/* ARES-WALK — interface, interaction, and traverse simulation */
(function () {
  "use strict";

  const D = window.ARES_DATA;
  const M = D.MAP;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const svg = (id, cls) => '<svg' + (cls ? ' class="' + cls + '"' : '') + ' aria-hidden="true"><use href="#' + id + '"/></svg>';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    layers: Object.fromEntries(D.layers.map((l) => [l.id, l.defaultOn])),
    overlays: Object.fromEntries(D.overlays.map((o) => [o.id, o.defaultOn])),
    selected: null,
    hover: null,
    tab: "audit",
    spe: false,
    dose: 0.84,
    hintHidden: false,
    interacted: false
  };

  function routeKm(points) {
    let px = 0;
    for (let i = 1; i < points.length; i++) px += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    return (px * M.mPerPx) / 1000;
  }
  const distances = {
    out: routeKm(D.routes.outbound),
    back: routeKm(D.routes.return),
    abort: routeKm(D.routes.abort)
  };
  const totalKm = distances.out + distances.back;

  let toastTimer = null;
  function toast(message, warn) {
    const el = $("#toast");
    el.firstElementChild.textContent = message;
    el.classList.toggle("warn", !!warn);
    el.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("visible"), 3400);
  }

  /* ---------------- left panel ---------------- */
  function renderLayers() {
    $("#layerList").innerHTML = D.layers.map((l) => {
      const on = !!state.layers[l.id];
      return '<article class="layer-card ' + (on ? "is-on" : "is-off") + '" data-layer-card="' + l.id + '" style="--accent:' + l.accent + '">' +
        '<div class="layer-top">' +
          '<span class="layer-index">' + l.index + '</span>' +
          '<div class="layer-title"><h3>' + l.name + '</h3>' +
            '<div class="layer-meta"><b>' + l.sensor + '</b><i></i><span>' + l.resolution + '</span></div>' +
          '</div>' +
          '<button class="switch" type="button" role="switch" aria-checked="' + on + '" data-layer-toggle="' + l.id + '" aria-label="Toggle ' + l.name + '"><span></span></button>' +
        '</div>' +
        '<p class="layer-short">' + l.short + '</p>' +
        '<button class="layer-more" type="button" aria-expanded="false" data-layer-more="' + l.id + '"><span>DETAILS</span>' + svg("i-chevron") + '</button>' +
        '<div class="layer-details"><div><p>' + l.details + '</p></div></div>' +
      '</article>';
    }).join("");
  }

  function renderOverlays() {
    $("#overlayList").innerHTML = D.overlays.map((o) => {
      const on = !!state.overlays[o.id];
      return '<div class="overlay-row ' + (on ? "" : "is-off") + '" data-overlay-row="' + o.id + '" style="--accent:' + o.accent + '">' +
        '<span class="overlay-icon">' + svg(o.icon) + '</span>' +
        '<span class="overlay-copy"><strong>' + o.label + '</strong><small>' + o.sub + '</small></span>' +
        '<button class="switch" type="button" role="switch" aria-checked="' + on + '" data-overlay-toggle="' + o.id + '" aria-label="Toggle ' + o.label + '"><span></span></button>' +
      '</div>';
    }).join("");
  }

  function updateLegend() {
    $$("#legendList [data-legend]").forEach((li) => {
      const item = D.legend.find((l) => l.id === li.getAttribute("data-legend"));
      if (item && item.overlay) li.hidden = !state.overlays[item.overlay];
    });
    $("#thermalScale").hidden = !state.layers.themis;
  }

  function toggleLayer(id) {
    state.layers[id] = !state.layers[id];
    const layer = D.layers.find((l) => l.id === id);
    const card = $('[data-layer-card="' + id + '"]');
    const toggle = $('[data-layer-toggle="' + id + '"]', card);
    card.classList.toggle("is-on", state.layers[id]);
    card.classList.toggle("is-off", !state.layers[id]);
    toggle.setAttribute("aria-checked", String(state.layers[id]));
    updateLegend();
    toast(layer.name + (state.layers[id] ? " layer enabled." : " layer muted."));
  }

  function toggleOverlay(id) {
    state.overlays[id] = !state.overlays[id];
    const overlay = D.overlays.find((o) => o.id === id);
    const row = $('[data-overlay-row="' + id + '"]');
    row.classList.toggle("is-off", !state.overlays[id]);
    $('[data-overlay-toggle="' + id + '"]', row).setAttribute("aria-checked", String(state.overlays[id]));
    updateLegend();
    toast(overlay.label + " overlay " + (state.overlays[id] ? "engaged." : "disengaged."));
  }

  /* ---------------- audit panel ---------------- */
  function waypointStatus(w) {
    if (w.deferred) return "DEFERRED";
    if (!state.spe) return w.listStatus;
    if (w.id === "W1") return "SAMPLED";
    if (w.id === "W2") return "ABORT PT";
    if (w.id === "W3") return "ABORTED";
    return "DEFERRED";
  }

  function renderWaypoints() {
    const progress = { W1: 22, W2: 48, W3: 78, W4: 100 };
    $("#wpList").innerHTML = D.waypoints.map((w) => {
      const cls = [w.deferred ? "deferred" : "", state.spe && w.id === "W3" ? "aborted" : "", state.spe && w.id === "W1" ? "complete" : ""].join(" ").trim();
      return '<li class="wp-item ' + cls + '" data-wp-item="' + w.id + '">' +
        '<button class="wp-row" type="button" data-wp-select="' + w.id + '" style="--wp-accent:' + w.accent + '" aria-label="Open ' + w.id + ' ' + w.name + ' briefing">' +
          '<span class="wp-num">' + w.id + '</span>' +
          '<span class="wp-main"><strong>' + w.name + '</strong><small>' + w.listMeta + '</small></span>' +
          '<span class="wp-right"><b>' + w.eta + '</b><em>' + waypointStatus(w) + '</em></span>' +
          '<span class="wp-progress" style="--prog:' + progress[w.id] + '%"></span>' +
        '</button>' +
      '</li>';
    }).join("");
  }

  function renderRules() {
    $("#rulesList").innerHTML = D.rules.map((r) => (
      '<div class="rule-card" data-rule-card="' + r.id + '">' +
        '<button class="rule-head" type="button" aria-expanded="false" data-rule-toggle="' + r.id + '">' +
          '<span class="rule-num">' + r.num + '</span>' +
          '<span class="rule-title"><strong>' + r.title + '</strong><small>' + r.sub + '</small></span>' +
          svg("i-chevron") +
        '</button>' +
        '<div class="rule-body"><div><p>' + r.copy + '</p></div></div>' +
      '</div>'
    )).join("");
  }

  function renderLegend() {
    $("#legendList").innerHTML = D.legend.map((l) => (
      '<li data-legend="' + l.id + '"' + (l.overlay && !state.overlays[l.overlay] ? " hidden" : "") + '><i class="sw ' + l.cls + '"></i>' + l.label + '</li>'
    )).join("");
    updateLegend();
  }

  function updateEnergy() {
    const e = D.energy;
    const out = state.spe ? 0 : e.outbound;
    const ret = state.spe ? e.abortReturn : e.return;
    const used = out + ret;
    const reserve = e.capacity - used;
    $("#energyUsed").textContent = used.toLocaleString("en-US");
    $("#energyOutVal").textContent = out.toLocaleString("en-US");
    $("#energyRetVal").textContent = ret.toLocaleString("en-US");
    $("#energyResVal").textContent = reserve.toLocaleString("en-US");
    $("#energyOut").style.width = (out / e.capacity * 100) + "%";
    $("#energyReturn").style.left = (out / e.capacity * 100) + "%";
    $("#energyReturn").style.width = (ret / e.capacity * 100) + "%";
    const track = $("#energyTrack");
    track.setAttribute("aria-label", state.spe
      ? "SPE abort return energy 214 watt-hours. 1,386 watt-hours reserve."
      : "Energy use 1,048 of 1,200 watt-hours. 552 watt-hours walkback reserve.");
    const note = $("#energyNote");
    note.classList.toggle("breach", state.spe);
    note.innerHTML = svg("i-info") + (state.spe
      ? " SPE abort return: 214 Wh used · 1,386 Wh reserve remains."
      : " Walkback reserve 552 Wh · exceeds the mandatory 400 Wh (25%) floor.");
  }

  function updateMissionStats() {
    const e = D.energy;
    if (!state.spe) {
      $("#statDistance").innerHTML = totalKm.toFixed(2) + '<small>km</small>';
      $("#statAscent").innerHTML = '+14.8<small>m</small>';
      $("#statTime").innerHTML = '2:48<small>h:m</small>';
      $("#statEnergy").innerHTML = e.total.toLocaleString("en-US") + '<small>Wh</small>';
      $("#statDistance").parentElement.querySelector("em").textContent = "ridge-crest loop";
      $("#statAscent").parentElement.querySelector("em").textContent = "high point W3";
      $("#statTime").parentElement.querySelector("em").textContent = "asymmetric 0.38 g";
      $("#statEnergy").parentElement.querySelector("em").textContent = "1,200 Wh cap";
      $("#auditStatus").classList.remove("spe");
      $("#auditStatus").innerHTML = '<span class="status-dot"></span><strong>WITHIN PLSS ENVELOPE</strong><em>4 TARGETS <i>·</i> 1 DEFERRED</em>';
      $("#modeChip").classList.remove("spe");
      $("#modeChip strong").textContent = "MIN-METABOLIC";
      $("#modeDistance").textContent = totalKm.toFixed(2) + " km";
    } else {
      $("#statDistance").innerHTML = distances.abort.toFixed(2) + '<small>km</small>';
      $("#statAscent").innerHTML = '−6.3<small>m</small>';
      $("#statTime").innerHTML = '0:18<small>h:m</small>';
      $("#statEnergy").innerHTML = e.abortReturn + '<small>Wh</small>';
      $("#statDistance").parentElement.querySelector("em").textContent = "minimum-time return";
      $("#statAscent").parentElement.querySelector("em").textContent = "ridge descent";
      $("#statTime").parentElement.querySelector("em").textContent = "RAD-driven abort";
      $("#statEnergy").parentElement.querySelector("em").textContent = "return leg only";
      $("#auditStatus").classList.add("spe");
      $("#auditStatus").innerHTML = '<span class="status-dot"></span><strong>SPE ABORT ACTIVE</strong><em>3 TARGETS SKIPPED <i>·</i> SHELTER RETURN</em>';
      $("#modeChip").classList.add("spe");
      $("#modeChip strong").textContent = "MIN-TIME ABORT";
      $("#modeDistance").textContent = distances.abort.toFixed(2) + " km";
    }
    updateEnergy();
  }

  /* ---------------- waypoint briefing panel ---------------- */
  function waypointStatusDetail(w) {
    if (w.deferred) return "REJECTED · OUT OF ENVELOPE";
    if (state.spe && w.id === "W3") return "ABORTED · RETURN TO ROVER";
    if (state.spe && w.id === "W2") return "CURRENT POSITION · ABORT START";
    if (state.spe && w.id === "W1") return "SAMPLED · RETURN IN PROGRESS";
    return "IN ENVELOPE · ROUTE LOCKED";
  }

  function openWaypoint(id) {
    const w = D.waypoints.find((x) => x.id === id);
    if (!w) return;
    state.selected = id;
    const panel = $(".audit-panel");
    panel.classList.add("detail-open");
    $("#auditView").hidden = true;
    $("#rulesView").hidden = true;
    const view = $("#waypointView");
    view.hidden = false;
    view.scrollTop = 0;

    const fieldTask = w.fieldTask ? '<div class="detail-callout"><span>FIELD TASK</span><p>' + w.fieldTask + '</p></div>' : "";
    const caution = w.caution ? '<div class="detail-callout caution"><span>CAUTION</span><p>' + w.caution + '</p></div>' : "";
    const rejection = w.deferred ? '<div class="detail-callout reject"><span>SOLVER REJECTION</span><p>22° stability ceiling + 25% PLSS walkback reserve → no valid route to this station.</p></div>' : "";

    view.innerHTML =
      '<button class="back-btn" type="button" data-back-audit>' + svg("i-back") + ' BACK TO ' + (state.tab === "rules" ? "FLIGHT RULES" : "TRAVERSE AUDIT") + '</button>' +
      '<article class="wp-detail ' + (w.deferred ? "rejected" : "") + '" style="--accent:' + w.accent + '">' +
        '<div class="wp-detail-head">' +
          '<div class="wp-detail-tags"><span class="priority-tag">PRIORITY ' + w.priority + '</span><span class="detail-status">' + waypointStatusDetail(w) + '</span></div>' +
          '<div class="wp-detail-id">' + w.id + '</div>' +
          '<h2>' + w.name + '</h2>' +
          '<p class="wp-detail-type">' + w.type + '</p>' +
        '</div>' +
        '<div class="detail-metrics">' + w.metrics.map((m) => (
          '<div><span>' + m.label + '</span><strong>' + m.value + (m.unit ? '<small>' + m.unit + '</small>' : '') + '</strong></div>'
        )).join("") + '</div>' +
        '<section class="detail-section"><h3>GEOLOGICAL BRIEFING</h3><p>' + w.briefing + '</p></section>' +
        fieldTask + caution + rejection +
        '<div class="detail-meta-foot"><span>' + w.foot.left + '</span><b>' + w.foot.right + '</b></div>' +
        '<button class="text-btn detail-action" type="button" data-focus-waypoint="' + w.id + '">LOCATE ON MAP ' + svg("i-arrow") + '</button>' +
      '</article>';

    updateHUD(w);
  }

  function closeWaypoint() {
    $("#waypointView").hidden = true;
    $(".audit-panel").classList.remove("detail-open");
    showTab(state.tab);
  }

  function showsAuditOrRules(tab) {
    $("#auditView").hidden = tab !== "audit";
    $("#rulesView").hidden = tab !== "rules";
    $("#waypointView").hidden = true;
    $(".audit-panel").classList.remove("detail-open");
    $$(".panel-tabs button").forEach((b) => {
      const on = b.getAttribute("data-tab") === tab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });
    if (tab === "audit") $("#auditView").scrollTop = 0; else $("#rulesView").scrollTop = 0;
  }
  function showTab(tab) {
    state.tab = tab;
    showsAuditOrRules(tab);
  }

  function updateHUD(w) {
    const hud = $("#visorHud");
    if (!w) {
      hud.classList.remove("locked");
      hud.style.removeProperty("--accent");
      $("#hudTitle").textContent = "NO TARGET LOCKED";
      $("#hudSub").textContent = "Click a science waypoint to pull its geological briefing.";
      $("#hudGrid").innerHTML =
        '<div><span>CREW</span><strong>02</strong></div>' +
        '<div><span>SUIT g</span><strong>0.38</strong></div>' +
        '<div><span>PLSS CAP</span><strong>75%</strong></div>';
      return;
    }
    hud.classList.add("locked");
    hud.style.setProperty("--accent", w.accent);
    $("#hudTitle").textContent = w.id + " · " + w.name.toUpperCase();
    $("#hudSub").textContent = "Priority " + w.priority + " · " + w.type;
    const m = w.metrics;
    const metric = (idx, label) => '<div><span>' + label + '</span><strong' + (w.deferred ? ' class="bad"' : (idx === 0 && w.id === "W1" ? ' class="hot"' : '')) + '>' + m[idx].value + (m[idx].unit ? " " + m[idx].unit : "") + '</strong></div>';
    $("#hudGrid").innerHTML = w.deferred
      ? metric(0, "SCARP SLOPE") + metric(1, "THERMAL") + '<div><span>ROUTE</span><strong class="bad">REJECT</strong></div>'
      : metric(0, w.id === "W3" ? "ELEVATION" : "THERMAL") + metric(1, "D2300") + metric(3, "WALK");
  }

  /* ---------------- mission brief ---------------- */
  let lastFocus = null;
  function openBrief() {
    const modal = $("#briefModal");
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    setTimeout(() => $("#briefClose").focus(), 30);
  }
  function closeBrief() {
    const modal = $("#briefModal");
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function trapFocus(e) {
    const modal = $("#briefModal");
    if (modal.hidden || e.key !== "Tab") return;
    const f = $$('button, [href], [tabindex]:not([tabindex="-1"])', modal).filter((el) =>
      !el.disabled && !el.closest("svg") && el.tabIndex >= 0 && el.getClientRects().length > 0
    );
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------------- SPE abort drill ---------------- */
  function syncSPEButtons() {
    $$("[data-spe-trigger]").forEach((btn) => {
      const b = btn.querySelector("b");
      const small = btn.querySelector("small");
      if (b) b.textContent = state.spe ? "CANCEL SPE DRILL" : "TRIGGER SPE SOLAR FLARE";
      if (small) small.textContent = state.spe ? "Abort routing active · click to reset drill" : (btn.classList.contains("compact") ? "Instant abort re-route" : "Simulate RAD detection · minimum-time abort");
    });
    const panel = $("#spePanel");
    panel.classList.toggle("active", state.spe);
    $("#spePanelState").textContent = state.spe ? "ABORT ACTIVE" : "ARMED";
  }

  function setSPE(active) {
    state.spe = !!active;
    state.dose = 0.84;
    document.body.classList.toggle("spe-active", state.spe);
    $("#speBanner").hidden = !state.spe;
    $("#sensorState").classList.toggle("spe", state.spe);
    $("#sensorState span").textContent = state.spe ? "SPE ABORT ACTIVE" : "FUSION LOCKED";
    $("#uhfStatus").innerHTML = state.spe ? '<i></i> BUFFERING' : '<i></i> NOMINAL';
    $("#uhfStatus").classList.toggle("ok", !state.spe);
    $("#speDose").textContent = "0.84 mSv";
    syncSPEButtons();
    updateMissionStats();
    renderWaypoints();
    if (state.selected) openWaypoint(state.selected);
    if (state.tab === "rules") showTab("rules");
    const rule = $('[data-rule-card="spe"]');
    if (rule && state.spe) {
      rule.classList.add("open");
      $('[data-rule-toggle="spe"]', rule).setAttribute("aria-expanded", "true");
    }
    if (state.spe && !reducedMotion) abortRevealStart = performance.now();
    toast(state.spe ? "SPE DETECTED — minimum-time shelter route engaged." : "SPE drill cancelled. Metabolic routing restored.", state.spe);
  }

  /* ---------------- clock ---------------- */
  let metSeconds = 4 * 3600 + 12 * 60 + 37;
  function tick() {
    metSeconds += 1;
    const h = Math.floor(metSeconds / 3600), m = Math.floor((metSeconds % 3600) / 60), s = metSeconds % 60;
    $("#metClock").textContent = [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
    if (state.spe) {
      state.dose = Math.min(9.9, state.dose + 0.007);
      $("#speDose").textContent = state.dose.toFixed(2) + " mSv";
    }
  }

  /* ---------------- global listeners ---------------- */
  function bindUI() {
    $("#briefBtn").addEventListener("click", openBrief);
    $("#briefClose").addEventListener("click", closeBrief);
    $("#briefEnter").addEventListener("click", closeBrief);
    $("[data-close-brief]").addEventListener("click", closeBrief);
    document.addEventListener("keydown", (e) => {
      trapFocus(e);
      if (e.key === "Escape") {
        if (!$("#briefModal").hidden) { closeBrief(); return; }
        if (!$("#waypointView").hidden) { closeWaypoint(); return; }
      }
      if ($("#briefModal").hidden && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "m" || k === "?") { e.preventDefault(); openBrief(); }
        else if (k === "f") { e.preventDefault(); fitMap(); }
      }
    });

    $("#layerList").addEventListener("click", (e) => {
      const t = e.target.closest("[data-layer-toggle]");
      if (t) { toggleLayer(t.getAttribute("data-layer-toggle")); return; }
      const m = e.target.closest("[data-layer-more]");
      if (m) {
        const card = m.closest(".layer-card");
        const open = !card.classList.contains("is-open");
        card.classList.toggle("is-open", open);
        m.setAttribute("aria-expanded", String(open));
      }
    });

    $("#overlayList").addEventListener("click", (e) => {
      const t = e.target.closest("[data-overlay-toggle]");
      if (t) toggleOverlay(t.getAttribute("data-overlay-toggle"));
    });

    $(".panel-tabs").addEventListener("click", (e) => {
      const t = e.target.closest("[data-tab]");
      if (t) showTab(t.getAttribute("data-tab"));
    });
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-goto-rules]")) showTab("rules");
      if (e.target.closest("[data-spe-trigger]")) setSPE(!state.spe);
    });

    $("#rulesList").addEventListener("click", (e) => {
      const t = e.target.closest("[data-rule-toggle]");
      if (!t) return;
      const card = t.closest(".rule-card");
      const open = !card.classList.contains("open");
      card.classList.toggle("open", open);
      t.setAttribute("aria-expanded", String(open));
    });

    $("#wpList").addEventListener("click", (e) => {
      const t = e.target.closest("[data-wp-select]");
      if (t) openWaypoint(t.getAttribute("data-wp-select"));
    });
    $("#wpList").addEventListener("pointerover", (e) => {
      const t = e.target.closest("[data-wp-select]");
      state.hover = t ? t.getAttribute("data-wp-select") : null;
    });
    $("#wpList").addEventListener("pointerleave", () => { state.hover = null; });
    $("#wpList").addEventListener("focusin", (e) => {
      const t = e.target.closest("[data-wp-select]");
      if (t) state.hover = t.getAttribute("data-wp-select");
    });
    $("#wpList").addEventListener("focusout", () => { state.hover = null; });

    $("#waypointView").addEventListener("click", (e) => {
      if (e.target.closest("[data-back-audit]")) { closeWaypoint(); return; }
      const focus = e.target.closest("[data-focus-waypoint]");
      if (focus) {
        const w = D.waypoints.find((x) => x.id === focus.getAttribute("data-focus-waypoint"));
        if (w) focusWorld(w.x, w.y);
      }
    });

    const hud = $("#visorHud");
    hud.addEventListener("click", () => openWaypoint(state.selected || "W1"));
    hud.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openWaypoint(state.selected || "W1"); }
    });

    window.addEventListener("resize", onResize);
  }

  /* ---------------- traverse map engine ---------------- */
  const FONT_MONO = '"Cascadia Code", "Cascadia Mono", Consolas, monospace';
  const FONT_SANS = 'Bahnschrift, "Segoe UI", sans-serif';
  let ctx = null;
  let terrain = null;
  const view = { w: 0, h: 0, dpr: 1 };
  const cam = { x: 742, y: 550, scale: .7 };
  const camTarget = { x: 742, y: 550, scale: .7 };
  let minScale = .4, maxScale = 2.4;
  let layerAlpha = { tpi: 1, thermal: 1, crism: 1, slope: 1, los: 1 };
  let revealStart = 0;
  let abortRevealStart = 0;
  let scaleCache = "";
  let frameCount = 0;
  let ro = null;

  const pointer = {
    down: false, moved: false, x: 0, y: 0,
    startX: 0, startY: 0, startCam: { x: 0, y: 0 }
  };

  const ALPHA_TARGET = {
    tpi: () => state.layers.hirise,
    thermal: () => state.layers.themis,
    crism: () => state.layers.crism,
    slope: () => state.overlays.slope,
    los: () => state.overlays.los
  };
  const ALPHA_MULT = { tpi: 1, thermal: .9, crism: 1, slope: 1, los: .95 };

  function hideMapHint() {
    $("#mapHint").classList.add("is-hidden");
    state.hintHidden = true;
  }

  function computeScaleLimits() {
    const cover = Math.max(view.w / M.w, view.h / M.h);
    minScale = cover * .88;
    maxScale = cover * 3.5;
  }

  function clampCamera(c) {
    const halfW = view.w / (2 * c.scale);
    const halfH = view.h / (2 * c.scale);
    c.x = halfW * 2 >= M.w ? M.w / 2 : clamp(c.x, halfW, M.w - halfW);
    c.y = halfH * 2 >= M.h ? M.h / 2 : clamp(c.y, halfH, M.h - halfH);
  }

  function fitMap(immediate, quiet) {
    computeScaleLimits();
    camTarget.scale = Math.max(view.w / M.w, view.h / M.h) * 1.025;
    camTarget.x = 718;
    camTarget.y = 550;
    clampCamera(camTarget);
    if (immediate) {
      cam.x = camTarget.x; cam.y = camTarget.y; cam.scale = camTarget.scale;
    }
    state.interacted = false;
    if (!quiet) toast("Camera reset to full traverse.");
    hideMapHint();
  }

  function resizeCanvas(initial) {
    if (!ctx) return;
    const rect = $("#traverseMap").getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    view.w = rect.width;
    view.h = rect.height;
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(view.w * view.dpr);
    const ph = Math.round(view.h * view.dpr);
    if ($("#traverseMap").width !== pw || $("#traverseMap").height !== ph) {
      $("#traverseMap").width = pw;
      $("#traverseMap").height = ph;
    }
    computeScaleLimits();
    if (initial || !state.interacted) {
      fitMap(true, true);
    } else {
      camTarget.scale = clamp(camTarget.scale, minScale, maxScale);
      cam.scale = clamp(cam.scale, minScale, maxScale);
      clampCamera(camTarget);
      clampCamera(cam);
    }
  }

  function onResize() {
    if (!ctx) return;
    const prevW = view.w, prevH = view.h;
    resizeCanvas(false);
    if (!state.interacted && terrain && (Math.abs(view.w - prevW) > 2 || Math.abs(view.h - prevH) > 2)) {
      fitMap(true, true);
    }
  }

  function worldToScreen(x, y) {
    return {
      x: (x - cam.x) * cam.scale + view.w / 2,
      y: (y - cam.y) * cam.scale + view.h / 2
    };
  }

  function screenToWorld(x, y) {
    return {
      x: cam.x + (x - view.w / 2) / cam.scale,
      y: cam.y + (y - view.h / 2) / cam.scale
    };
  }

  function screenPoints(points) {
    return points.map((p) => worldToScreen(p[0], p[1]));
  }

  function screenLength(pts) {
    let n = 0;
    for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return n;
  }

  function traceScreen(g, pts) {
    if (!pts.length) return;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  }

  function strokePartial(pts, fraction) {
    if (fraction <= 0 || pts.length < 2) return;
    if (fraction >= 1) {
      traceScreen(ctx, pts);
      ctx.stroke();
      return;
    }
    const total = screenLength(pts);
    let remain = total * fraction;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (remain >= len) {
        ctx.lineTo(b.x, b.y);
        remain -= len;
      } else {
        const t = len > 0 ? remain / len : 1;
        ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        break;
      }
    }
    ctx.stroke();
  }

  function pointAt(pts, fraction) {
    const total = screenLength(pts);
    let remain = total * fraction;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (remain <= len) {
        const t = len > 0 ? remain / len : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
      }
      remain -= len;
    }
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    return { x: b.x, y: b.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  function chevrons(pts, fractions, color, size) {
    for (const f of fractions) {
      const p = pointAt(pts, f);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * .6, size * .62);
      ctx.lineTo(-size * .25, 0);
      ctx.lineTo(-size * .6, -size * .62);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPlate(x, y, lines, accent, opts) {
    opts = opts || {};
    const padX = 7, line1H = 11, line2H = 10;
    const h = lines[1] ? 30 : 19;
    ctx.font = '600 9px ' + FONT_MONO;
    let w = ctx.measureText(lines[0]).width;
    if (lines[1]) {
      ctx.font = '500 7px ' + FONT_MONO;
      w = Math.max(w, ctx.measureText(lines[1]).width);
    }
    w = Math.min(235, w + padX * 2 - 2) + (opts.selected ? 2 : 0);
    if (opts.align === "right") x -= w;
    else if (opts.align === "center") x -= w / 2;
    x = clamp(x, 8, Math.max(8, view.w - w - 8));
    y = clamp(y, 44, Math.max(44, view.h - h - 8));

    if (opts.anchor) {
      const tx = clamp(opts.anchor.x, x, x + w);
      const ty = clamp(opts.anchor.y, y, y + h);
      if (opts.anchor.x < x || opts.anchor.x > x + w || opts.anchor.y < y || opts.anchor.y > y + h) {
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = accent + (opts.selected ? "88" : "4d");
        ctx.lineWidth = .8;
        ctx.beginPath();
        ctx.moveTo(opts.anchor.x, opts.anchor.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.fillStyle = opts.bg || "rgba(4,9,14,.86)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent + (opts.selected ? "aa" : "52");
    ctx.lineWidth = .8;
    ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    ctx.fillStyle = accent;
    ctx.globalAlpha = opts.selected ? 1 : .75;
    ctx.fillRect(x, y, 2, h);
    ctx.globalAlpha = 1;

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = '600 9px ' + FONT_MONO;
    ctx.fillStyle = opts.selected ? "#f2f8fd" : "#d2dce7";
    ctx.fillText(lines[0], x + padX, y + (lines[1] ? 9.5 : 9.5));
    if (lines[1]) {
      ctx.font = '500 7px ' + FONT_MONO;
      ctx.fillStyle = accent + "c8";
      ctx.fillText(lines[1], x + padX, y + 21);
    }
    return { x, y, w, h };
  }

  // Free-floating labels need room between the outer waypoints; phones always use the compact map.
  function compactMap() {
    if (window.innerWidth < 720) return true;
    const span = (D.waypoints[D.waypoints.length - 1].x - D.waypoints[0].x) * cam.scale;
    return span < 330;
  }

  function drawTerrainLabels() {
    if (compactMap()) return;
    const reg = worldToScreen(D.labels.region.x, D.labels.region.y);
    if (reg.x > -100 && reg.x < view.w + 100) {
      ctx.save();
      ctx.font = '600 9px ' + FONT_MONO;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
      ctx.fillStyle = "rgba(255,226,196,.42)";
      ctx.shadowColor = "rgba(2,6,9,.9)";
      ctx.shadowBlur = 5;
      ctx.textAlign = "center";
      ctx.fillText(D.labels.region.text, reg.x, reg.y);
      ctx.strokeStyle = "rgba(255,200,150,.21)";
      ctx.lineWidth = .7;
      const w = ctx.measureText(D.labels.region.text).width;
      ctx.beginPath();
      ctx.moveTo(reg.x - w / 2 - 56, reg.y);
      ctx.lineTo(reg.x - w / 2 - 10, reg.y);
      ctx.moveTo(reg.x + w / 2 + 10, reg.y);
      ctx.lineTo(reg.x + w / 2 + 56, reg.y);
      ctx.stroke();
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      ctx.restore();
    }

    const mount = worldToScreen(D.labels.mount.x, D.labels.mount.y);
    ctx.save();
    ctx.font = '600 7.5px ' + FONT_MONO;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "1.6px";
    ctx.fillStyle = "rgba(225,235,245,.34)";
    ctx.shadowColor = "rgba(2,6,9,.9)";
    ctx.shadowBlur = 4;
    ctx.textAlign = "center";
    ctx.fillText(D.labels.mount.text, mount.x, mount.y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.restore();

    for (const key of ["hollowA", "hollowB"]) {
      const p = worldToScreen(D.labels[key].x, D.labels[key].y);
      if (p.x < 0 || p.x > view.w || p.y < 0 || p.y > view.h) continue;
      ctx.save();
      ctx.font = '500 6.5px ' + FONT_MONO;
      ctx.fillStyle = "rgba(190,212,232,.46)";
      ctx.shadowColor = "rgba(2,6,9,.9)";
      ctx.shadowBlur = 4;
      ctx.textAlign = "center";
      ctx.fillText(D.labels[key].text, p.x, p.y);
      ctx.strokeStyle = "rgba(180,205,230,.25)";
      ctx.lineWidth = .6;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 4, 1.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const sc = worldToScreen(D.labels.scarp.x, D.labels.scarp.y);
    if (sc.x > 0 && sc.x < view.w && sc.y > 0 && sc.y < view.h) {
      ctx.save();
      ctx.translate(sc.x, sc.y);
      ctx.rotate(-1.18);
      ctx.font = '600 7px ' + FONT_MONO;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "1.5px";
      ctx.fillStyle = "rgba(255,182,164,.46)";
      ctx.shadowColor = "rgba(2,6,9,.9)";
      ctx.shadowBlur = 4;
      ctx.textAlign = "center";
      ctx.fillText(D.labels.scarp.text, 0, 0);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      ctx.restore();
    }
  }

  function drawBenchmark() {
    if (!state.overlays.benchmark || !terrain) return;
    const pts = screenPoints(terrain.routes.curiosity);
    ctx.save();
    ctx.strokeStyle = "rgba(242,196,93,.82)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 7]);
    ctx.lineDashOffset = reducedMotion ? 0 : -performance.now() / 85;
    ctx.shadowColor = "rgba(242,196,93,.28)";
    ctx.shadowBlur = 7;
    traceScreen(ctx, pts);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    for (let i = 8; i < pts.length; i += 9) {
      const a = pts[i - 1], b = pts[i];
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(ang) * 2.6, b.y - Math.sin(ang) * 2.6);
      ctx.lineTo(b.x + Math.cos(ang) * 2.6, b.y + Math.sin(ang) * 2.6);
      ctx.strokeStyle = "rgba(242,196,93,.55)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const labelAt = worldToScreen(218, 806);
    drawPlate(labelAt.x, labelAt.y, ["CURIOSITY GROUND TRUTH", "MSL SOLS 4535–4611"], "#f2c45d", { anchor: labelAt });
    ctx.restore();
  }

  function drawPLSSEnvelope(now) {
    if (!state.overlays.plss) return;
    const center = D.MAP.base;
    const pts = [];
    for (let i = 0; i < 96; i++) {
      const a = (Math.PI * 2 * i) / 96;
      const wobble = 1 + Math.sin(a * 3 + 1.2) * .022 + Math.cos(a * 5.1) * .013;
      pts.push(worldToScreen(
        center.x + Math.cos(a) * 612 * wobble,
        center.y + Math.sin(a) * 522 * wobble
      ));
    }
    ctx.save();
    traceScreen(ctx, pts);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,180,94,.028)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,180,94,.52)";
    ctx.lineWidth = 1.1;
    ctx.setLineDash([7, 8]);
    ctx.lineDashOffset = reducedMotion ? 0 : -now / 65;
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16;
      const rx = 612, ry = 522;
      const x = center.x + Math.cos(a) * rx, y = center.y + Math.sin(a) * ry;
      const s1 = worldToScreen(x, y), s2 = worldToScreen(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.strokeStyle = "rgba(255,180,94,.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (!compactMap()) {
      const labelP = worldToScreen(center.x + 380, center.y - 440);
      drawPlate(labelP.x, labelP.y, ["PLSS 25% WALKBACK CAP", "1,200 Wh · SCHEMATIC ENVELOPE"], "#ffb45e", { anchor: labelP });
    }
    ctx.restore();
  }

  function drawRoutes(now) {
    if (!terrain) return;
    const reveal = reducedMotion ? 1 : clamp((now - revealStart) / 1500, 0, 1);
    const ease = 1 - Math.pow(1 - reveal, 3);
    const outPts = screenPoints(terrain.routes.outbound);
    const retPts = screenPoints(terrain.routes.return);
    const abortPts = screenPoints(terrain.routes.abort);
    const dim = state.spe;

    ctx.save();
    ctx.globalAlpha = dim ? .16 : 1;

    // casing
    ctx.strokeStyle = "rgba(2,8,12,.8)";
    ctx.lineWidth = 7;
    strokePartial(outPts, ease);
    // main outbound
    ctx.strokeStyle = "#69e9ff";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "rgba(105,233,255,.45)";
    ctx.shadowBlur = 9;
    strokePartial(outPts, ease);
    ctx.shadowBlur = 0;
    // moving light
    ctx.strokeStyle = "rgba(236,255,255,.55)";
    ctx.lineWidth = .9;
    ctx.setLineDash([1.5, 13]);
    ctx.lineDashOffset = reducedMotion ? 0 : -now / 26;
    strokePartial(outPts, ease);
    ctx.setLineDash([]);
    chevrons(outPts.slice(0, Math.max(2, Math.floor(outPts.length * ease))), [.16, .42, .69, .9], "rgba(190,252,255,.85)", 4.2);

    // return leg
    const retProgress = clamp((ease - .42) / .58, 0, 1);
    ctx.globalAlpha = dim ? .13 : .7;
    ctx.strokeStyle = "#69e9ff";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 7]);
    ctx.lineDashOffset = reducedMotion ? 0 : now / 48;
    strokePartial(retPts, retProgress);
    ctx.setLineDash([]);
    ctx.globalAlpha = dim ? .13 : .45;
    chevrons(retPts.slice(0, Math.max(2, Math.floor(retPts.length * retProgress))), [.35, .7], "rgba(105,233,255,.85)", 3.2);

    ctx.restore();

    if (state.spe) {
      const abortReveal = reducedMotion ? 1 : clamp((now - abortRevealStart) / 950, 0, 1);
      const ab = 1 - Math.pow(1 - abortReveal, 3);
      ctx.save();
      ctx.strokeStyle = "rgba(5,7,9,.85)";
      ctx.lineWidth = 8;
      strokePartial(abortPts, ab);
      ctx.strokeStyle = "#ff5f66";
      ctx.lineWidth = 2.8;
      ctx.shadowColor = "rgba(255,95,102,.6)";
      ctx.shadowBlur = 13;
      strokePartial(abortPts, ab);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,235,235,.7)";
      ctx.lineWidth = .9;
      ctx.setLineDash([2, 10]);
      ctx.lineDashOffset = reducedMotion ? 0 : -now / 20;
      strokePartial(abortPts, ab);
      ctx.setLineDash([]);
      chevrons(abortPts.slice(0, Math.max(2, Math.floor(abortPts.length * ab))), [.25, .55, .83], "rgba(255,210,212,.92)", 4.4);
      ctx.restore();
    }
  }

  function drawOverlayLabels() {
    if (compactMap()) return;
    if (state.spe) {
      const p = worldToScreen(756, 674);
      drawPlate(p.x, p.y, ["MIN-TIME RETURN", "DOSE-LIMITED SHELTER LEG"], "#ffb45e", { anchor: p });
    }
    if (state.overlays.slope) {
      const p = worldToScreen(1075, 758);
      drawPlate(p.x, p.y, [">22° STABILITY LIMIT", "±2.0 m CO-REGISTRATION BUFFER"], "#ff6269", { anchor: p });
    }
    if (state.overlays.los) {
      const p1 = worldToScreen(1048, 622);
      const p2 = worldToScreen(610, 826);
      drawPlate(p1.x, p1.y, ["UHF SHADOW", "TELEMETRY BUFFERED"], "#b08cff", { anchor: p1 });
      drawPlate(p2.x, p2.y, ["UHF SHADOW", "RF OCCLUSION"], "#b08cff", { anchor: p2 });
    }
  }

  function drawBaseMarker(now) {
    const s = worldToScreen(D.MAP.base.x, D.MAP.base.y);
    ctx.save();
    const pulse = reducedMotion ? 0 : (Math.sin(now / 520) + 1) / 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 17 + pulse * 5, 0, Math.PI * 2);
    ctx.strokeStyle = state.spe ? "rgba(84,227,165," + (.42 - pulse * .25) + ")" : "rgba(255,180,94," + (.35 - pulse * .22) + ")";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(s.x, s.y, 11, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(5,11,16,.94)";
    ctx.fill();
    ctx.strokeStyle = state.spe ? "#54e3a5" : "#ffb45e";
    ctx.lineWidth = 1.7;
    ctx.stroke();

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = state.spe ? "#54e3a5" : "#ffb45e";
    ctx.fillRect(-3.6, -3.6, 7.2, 7.2);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 13);
    ctx.lineTo(s.x, s.y - 19);
    ctx.strokeStyle = state.spe ? "#54e3a5" : "#ffb45e";
    ctx.lineWidth = .9;
    ctx.stroke();

    drawPlate(s.x + 16, s.y + 12, [
      state.spe ? "ROVER BASE / SHELTER" : "ROVER BASE",
      "PRESSURIZED · UHF MAST 3.5 m"
    ], state.spe ? "#54e3a5" : "#ffb45e", { selected: state.spe });
    ctx.restore();
  }

  function drawWaypointMarkers(now) {
    if (!terrain) return;
    const positions = {};
    D.waypoints.forEach((w, i) => {
      const s = worldToScreen(w.x, w.y);
      positions[w.id] = s;
      const active = state.selected === w.id || state.hover === w.id;
      const pulse = reducedMotion || w.deferred ? 0 : (Math.sin(now / 430 + i * 1.3) + 1) / 2;

      ctx.save();
      if (active) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 21, 0, Math.PI * 2);
        ctx.fillStyle = w.accent + "12";
        ctx.fill();
        ctx.strokeStyle = w.accent + "55";
        ctx.lineWidth = .8;
        ctx.stroke();
      }
      if (!w.deferred) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 14 + (active ? 2 : 0), -Math.PI * .82, -Math.PI * .34);
        ctx.arc(s.x, s.y, 14 + (active ? 2 : 0), -Math.PI * .2, Math.PI * .28);
        ctx.strokeStyle = w.accent + "88";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.x, s.y, 18 + pulse * 4, 0, Math.PI * 2);
        ctx.strokeStyle = w.accent + "1f";
        ctx.lineWidth = .8;
        ctx.stroke();
      } else {
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 14, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,98,105,.5)";
        ctx.lineWidth = .9;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.arc(s.x, s.y, 9.5, 0, Math.PI * 2);
      ctx.fillStyle = "#050c12";
      ctx.fill();
      ctx.strokeStyle = w.accent;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.fillStyle = w.accent;
      ctx.font = '600 7px ' + FONT_MONO;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(w.id, s.x, s.y + .3);

      if (w.deferred) {
        ctx.beginPath();
        ctx.moveTo(s.x - 5.5, s.y + 5.5);
        ctx.lineTo(s.x + 5.5, s.y - 5.5);
        ctx.strokeStyle = "rgba(255,98,105,.75)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    });

    D.waypoints.forEach((w) => {
      const s = positions[w.id];
      const active = state.selected === w.id || state.hover === w.id;
      if (compactMap() && !active) return;
      const value = w.deferred
        ? "SOLVER REJECT"
        : w.id === "W3" ? "+14.8 m" : (w.metrics[0].value + " " + (w.metrics[0].unit || "")).trim();
      const sub = "P" + w.priority + " · " + w.distanceKm.toFixed(2) + " km · " + value;
      drawPlate(
        s.x + w.label.dx,
        s.y + w.label.dy,
        [w.id + " · " + w.name.toUpperCase(), sub],
        w.accent,
        { align: w.label.align, anchor: s, selected: active }
      );
    });
  }

  function updateScaleBar() {
    if (!view.w) return;
    const raw = (104 / cam.scale) * M.mPerPx;
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
    const opts = [1, 2, 2.5, 5, 10].map((n) => n * pow);
    let nice = opts.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
    let px = nice / M.mPerPx * cam.scale;
    if (px > 150) { nice /= 2; px = nice / M.mPerPx * cam.scale; }
    if (px < 46) { nice *= 2; px = nice / M.mPerPx * cam.scale; }
    const label = nice >= 1000 ? (nice / 1000).toFixed(nice % 1000 ? 1 : 0) + " km" : Math.round(nice) + " m";
    const key = Math.round(px) + label;
    if (key !== scaleCache) {
      scaleCache = key;
      $("#scaleLine").style.width = px.toFixed(0) + "px";
      $("#scaleLabel").textContent = label;
    }
  }

  function updateReadout(world) {
    const spans = $$("#mapReadout span");
    if (spans.length < 3) return;
    const lat = M.latTop + (world.y / M.h) * (M.latBottom - M.latTop);
    const lon = M.lonLeft + (world.x / M.w) * (M.lonRight - M.lonLeft);
    const elev = (M.baseY - world.y) * M.mPerPxZ;
    spans[0].textContent = Math.abs(lat).toFixed(5) + "°S";
    spans[1].textContent = lon.toFixed(5) + "°E";
    spans[2].textContent = (elev >= 0 ? "+" : "") + elev.toFixed(1) + " m";
  }

  function draw(now) {
    if (!ctx) return;
    frameCount++;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.fillStyle = "#170c09";
    ctx.fillRect(0, 0, view.w, view.h);
    if (!terrain) return;

    const ease = reducedMotion ? 1 : .18;
    cam.x += (camTarget.x - cam.x) * ease;
    cam.y += (camTarget.y - cam.y) * ease;
    cam.scale += (camTarget.scale - cam.scale) * ease;
    if (Math.abs(camTarget.x - cam.x) < .05) cam.x = camTarget.x;
    if (Math.abs(camTarget.y - cam.y) < .05) cam.y = camTarget.y;
    if (Math.abs(camTarget.scale - cam.scale) < .0002) cam.scale = camTarget.scale;

    for (const key of Object.keys(layerAlpha)) {
      const target = ALPHA_TARGET[key]() ? 1 : 0;
      layerAlpha[key] += (target - layerAlpha[key]) * .15;
      if (Math.abs(layerAlpha[key] - target) < .004) layerAlpha[key] = target;
    }

    const origin = worldToScreen(0, 0);
    const sw = M.w * cam.scale, sh = M.h * cam.scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.globalAlpha = 1;
    ctx.drawImage(terrain.base, origin.x, origin.y, sw, sh);
    for (const key of ["tpi", "thermal", "crism", "slope", "los"]) {
      const alpha = layerAlpha[key];
      if (alpha <= .002) continue;
      ctx.globalAlpha = alpha * ALPHA_MULT[key];
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(terrain.layers[key], origin.x, origin.y, sw, sh);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    drawTerrainLabels();
    drawBenchmark();
    drawPLSSEnvelope(now);
    drawRoutes(now);
    drawBaseMarker(now);
    drawWaypointMarkers(now);
    drawOverlayLabels();
    updateScaleBar();

    // edge vignette sits in CSS; draw a subtle map edge line here
    ctx.strokeStyle = "rgba(38,58,77,.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(.5, .5, view.w - 1, view.h - 1);
  }

  function loop(now) {
    draw(now);
    requestAnimationFrame(loop);
  }

  function findWaypointAt(sx, sy) {
    let best = null, bestD = 24;
    for (const w of D.waypoints) {
      const s = worldToScreen(w.x, w.y);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  }

  function focusWorld(x, y) {
    state.interacted = true;
    camTarget.scale = clamp(Math.max(camTarget.scale, minScale * 1.55), minScale, maxScale);
    camTarget.x = x;
    camTarget.y = y;
    clampCamera(camTarget);
    hideMapHint();
  }

  function getPoint(e) {
    const r = $("#traverseMap").getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function bindMapControls() {
    const canvas = $("#traverseMap");

    $("#zoomIn").addEventListener("click", () => {
      state.interacted = true;
      camTarget.scale = clamp(camTarget.scale * 1.28, minScale, maxScale);
      clampCamera(camTarget);
      hideMapHint();
    });
    $("#zoomOut").addEventListener("click", () => {
      state.interacted = true;
      camTarget.scale = clamp(camTarget.scale / 1.28, minScale, maxScale);
      clampCamera(camTarget);
      hideMapHint();
    });
    $("#fitView").addEventListener("click", () => fitMap(false, false));

    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      const p = getPoint(e);
      pointer.down = true;
      pointer.moved = false;
      pointer.x = p.x; pointer.y = p.y;
      pointer.startX = p.x; pointer.startY = p.y;
      pointer.startCam.x = camTarget.x;
      pointer.startCam.y = camTarget.y;
      canvas.classList.add("dragging");
      state.interacted = true;
      hideMapHint();
    });

    canvas.addEventListener("pointermove", (e) => {
      const p = getPoint(e);
      pointer.x = p.x; pointer.y = p.y;
      const world = screenToWorld(p.x, p.y);
      cursorWorld = world;
      updateReadout(world);
      if (pointer.down) {
        const dx = p.x - pointer.startX;
        const dy = p.y - pointer.startY;
        if (Math.hypot(dx, dy) > 3) pointer.moved = true;
        if (pointer.moved) {
          camTarget.x = pointer.startCam.x - dx / cam.scale;
          camTarget.y = pointer.startCam.y - dy / cam.scale;
          clampCamera(camTarget);
          cam.x = camTarget.x;
          cam.y = camTarget.y;
        }
      } else {
        const wp = findWaypointAt(p.x, p.y);
        state.hover = wp ? wp.id : null;
        canvas.style.cursor = wp ? "pointer" : "grab";
      }
    });

    function endPointer(e) {
      if (!pointer.down) return;
      pointer.down = false;
      $("#traverseMap").classList.remove("dragging");
      if (!pointer.moved) {
        const p = getPoint(e);
        const wp = findWaypointAt(p.x, p.y);
        if (wp) openWaypoint(wp.id);
      }
    }
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", () => {
      pointer.down = false;
      $("#traverseMap").classList.remove("dragging");
    });
    canvas.addEventListener("pointerleave", () => {
      if (!pointer.down) { state.hover = null; }
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      state.interacted = true;
      hideMapHint();
      const p = getPoint(e);
      const oldScale = camTarget.scale;
      const factor = Math.exp(-e.deltaY * .0012);
      const nextScale = clamp(oldScale * factor, minScale, maxScale);
      const wx = camTarget.x + (p.x - view.w / 2) / oldScale;
      const wy = camTarget.y + (p.y - view.h / 2) / oldScale;
      camTarget.scale = nextScale;
      camTarget.x = wx - (p.x - view.w / 2) / nextScale;
      camTarget.y = wy - (p.y - view.h / 2) / nextScale;
      clampCamera(camTarget);
    }, { passive: false });

    canvas.addEventListener("keydown", (e) => {
      const step = 60 / cam.scale;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        if (e.key === "ArrowLeft") camTarget.x -= step;
        if (e.key === "ArrowRight") camTarget.x += step;
        if (e.key === "ArrowUp") camTarget.y -= step;
        if (e.key === "ArrowDown") camTarget.y += step;
        clampCamera(camTarget);
        state.interacted = true;
      } else if (e.key === "Enter" && state.hover) {
        e.preventDefault();
        openWaypoint(state.hover);
      } else if (e.key === "+" || e.key === "=") {
        camTarget.scale = clamp(camTarget.scale * 1.2, minScale, maxScale);
      } else if (e.key === "-" || e.key === "_") {
        camTarget.scale = clamp(camTarget.scale / 1.2, minScale, maxScale);
      }
    });
  }

  let cursorWorld = { x: 742, y: 550 };

  async function initMap() {
    ctx = $("#traverseMap").getContext("2d", { alpha: false });
    resizeCanvas(true);
    const loading = $("#mapLoading");
    const loadingTitle = $("#mapLoadingTitle");
    try {
      terrain = await window.ARES_TERRAIN.build();
    } catch (err) {
      console.error("ARES-WALK terrain generation failed", err);
      loading.classList.add("is-error");
      loadingTitle.textContent = "BASEMAP LINK UNAVAILABLE";
      toast("Orbital basemap could not be fused — check local asset path.", true);
      return;
    }
    layerAlpha = {
      tpi: state.layers.hirise ? 1 : 0,
      thermal: state.layers.themis ? 1 : 0,
      crism: state.layers.crism ? 1 : 0,
      slope: state.overlays.slope ? 1 : 0,
      los: state.overlays.los ? 1 : 0
    };
    revealStart = performance.now();
    updateReadout(cursorWorld);
    bindMapControls();
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => onResize());
      ro.observe($(".map-stage"));
    }
    requestAnimationFrame(loop);
    requestAnimationFrame(() => {
      loading.classList.add("is-done");
      setTimeout(() => loading.remove(), 650);
    });
  }

  function init() {
    renderLayers();
    renderOverlays();
    renderLegend();
    renderWaypoints();
    renderRules();
    updateMissionStats();
    updateHUD(null);
    bindUI();
    initMap();
    setInterval(tick, 1000);
    setTimeout(hideMapHint, 9000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
