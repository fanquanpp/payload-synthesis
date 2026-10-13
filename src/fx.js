/* ══════════════════════════════════════════════════════════════════
   fx.js — effects: instanced sparks, shockwave rings, floating score
   sprites, drifting motes.

   All world→scene mapping reads C.BW / C.BH live: the board width is
   adaptive, so a cached copy put every effect off-centre on wide bays.
   Exposed as SA.fx
   ══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var SA = root.SA, C = SA.cfg.CFG;

  var scene = null;
  var parts, partData = [], partPtr = 0;
  var rings, ringData = [], ringPtr = 0;
  var motes;
  var floats = [], floatPool = [];
  var flash = 0;

  var _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(),
      _v = new THREE.Vector3(), _s = new THREE.Vector3(), _col = new THREE.Color();
  var _axisZ = new THREE.Vector3(0, 0, 1);
  var HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  /* ink / cream / red — the page's own palette, so effects read as
     part of the manual rather than as neon overlays */
  var CREAM = 0xF2ECDF, GOLD = 0xD2A85E, RED = 0xD63A2C;  /* no ink in sparks — effects stay bright */

  function wx(x) { return x - C.BW / 2; }
  function wy(y) { return C.BH / 2 - y; }

  /* ── sparks: elongated shards, two lengths ──────────────────── */
  function initSparks() {
    var geo = new THREE.PlaneGeometry(1, 1);
    var mat = new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.NormalBlending,
      depthWrite: false, side: THREE.DoubleSide
    });
    parts = new THREE.InstancedMesh(geo, mat, C.MAX_PARTS);
    parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parts.frustumCulled = false;
    parts.renderOrder = 12;
    scene.add(parts);

    var white = new THREE.Color(0xffffff);
    for (var i = 0; i < C.MAX_PARTS; i++) {
      partData.push({
        life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0,
        len: 1, wide: 1, drag: 0.96, grav: 60, spin: 0, rot: 0,
        col: new THREE.Color(1, 1, 1)
      });
      parts.setMatrixAt(i, HIDDEN);
      parts.setColorAt(i, white);
    }
    parts.instanceMatrix.needsUpdate = true;
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
  }

  var SPARK_MIX = [CREAM, CREAM, RED, GOLD];

  function burst(x, y, colorHex, count, power) {
    if (!parts) return;
    power = power || 1;
    var accent = new THREE.Color(colorHex);
    for (var i = 0; i < count; i++) {
      var p = partData[partPtr];
      var a = Math.random() * Math.PI * 2;
      var sp = (12 + Math.random() * 34) * power;
      p.life = p.max = 0.32 + Math.random() * 0.46;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 10 * power;
      p.len = (1.6 + Math.random() * 2.6) * (0.8 + power * 0.4);
      p.wide = 0.32 + Math.random() * 0.3;
      p.drag = 0.955; p.grav = 88;
      p.spin = (Math.random() - 0.5) * 16;
      p.rot = a;                                  // shard flies point-first
      /* mostly the caller's accent, salted with the manual palette */
      var pick = Math.random();
      p.col.copy(pick < 0.62 ? accent : _col.setHex(SPARK_MIX[(Math.random() * SPARK_MIX.length) | 0]));
      parts.setColorAt(partPtr, p.col);
      partPtr = (partPtr + 1) % C.MAX_PARTS;
    }
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
  }

  /* ── shockwave rings: ink outline + accent, ease-out expansion ── */
  function initRings() {
    var geo = new THREE.RingGeometry(0.86, 1, 64);
    var mat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    rings = new THREE.InstancedMesh(geo, mat, C.MAX_RINGS);
    rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rings.frustumCulled = false;
    rings.renderOrder = 11;
    scene.add(rings);
    var white = new THREE.Color(0xffffff);
    for (var i = 0; i < C.MAX_RINGS; i++) {
      ringData.push({ life: 0, max: 1, x: 0, y: 0, r0: 1, r1: 6, w: 1, col: new THREE.Color(1, 1, 1) });
      rings.setMatrixAt(i, HIDDEN);
      rings.setColorAt(i, white);
    }
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  }

  function wave(x, y, colorHex, radius, power) {
    if (!rings) return;
    power = power || 1;
    var r = ringData[ringPtr];
    r.life = r.max = 0.4 + power * 0.2;
    r.x = x; r.y = y;
    r.r0 = radius * 0.6;
    r.r1 = radius * (1.9 + power * 0.7);
    r.w = 0.7 + power * 0.55;
    r.col.set(colorHex);
    /* lerp toward cream as it expands — accent fading to paint */
    rings.setColorAt(ringPtr, r.col);
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    ringPtr = (ringPtr + 1) % C.MAX_RINGS;
  }

  /* ── floating score text ───────────────────────────────────── */
  function makeFloatSprite() {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
    var sp = new THREE.Sprite(mat);
    sp.scale.set(14, 5.25, 1);
    sp.visible = false;
    sp.renderOrder = 30;
    scene.add(sp);
    return { sprite: sp, canvas: c, ctx: c.getContext('2d'), tex: tex, life: 0, max: 1, vy: 0, color: '#fff' };
  }

  function drawFloatText(f, text, color) {
    var g = f.ctx, W = 256, H = 96;
    g.clearRect(0, 0, W, H);
    g.font = '800 44px Archivo, "Helvetica Neue", "PingFang SC", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 9; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(236,229,214,.95)';       /* cream plate behind ink text */
    g.strokeText(text, W / 2, H / 2);
    g.strokeStyle = 'rgba(242,236,223,.95)';
    g.lineWidth = 5;
    g.strokeText(text, W / 2, H / 2);
    g.fillStyle = color;
    g.fillText(text, W / 2, H / 2);
    f.tex.needsUpdate = true;
  }

  function floatText(x, y, text, color, big) {
    var f;
    for (var i = 0; i < floatPool.length; i++) if (floatPool[i].life <= 0) { f = floatPool[i]; break; }
    if (!f) {
      if (floatPool.length >= C.MAX_FLOATS) return;
      f = makeFloatSprite(); floatPool.push(f);
    }
    f.life = f.max = 0.95;
    f.vy = 21;
    f.x = x; f.y = y;
    f.color = color || '#2A2A2A';
    f.big = big || 1;
    drawFloatText(f, text, f.color);
    f.sprite.position.set(wx(x), wy(y), 8);
    f.sprite.scale.set(14 * f.big, 5.25 * f.big, 1);
    f.sprite.material.opacity = 1;
    f.sprite.visible = true;
  }

  /* ── ambient motes: cream dust in the bay light ────────────── */
  function initMotes() {
    var N = 140;
    var pos = new Float32Array(N * 3);
    var spd = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (C.BW + 12);
      pos[i * 3 + 1] = (Math.random() - 0.5) * (C.BH + 12);
      pos[i * 3 + 2] = -6 - Math.random() * 22;
      spd[i] = 0.6 + Math.random() * 2.2;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({
      color: 0xD8D0BE, size: 0.5, transparent: true, opacity: 0.35,
      depthWrite: false, sizeAttenuation: true
    });
    motes = new THREE.Points(geo, mat);
    motes.frustumCulled = false;
    motes.userData.spd = spd;
    scene.add(motes);
  }

  /* ══════════════════════════ api ═══════════════════════════ */
  function init(s) {
    scene = s;
    initSparks(); initRings(); initMotes();
  }

  function update(dt, t) {
    /* sparks */
    var dirty = false, cdirty = false;
    for (var i = 0; i < C.MAX_PARTS; i++) {
      var p = partData[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      dirty = true;
      if (p.life <= 0) { parts.setMatrixAt(i, HIDDEN); continue; }
      p.vy += p.grav * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      var k = p.life / p.max;
      var sc = 0.5 + k * 1.1;
      _v.set(wx(p.x), wy(p.y), 5);
      _q.setFromAxisAngle(_axisZ, p.rot);
      _s.set(p.len * sc, p.wide * p.len * sc, 1);
      _m4.compose(_v, _q, _s);
      parts.setMatrixAt(i, _m4);
      /* fade to transparent rather than to black (normal blending) */
      if (parts.instanceColor) {
        _col.copy(p.col).multiplyScalar(Math.min(1, k * 1.7));
        parts.setColorAt(i, _col);
        cdirty = true;
      }
    }
    if (dirty) parts.instanceMatrix.needsUpdate = true;
    if (cdirty && parts.instanceColor) parts.instanceColor.needsUpdate = true;

    /* rings */
    var rdirty = false, rcdirty = false;
    for (var j = 0; j < C.MAX_RINGS; j++) {
      var r = ringData[j];
      if (r.life <= 0) continue;
      r.life -= dt; rdirty = true;
      if (r.life <= 0) { rings.setMatrixAt(j, HIDDEN); continue; }
      var kk = 1 - r.life / r.max;
      var ease = 1 - Math.pow(1 - kk, 3.2);          /* fast out, long settle */
      var rad = r.r0 + (r.r1 - r.r0) * ease;
      var th = Math.pow(1 - kk, 1.6) * r.w;          /* thin out as it goes */
      _v.set(wx(r.x), wy(r.y), 2);
      _q.identity();
      _s.set(rad, rad, 1);
      _m4.compose(_v, _q, _s);
      rings.setMatrixAt(j, _m4);
      /* accent -> ink as the ring expands, like paint fading to print */
      _col.copy(r.col).lerp(_col.set(CREAM), kk * 0.8).multiplyScalar(1 - kk * 0.35);
      rings.setColorAt(j, _col);
      rcdirty = true;
      void th;
    }
    if (rdirty) rings.instanceMatrix.needsUpdate = true;
    if (rcdirty && rings.instanceColor) rings.instanceColor.needsUpdate = true;

    /* floats */
    for (var f = 0; f < floatPool.length; f++) {
      var fo = floatPool[f];
      if (fo.life <= 0) continue;
      fo.life -= dt;
      if (fo.life <= 0) { fo.sprite.visible = false; continue; }
      var kf = fo.life / fo.max;
      fo.y -= fo.vy * dt;
      fo.sprite.position.set(wx(fo.x), wy(fo.y), 8);
      fo.sprite.material.opacity = Math.min(1, kf * 2.4);
      var scl = fo.big * (1 + (1 - kf) * 0.12);
      fo.sprite.scale.set(14 * scl, 5.25 * scl, 1);
    }

    /* motes */
    if (motes) {
      var pos = motes.geometry.attributes.position;
      var spd = motes.userData.spd;
      var halfW = C.BW / 2 + 6;
      for (var m = 0; m < spd.length; m++) {
        var y = pos.getY(m) + spd[m] * dt * 3.0;
        if (y > C.BH / 2 + 6) y = -C.BH / 2 - 6;
        pos.setY(m, y);
        pos.setX(m, pos.getX(m) + Math.sin((t + m) * 0.6) * dt * 0.8);
        if (pos.getX(m) > halfW) pos.setX(m, -halfW);
        else if (pos.getX(m) < -halfW) pos.setX(m, halfW);
      }
      pos.needsUpdate = true;
    }

    if (flash > 0) flash = Math.max(0, flash - dt * 2.4);
  }

  function hit(v) { flash = Math.max(flash, v); }

  function clear() {
    for (var i = 0; i < C.MAX_PARTS; i++) { partData[i].life = 0; parts.setMatrixAt(i, HIDDEN); }
    for (var j = 0; j < C.MAX_RINGS; j++) { ringData[j].life = 0; rings.setMatrixAt(j, HIDDEN); }
    parts.instanceMatrix.needsUpdate = true;
    rings.instanceMatrix.needsUpdate = true;
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    for (var f = 0; f < floatPool.length; f++) { floatPool[f].life = 0; floatPool[f].sprite.visible = false; }
    flash = 0;
  }

  SA.fx = {
    init: init, update: update, clear: clear, hit: hit,
    burst: burst, wave: wave, floatText: floatText,
    get flash() { return flash; }
  };
})(window);
