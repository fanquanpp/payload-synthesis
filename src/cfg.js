/* ══════════════════════════════════════════════════════════════════
   cfg.js — tuning constants + the 11-step payload ladder
   Art direction: NASA-punk (70s functional aerospace hardware)
   Exposed as window.SA.cfg
   ══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ── playfield ────────────────────────────────────────────────
     BH (height) is fixed. BW (width) is chosen at layout time from
     the room the viewport actually offers, so a wide screen gets a
     wide chamber instead of a letterboxed column. Physics reads
     CFG.BW live, so the board can be re-sized between games.    */
  var BASE_BW = 100;
  var BH = 136.4;
  var MIN_ASPECT = 0.733;          /* portrait floor — never narrower  */
  var MAX_ASPECT = 1.15;           /* landscape ceiling — never wider  */

  var CFG = {
    BW: BASE_BW, BH: BH,
    MIN_ASPECT: MIN_ASPECT, MAX_ASPECT: MAX_ASPECT,

    GRAV: 172,                     /* a bit heavier than earth-ish */
    FIXED: 1 / 180,
    MAX_STEPS: 6,
    ITER_V: 6,
    ITER_P: 5,                     /* position passes (sorted by radius) */
    SLOP: 0.05,                    /* base contact slop (scales with radius) */
    HULL_SHRINK: 0.985,            /* 1.5% each: big hardware kisses, never hovers */
    MU: 0.28,                      /* grippier: parts grip the floor */
    AIR_DRAG: 0.085,               /* thicker air: less floating */
    CORRECTION: 0.5,
    MAX_SPEED: 260,
    CREEP_V2: 36,                  /* below 6 u/s: hardware sits still  */
    CREEP_DAMP: 3.4,               /* extra damping that stops creep    */

    DEEP_PASSES: 2,                /* relaxation passes for deep overlap */
    DEEP_THRESHOLD: 0.5,           /* only pairs this far past tolerance */
    DEEP_OVER: 0.5,                /* under-relaxed: never break contact */

    SLEEP_VEL2: 5.0,               /* freeze a pile before creep sets in */
    SLEEP_TIME: 0.45,
    SLEEP_PEN_SLOP: 0.4,           /* may only sleep when not overlapping */
    WAKE_VEL2: 3.5,
    WAKE_DIST: 0.5,

    IMPACT_MILD: 16,
    IMPACT_STRONG: 38,
    IMPACT_HUGE: 78,
    REST_MILD: 0.06,
    REST_STRONG: 0.13,
    REST_HUGE: 0.24,   /* dead-ish contacts: weight lands, stays */

    ALIGN_THRESH: 0.045,           /* narrower: only truly vertical stacks */
    PERTURB: 0.18,                 /* a whisper: settle, don't swim */
    ROLL_BIAS: 0.25,

    MAX_SPAWN: 4,
    DROP_Y: 12,
    DROP_CD: 0.14,
    INPUT_BUFFER: 0.28,            /* a press during cooldown still fires */
    MAX_BODIES: 120,

    TOP_LINE: 30,
    OVER_TIME: 6.0,
    DROP_GRACE: 0.85,

    MAX_PARTS: 320,
    MAX_FLOATS: 14,
    MAX_WAVES: 14,                 /* wave sprite pool (fx.js) */
    MAX_RINGS: 10,
    MAX_LOG: 7,

    COMBO_WINDOW: 2.6,             /* base chain window; +0.05s per link */
    COMBO_CAP: 32,                 /* multiplier ceiling — deep chains pay */

    SKILL_STEP: 10000,             /* points per reject charge */
    SKILL_MAX: 9,                  /* stockpile cap */
  };

  /* ── payload ladder ──────────────────────────────────────────
     Eleven pieces of flight hardware. Each carries its own
     functional pattern, its own single vivid accent, its own form.

     r    : visual bounding radius, in world units — the renderer
            scales the mesh by this and physics.js builds the collision
            hull in the same unit, so hull and silhouette are the same
            shape. No separate collision factor: a part is exactly as
            solid as it looks.
     mass : used for invMass (1/mass²), so big parts shove small ones
     ──────────────────────────────────────────────────────────── */
  var LADDER = [
    { id: 0,  code: 'P/L 01',   name: '螺栓',     en: 'BOLT',            geo: 'hexbolt',  tex: 'lv01', col: '#4C5A68', r: 3.2,  metal: .45, rough: .52, mass: 1 },
    { id: 1,  code: 'STOW 84S', name: '传感器',   en: 'SENSOR',          geo: 'capsule',  tex: 'lv02', col: '#2F6E75', r: 4.4,  metal: .30, rough: .58, mass: 2 },
    { id: 2,  code: 'REF 12-4', name: '电池组',   en: 'BATTERY',         geo: 'box',      tex: 'lv03', col: '#D2A85E', r: 5.9,  metal: .22, rough: .66, mass: 3 },
    { id: 3,  code: 'GYR-A',    name: '陀螺仪',   en: 'GYRO',            geo: 'sphere',   tex: 'lv04', col: '#8A8578', r: 7.6,  metal: .38, rough: .50, mass: 4 },
    { id: 4,  code: 'TANK 5',   name: '储罐',     en: 'CANISTER',        geo: 'cyl',      tex: 'lv05', col: '#7A7F4E', r: 9.4,  metal: .35, rough: .55, mass: 5 },
    { id: 5,  code: 'NO STEP',  name: '推进器',   en: 'THRUSTER',        geo: 'bell',     tex: 'lv06', col: '#A8432F', r: 11.4, metal: .42, rough: .48, mass: 6 },
    { id: 6,  code: 'ANT 7',    name: '天线',     en: 'ANTENNA',         geo: 'torus',    tex: 'lv07', col: '#2B4A7A', r: 13.6, metal: .40, rough: .52, mass: 7 },
    { id: 7,  code: 'F/T 08',   name: '燃料舱',   en: 'FUEL TANK',       geo: 'dodeca',   tex: 'lv08', col: '#C8792B', r: 16.0, metal: .30, rough: .62, mass: 8 },
    { id: 8,  code: 'SM-09',    name: '服务舱',   en: 'SERVICE MODULE',  geo: 'cyl2',     tex: 'lv09', col: '#2F6E75', r: 18.6, metal: .34, rough: .58, mass: 9 },
    { id: 9,  code: 'CM-10',    name: '指令舱',   en: 'COMMAND MODULE',  geo: 'cone',     tex: 'lv10', col: '#D63A2C', r: 21.4, metal: .28, rough: .64, mass: 10 },
    { id: 10, code: 'LV-11',    name: '运载火箭', en: 'LAUNCH VEHICLE',  geo: 'booster',  tex: 'lv11', col: '#D63A2C', r: 24.4, metal: .36, rough: .55, mass: 12 }
  ];

  var MAX_LV = LADDER.length - 1;

  /* ── NASA-punk palette (1975 graphics standards manual) ── */
  var UI = {
    substrate: 0xECE5D6,
    panel:     0xF5F0E8,
    ink:       0x2A2A2A,
    inkMid:    0x5A5650,
    inkLight:  0x8A8578,
    accent:    0xD63A2C,
    stripe1:   0x4C5A68,
    stripe2:   0x7A7F4E,
    stripe3:   0xD2A85E,
    stripe4:   0xA8432F,
    hazard:    0x1C1C1C
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* pick the board width the current viewport can actually use */
  function boardWidthFor(boxW, boxH) {
    var a = boxH > 0 ? boxW / boxH : MIN_ASPECT;
    a = clamp(a, MIN_ASPECT, MAX_ASPECT);
    return BH * a;
  }

  function setBoard(bw) {
    bw = Math.round(bw * 100) / 100;
    if (Math.abs(bw - CFG.BW) < 0.01) return false;
    CFG.BW = bw;
    return true;
  }

  root.SA = root.SA || {};
  root.SA.cfg = {
    CFG: CFG, LADDER: LADDER, MAX_LV: MAX_LV, UI: UI,
    clamp: clamp,
    lerp: function (a, b, t) { return a + (b - a) * t; },
    randSpawn: function () { return (Math.random() * (CFG.MAX_SPAWN + 1)) | 0; },
    boardWidthFor: boardWidthFor,
    setBoard: setBoard,
    fmtTime: function (s) {
      s = Math.max(0, s | 0);
      var m = (s / 60) | 0, ss = s % 60;
      return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
    },
    /* compact score: <10,000 shows raw; then 12.3K, then 2.6M, 1.2B */
    fmtScore: function (n) {
      if (n < 10000) return String(n | 0);
      var units = ['K', 'M', 'B', 'T'];
      var u = -1, v = n;
      while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
      var txt = v >= 100 ? String(Math.round(v))
              : v >= 10 ? (Math.round(v * 10) / 10).toFixed(1)
              : (Math.round(v * 100) / 100).toFixed(2);
      /* strip trailing .0 */
      txt = txt.replace(/\.0+$/, '').replace(/(\.[0-9]*[1-9])0+$/, '$1');
      return txt + units[u];
    }
  };
})(window);
