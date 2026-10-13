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

  function World() {
    this.bodies = [];
    this.frameSeed = 0;
    this.merged = [];             // pairs produced by the last merge pass
    this._cols = 0; this._rows = 0; this._cells = [];
    this._stamp = [];
    this._gen = 0;
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
     `r` is the collision radius (calibrated per shape), `visR` the
     radius the renderer uses. Keeping them apart lets faceted
     shapes nest visually instead of hovering apart.          ── */
  World.prototype.spawn = function (x, y, level, opts) {
    var L = LADDER[level];
    var b = {
      x: x, y: y,
      r: L.r * (L.crf == null ? 1 : L.crf),
      visR: L.r,
      level: level,
      vx: 0, vy: 0,
      invMass: 1 / (L.mass * L.mass),
      angle: (Math.random() - 0.5) * 6.28,
      spin: 0,
      pop: 0, age: 0, maxPen: 0, dead: false,
      sleeping: false, sleepTimer: 0
    };
    if (opts) {
      b.vx = opts.vx || 0;
      b.vy = opts.vy || 0;
      b.spin = opts.spin || 0;
    }
    this.bodies.push(b);
    return b;
  };

  function wake(b) { if (b.sleeping) { b.sleeping = false; b.sleepTimer = 0; } }

  /* ── broad phase ───────────────────────────────────────────── */
  World.prototype._buildGrid = function () {
    this.setBounds();
    var n = this.bodies.length, cells = this._cells, i;
    for (i = 0; i < cells.length; i++) if (cells[i].length) cells[i].length = 0;

    for (i = 0; i < n; i++) {
      var b = this.bodies[i];
      var x0 = Math.max(0, ((b.x - b.r) / CELL + 1) | 0);
      var x1 = Math.min(this._cols - 1, ((b.x + b.r) / CELL + 1) | 0);
      var y0 = Math.max(0, ((b.y - b.r) / CELL + 1) | 0);
      var y1 = Math.min(this._rows - 1, ((b.y + b.r) / CELL + 1) | 0);
      for (var y = y0; y <= y1; y++) {
        var row = y * this._cols;
        for (var x = x0; x <= x1; x++) cells[row + x].push(i);
      }
    }
    if (this._stamp.length < n) {
      var from = this._stamp.length;
      this._stamp.length = n;
      for (i = from; i < n; i++) this._stamp[i] = -1;
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
      var v = o[i], vr = bs[v].r, j = i - 1;
      while (j >= 0 && bs[o[j]].r < vr) { o[j + 1] = o[j]; j--; }
      o[j + 1] = v;
    }
  };

  /* ── velocity solve ───────────────────────────────────────── */
  World.prototype._solveVel = function (iter) {
    var bodies = this.bodies, cells = this._cells;
    var stamp = this._stamp, first = iter === 0, seed = this.frameSeed;
    var damp = 1 - C.VEL_DAMP_LOW;
    var gen = ++this._gen;

    for (var ci = 0; ci < cells.length; ci++) {
      var bucket = cells[ci], m = bucket.length;
      if (m < 2) continue;

      for (var ai = 0; ai < m; ai++) {
        var i = bucket[ai], a = bodies[i], ar = a.r;
        for (var bi = ai + 1; bi < m; bi++) {
          var j = bucket[bi];
          if (j <= i || stamp[j] === gen) continue;
          stamp[j] = gen;
          var b = bodies[j];
          if (a.sleeping && b.sleeping) continue;

          var dx = b.x - a.x, rr = ar + b.r;
          if (dx > rr || dx < -rr) continue;
          var dy = b.y - a.y;
          if (dy > rr || dy < -rr) continue;
          var d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 < 1e-9) continue;

          var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          var vn = rvx * nx + rvy * ny;
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

          /* gentle contacts bleed off energy so stacks stop buzzing */
          if (impact < C.IMPACT_MILD) {
            var kd = 1 - damp;
            a.vx -= nx * vn * aInv * kd; a.vy -= ny * vn * aInv * kd;
            b.vx += nx * vn * bInv * kd; b.vy += ny * vn * bInv * kd;
          }

          /* a heavy hit throws the pile sideways so towers topple */
          if (impact > C.IMPACT_HUGE && first) {
            var kick = (impact / C.MAX_SPEED) * 9;
            var dir = (a.x + b.x) < C.BW / 2 ? 1 : -1;
            a.vx += -ny * dir * kick * 0.5;
            b.vx -= -ny * dir * kick * 0.5;
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
            if (absNx < C.ALIGN_THRESH && sp2 < 40) {
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
      var r = b.r;
      if (b.x < r && b.vx < 0) b.vx = -b.vx * 0.10;
      else if (b.x > W - r && b.vx > 0) b.vx = -b.vx * 0.10;
      if (b.y + r > H && b.vy > 0) { b.vy = -b.vy * 0.06; b.vx *= 0.985; }
      if (b.y - r < -60 && b.vy < 0) b.vy = 0;
    }
  };

  /* ── position solve, largest radius first ─────────────────── */
  World.prototype._solvePos = function () {
    var bodies = this.bodies, cells = this._cells, cols = this._cols, stamp = this._stamp;
    var order = this._order, n = order.length, rows = this._rows;
    var gen = ++this._gen;

    for (var oi = 0; oi < n; oi++) {
      var i = order[oi], a = bodies[i], ar = a.r;
      var cy0 = Math.max(0, ((a.y - ar) / CELL + 1) | 0);
      var cy1 = Math.min(rows - 1, ((a.y + ar) / CELL + 1) | 0);
      var cx0 = Math.max(0, ((a.x - ar) / CELL + 1) | 0);
      var cx1 = Math.min(cols - 1, ((a.x + ar) / CELL + 1) | 0);

      for (var cy = cy0; cy <= cy1; cy++) {
        var row = cy * cols;
        for (var cx = cx0; cx <= cx1; cx++) {
          var bucket = cells[row + cx], m = bucket.length;
          for (var bi = 0; bi < m; bi++) {
            var j = bucket[bi];
            if (j === i || stamp[j] === gen) continue;
            stamp[j] = gen;
            var b = bodies[j];
            if (a.sleeping && b.sleeping) continue;

            var dx = b.x - a.x, rr = ar + b.r;
            if (dx > rr || dx < -rr) continue;
            var dy = b.y - a.y;
            if (dy > rr || dy < -rr) continue;
            var d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr || d2 < 1e-9) continue;

            var d = Math.sqrt(d2), overlap = rr - d;
            if (overlap > a.maxPen) a.maxPen = overlap;
            if (overlap > b.maxPen) b.maxPen = overlap;

            if (a.sleeping && overlap > C.WAKE_DIST) wake(a);
            if (b.sleeping && overlap > C.WAKE_DIST) wake(b);
            if (a.sleeping && b.sleeping) continue;
            if (overlap <= C.SLOP) continue;

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

            var nx = dx / d, ny = dy / d;
            var kk = ((overlap - C.SLOP) / imSum) * corr;
            var px = nx * kk, py = ny * kk;
            a.x -= px * aInv; a.y -= py * aInv;
            b.x += px * bInv; b.y += py * bInv;
          }
        }
      }
    }
  };

  /* ── deep penetration relaxation ──────────────────────────── */
  World.prototype._deepFix = function () {
    var bs = this.bodies, n = bs.length;
    if (n < 2) return;
    var W = C.BW, H = C.BH;

    for (var pass = 0; pass < C.DEEP_PASSES; pass++) {
      var fixed = false;
      for (var i = 0; i < n; i++) {
        var a = bs[i], ar = a.r;
        for (var j = i + 1; j < n; j++) {
          var b = bs[j];
          if (a.sleeping && b.sleeping) continue;
          var dx = b.x - a.x, rr = ar + b.r;
          if (dx > rr || dx < -rr) continue;
          var dy = b.y - a.y;
          if (dy > rr || dy < -rr) continue;
          var d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 < 1e-9) continue;

          var d = Math.sqrt(d2), overlap = rr - d;
          if (overlap < C.DEEP_THRESHOLD) continue;
          fixed = true;

          var aInv = a.sleeping ? 0 : a.invMass;
          var bInv = b.sleeping ? 0 : b.invMass;
          var imSum = aInv + bInv;
          if (imSum <= 0) continue;

          var nx = dx / d, ny = dy / d;
          var k = (overlap * C.DEEP_OVER) / imSum;
          a.x -= nx * k * aInv; a.y -= ny * k * aInv;
          b.x += nx * k * bInv; b.y += ny * k * bInv;

          if (a.sleeping) { a.sleeping = false; a.sleepTimer = 0; }
          if (b.sleeping) { b.sleeping = false; b.sleepTimer = 0; }
        }
      }
      if (!fixed) break;
    }

    for (var q = 0; q < n; q++) {
      var bb = bs[q], r = bb.r;
      if (bb.x < r) bb.x = r; else if (bb.x > W - r) bb.x = W - r;
      if (bb.y + r > H) bb.y = H - r;
    }
  };

  World.prototype._solvePosWalls = function () {
    var bs = this.bodies, W = C.BW, H = C.BH;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (b.sleeping) continue;
      var r = b.r;
      if (b.x < r) b.x = r; else if (b.x > W - r) b.x = W - r;
      if (b.y + r > H) b.y = H - r;
      if (b.y - r < -60) b.y = -60 + r;
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
      b.x += b.vx * h;
      b.y += b.vy * h;
      /* rotation comes only from travel (rolling), heavily damped:
         hardware is dense — it does not pirouette in mid-air */
      b.spin += (b.vx / Math.max(2.5, b.visR)) * h * 0.28;
      b.spin *= (1 - 3.2 * h);
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

    /* a body may only sleep when it is not currently interpenetrating
       anything, otherwise piles freeze mid-overlap */
    for (var s = 0; s < n; s++) {
      var bb = bs[s];
      if (bb.sleeping) continue;
      var v2 = bb.vx * bb.vx + bb.vy * bb.vy;
      if (v2 < C.SLEEP_VEL2 && bb.maxPen < C.SLEEP_PEN_SLOP) {
        bb.sleepTimer += h;
        if (bb.sleepTimer >= C.SLEEP_TIME) {
          bb.sleeping = true; bb.vx = 0; bb.vy = 0; bb.spin = 0;
        }
      } else {
        bb.sleepTimer = 0;
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
