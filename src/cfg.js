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

    GRAV: 150,
    FIXED: 1 / 180,
    MAX_STEPS: 6,
    ITER_V: 6,
    ITER_P: 5,                     /* position passes (sorted by radius) */
    SLOP: 0.06,
    MU: 0.03,
    AIR_DRAG: 0.06,
    CORRECTION: 0.5,
    VEL_DAMP_LOW: 0.45,            /* energy bled off gentle contacts    */
    MAX_SPEED: 260,

    DEEP_PASSES: 2,                /* relaxation passes for deep overlap */
    DEEP_THRESHOLD: 0.5,
    DEEP_OVER: 1.02,

    SLEEP_VEL2: 0.9,
    SLEEP_TIME: 0.42,
    SLEEP_PEN_SLOP: 0.4,           /* may only sleep when not overlapping */
    WAKE_VEL2: 3.5,
    WAKE_DIST: 0.5,

    IMPACT_MILD: 14,
    IMPACT_STRONG: 34,
    IMPACT_HUGE: 70,
    REST_MILD: 0.10,
    REST_STRONG: 0.20,
    REST_HUGE: 0.34,

    ALIGN_THRESH: 0.07,
    PERTURB: 0.9,
    ROLL_BIAS: 0.4,

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

    SKILL_STEP: 500,               /* points per reject charge */
    SKILL_MAX: 9,                  /* stockpile cap */
    SKILL_ESCALATE: 4,             /* beyond this, each charge costs +50% */
  };

  /* ── payload ladder ──────────────────────────────────────────
     Eleven pieces of flight hardware. Each carries its own
     functional pattern, its own single vivid accent, its own form.

     r    : visual bounding radius, in world units
     crf  : collision radius factor — how much of the bounding sphere
            behaves as solid. Faceted / ringed shapes nest a little,
            so they get a factor below 1; that keeps contacts reading
            as "they touched" rather than "they hit air".
     mass : used for invMass (1/mass²), so big parts shove small ones
     ──────────────────────────────────────────────────────────── */
  var LADDER = [
    { id: 0,  code: 'P/L 01',   name: '螺栓',     en: 'BOLT',            geo: 'hexbolt',  tex: 'lv01', col: '#4C5A68', r: 3.2,  crf: 0.96, metal: .45, rough: .52, mass: 1 },
    { id: 1,  code: 'STOW 84S', name: '传感器',   en: 'SENSOR',          geo: 'capsule',  tex: 'lv02', col: '#2F6E75', r: 4.4,  crf: 1.00, metal: .30, rough: .58, mass: 2 },
    { id: 2,  code: 'REF 12-4', name: '电池组',   en: 'BATTERY',         geo: 'box',      tex: 'lv03', col: '#D2A85E', r: 5.9,  crf: 0.93, metal: .22, rough: .66, mass: 3 },
    { id: 3,  code: 'GYR-A',    name: '陀螺仪',   en: 'GYRO',            geo: 'sphere',   tex: 'lv04', col: '#8A8578', r: 7.6,  crf: 1.00, metal: .38, rough: .50, mass: 4 },
    { id: 4,  code: 'TANK 5',   name: '储罐',     en: 'CANISTER',        geo: 'cyl',      tex: 'lv05', col: '#7A7F4E', r: 9.4,  crf: 0.96, metal: .35, rough: .55, mass: 5 },
    { id: 5,  code: 'NO STEP',  name: '推进器',   en: 'THRUSTER',        geo: 'bell',     tex: 'lv06', col: '#A8432F', r: 11.4, crf: 0.96, metal: .42, rough: .48, mass: 6 },
    { id: 6,  code: 'ANT 7',    name: '天线',     en: 'ANTENNA',         geo: 'torus',    tex: 'lv07', col: '#2B4A7A', r: 13.6, crf: 0.90, metal: .40, rough: .52, mass: 7 },
    { id: 7,  code: 'F/T 08',   name: '燃料舱',   en: 'FUEL TANK',       geo: 'dodeca',   tex: 'lv08', col: '#C8792B', r: 16.0, crf: 0.96, metal: .30, rough: .62, mass: 8 },
    { id: 8,  code: 'SM-09',    name: '服务舱',   en: 'SERVICE MODULE',  geo: 'cyl2',     tex: 'lv09', col: '#2F6E75', r: 18.6, crf: 0.96, metal: .34, rough: .58, mass: 9 },
    { id: 9,  code: 'CM-10',    name: '指令舱',   en: 'COMMAND MODULE',  geo: 'cone',     tex: 'lv10', col: '#D63A2C', r: 21.4, crf: 0.93, metal: .28, rough: .64, mass: 10 },
    { id: 10, code: 'LV-11',    name: '运载火箭', en: 'LAUNCH VEHICLE',  geo: 'booster',  tex: 'lv11', col: '#D63A2C', r: 24.4, crf: 0.98, metal: .36, rough: .55, mass: 12 }
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
    }
  };
})(window);
