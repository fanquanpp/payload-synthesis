/* ══════════════════════════════════════════════════════════════════
   fx.js — GPU-cheap effects: instanced sparks, shockwave rings,
   floating score sprites, drifting motes, screen flash.
   Exposed as SA.fx
   ══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var SA = root.SA, C = SA.cfg.CFG;

  var BW = C.BW, BH = C.BH;
  var scene = null;
  var parts, partData = [], partPtr = 0;
  var rings, ringData = [], ringPtr = 0;
  var motes;
  var floats = [], floatPool = [];
  var flash = 0;

  var _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(),
      _v = new THREE.Vector3(), _s = new THREE.Vector3(), _col = new THREE.Color();
  var HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  function wx(x) { return x - BW / 2; }
  function wy(y) { return BH / 2 - y; }

  /* ── sparks ───────────────────────────────────────────────── */
  function initSparks() {
    var geo = new THREE.PlaneGeometry(1, 1);
    var mat = new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, vertexColors: false
    });
    parts = new THREE.InstancedMesh(geo, mat, C.MAX_PARTS);
    parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parts.frustumCulled = false;
    scene.add(parts);

    var white = new THREE.Color(0xffffff);
    for (var i = 0; i < C.MAX_PARTS; i++) {
      partData.push({ life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, size: 1, drag: 0.96, grav: 60, spin: 0, rot: 0, col: new THREE.Color(1, 1, 1) });
      parts.setMatrixAt(i, HIDDEN);
      parts.setColorAt(i, white);
    }
    parts.instanceMatrix.needsUpdate = true;
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
  }

  function burst(x, y, colorHex, count, power) {
    if (!parts) return;
    power = power || 1;
    var col = new THREE.Color(colorHex);
    for (var i = 0; i < count; i++) {
      var p = partData[partPtr];
      var a = Math.random() * Math.PI * 2;
      var sp = (10 + Math.random() * 30) * power;
      p.life = p.max = 0.34 + Math.random() * 0.5;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 12 * power;
      p.size = (0.9 + Math.random() * 1.9) * (0.7 + power * 0.5);
      p.drag = 0.965; p.grav = 95;
      p.spin = (Math.random() - 0.5) * 22;
      p.rot = Math.random() * 6.28;
      p.col.copy(col);
      parts.setColorAt(partPtr, col);
      partPtr = (partPtr + 1) % C.MAX_PARTS;
    }
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
  }

  /* ── shockwave rings ──────────────────────────────────────── */
  function initRings() {
    var geo = new THREE.RingGeometry(0.72, 1, 56);
    var mat = new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    rings = new THREE.InstancedMesh(geo, mat, C.MAX_RINGS);
    rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rings.frustumCulled = false;
    scene.add(rings);
    var white = new THREE.Color(0xffffff);
    for (var i = 0; i < C.MAX_RINGS; i++) {
      ringData.push({ life: 0, max: 1, x: 0, y: 0, r0: 1, r1: 6, w: 1 });
      rings.setMatrixAt(i, HIDDEN);
      rings.setColorAt(i, white);
    }
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  }

  function wave(x, y, colorHex, radius, power) {
    if (!rings) return;
    power = power || 1;
    var r = ringData[ringPtr];
    r.life = r.max = 0.42 + power * 0.24;
    r.x = x; r.y = y;
    r.r0 = radius * 0.55;
    r.r1 = radius * (2.1 + power * 0.9);
    r.w = 0.9 + power * 0.5;
    rings.setColorAt(ringPtr, new THREE.Color(colorHex));
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    ringPtr = (ringPtr + 1) % C.MAX_RINGS;
  }

  /* ── floating score text ──────────────────────────────────── */
  function makeFloatSprite() {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.NormalBlending });
    var sp = new THREE.Sprite(mat);
    sp.scale.set(14, 5.25, 1);
    sp.visible = false;
    scene.add(sp);
    return { sprite: sp, canvas: c, ctx: c.getContext('2d'), tex: tex, life: 0, max: 1, vy: 0, color: '#fff' };
  }

  function drawFloatText(f, text, color) {
    var g = f.ctx, W = 256, H = 96;
    g.clearRect(0, 0, W, H);
    g.font = '700 46px "Chakra Petch", "PingFang SC", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(6,10,14,.92)';
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
    f.vy = 20;
    f.x = x; f.y = y;
    f.color = color || '#ffffff';
    f.big = big || 1;
    drawFloatText(f, text, f.color);
    f.sprite.position.set(wx(x), wy(y), 6);
    f.sprite.scale.set(14 * f.big, 5.25 * f.big, 1);
    f.sprite.material.opacity = 1;
    f.sprite.visible = true;
  }

  /* ── ambient motes ────────────────────────────────────────── */
  function initMotes() {
    var N = 160;
    var pos = new Float32Array(N * 3);
    var spd = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (BW + 10);
      pos[i * 3 + 1] = (Math.random() - 0.5) * (BH + 10);
      pos[i * 3 + 2] = -6 - Math.random() * 22;
      spd[i] = 0.6 + Math.random() * 2.4;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({
      color: 0x3DDDFF, size: 0.55, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
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
    var dirty = false;
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
      var sc = p.size * (0.35 + k * 0.9);
      _v.set(wx(p.x), wy(p.y), 4);
      _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), p.rot);
      _s.set(sc, sc, 1);
      _m4.compose(_v, _q, _s);
      parts.setMatrixAt(i, _m4);
      _col.copy(p.col).multiplyScalar(Math.min(1, k * 1.6));
      parts.setColorAt(i, _col);
    }
    if (dirty) {
      parts.instanceMatrix.needsUpdate = true;
      if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
    }

    /* rings */
    var rdirty = false;
    for (var j = 0; j < C.MAX_RINGS; j++) {
      var r = ringData[j];
      if (r.life <= 0) continue;
      r.life -= dt; rdirty = true;
      if (r.life <= 0) { rings.setMatrixAt(j, HIDDEN); continue; }
      var kk = 1 - r.life / r.max;
      var ease = 1 - Math.pow(1 - kk, 3);
      var rad = r.r0 + (r.r1 - r.r0) * ease;
      var th = (1 - kk) * r.w;
      _v.set(wx(r.x), wy(r.y), 2);
      _q.identity();
      _s.set(rad, rad, 1);
      _m4.compose(_v, _q, _s);
      rings.setMatrixAt(j, _m4);
      rings.setColorAt(j, new THREE.Color(1, 1, 1).multiplyScalar(Math.max(0, 1 - kk) * (1 - kk)));
      rings.instanceColor.needsUpdate = true;
    }
    if (rdirty) rings.instanceMatrix.needsUpdate = true;

    /* floats */
    for (var f = 0; f < floatPool.length; f++) {
      var fo = floatPool[f];
      if (fo.life <= 0) continue;
      fo.life -= dt;
      if (fo.life <= 0) { fo.sprite.visible = false; continue; }
      var kf = fo.life / fo.max;
      fo.y -= fo.vy * dt;
      fo.sprite.position.set(wx(fo.x), wy(fo.y), 6);
      fo.sprite.material.opacity = Math.min(1, kf * 2.2);
      var scl = fo.big * (1 + (1 - kf) * 0.14);
      fo.sprite.scale.set(14 * scl, 5.25 * scl, 1);
    }

    /* motes drift upward */
    if (motes) {
      var pos = motes.geometry.attributes.position;
      var spd = motes.userData.spd;
      for (var m = 0; m < spd.length; m++) {
        var y = pos.getY(m) + spd[m] * dt * 3.2;
        if (y > BH / 2 + 6) y = -BH / 2 - 6;
        pos.setY(m, y);
        pos.setX(m, pos.getX(m) + Math.sin((t + m) * 0.6) * dt * 0.9);
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
    for (var f = 0; f < floatPool.length; f++) { floatPool[f].life = 0; floatPool[f].sprite.visible = false; }
    flash = 0;
  }

  SA.fx = {
    init: init, update: update, clear: clear, hit: hit,
    burst: burst, wave: wave, floatText: floatText,
    get flash() { return flash; }
  };
})(window);
