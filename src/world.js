/* ══════════════════════════════════════════════════════════════════
   world.js — Three.js layer.
   A dark checkout-bay viewport set into the cream NASA-punk page:
   matte flight hardware, neutral studio light, no neon.
   Exposed as SA.world
   ══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var SA = root.SA, C = SA.cfg.CFG, LADDER = SA.cfg.LADDER, MAX_LV = SA.cfg.MAX_LV, UI = SA.cfg.UI;

  var BW = C.BW, BH = C.BH, DEPTH = 30;
  function syncBW() { BW = C.BW; }
  var FOV = 30, MARGIN = 1.055, ELEV = 46;

  var renderer, scene, camera, composer, bloom, fxaa;
  var chamber = {}, mats = [], geos = [], halos = [];
  var bodyMeshes = new Map();
  var ghost = null, ghostGuide = null, ghostRing = null;
  var hoverRing = null, hoverTarget = null;
  var aimLight = null;
  var shake = 0;
  var dangerLevel = 0, dangerLine = null, dangerGlow = null;
  var clock = 0, ready = false;
  var camBase = new THREE.Vector3(0, ELEV, 250);

  /* ── adaptive quality ────────────────────────────────────────
     0 = full (bloom + full DPR)
     1 = reduced DPR, half-res bloom
     2 = no bloom, 1x DPR
     The game loop nudges this down when the frame rate sags and back
     up when there is headroom again.                            */
  var QUALITY_DPR = [2, 1.5, 1];
  var QUALITY_BLOOM = [1, 0.5, 0];
  var quality = 0;

  var ACCENT = 0xD63A2C;
  var SUBSTRATE = 0xECE5D6;
  var INK = 0x2A2A2A;

  /* ── procedural env: a neutral studio ceiling, no coloured glow ── */
  function envTexture() {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, '#5d5a52');
    grad.addColorStop(0.44, '#8e887c');
    grad.addColorStop(0.60, '#4a4740');
    grad.addColorStop(1.00, '#1d1c19');
    g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
    var lg = g.createRadialGradient(150, 58, 0, 150, 58, 150);
    lg.addColorStop(0, 'rgba(255,252,244,.98)'); lg.addColorStop(1, 'rgba(255,252,244,0)');
    g.fillStyle = lg; g.fillRect(0, 0, 512, 256);
    var lg2 = g.createRadialGradient(392, 84, 0, 392, 84, 160);
    lg2.addColorStop(0, 'rgba(238,232,220,.72)'); lg2.addColorStop(1, 'rgba(238,232,220,0)');
    g.fillStyle = lg2; g.fillRect(0, 0, 512, 256);
    var t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  }

  /* ── checkout-bay wall: ink panel with cream functional grid ── */
  function panelTexture() {
    var s = 512;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    g.fillStyle = '#34312c'; g.fillRect(0, 0, s, s);
    /* fine checkout grid */
    g.strokeStyle = 'rgba(236,229,214,.07)'; g.lineWidth = 1;
    for (var i = 0; i <= s; i += 16) {
      g.beginPath(); g.moveTo(i + .5, 0); g.lineTo(i + .5, s); g.stroke();
      g.beginPath(); g.moveTo(0, i + .5); g.lineTo(s, i + .5); g.stroke();
    }
    /* structural seams */
    g.strokeStyle = 'rgba(236,229,214,.24)'; g.lineWidth = 2;
    for (var j = 0; j <= s; j += 128) {
      g.beginPath(); g.moveTo(j + .5, 0); g.lineTo(j + .5, s); g.stroke();
      g.beginPath(); g.moveTo(0, j + .5); g.lineTo(s, j + .5); g.stroke();
    }
    /* rivets at seam intersections */
    for (var y = 8; y < s; y += 128) {
      for (var x = 8; x < s; x += 128) {
        g.fillStyle = 'rgba(236,229,214,.34)';
        g.beginPath(); g.arc(x, y, 2.4, 0, 6.283); g.fill();
        g.fillStyle = 'rgba(236,229,214,.12)';
        g.beginPath(); g.arc(x, y, 5.2, 0, 6.283); g.fill();
      }
    }
    /* stencil marks */
    g.fillStyle = 'rgba(236,229,214,.30)';
    g.font = '700 11px monospace';
    g.fillText('CHECKOUT BAY 01', 14, s - 30);
    g.fillText('REF 12-4 / NO STEP', 14, s - 14);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 3);
    return t;
  }

  /* ── geometry per ladder step (each bounding radius == 1) ─── */
  function geometryFor(kind) {
    switch (kind) {
      case 'hexbolt': return new THREE.CylinderGeometry(0.88, 0.88, 1.15, 6, 1);
      case 'capsule': return new THREE.CapsuleGeometry(0.42, 1.16, 6, 20);
      case 'box':     return new THREE.BoxGeometry(1.16, 1.16, 1.16);
      case 'cyl':     return new THREE.CylinderGeometry(0.72, 0.72, 1.4, 28, 1);
      case 'cyl2':    return new THREE.CylinderGeometry(0.56, 0.56, 1.68, 28, 1);
      case 'bell':    return new THREE.CylinderGeometry(0.44, 1.02, 1.48, 28, 1);
      case 'cone':    return new THREE.ConeGeometry(1.0, 1.42, 28, 1);
      case 'torus':   return new THREE.TorusGeometry(0.72, 0.28, 16, 34);
      case 'dodeca':  return new THREE.DodecahedronGeometry(1, 0);
      case 'octa':    return new THREE.OctahedronGeometry(1, 0);
      case 'booster': return new THREE.CapsuleGeometry(0.6, 0.95, 8, 26);
      default:        return new THREE.SphereGeometry(1, 36, 26);
    }
  }
  var FLAT = { hexbolt: 1, box: 1, dodeca: 1, octa: 1 };

  var manager = null;
  function loadTex(path, srgb) {
    var t = new THREE.TextureLoader(manager).load(path);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  function onLoaded(cb) {
    if (!manager) { cb(); return; }
    var fired = false;
    var go = function () { if (!fired) { fired = true; cb(); } };
    manager.onLoad = go;
    manager.onError = go;
    setTimeout(go, 6000);
  }

  /* ══════════════════════════ init ══════════════════════════ */
  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x22201c, 1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x22201c, 0.0008);

    camera = new THREE.PerspectiveCamera(FOV, BW / BH, 1, 900);
    fitCamera();

    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var envRT = pmrem.fromEquirectangular(envTexture());
    scene.environment = envRT.texture;
    pmrem.dispose();

    buildLights();
    buildChamber();
    buildGhost();

    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    /* NASA-punk has no neon — bloom stays essentially off, only a whisper
       to keep bright speculars from clipping hard */
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.14, 0.5, 0.92);
    composer.addPass(bloom);
    fxaa = new THREE.ShaderPass(THREE.FXAAShader);
    composer.addPass(fxaa);

    ready = true;
  }

  function buildLights() {
    /* neutral, bright, studio-flat — the light of a documentation photo */
    scene.add(new THREE.HemisphereLight(0xF4EFE4, 0x2a2724, 1.15));

    var key = new THREE.DirectionalLight(0xFFFDF7, 2.05);
    key.position.set(-70, 150, 160);
    scene.add(key);

    var fill = new THREE.DirectionalLight(0xEDE7DA, 0.95);
    fill.position.set(150, 60, 90);
    scene.add(fill);

    var rim = new THREE.DirectionalLight(0xCFC7B6, 0.75);
    rim.position.set(60, -70, -140);
    scene.add(rim);

    var top = new THREE.DirectionalLight(0xFFFDF7, 0.85);
    top.position.set(10, 210, 30);
    scene.add(top);

    var bottom = new THREE.PointLight(0xD8D0BE, 1.0, 300, 2);
    bottom.position.set(0, -BH / 2 - 8, 40);
    scene.add(bottom);

    aimLight = new THREE.PointLight(ACCENT, 0, 110, 2);
    aimLight.position.set(0, 0, 34);
    scene.add(aimLight);
  }

  /* ══════════════════════════ chamber ═══════════════════════ */
  function disposeGroup(g) {
    if (!g) return;
    for (var i = g.children.length - 1; i >= 0; i--) {
      var c = g.children[i];
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (c.material.map && c.material.map.isCanvasTexture) c.material.map.dispose();
        c.material.dispose();
      }
      g.remove(c);
    }
  }

  /* called when the viewport hands us a different board width */
  function rebuildChamber() {
    syncBW();
    if (chamber.root) {
      scene.remove(chamber.root);
      disposeGroup(chamber.root);
    }
    chamber = {};
    dangerLine = null; dangerGlow = null;
    buildChamber();
  }

  function buildChamber() {
    var g = new THREE.Group();
    scene.add(g);
    chamber.root = g;

    var halfW = BW / 2, halfH = BH / 2;

    /* back wall — ink panel, cream markings */
    var backMat = new THREE.MeshStandardMaterial({
      map: panelTexture(), color: 0x746E63, metalness: 0.16, roughness: 0.9
    });
    var back = new THREE.Mesh(new THREE.PlaneGeometry(BW + 14, BH + 14), backMat);
    back.position.set(0, 0, -DEPTH);
    g.add(back);

    /* floor */
    var floorMat = new THREE.MeshStandardMaterial({ color: 0x3a3730, metalness: 0.22, roughness: 0.84 });
    var floor = new THREE.Mesh(new THREE.BoxGeometry(BW + 14, 3.2, DEPTH + 4), floorMat);
    floor.position.set(0, -halfH - 1.6, -DEPTH / 2 + 1);
    g.add(floor);

    /* side walls — painted cream gantry rails against the ink bay */
    var wallMat = new THREE.MeshStandardMaterial({ color: 0xCFC7B6, metalness: 0.22, roughness: 0.72 });
    [-1, 1].forEach(function (s) {
      var w = new THREE.Mesh(new THREE.BoxGeometry(3.2, BH + 8, DEPTH + 4), wallMat);
      w.position.set(s * (halfW + 1.6), 0, -DEPTH / 2 + 1);
      g.add(w);
      /* hazard edge strip down the inner face */
      var strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, BH + 4, 0.55),
        new THREE.MeshStandardMaterial({ color: 0x1C1C1C, roughness: 0.9 })
      );
      strip.position.set(s * (halfW + 0.15), 0, 0.6);
      g.add(strip);
    });

    /* floor strip — cream painted line */
    var fl = new THREE.Mesh(
      new THREE.BoxGeometry(BW + 2, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xD8D0BE, roughness: 0.85 })
    );
    fl.position.set(0, -halfH + 0.3, 0.6);
    g.add(fl);

    /* top lip */
    var lip = new THREE.Mesh(
      new THREE.BoxGeometry(BW + 14, 2.6, DEPTH + 4),
      new THREE.MeshStandardMaterial({ color: 0xCFC7B6, metalness: 0.22, roughness: 0.72 })
    );
    lip.position.set(0, halfH + 5.4, -DEPTH / 2 + 1);
    g.add(lip);

    /* corner brackets — sharp ink L-marks, the manual's crop marks */
    var bracketMat = new THREE.LineBasicMaterial({ color: 0xECE5D6, transparent: true, opacity: 0.85 });
    var pts = [], bx = halfW + 0.4, by = halfH + 0.4, L = 13;
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (s) {
      var x = s[0] * bx, y = s[1] * by;
      pts.push(new THREE.Vector3(x, y - s[1] * L, 1), new THREE.Vector3(x, y, 1), new THREE.Vector3(x - s[0] * L, y, 1));
    });
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), bracketMat));

    /* limit line — the single red accent of the composition */
    var dy = halfH - C.TOP_LINE;
    dangerGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(BW + 2, 3.0),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.16, depthWrite: false })
    );
    dangerGlow.position.set(0, dy, 0.5);
    g.add(dangerGlow);

    var dl = [];
    for (var x = -halfW; x < halfW; x += 5) {
      dl.push(new THREE.Vector3(x, dy, 0.6), new THREE.Vector3(x + 2.8, dy, 0.6));
    }
    dangerLine = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(dl),
      new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.75 })
    );
    g.add(dangerLine);
  }

  /* ══════════════════════════ specimens ═════════════════════ */
  function buildSpecimens(onReady) {
    manager = new THREE.LoadingManager();
    LADDER.forEach(function (L, i) {
      geos[i] = geometryFor(L.geo);
      var flat = !!FLAT[L.geo];
      var map = loadTex('assets/tex/final/' + L.tex + '_a.jpg', true);
      /* no emissive map: this language has no neon. A very faint uniform
         lift just keeps parts legible against the dark bay. */
      mats[i] = new THREE.MeshStandardMaterial({
        map: map,
        emissive: new THREE.Color(L.col),
        emissiveIntensity: 0.04,
        metalness: L.metal, roughness: L.rough,
        flatShading: flat,
        envMapIntensity: 0.85
      });
      /* no halo shells in this language — the accent colour does the work */
      halos[i] = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.col), transparent: true, opacity: 0, depthWrite: false });
    });
    if (onReady) manager.onLoad = onReady;
  }

  var outlineMat = null;
  var OUTLINE_MIN_R = 5.0;

  function makeMesh(level) {
    var L = LADDER[level];
    if (!outlineMat) {
      outlineMat = new THREE.MeshBasicMaterial({ color: 0x1B1A18, side: THREE.BackSide });
    }
    var g = new THREE.Group();
    var m = new THREE.Mesh(geos[level], mats[level]);
    m.scale.setScalar(L.r);
    g.add(m);
    /* inverted-hull ink outline — the line-work that makes these read as
       technical-illustration hardware rather than blobs. Small parts are
       only a few pixels across, so the extra draw call buys nothing. */
    if (L.r >= OUTLINE_MIN_R) {
      var o = new THREE.Mesh(geos[level], outlineMat);
      o.scale.setScalar(L.r * 1.045);
      g.add(o);
      g.userData.outline = o;
    }
    g.userData.inner = m;
    return g;
  }

  function syncBodies(bodies) {
    var seen = new Set();
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      var mesh = bodyMeshes.get(b);
      if (!mesh) { mesh = makeMesh(b.level); scene.add(mesh); bodyMeshes.set(b, mesh); }
      seen.add(b);
      var pop = b.pop > 0 ? 1 + b.pop * 0.4 : 1;
      mesh.position.set(b.x - C.BW / 2, BH / 2 - b.y, 0);
      mesh.rotation.set(b.angle * 0.6, b.angle, b.angle * 0.35);
      mesh.scale.setScalar(pop);
    }
    bodyMeshes.forEach(function (mesh, b) {
      if (!seen.has(b)) { scene.remove(mesh); bodyMeshes.delete(b); }
    });
  }

  function clearBodies() {
    bodyMeshes.forEach(function (mesh) { scene.remove(mesh); });
    bodyMeshes.clear();
  }

  /* ══════════════════════════ ghost ═════════════════════════ */
  function buildGhost() {
    ghost = new THREE.Group();
    ghost.visible = false;
    scene.add(ghost);

    ghostRing = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1, 48),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    ghost.add(ghostRing);

    var pts = [new THREE.Vector3(0, 0, 0.6), new THREE.Vector3(0, -BH, 0.6)];
    ghostGuide = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0xD8D0BE, dashSize: 2.6, gapSize: 2.6, transparent: true, opacity: 0.55 })
    );
    ghostGuide.computeLineDistances();
    ghost.add(ghostGuide);

    /* targeting reticle for the purge skill */
    hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.80, 1.0, 6),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95,
                                    side: THREE.DoubleSide, depthWrite: false, depthTest: false })
    );
    hoverRing.visible = false;
    hoverRing.renderOrder = 20;
    scene.add(hoverRing);
  }

  function setHover(body) {
    hoverTarget = body || null;
    if (hoverRing) hoverRing.visible = !!body;
  }

  function updateGhost(level, x, y, visible) {
    if (!ghost) return;
    ghost.visible = visible;
    if (!visible) { aimLight.intensity = 0; return; }
    var L = LADDER[level];
    if (!ghost.userData.inner || ghost.userData.level !== level) {
      if (ghost.userData.inner) ghost.remove(ghost.userData.inner);
      var inner = new THREE.Mesh(geos[level], new THREE.MeshStandardMaterial({
        map: mats[level].map,
        emissive: new THREE.Color(L.col), emissiveIntensity: 0.4,
        metalness: L.metal, roughness: L.rough, flatShading: mats[level].flatShading,
        transparent: true, opacity: 0.5
      }));
      inner.scale.setScalar(L.r);
      ghost.add(inner);
      ghost.userData.inner = inner;
      ghost.userData.level = level;
      ghostRing.scale.setScalar(L.r);
    }
    var wx = x - C.BW / 2, wy = BH / 2 - y;
    ghost.position.set(wx, wy, 1.2);
    ghost.rotation.y = clock * 0.7;
    ghost.userData.inner.rotation.set(clock * 0.4, clock * 0.7, 0);
    ghostGuide.position.set(-wx, 0, -0.6);
    aimLight.position.set(wx, wy, 26);
    aimLight.intensity = 1.4;
  }

  /* ══════════════════════════ frame ═════════════════════════ */
  function fitCamera() {
    var visH = BH * MARGIN;
    var dist = (visH / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    var back = Math.sqrt(Math.max(1, dist * dist - ELEV * ELEV));
    camBase.set(0, ELEV, back);
    camera.position.copy(camBase);
    camera.lookAt(0, 1.5, 0);
    camera.updateProjectionMatrix();
  }

  function resize(w, h, dpr) {
    if (!ready) return;
    syncBW();
    var useDpr = Math.min(dpr, QUALITY_DPR[quality]);
    renderer.setPixelRatio(useDpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    fitCamera();

    composer.setPixelRatio(useDpr);
    composer.setSize(w, h);
    var bs = QUALITY_BLOOM[quality];
    bloom.setSize(Math.max(64, Math.round(w * bs)), Math.max(64, Math.round(h * bs)));
    var pr = renderer.getPixelRatio();
    fxaa.material.uniforms['resolution'].value.set(1 / (w * pr), 1 / (h * pr));
  }

  function setQuality(q) {
    q = Math.max(0, Math.min(2, q | 0));
    if (q === quality) return false;
    quality = q;
    return true;
  }

  function setShake(v) { shake = Math.max(shake, v); }

  function setDanger(v) {
    dangerLevel = v;
    if (!dangerLine) return;
    dangerLine.material.opacity = 0.35 + v * 0.65;
    dangerGlow.material.opacity = 0.05 + v * 0.42;
    dangerGlow.scale.y = 1 + v * 0.9;
  }

  function render(dt, t) {
    clock = t;
    if (hoverRing && hoverTarget) {
      var L = LADDER[hoverTarget.level];
      var sc = L.r * (1.18 + Math.sin(t * 7) * 0.06);
      hoverRing.position.set(hoverTarget.x - C.BW / 2, BH / 2 - hoverTarget.y, 3);
      hoverRing.scale.set(sc, sc, 1);
      hoverRing.rotation.z = t * 1.4;
      hoverRing.material.opacity = 0.72 + Math.sin(t * 9) * 0.24;
    }
    if (shake > 0.001) {
      shake = Math.max(0, shake - dt * 2.6);
      var s = shake * 2.4;
      camera.position.set(camBase.x + Math.sin(t * 47) * s,
                          camBase.y + Math.cos(t * 39) * s,
                          camBase.z);
      camera.rotation.z = Math.sin(t * 31) * shake * 0.012;
    } else if (camera.position.x !== camBase.x || camera.position.y !== camBase.y) {
      camera.position.copy(camBase);
      camera.rotation.z = 0;
    }
    if (QUALITY_BLOOM[quality] > 0) {
      bloom.strength = (0.62 + dangerLevel * 0.7) * (quality === 0 ? 1 : 0.9);
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }

  SA.world = {
    init: init, resize: resize, render: render,
    buildSpecimens: buildSpecimens, onLoaded: onLoaded,
    syncBodies: syncBodies, clearBodies: clearBodies,
    updateGhost: updateGhost, setHover: setHover,
    rebuildChamber: rebuildChamber,
    setShake: setShake, setDanger: setDanger, setQuality: setQuality,
    get quality() { return quality; },
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    mats: mats, geos: geos
  };
})(window);
