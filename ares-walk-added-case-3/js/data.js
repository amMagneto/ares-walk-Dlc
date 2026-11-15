/* ARES-WALK — mission copy, sensor layers, routes, waypoints */
window.ARES_DATA = (function () {
  "use strict";

  const MAP = {
    w: 1600,
    h: 1100,
    renderScale: 1.5,
    mPerPx: 1.6,
    base: { x: 320, y: 655 },
    baseY: 655,
    mPerPxZ: 0.0658,
    latTop: -4.7515,
    latBottom: -4.7485,
    lonLeft: 137.398,
    lonRight: 137.402
  };

  const layers = [
    {
      id: "hirise",
      index: "L1",
      name: "HiRISE Stereo DTM + Boxwork TPI",
      sensor: "MRO HiRISE",
      resolution: "1.0 m/px",
      accent: "#ffb45e",
      defaultOn: true,
      short: 'Extracts local ridge crests vs. sunken polygon interiors using Topographic Position Index (<span class="formula">TPI = z − z̄<sub>13 m</sub></span>).',
      details: 'Derived from MRO HiRISE stereo Digital Terrain Models (<code>DTEEC_*</code>). Positive TPI values (warm tones) highlight indurated diagenetic fracture ridges that provide firm footing; negative TPI values (cool tones) mark recessed polygonal basins prone to sand accumulation.'
    },
    {
      id: "themis",
      index: "L2",
      name: "Odyssey THEMIS Thermal Inertia",
      sensor: "Mars Odyssey THEMIS",
      resolution: "100 m/px resampled",
      accent: "#79b8ff",
      defaultOn: false,
      short: "Separates load-bearing bedrock (<b>&gt;350 SI</b>) from loose aeolian sand traps (<b>&lt;180 SI</b>).",
      details: "Computed from Mars Odyssey THEMIS nighttime brightness temperature. Fine windblown dust and sand cool rapidly after sunset (low thermal inertia), imposing up to a <b>2.4×</b> regolith sinkage and metabolic energy penalty on suited astronauts."
    },
    {
      id: "crism",
      index: "L3",
      name: "MRO CRISM D2300 Phyllosilicate Index",
      sensor: "MRO CRISM · MTRDR",
      resolution: "18 m/px resampled",
      accent: "#e6a5ff",
      defaultOn: true,
      short: "Maps hydrated Fe/Mg-smectite clay abundance along mineralized fracture walls.",
      details: "Derived from MRO CRISM <code>MTRDR</code> hyperspectral reflectance cubes (2.3 μm absorption band depth). Elevated <code>D2300</code> signatures pinpoint ancient groundwater-altered veins—primary astrobiological and paleoclimate sampling targets."
    }
  ];

  const overlays = [
    {
      id: "slope",
      icon: "i-alert",
      accent: "#ff6269",
      label: "Slope >22° + ±2 m buffer",
      sub: "Hazard envelope",
      defaultOn: true
    },
    {
      id: "los",
      icon: "i-signal",
      accent: "#b08cff",
      label: "UHF Line-of-Sight",
      sub: "RF dead-zone viewshed",
      defaultOn: false
    },
    {
      id: "plss",
      icon: "i-target",
      accent: "#ffb45e",
      label: "PLSS 25% walkback",
      sub: "1,200 Wh energy cap",
      defaultOn: true
    },
    {
      id: "benchmark",
      icon: "i-route",
      accent: "#f2c45d",
      label: "Curiosity ground truth",
      sub: "Sols 4535–4611",
      defaultOn: false
    }
  ];

  const rules = [
    {
      id: "slope",
      num: "01",
      title: "Slope >22° + ±2 m Co-Registration Buffer",
      sub: "Trafficability ceiling · hazard envelope",
      copy: "Red zones mark terrain exceeding the <b>22°</b> suited stability limit or boulder fields, expanded by a <b>2.0 m</b> spatial uncertainty halo to account for orbital-to-surface pointing offsets."
    },
    {
      id: "los",
      num: "02",
      title: "UHF Line-of-Sight (LOS) Viewshed",
      sub: "Ray-traced comms geometry",
      copy: "Ray-traced from the pressurized rover's <b>3.5 m</b> comms mast to the astronaut's <b>1.8 m</b> PLSS antenna. Shaded purple pockets indicate terrain-occluded RF dead zones where telemetry buffers locally and navigation risk increases."
    },
    {
      id: "plss",
      num: "03",
      title: "PLSS 25% Walkback Envelope (0.38g Metabolic Model)",
      sub: "Hard energy reserve",
      copy: 'At every waypoint <span class="math">i</span>, cumulative outbound energy plus minimum safe return energy (<span class="math">E<sub>out</sub> + E<sub>ret</sub></span>) cannot exceed <b>1,200 Wh</b> (<b>75%</b> of total <b>1,600 Wh</b> PLSS capacity). Any science station breaching this curve is automatically deferred.'
    },
    {
      id: "spe",
      num: "04",
      title: "SPE Solar Flare Emergency Abort (TRIGGER SPE SOLAR FLARE)",
      sub: "Radiation abort mode",
      copy: "Simulates an acute Solar Particle Event detected by the rover's Radiation Assessment Detector (RAD). Immediately aborts unvisited science targets and switches pathfinding from <i>minimum metabolic energy</i> to <i>minimum traversal time</i> to reach radiation shelter before dose limits are exceeded."
    },
    {
      id: "benchmark",
      num: "05",
      title: "Ground-Truth Benchmark (Curiosity Sols 4535–4611)",
      sub: "Independent route convergence",
      copy: 'Dashed gold track shows NASA <i>Curiosity</i>\'s actual historical drive corridor across Mount Sharp\'s boxwork terrain. ARES-WALK\'s independent physics router converges onto the same ridge-crest corridor while avoiding sandy hollow traps.'
    }
  ];

  const waypoints = [
    {
      id: "W1",
      priority: 1,
      name: "Ridge Vein",
      type: "Fe/Mg-Phyllosilicate Outcrop",
      status: "Sampling target",
      listStatus: "ACTIVE",
      x: 445, y: 560,
      distanceKm: 0.26,
      eta: "0:38",
      energy: 152,
      accent: "#69e9ff",
      label: { dx: -16, dy: 18, align: "right" },
      listMeta: "Priority 1 · Fe/Mg-Phyllosilicate",
      metrics: [
        { label: "THERMAL INERTIA", value: "412", unit: "SI" },
        { label: "D2300 DEPTH", value: "0.081" },
        { label: "RIDGE HEIGHT", value: "1.4", unit: "m" },
        { label: "WALK DISTANCE", value: "0.26", unit: "km" }
      ],
      briefing: 'Exposed <b>1.4 m-tall</b> diagenetic boxwork ridge exhibiting strong CRISM <code>D2300</code> clay absorption and high thermal inertia (<b>412 SI</b>).',
      fieldTask: "Image laminated fracture fill with hand lens and collect a <b>50 g</b> core sample across the vein-host rock contact.",
      caution: "",
      foot: { left: "VEIN CONTACT", right: "SAMPLE MASS 50 g" }
    },
    {
      id: "W2",
      priority: 2,
      name: "Polygon Contact",
      type: "Siderite / Smectite Boundary",
      status: "Sampling target",
      listStatus: "ACTIVE",
      x: 620, y: 560,
      distanceKm: 0.54,
      eta: "1:04",
      energy: 336,
      accent: "#ffb45e",
      label: { dx: 18, dy: -46, align: "left" },
      listMeta: "Priority 2 · Siderite / Smectite",
      metrics: [
        { label: "THERMAL INERTIA", value: "364", unit: "SI" },
        { label: "D2300 DEPTH", value: "0.063" },
        { label: "RIDGE NODE", value: "3-WAY" },
        { label: "WALK DISTANCE", value: "0.54", unit: "km" }
      ],
      briefing: "Intersection node of three boxwork ridges bordering a shallow sand-mantled hollow. Ideal stratigraphic window into shifting groundwater chemistry during Mount Sharp's drying transition.",
      fieldTask: "",
      caution: "Keep boots on the north ridge shoulder; hollow floor drops below <b>170 SI</b>.",
      foot: { left: "STRATIGRAPHIC WINDOW", right: "HOLLOW FLOOR <170 SI" }
    },
    {
      id: "W3",
      priority: 3,
      name: "Upper Crest",
      type: "Hydrated Mg-Sulfate Cap",
      status: "Survey target",
      listStatus: "ACTIVE",
      x: 790, y: 430,
      distanceKm: 0.90,
      eta: "1:46",
      energy: 512,
      accent: "#54e3a5",
      label: { dx: 18, dy: 18, align: "left" },
      listMeta: "Priority 3 · Hydrated Mg-Sulfate",
      metrics: [
        { label: "ELEVATION", value: "+14.8", unit: "m" },
        { label: "D2300 DEPTH", value: "0.044" },
        { label: "RIDGE SLOPE", value: "9.6", unit: "°" },
        { label: "WALK DISTANCE", value: "0.90", unit: "km" }
      ],
      briefing: "Highest reachable vantage point along the southeast ridge spine (<b>+14.8 m</b> above base). Captures transition into sulfate-bearing strata and provides unobstructed visual survey of the upper talus slope.",
      fieldTask: "",
      caution: "",
      foot: { left: "VANTAGE +14.8 m", right: "SULFATE TRANSITION" }
    },
    {
      id: "W4",
      priority: 4,
      name: "Far Scarp Rim",
      type: "Deferred Out-of-Envelope Target",
      status: "Solver rejected",
      listStatus: "DEFERRED",
      x: 995, y: 335,
      distanceKm: 1.16,
      eta: "2:34",
      energy: 1286,
      accent: "#ff6269",
      deferred: true,
      label: { dx: 14, dy: -48, align: "left" },
      listMeta: "Priority 4 · Deferred target",
      metrics: [
        { label: "SCARP SLOPE", value: "24.6", unit: "°" },
        { label: "THERMAL INERTIA", value: "198", unit: "SI" },
        { label: "PROJ. ENERGY", value: "1,688", unit: "Wh" },
        { label: "WALK DISTANCE", value: "1.16", unit: "km" }
      ],
      briefing: "High-angle talus scarp (<b>&gt;24° slope</b>) on the eastern flank. Automatically rejected by flight-rule solver: traversing the scarp approach violates the <b>22°</b> stability ceiling and breaches the <b>25%</b> PLSS walkback reserve.",
      fieldTask: "",
      caution: "",
      foot: { left: "OUT OF ENVELOPE", right: "PLAN NOT GENERATED" }
    }
  ];

  const outbound = [
    [320, 655], [355, 624], [397, 593], [445, 560], [492, 548], [552, 554],
    [620, 560], [662, 538], [704, 505], [746, 470], [790, 430]
  ];

  const returnPath = [
    [790, 430], [826, 468], [851, 512], [835, 562], [790, 602], [724, 633],
    [654, 651], [580, 659], [505, 661], [432, 659], [373, 655], [320, 655]
  ];

  const abortPath = [
    [620, 560], [652, 598], [646, 631], [600, 650], [544, 659], [480, 662],
    [420, 660], [365, 656], [320, 655]
  ];

  const curiosity = [
    [40, 900], [150, 838], [238, 763], [318, 716], [408, 724], [492, 690],
    [566, 638], [646, 606], [724, 584], [802, 536], [870, 482], [940, 424],
    [1012, 372], [1104, 324], [1200, 284], [1320, 262]
  ];

  const energy = {
    outbound: 716,
    return: 332,
    total: 1048,
    cap: 1200,
    capacity: 1600,
    reserve: 552,
    floor: 400,
    abortReturn: 214
  };

  const legend = [
    { id: "ridge", label: "Ridge crest", cls: "ridge" },
    { id: "sand", label: "Sand hollow", cls: "sand" },
    { id: "route", label: "Active route", cls: "route" },
    { id: "return", label: "Return leg", cls: "return" },
    { id: "slope", label: "Slope hazard", cls: "hazard", overlay: "slope" },
    { id: "los", label: "UHF shadow", cls: "los", overlay: "los" },
    { id: "plss", label: "PLSS cap", cls: "plss", overlay: "plss" },
    { id: "benchmark", label: "Curiosity", cls: "msl", overlay: "benchmark" }
  ];

  const labels = {
    region: { x: 655, y: 208, text: "ALTADENA BOXWORK UNIT" },
    mount: { x: 498, y: 128, text: "LOWER MOUNT SHARP · AEOLIS MONS" },
    scarp: { x: 1132, y: 672, text: "TALUS SCARP  >24°" },
    hollowA: { x: 548, y: 690, text: "SAND HOLLOW H-07" },
    hollowB: { x: 892, y: 600, text: "SAND HOLLOW H-12" }
  };

  return {
    MAP, layers, overlays, rules, waypoints,
    routes: { outbound, return: returnPath, abort: abortPath, curiosity },
    energy, legend, labels
  };
})();
