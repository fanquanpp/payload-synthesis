/* ══════════════════════════════════════════════════════════════════
   physics.js — 2D impulse solver for circles.

   Solver design (adapted from the gameplay reference):
     · uniform-grid broad phase
     · position pass ordered by radius, largest first
     · deep-penetration relaxation pass
     · low-impact velocity damping so piles settle instead of buzzing
     · sleep only when a body is not currently interpenetrating
   Pure data: no Three.js.
   ══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var SA = root.SA, C = SA.cfg.CFG, LADDER = SA.cfg.LADDER, MAX_LV = SA.cfg.MAX_LV;

  var CELL = 10;

  /* ══ shape-true collision hulls ══════════════════════════════
     Circles in local space (x right, y up), 1.0 == the geometry's
     own bounding radius — the same unit world.js scales the mesh by,
     so a hull here is literally the silhouette of the rendered part.

     Each table entry is fitted to the mesh it belongs to: circles sit
     along the silhouette with their radii equal to the part's local
     half-width, so the union's extent equals the real half-width and
     half-height. Corners therefore clip a little rather than the
     whole hull bulging — which is what stops parts hovering apart.

     (w, h) = the geometry's silhouette half-extents from world.js. */
  var HULLS = {
    /* hex prism r0.88 h1.15 — squat: chain across x */
    hexbolt: [[0.00, 0.00, 0.58], [0.30, 0.00, 0.58], [-0.30, 0.00, 0.58]],
    /* capsule r0.42 len1.16 — tall: chain down y */
    capsule: [[0.00, 0.58, 0.42], [0.00, 0.00, 0.42], [0.00, -0.58, 0.42]],
    /* cube 1.16³ — 2x2 so the flat faces stay flat */
    box:     [[0.24, 0.24, 0.34], [-0.24, 0.24, 0.34], [0.24, -0.24, 0.34], [-0.24, -0.24, 0.34]],
    sphere:  [[0.00, 0.00, 1.00]],
    /* canister r0.72 h1.4 — 2x2, vertical extent exact */
    cyl:     [[0.29, 0.27, 0.43], [-0.29, 0.27, 0.43], [0.29, -0.27, 0.43], [-0.29, -0.27, 0.43]],
    /* nozzle: wide bell mouth r1.02 tapering to r0.44 — bottom-heavy lobes */
    bell:    [[0.28, 0.00, 0.74], [-0.28, 0.00, 0.74]],
    /* ring r0.72 tube 0.28 — four beads on the ring, hole preserved */
    torus:   [[0.72, 0.00, 0.28], [-0.72, 0.00, 0.28], [0.00, 0.72, 0.28], [0.00, -0.72, 0.28]],
    /* dodecahedron r1 — a near-spherical solid; one circle fits its
       silhouette to within 4%, and it is meant to roll */
    dodeca:  [[0.00, 0.00, 0.96]],
    /* service module r0.56 h1.68 — tall: chain down y */
    cyl2:    [[0.00, 0.28, 0.56], [0.00, 0.00, 0.56], [0.00, -0.28, 0.56]],
    /* cone base r1.0 apex — two lobes under the base */
    cone:    [[0.29, 0.00, 0.71], [-0.29, 0.00, 0.71]],
    /* octahedron r1 — its silhouette is the diamond |x|+|y|<=1 */
    octa:    [[0.50, 0.00, 0.50], [-0.50, 0.00, 0.50], [0.00, 0.50, 0.50], [0.00, -0.50, 0.50]],
    /* booster capsule r0.6 len0.95 — tall: chain down y */
    booster: [[0.00, 0.48, 0.60], [0.00, 0.00, 0.60], [0.00, -0.48, 0.60]]
  };

  function World() {
    this.bodies = [];
    this.frameSeed = 0;
    this.merged = [];             // pairs produced by the last merge pass
    this._cols = 0; this._rows = 0; this._cells = [];
    this._order = [];
    this._bw = -1;
    this.setBounds();
  }

  /* the playfield width is adaptive (narrow in portrait, wide in
     landscape), so the grid is rebuilt whenever it changes */
  World.prototype.setBounds = function () {
    if (this._bw === C.BW) return;
    this._bw = C.BW;
    this._cols = Math.ceil(C.BW / CELL) + 2;
    this._rows = Math.ceil(C.BH / CELL) + 2;
    this._cells = new Array(this._cols * this._rows);
    for (var i = 0; i < this._cells.length; i++) this._cells[i] = [];
  };

  World.prototype.clear = function () {
    this.bodies.length = 0;
    this.merged.length = 0;
    this.frameSeed = 0;
  };

  /* drop everything flagged dead */
  World.prototype.sweep = function () {
    var bs = this.bodies, w = 0;
    for (var i = 0; i < bs.length; i++) if (!bs[i].dead) bs[w++] = bs[i];
    bs.length = w;
  };

  /* ── spawn ─────────────────────────────────────────────────
     The hull is expressed in the same unit the renderer scales the
     mesh by, so the solid shape and the drawn shape are the same
     shape — a part is exactly as solid as it looks.             ── */
  World.prototype.spawn = function (x, y, level, opts) {
    var L = LADDER[level];
    var b = {
      x: x, y: y,
      r: L.r,
      level: level,
      vx: 0, vy: 0,
      invMass: 1 / (L.mass * L.mass),
      angle: (Math.random() - 0.5) * 6.28,
      spin: 0,
      pop: 0, age: 0, maxPen: 0, dead: false,
      sleeping: false, sleepTimer: 0, anchorX: x, anchorY: y,
      hull: HULLS[L.geo] || HULLS.sphere,   /* template */
      outer: 0,
      eL: 0, eR: 0, eT: 0, eB: 0,           /* wall reach per direction */
      ox: null, oy: null, or: null,         /* hull circles, body-local */
      wn: 0
    };
    if (opts) {
      b.vx = opts.vx || 0;
      b.vy = opts.vy || 0;
      b.spin = opts.spin || 0;
    }
    this.bodies.push(b);
    return b;
  };

  function wake(b) { if (b.sleeping) { b.sleeping = false; b.sleepTimer = 0; b.anchorX = b.x; b.anchorY = b.y; } }

  /* ── deepest overlapping circle pair between two hulls ───────
     Returns the penetration depth (0 when the hulls are apart) and
     writes the contact normal into OUT. Every solver pass uses this
     one measure: a bounding-radius test would separate flat, wide
     parts by their diagonal, which is what left visible gaps and
     stopped piles ever settling. */
  var OUT = { pen: 0, nx: 0, ny: 0 };
  function deepestPair(a, b) {
    var best = 0, nx = 0, ny = 0, na = a.wn, nb = b.wn;
    var ax0 = a.x, ay0 = a.y, bx0 = b.x, by0 = b.y;
    var aox = a.ox, aoy = a.oy, aor = a.or;
    var box = b.ox, boy = b.oy, bor = b.or;
    for (var ka = 0; ka < na; ka++) {
      var ax = ax0 + aox[ka], ay = ay0 + aoy[ka], ar = aor[ka];
      for (var kb = 0; kb < nb; kb++) {
        var ddx = bx0 + box[kb] - ax, ddy = by0 + boy[kb] - ay;
        var sc = ar + bor[kb];
        var dd2 = ddx * ddx + ddy * ddy;
        if (dd2 >= sc * sc || dd2 < 1e-9) continue;
        var dd = Math.sqrt(dd2), pen = sc - dd;
        if (pen > best) { best = pen; nx = ddx / dd; ny = ddy / dd; }
      }
    }
    OUT.pen = best; OUT.nx = nx; OUT.ny = ny;
    return best;
  }

  /* ── broad phase ───────────────────────────────────────────── */
  /* Rotate + scale the hull template into body-local OFFSETS, once per
     body per frame. Offsets rather than absolute positions: the
     position pass moves bodies between iterations, and circles baked
     at the old position made every iteration re-apply the same
     correction — pairs got shoved apart far past contact, which broke
     the contact the velocity pass needs and left piles buzzing. */
  World.prototype._updateHulls = function () {
    var bs = this.bodies;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i], h = b.hull, n = h.length;
      b.outer = this._outerRadius(b);
      if (!b.ox || b.ox.length !== n) {
        b.ox = new Float32Array(n); b.oy = new Float32Array(n); b.or = new Float32Array(n);
        b.wn = n;
      }
      var ca = Math.cos(b.angle), sa = Math.sin(b.angle);
      var eL = 0, eR = 0, eT = 0, eB = 0;
      for (var k = 0; k < n; k++) {
        var hx = h[k][0] * b.r, hy = h[k][1] * b.r;
        var ox = hx * ca - hy * sa, oy = hx * sa + hy * ca;
        var wr = h[k][2] * b.r * C.HULL_SHRINK;
        b.ox[k] = ox; b.oy[k] = oy; b.or[k] = wr;
        /* how far the hull reaches from the centre along each wall
           normal — a wide flat part must not hover above the floor
           just because it is also wide */
        var l = wr - ox, r = wr + ox, t = wr - oy, d = wr + oy;
        if (l > eL) eL = l;
        if (r > eR) eR = r;
        if (t > eT) eT = t;
        if (d > eB) eB = d;
      }
      b.eL = eL; b.eR = eR; b.eT = eT; b.eB = eB;
    }
  };

  /* broadest circle of the hull — for the grid and early-outs */
  World.prototype._outerRadius = function (b) {
    var h = b.hull, m = 0;
    for (var k = 0; k < h.length; k++) {
      var d = Math.sqrt(h[k][0] * h[k][0] + h[k][1] * h[k][1]) + h[k][2];
      if (d > m) m = d;
    }
    return m * b.r * C.HULL_SHRINK;
  };

  World.prototype._buildGrid = function () {
    this._updateHulls();
    this.setBounds();
    var n = this.bodies.length, cells = this._cells, i;
    var lastX = this._cols - 1, lastY = this._rows - 1;
    for (i = 0; i < cells.length; i++) if (cells[i].length) cells[i].length = 0;

    for (i = 0; i < n; i++) {
      var b = this.bodies[i];
      var R = b.outer;
      /* each end is clamped into the grid on its own. Clamping the pair
         together let a body above the top of the bay land in an empty
         range, which put it in no cell at all — invisible to every
         solver pass, free to fall straight through the pile. */
      var x0 = ((b.x - R) / CELL + 1) | 0; if (x0 < 0) x0 = 0; else if (x0 > lastX) x0 = lastX;
      var x1 = ((b.x + R) / CELL + 1) | 0; if (x1 < 0) x1 = 0; else if (x1 > lastX) x1 = lastX;
      var y0 = ((b.y - R) / CELL + 1) | 0; if (y0 < 0) y0 = 0; else if (y0 > lastY) y0 = lastY;
      var y1 = ((b.y + R) / CELL + 1) | 0; if (y1 < 0) y1 = 0; else if (y1 > lastY) y1 = lastY;
      b.gx0 = x0; b.gx1 = x1; b.gy0 = y0; b.gy1 = y1;
      for (var y = y0; y <= y1; y++) {
        var row = y * this._cols;
        for (var x = x0; x <= x1; x++) cells[row + x].push(i);
      }
    }
  };

  /* indices sorted by collision radius, largest first — the position
     pass resolves heavy bodies before light ones, which is what stops
     small parts being squirted out of a pile */
  World.prototype._rebuildOrder = function () {
    var bs = this.bodies, n = bs.length, o = this._order;
    if (o.length !== n) {
      o.length = n;
      for (var k = 0; k < n; k++) o[k] = k;
    }
    /* insertion sort: the body list is nearly sorted from frame to frame,
       so this is O(n) in practice and avoids a comparator call per step */
    for (var i = 1; i < n; i++) {
      var v = o[i], vr = bs[v].outer, j = i - 1;
      while (j >= 0 && bs[o[j]].outer < vr) { o[j + 1] = o[j]; j--; }
      o[j + 1] = v;
    }
  };

  /* ── velocity solve ───────────────────────────────────────── */
  /* A pair shares a whole rectangle of cells, so it must be resolved
     in exactly one of them or it is resolved several times over. The
     canonical cell is the first one the two ranges share in row-major
     order: the larger of the two row starts, then the larger of the
     two column starts. */
  World.prototype._solveVel = function (iter) {
    var bodies = this.bodies, cells = this._cells, cols = this._cols;
    var first = iter === 0, seed = this.frameSeed;

    for (var ci = 0; ci < cells.length; ci++) {
      var bucket = cells[ci], m = bucket.length;
      if (m < 2) continue;

      for (var ai = 0; ai < m; ai++) {
        var i = bucket[ai], a = bodies[i], aR = a.outer;
        for (var bi = ai + 1; bi < m; bi++) {
          var j = bucket[bi], b = bodies[j];
          /* resolve this pair only in its canonical cell */
          if (ci !== (a.gy0 > b.gy0 ? a.gy0 : b.gy0) * cols +
                    (a.gx0 > b.gx0 ? a.gx0 : b.gx0)) continue;
          var bR = b.outer;
          if (a.sleeping && b.sleeping) continue;

          /* broad reject on outer circles, then the deepest hull-circle
             contact — that pair defines the normal */
          var dx0 = b.x - a.x, rr0 = aR + bR;
          if (dx0 > rr0 || dx0 < -rr0) continue;
          var dy0 = b.y - a.y;
          if (dy0 > rr0 || dy0 < -rr0) continue;

          if (deepestPair(a, b) <= 0) continue;
          var nx = OUT.nx, ny = OUT.ny, vn = 0;
          {
          var dx = b.x - a.x, d2 = dx * dx + dy0 * dy0;
          void dx; void d2;
          var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          vn = rvx * nx + rvy * ny;
          if (vn > 0) continue;

          var impact = -vn;
          if (a.sleeping && impact * impact > C.WAKE_VEL2) wake(a);
          if (b.sleeping && impact * impact > C.WAKE_VEL2) wake(b);
          if (a.sleeping && b.sleeping) continue;

          var aInv = a.sleeping ? 0 : a.invMass;
          var bInv = b.sleeping ? 0 : b.invMass;
          var imSum = aInv + bInv;
          if (imSum <= 0) continue;

          var e;
          if (impact > C.IMPACT_HUGE) e = C.REST_HUGE;
          else if (impact > C.IMPACT_STRONG) e = C.REST_STRONG;
          else if (impact > C.IMPACT_MILD) e = C.REST_MILD;
          else e = 0;

          var jn = -(1 + e) * vn / imSum;
          a.vx -= nx * jn * aInv; a.vy -= ny * jn * aInv;
          b.vx += nx * jn * bInv; b.vy += ny * jn * bInv;

          /* A heavy hit throws the pile sideways so towers topple */
          if (impact > C.IMPACT_HUGE && first) {
            var kick = (impact / C.MAX_SPEED) * 9;
            var dir = (a.x + b.x) < C.BW / 2 ? 1 : -1;
            a.vx += -ny * dir * kick * 0.5;
            b.vx -= -ny * dir * kick * 0.5;
          }

          }
          /* friction */
          rvx = b.vx - a.vx; rvy = b.vy - a.vy;
          var tx = -ny, ty = nx;
          var vt = rvx * tx + rvy * ty;
          var jt = -vt / imSum, maxJt = C.MU * jn;
          if (jt > maxJt) jt = maxJt; else if (jt < -maxJt) jt = -maxJt;
          a.vx -= tx * jt * aInv; a.vy -= ty * jt * aInv;
          b.vx += tx * jt * bInv; b.vy += ty * jt * bInv;

          /* near-vertical contact between two nearly-stacked units:
             nudge sideways so the pile keeps flowing */
          if (first) {
            var absNx = nx < 0 ? -nx : nx;
            var sp2 = a.vx * a.vx + a.vy * a.vy + b.vx * b.vx + b.vy * b.vy;
            if (absNx < C.ALIGN_THRESH && sp2 < 12) {
              var s = Math.sin(a.x * 12.9898 + b.y * 78.233 + seed * 0.137) * 43758.5453;
              var noise = (s - Math.floor(s)) - 0.5;
              var upper = a.y < b.y ? a : b, lower = a.y < b.y ? b : a;
              var mag = C.PERTURB * (1 - absNx / C.ALIGN_THRESH) * (noise > 0 ? 1 : -1);
              upper.vx += mag * upper.invMass * C.ROLL_BIAS * 22;
              lower.vx -= mag * lower.invMass * 3;
            }
          }
        }
      }
    }
  };

  World.prototype._solveVelWalls = function () {
    var bs = this.bodies, W = C.BW, H = C.BH;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (b.sleeping) continue;
      if (b.x - b.eL < 0 && b.vx < 0) b.vx = -b.vx * 0.10;
      else if (b.x + b.eR > W && b.vx > 0) b.vx = -b.vx * 0.10;
      if (b.y + b.eB > H && b.vy > 0) { b.vy = -b.vy * 0.06; b.vx *= 0.985; }
      if (b.y - b.eT < -60 && b.vy < 0) b.vy = 0;
    }
  };

  /* ── position solve, largest radius first ─────────────────── */
  /* Scans the cell range the body was filed under, and resolves each
     pair only in its canonical cell — see _solveVel. */
  World.prototype._solvePos = function () {
    var bodies = this.bodies, cells = this._cells, cols = this._cols;
    var order = this._order, n = order.length;

    for (var oi = 0; oi < n; oi++) {
      var i = order[oi], a = bodies[i], aR = a.outer;
      var cy0 = a.gy0, cy1 = a.gy1, cx0 = a.gx0, cx1 = a.gx1;

      for (var cy = cy0; cy <= cy1; cy++) {
        var row = cy * cols;
        for (var cx = cx0; cx <= cx1; cx++) {
          var bucket = cells[row + cx], m = bucket.length;
          for (var bi = 0; bi < m; bi++) {
            var j = bucket[bi];
            if (j === i) continue;
            var b = bodies[j], bR = b.outer;
            if (a.sleeping && b.sleeping) continue;
            if (cy !== (a.gy0 > b.gy0 ? a.gy0 : b.gy0)) continue;
            if (cx !== (a.gx0 > b.gx0 ? a.gx0 : b.gx0)) continue;

            var dx0 = b.x - a.x, rr0 = aR + bR;
            if (dx0 > rr0 || dx0 < -rr0) continue;
            var dy0 = b.y - a.y;
            if (dy0 > rr0 || dy0 < -rr0) continue;

            /* deepest hull-circle overlap drives the positional push.
               slop scales with the pair: big hardware is allowed to
               kiss/overlap slightly (reads as packed), small parts stay
               crisp. 0.05 base + 3% of the smaller radius. */
            var overlap = deepestPair(a, b);
            if (overlap <= 0) continue;
            var nx = OUT.nx, ny = OUT.ny;
            var minR = a.r < b.r ? a.r : b.r;
            var pen = overlap - (C.SLOP + minR * 0.03);
            if (pen <= 0) continue;

            /* maxPen is penetration BEYOND tolerance, so the sleep
               gate stays a plain absolute threshold at any part size */
            if (pen > a.maxPen) a.maxPen = pen;
            if (pen > b.maxPen) b.maxPen = pen;

            if (a.sleeping && pen > C.WAKE_DIST) wake(a);
            if (b.sleeping && pen > C.WAKE_DIST) wake(b);
            if (a.sleeping && b.sleeping) continue;

            var aInv = a.sleeping ? 0 : a.invMass;
            var bInv = b.sleeping ? 0 : b.invMass;
            var imSum = aInv + bInv;
            if (imSum <= 0) continue;

            /* when one body hugely outweighs the other, push harder —
               otherwise the light part sinks into the heavy one */
            var ratio = aInv > bInv ? aInv / bInv : bInv / aInv;
            var corr = C.CORRECTION;
            if (ratio > 4) corr = Math.min(0.95, corr + 0.10);
            if (ratio > 16) corr = Math.min(0.98, corr + 0.15);

            var kk = (pen / imSum) * corr;
            var px = nx * kk, py = ny * kk;
            a.x -= px * aInv; a.y -= py * aInv;
            b.x += px * bInv; b.y += py * bInv;
          }
        }
      }
    }
  };

  /* ── deep penetration relaxation ──────────────────────────── */
  /* Safety net for a part wedged where the position pass cannot
     converge. Measured on the hull, and only above a radius-scaled
     depth, so ordinary resting contact never trips it — an earlier
     bounding-radius test did, which shoved wide parts apart and woke
     every pile forever. */
  World.prototype._deepFix = function () {
    var bs = this.bodies, n = bs.length;
    if (n < 2) return;
    var W = C.BW, H = C.BH;

    for (var pass = 0; pass < C.DEEP_PASSES; pass++) {
      var fixed = false;
      for (var i = 0; i < n; i++) {
        var a = bs[i];
        for (var j = i + 1; j < n; j++) {
          var b = bs[j];
          if (a.sleeping && b.sleeping) continue;
          var dx = b.x - a.x, rr = a.outer + b.outer;
          if (dx > rr || dx < -rr) continue;
          var dy = b.y - a.y;
          if (dy > rr || dy < -rr) continue;

          var overlap = deepestPair(a, b);
          var minR = a.r < b.r ? a.r : b.r;
          if (overlap < C.DEEP_THRESHOLD + minR * 0.05) continue;
          fixed = true;

          var aInv = a.sleeping ? 0 : a.invMass;
          var bInv = b.sleeping ? 0 : b.invMass;
          var imSum = aInv + bInv;
          if (imSum <= 0) continue;

          var nx = OUT.nx, ny = OUT.ny;
          var k = ((overlap - (C.SLOP + minR * 0.03)) * C.DEEP_OVER) / imSum;
          a.x -= nx * k * aInv; a.y -= ny * k * aInv;
          b.x += nx * k * bInv; b.y += ny * k * bInv;

          if (a.sleeping) { a.sleeping = false; a.sleepTimer = 0; }
          if (b.sleeping) { b.sleeping = false; b.sleepTimer = 0; }
        }
      }
      if (!fixed) break;
    }

    /* same directional clamp as the main position pass — an `outer`
       bound would lift wide parts off the floor */
    for (var q = 0; q < n; q++) {
      var bb = bs[q];
      if (bb.x - bb.eL < 0) bb.x = bb.eL;
      else if (bb.x + bb.eR > W) bb.x = W - bb.eR;
      if (bb.y + bb.eB > H) bb.y = H - bb.eB;
      if (bb.y - bb.eT < -60) bb.y = -60 + bb.eT;
    }
  };

  World.prototype._solvePosWalls = function () {
    var bs = this.bodies, W = C.BW, H = C.BH;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (b.sleeping) continue;
      if (b.x - b.eL < 0) b.x = b.eL;
      else if (b.x + b.eR > W) b.x = W - b.eR;
      if (b.y + b.eB > H) b.y = H - b.eB;
      if (b.y - b.eT < -60) b.y = -60 + b.eT;
    }
  };

  /* ── one fixed substep ────────────────────────────────────── */
  World.prototype.step = function (h) {
    var bs = this.bodies, n = bs.length;
    var drag = 1 - C.AIR_DRAG * h, g = C.GRAV * h;
    var maxSp2 = C.MAX_SPEED * C.MAX_SPEED;
    this.frameSeed = (this.frameSeed + 1) & 0xFFFF;

    for (var i = 0; i < n; i++) {
      var b = bs[i];
      b.maxPen = 0;
      if (b.sleeping) continue;
      b.vy += g;
      b.vx *= drag;
      var sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 > maxSp2) { var k = C.MAX_SPEED / Math.sqrt(sp2); b.vx *= k; b.vy *= k; }
      /* creep damper: below walking pace, hardware is meant to sit
         still. Without it a low-friction pile slides for ten seconds
         and never reaches the sleep threshold. */
      else if (sp2 < C.CREEP_V2) {
        var cd = 1 - C.CREEP_DAMP * h;
        b.vx *= cd; b.vy *= cd;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
      /* rotation comes only from travel (rolling), heavily damped:
         hardware is dense — it does not pirouette in mid-air.
         Below crawl speed the spin is zeroed outright so resting
         parts never keep turning. */
      if (b.vx * b.vx + b.vy * b.vy < 4) {
        b.spin = 0;
      } else {
        b.spin += (b.vx / Math.max(2.5, b.r)) * h * 0.28;
        b.spin *= (1 - 3.2 * h);
        if (b.spin > 1.4) b.spin = 1.4;          /* rad/s ceiling */
        else if (b.spin < -1.4) b.spin = -1.4;
      }
      b.angle += b.spin * h * 60;
      if (b.pop > 0) { b.pop -= h * 3.6; if (b.pop < 0) b.pop = 0; }
      b.age += h;
    }

    this._buildGrid();
    for (var it = 0; it < C.ITER_V; it++) this._solveVel(it);
    this._solveVelWalls();

    this._rebuildOrder();
    for (var ip = 0; ip < C.ITER_P; ip++) this._solvePos();
    this._solvePosWalls();
    this._deepFix();

    /* A body may only sleep when it is not currently interpenetrating
       anything, otherwise piles freeze mid-overlap.
       The test is displacement, not instantaneous velocity: a large
       part wedged in a cradle of diagonal contacts keeps a small
       standing velocity — gravity in each substep, a diagonal contact
       impulse back out — while never actually going anywhere. Testing
       velocity kept such piles awake forever. Distance from an anchor
       is robust against that and still catches a slow steady slide. */
    for (var s = 0; s < n; s++) {
      var bb = bs[s];
      if (bb.sleeping) continue;
      var dxa = bb.x - bb.anchorX, dya = bb.y - bb.anchorY;
      if (dxa * dxa + dya * dya < C.SLEEP_DIST2 && bb.maxPen < C.SLEEP_PEN_SLOP) {
        bb.sleepTimer += h;
        if (bb.sleepTimer >= C.SLEEP_TIME) {
          bb.sleeping = true; bb.vx = 0; bb.vy = 0; bb.spin = 0;
        }
      } else {
        bb.sleepTimer = 0;
        bb.anchorX = bb.x; bb.anchorY = bb.y;
      }
    }
  };

  /* ── merge pass: returns array of {a,b,lv,x,y,body} ───────── */
  World.prototype.mergePass = function () {
    var bs = this.bodies, n = bs.length;
    var out = this.merged;
    out.length = 0;
    if (n < 2) return out;

    for (var i = 0; i < n; i++) {
      var ai = bs[i];
      if (ai.dead || ai.level >= MAX_LV) continue;
      var al = ai.level, ar = ai.r;
      for (var j = i + 1; j < n; j++) {
        var bj = bs[j];
        if (bj.dead || bj.level !== al) continue;
        var dx = bj.x - ai.x, dy = bj.y - ai.y, rr = ar + bj.r;
        if (dx * dx + dy * dy <= rr * rr) {
          ai.dead = bj.dead = true;
          var lv = al + 1;
          var nx = (ai.x + bj.x) * 0.5, ny = (ai.y + bj.y) * 0.5;
          var nb = this.spawn(nx, ny, lv, {
            vx: (ai.vx + bj.vx) * 0.28 + (Math.random() - 0.5) * 8,
            vy: (ai.vy + bj.vy) * 0.28 - 22,
            spin: (ai.spin + bj.spin) * 0.5
          });
          nb.pop = 1; nb.age = C.DROP_GRACE;
          out.push({ x: nx, y: ny, lv: lv, a: ai, b: bj, body: nb });

          var wr = LADDER[lv].r + 18, wr2 = wr * wr;
          for (var k = 0; k < bs.length; k++) {
            var o = bs[k];
            if (o === nb || o.dead) continue;
            var ddx = o.x - nx, ddy = o.y - ny;
            if (ddx * ddx + ddy * ddy < wr2) wake(o);
          }
          break;
        }
      }
    }

    if (out.length) this.sweep();
    return out;
  };

  SA.physics = { World: World, CELL: CELL };
})(window);
