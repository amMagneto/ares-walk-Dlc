/* ARES-WALK — HiRISE basemap, image-derived sensor products, traverse geometry */
window.ARES_TERRAIN = (function () {
  "use strict";

  const D = window.ARES_DATA;
  const M = D.MAP;
  const W = M.w, H = M.h, S = M.renderScale;
  const IMAGE_SRC = "assets/altadena-hirise.jpg";
  const AW = 960, AH = 660;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a || 1), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(0xA5E5B07);

  function smoothPoints(points, perSeg) {
    perSeg = perSeg || 9;
    if (!points || points.length < 2) return points ? points.slice() : [];
    const p = points, out = [];
    const get = (i) => p[Math.max(0, Math.min(p.length - 1, i))];
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      for (let s = 0; s < perSeg; s++) {
        const t = s / perSeg, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    out.push(p[p.length - 1].slice());
    return out;
  }

  function offsetPoints(pts, d) {
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      return [p[0] - dy * d, p[1] + dx * d];
    });
  }

  const RT = {
    outbound: smoothPoints(D.routes.outbound, 12),
    return: smoothPoints(D.routes.return, 12),
    abort: smoothPoints(D.routes.abort, 12),
    curiosity: smoothPoints(D.routes.curiosity, 8)
  };

  function makeCanvas() {
    const c = document.createElement("canvas");
    c.width = Math.round(W * S);
    c.height = Math.round(H * S);
    const g = c.getContext("2d");
    g.scale(S, S);
    g.lineJoin = "round";
    g.lineCap = "round";
    return { canvas: c, g };
  }

  function traceRoute(g, pts) {
    if (!pts.length) return;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  }

  function traceSmoothClosed(g, pts) {
    if (!pts.length) return;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const start = mid(pts[pts.length - 1], pts[0]);
    g.beginPath();
    g.moveTo(start[0], start[1]);
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], next = pts[(i + 1) % pts.length];
      const m = mid(cur, next);
      g.quadraticCurveTo(cur[0], cur[1], m[0], m[1]);
    }
    g.closePath();
  }

  function makeHatch(color, step, width) {
    const c = document.createElement("canvas");
    c.width = c.height = Math.max(3, Math.round(step * S));
    const g = c.getContext("2d");
    g.scale(c.width / step, c.height / step);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(-step, step);
    g.lineTo(step, -step);
    g.moveTo(0, step * 2);
    g.lineTo(step * 2, 0);
    g.stroke();
    return c;
  }

  /* ------------------------------------------------------------------
     Basemap: NASA/JPL-Caltech/University of Arizona HiRISE PIA26306.
     The source crop is pre-registered to this 1600 × 1100 local grid.
     ------------------------------------------------------------------ */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("HiRISE basemap could not be loaded from " + src));
      img.src = src;
    });
  }

  function drawBase(img) {
    const { canvas, g } = makeCanvas();
    g.save();
    g.filter = "saturate(1.22) contrast(1.13) brightness(1.2)";
    g.drawImage(img, 0, 0, W, H);
    g.restore();

    // Pull the photographic basemap into the dark avionics palette without
    // flattening the ridge/hollow relief that carries the terrain story.
    const wash = g.createLinearGradient(140, 80, W * .82, H);
    wash.addColorStop(0, "rgba(50,98,132,.07)");
    wash.addColorStop(.46, "rgba(11,20,27,.015)");
    wash.addColorStop(1, "rgba(8,6,8,.11)");
    g.fillStyle = wash;
    g.fillRect(0, 0, W, H);

    const sun = g.createRadialGradient(W * .68, H * .16, 20, W * .68, H * .16, W * .84);
    sun.addColorStop(0, "rgba(255,177,111,.055)");
    sun.addColorStop(.58, "rgba(255,145,87,.015)");
    sun.addColorStop(1, "rgba(255,145,87,0)");
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);

    const vignette = g.createRadialGradient(W * .49, H * .48, H * .18, W * .49, H * .48, W * .66);
    vignette.addColorStop(0, "rgba(3,7,10,0)");
    vignette.addColorStop(.66, "rgba(3,7,10,.06)");
    vignette.addColorStop(1, "rgba(3,7,10,.33)");
    g.fillStyle = vignette;
    g.fillRect(0, 0, W, H);

    // Fine filmic mottle keeps the JPEG from reading as a flat photo inset.
    const tile = document.createElement("canvas");
    tile.width = tile.height = 184;
    const tg = tile.getContext("2d");
    const td = tg.createImageData(184, 184);
    for (let i = 0; i < 184 * 184; i++) {
      const v = rng();
      td.data[i * 4] = td.data[i * 4 + 1] = td.data[i * 4 + 2] = v > .5 ? 255 : 12;
      td.data[i * 4 + 3] = Math.floor(v * 8);
    }
    tg.putImageData(td, 0, 0);
    g.save();
    g.globalAlpha = .75;
    g.fillStyle = g.createPattern(tile, "repeat");
    g.fillRect(0, 0, W, H);
    g.restore();

    // Two hairline survey seams suggesting the adjacent CTX stereo pairs.
    g.save();
    g.setLineDash([1.5, 18]);
    g.strokeStyle = "rgba(222,208,190,.12)";
    g.lineWidth = .7;
    g.beginPath();
    g.moveTo(60, 1040);
    g.lineTo(540, 720);
    g.lineTo(1030, 670);
    g.lineTo(1520, 420);
    g.stroke();
    g.restore();

    return canvas;
  }

  /* ------------------------------------------------------------------
     Image analysis: luminance, local relief, and derived sensor fields.
     ------------------------------------------------------------------ */
  function boxBlur(src, w, h, r) {
    if (!r) return src.slice();
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const win = r * 2 + 1;
    const inv = 1 / win;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[row + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum * inv;
        sum += src[row + clamp(x + r + 1, 0, w - 1)] - src[row + clamp(x - r, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum * inv;
        sum += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x];
      }
    }
    return out;
  }

  function stdRange(arr) {
    let sum = 0, sq = 0;
    for (let i = 0; i < arr.length; i++) { sum += arr[i]; sq += arr[i] * arr[i]; }
    const mean = sum / arr.length;
    return { mean, std: Math.sqrt(Math.max(.000001, sq / arr.length - mean * mean)) };
  }

  function percentiles(arr, lo, hi) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] < min) min = arr[i];
      if (arr[i] > max) max = arr[i];
    }
    const bins = new Uint32Array(512);
    const scale = 511 / Math.max(.000001, max - min);
    for (let i = 0; i < arr.length; i++) bins[Math.round((arr[i] - min) * scale)]++;
    const loN = Math.floor(arr.length * lo), hiN = Math.floor(arr.length * hi);
    let acc = 0, a = min, b = max;
    for (let i = 0; i < bins.length; i++) {
      acc += bins[i];
      if (a === min && acc >= loN) a = min + (i / 511) * (max - min);
      if (acc >= hiN) { b = min + (i / 511) * (max - min); break; }
    }
    return { min: a, max: b };
  }

  function makeFallbackAnalysis() {
    const lum = new Float32Array(AW * AH);
    const tpi = new Float32Array(AW * AH);
    const heat = new Float32Array(AW * AH);
    for (let y = 0; y < AH; y++) {
      for (let x = 0; x < AW; x++) {
        const i = y * AW + x;
        const broad = .44 + .15 * Math.sin(x * .006 + y * .004) + .07 * Math.sin(x * .018 - y * .013);
        const grain = .04 * Math.sin(x * .08 + y * .031) + .025 * Math.sin(x * .031 - y * .097);
        lum[i] = clamp(broad + grain, 0, 1);
        tpi[i] = grain;
        heat[i] = broad;
      }
    }
    return { lum, tpi, heat, nTpi: tpi, nHeat: heat };
  }

  function analyzeImage(img) {
    const c = document.createElement("canvas");
    c.width = AW; c.height = AH;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, AW, AH);
    let pixels;
    try {
      pixels = g.getImageData(0, 0, AW, AH).data;
    } catch (err) {
      console.warn("ARES-WALK: image pixels unavailable; using calibrated fallback fields.", err);
      return makeFallbackAnalysis();
    }

    const N = AW * AH;
    const lum = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const p = i * 4;
      lum[i] = (pixels[p] * .2126 + pixels[p + 1] * .7152 + pixels[p + 2] * .0722) / 255;
    }

    const b3 = boxBlur(lum, AW, AH, 3);
    const b8 = boxBlur(lum, AW, AH, 8);
    const b24 = boxBlur(lum, AW, AH, 24);
    const tpi = new Float32Array(N);
    const heatRaw = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      // The local relief term is tuned to the ~13 m TPI baseline claimed by
      // the layer card, while the wider term lifts continuous ridge spines.
      tpi[i] = (lum[i] - b8[i]) * .74 + (lum[i] - b24[i]) * .26;
      heatRaw[i] = b8[i] * .52 + b24[i] * .34 + lum[i] * .14 + tpi[i] * .24;
    }

    const tr = stdRange(tpi);
    const hr = percentiles(heatRaw, .04, .96);
    const nTpi = new Float32Array(N);
    const nHeat = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      nTpi[i] = clamp((tpi[i] - tr.mean) / (2.65 * tr.std), -1.2, 1.2);
      nHeat[i] = clamp((heatRaw[i] - hr.min) / Math.max(.0001, hr.max - hr.min), 0, 1);
    }

    return { lum, tpi, heat: heatRaw, nTpi, nHeat };
  }

  function fillLayer(w, h, painter) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    const img = g.createImageData(w, h);
    painter(img.data, w, h);
    g.putImageData(img, 0, 0);
    return c;
  }

  function setPixel(data, i, r, g, b, a) {
    const p = i * 4;
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = a;
  }

  function buildTPI(a) {
    const color = new Float32Array(AW * AH * 4);
    for (let i = 0; i < AW * AH; i++) {
      const t = a.nTpi[i];
      let r = 0, g = 0, b = 0, alpha = 0;
      if (t > 0) {
        const p = smoothstep(.03, .72, t);
        r = 255; g = 194; b = 124;
        alpha = p * 29;
      } else {
        const n = smoothstep(.04, .72, -t);
        r = 34; g = 76; b = 103;
        alpha = n * 22;
      }
      const o = i * 4;
      color[o] = r; color[o + 1] = g; color[o + 2] = b; color[o + 3] = alpha;
    }

    // Ridge-crest emphasis: a one-pixel warm edge where the positive TPI
    // crosses its strongest quartile. It makes the boxwork lattice legible
    // without painting over the photographic texture.
    for (let y = 1; y < AH - 1; y++) {
      for (let x = 1; x < AW - 1; x++) {
        const i = y * AW + x;
        const t = a.nTpi[i];
        if (t < .21) continue;
        const left = a.nTpi[i - 1], right = a.nTpi[i + 1];
        const up = a.nTpi[i - AW], down = a.nTpi[i + AW];
        if (t > left && t > right || t > up && t > down) {
          const o = i * 4;
          color[o] = 255; color[o + 1] = 211; color[o + 2] = 154;
          color[o + 3] = Math.max(color[o + 3], 42 + smoothstep(.2, .8, t) * 56);
        }
      }
    }

    const c = document.createElement("canvas");
    c.width = AW; c.height = AH;
    const cg = c.getContext("2d");
    const image = cg.createImageData(AW, AH);
    for (let i = 0; i < AW * AH * 4; i++) image.data[i] = color[i];
    cg.putImageData(image, 0, 0);
    return c;
  }

  function buildThermal(a) {
    const stops = [
      [0.00, 41, 70, 145, .15],
      [0.25, 60, 92, 177, .22],
      [0.48, 118, 82, 160, .27],
      [0.68, 206, 92, 109, .3],
      [0.84, 248, 154, 91, .34],
      [1.00, 255, 225, 168, .4]
    ];
    return fillLayer(AW, AH, (data) => {
      for (let i = 0; i < AW * AH; i++) {
        const t = a.nHeat[i];
        let j = 0;
        while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
        const s0 = stops[j], s1 = stops[j + 1];
        const f = clamp((t - s0[0]) / (s1[0] - s0[0] || 1), 0, 1);
        // A faint band boundary makes the raster read as sampled THEMIS
        // data rather than a decorative colour wash.
        const band = t * 9;
        const edge = Math.abs(band - Math.round(band)) < .045 ? .055 : 0;
        const alpha = lerp(s0[4], s1[4], f) + edge;
        setPixel(data, i,
          Math.round(lerp(s0[1], s1[1], f)),
          Math.round(lerp(s0[2], s1[2], f)),
          Math.round(lerp(s0[3], s1[3], f)),
          Math.round(clamp(alpha, 0, .44) * 255)
        );
      }
    });
  }

  function buildCrism(a) {
    function hash(x, y) {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return s - Math.floor(s);
    }
    function mineralField(x, y) {
      return .5 + .23 * Math.sin(x * .015 + y * .009 + .6) +
        .15 * Math.sin(x * .038 - y * .021 + 2.1) +
        .08 * Math.sin(x * .087 + y * .047 + 1.2);
    }
    const spots = [
      { x: 445, y: 560, r: 44, cyan: false },
      { x: 620, y: 560, r: 38, cyan: true },
      { x: 704, y: 510, r: 34, cyan: false },
      { x: 790, y: 430, r: 36, cyan: true },
      { x: 533, y: 596, r: 28, cyan: false },
      { x: 854, y: 478, r: 30, cyan: false },
      { x: 318, y: 630, r: 26, cyan: true }
    ].map((s) => ({ x: s.x * AW / W, y: s.y * AH / H, r: s.r * AW / W, cyan: s.cyan }));

    const strongRidge = new Float32Array(AW * AH);
    for (let i = 0; i < strongRidge.length; i++) {
      strongRidge[i] = smoothstep(.01, .58, a.nTpi[i]) * (.4 + .6 * smoothstep(.3, .82, a.lum[i]));
    }
    const ridgeHalo = boxBlur(strongRidge, AW, AH, 5);

    return fillLayer(AW, AH, (data) => {
      for (let y = 0; y < AH; y++) {
        for (let x = 0; x < AW; x++) {
          const i = y * AW + x;
          const t = a.nTpi[i];
          const ridge = smoothstep(.015, .55, t);
          const spectral = smoothstep(.53, .72, mineralField(x, y));
          let amount = spectral * (ridge * .34 + ridgeHalo[i] * .26);
          for (const s of spots) {
            const dx = (x - s.x) / s.r, dy = (y - s.y) / s.r;
            const d = dx * dx + dy * dy;
            if (d < 2.9) amount += Math.exp(-d * 1.8) * .46;
          }
          if (amount < .075) continue;
          const grain = hash(x * 1.3 + 2.7, y * 1.7 + 9.1);
          if (grain < .28) amount *= .24;
          const cyan = mineralField(x * 1.7 + 16, y * 1.7 + 4) > .51;
          const speck = grain > .93 ? .16 : 0;
          setPixel(data, i,
            cyan ? 58 : 216,
            cyan ? 224 : 86,
            cyan ? 208 : 244,
            Math.round(clamp(amount * .25 + speck, 0, .36) * 255)
          );
        }
      }
    });
  }

  /* ---------------------------- safety layers ---------------------------- */
  const HAZARDS = {
    scarp: [
      [918, 246], [975, 258], [1003, 226], [1028, 286], [1054, 352],
      [1048, 434], [1080, 498], [1084, 600], [1050, 704], [1070, 806],
      [1016, 878], [940, 846], [926, 760], [900, 660], [922, 560],
      [900, 470], [916, 380], [894, 320]
    ],
    approach: [
      [916, 308], [1004, 292], [1030, 380], [1005, 455], [930, 470], [886, 398]
    ],
    hollow: [
      [455, 704], [510, 668], [573, 682], [614, 723], [605, 779],
      [548, 805], [489, 780], [452, 742]
    ],
    boulders: [
      [805, 612], [857, 594], [914, 630], [923, 680], [879, 703],
      [826, 688], [798, 650]
    ]
  };

  function drawHazard(g, pts, hatch, danger) {
    g.save();
    traceSmoothClosed(g, pts);
    g.fillStyle = danger ? "rgba(255,76,89,.095)" : "rgba(255,76,89,.065)";
    g.fill();
    g.clip();
    g.globalAlpha = .37;
    g.fillStyle = hatch;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
    g.restore();

    traceSmoothClosed(g, pts);
    g.setLineDash([5, 5]);
    g.strokeStyle = danger ? "rgba(255,112,118,.66)" : "rgba(255,98,105,.46)";
    g.lineWidth = 1.1;
    g.stroke();
    g.setLineDash([]);
  }

  function drawSlope() {
    const { canvas, g } = makeCanvas();
    const hatch = g.createPattern(makeHatch("rgba(255,94,103,.55)", 6, 1.2), "repeat");

    drawHazard(g, HAZARDS.scarp, hatch, true);
    drawHazard(g, HAZARDS.approach, hatch, true);
    drawHazard(g, HAZARDS.hollow, hatch, false);
    drawHazard(g, HAZARDS.boulders, hatch, false);

    // Co-registration uncertainty halo around the rejected scarp approach.
    g.save();
    traceSmoothClosed(g, HAZARDS.approach);
    g.setLineDash([2, 4]);
    g.strokeStyle = "rgba(255,180,94,.65)";
    g.lineWidth = .9;
    g.stroke();
    g.restore();

    // Scattered boulder halos on the visible eastern pavement.
    const rocks = [
      [852, 632, 3.1], [874, 646, 4.1], [892, 665, 2.7], [912, 677, 3.7],
      [942, 702, 2.5], [989, 735, 3.2], [814, 663, 2.6], [856, 696, 2.3]
    ];
    for (const r of rocks) {
      g.beginPath();
      g.arc(r[0], r[1], r[2] + 4.2, 0, Math.PI * 2);
      g.strokeStyle = "rgba(255,98,105,.38)";
      g.lineWidth = .8;
      g.stroke();
    }
    return canvas;
  }

  function drawLOS() {
    const { canvas, g } = makeCanvas();
    const pockets = [
      [[862, 284], [950, 258], [1026, 282], [1074, 366], [1096, 470],
        [1082, 584], [1060, 690], [990, 774], [918, 746], [888, 672],
        [916, 590], [900, 500], [906, 402], [884, 340]],
      [[410, 684], [474, 652], [560, 650], [648, 670], [736, 714],
        [788, 792], [766, 862], [700, 910], [596, 924], [502, 890],
        [438, 830], [398, 754]],
      [[1040, 612], [1096, 642], [1124, 716], [1094, 784], [1038, 766], [1018, 700]]
    ];

    // Soft shadow bodies first, so the edges stay atmospheric rather than cut.
    g.save();
    g.filter = "blur(9px)";
    for (const pocket of pockets) {
      traceSmoothClosed(g, pocket);
      g.fillStyle = "rgba(150,111,247,.5)";
      g.fill();
    }
    g.restore();

    const violetHatch = g.createPattern(makeHatch("rgba(195,164,255,.42)", 7, .85), "repeat");
    for (const pocket of pockets) {
      g.save();
      traceSmoothClosed(g, pocket);
      g.clip();
      g.fillStyle = "rgba(147,108,242,.13)";
      g.fillRect(0, 0, W, H);
      g.globalAlpha = .25;
      g.fillStyle = violetHatch;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
      g.restore();

      traceSmoothClosed(g, pocket);
      g.setLineDash([4, 8]);
      g.strokeStyle = "rgba(200,172,255,.44)";
      g.lineWidth = 1;
      g.stroke();
      g.setLineDash([]);
    }
    return canvas;
  }

  function buildOverlays(a) {
    return {
      tpi: buildTPI(a),
      thermal: buildThermal(a),
      crism: buildCrism(a),
      slope: drawSlope(),
      los: drawLOS()
    };
  }

  return {
    build: async function () {
      const img = await loadImage(IMAGE_SRC);
      const base = drawBase(img);
      let analysis;
      try {
        analysis = analyzeImage(img);
      } catch (err) {
        console.warn("ARES-WALK: image analysis failed; falling back to calibrated fields.", err);
        analysis = makeFallbackAnalysis();
      }
      return {
        base,
        routes: RT,
        layers: buildOverlays(analysis),
        meta: {
          basemap: "NASA/JPL-Caltech/University of Arizona · HiRISE PIA26306",
          projection: "local ortho grid · 1600 × 1100"
        }
      };
    },
    smoothPoints,
    offsetPoints
  };
})();
