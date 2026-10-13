/* ══════════════════════════════════════════════════════════════════
   game.js — glue: state machine, main loop, input, responsive layout,
   scoring / chain logic. Boots everything.
   ══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var SA = root.SA, C = SA.cfg.CFG, LADDER = SA.cfg.LADDER, MAX_LV = SA.cfg.MAX_LV;
  var clamp = SA.cfg.clamp;

  var world = new SA.physics.World();

  var state = 'boot';                 // boot | ready | playing | paused | over
  var score = 0, best = 0, combo = 0, comboTimer = 0, maxTier = 0;
  var currentLevel = 0, nextLevel = 0;
  var dropCd = 0, acc = 0, last = 0, playTime = 0;
  var aimX = C.BW / 2, pendingDrop = false;
  var overTimer = 0, dangerLv = 0;
  var fpsAcc = 0, fpsFrames = 0;
  var canvas, stage, wrap, dpr = 1;
  var rectCache = null;
  var shakeFromMerge = 0;
  var autoPause = true;          /* off for embeds / automated capture */

  /* purge skill (from the gameplay reference: 500 pts = 1 charge) */
  var skillCharges = 0, nextSkillAt = C.SKILL_STEP, armed = false, hovered = null;
  var ptrX = -1, ptrY = -1;
  var bufferedDrop = 0;

  try { best = Number(localStorage.getItem('os_best')) || 0; } catch (_) { best = 0; }

  /* ══════════════════════════ layout ════════════════════════ */
  /* How much room is actually left for the chamber once the rails and
     the surrounding chrome have taken theirs. Measured from the board
     element, not from .stage-wrap — .stage-wrap gets an explicit size
     below, so measuring it would feed back on itself. */
  function measure() {
    var boardEl = document.querySelector('.board');
    if (!boardEl) return { w: 320, h: 480 };
    var cs = getComputedStyle(boardEl);
    var col = cs.flexDirection === 'column';
    var innerW = boardEl.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    var innerH = boardEl.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    var gap = parseFloat(cs.rowGap) || parseFloat(cs.gap) || 0;

    var railW = 0, railH = 0, n = 0;
    var rails = boardEl.querySelectorAll('.rail');
    for (var i = 0; i < rails.length; i++) {
      var r = rails[i];
      if (getComputedStyle(r).display === 'none') continue;
      var b = r.getBoundingClientRect();
      if (col) railH += b.height; else railW += b.width;
      n++;
    }
    return {
      w: Math.max(140, innerW - railW - gap * n),
      h: Math.max(140, innerH - railH - gap * n)
    };
  }

  /* the board may only change shape while nothing is in flight */
  function applyBoard(box) {
    var want = SA.cfg.boardWidthFor(box.w, box.h);
    if (world.bodies.length === 0 && SA.cfg.setBoard(want)) {
      SA.world.rebuildChamber();
    }
  }

  function layout() {
    var box = measure();
    applyBoard(box);

    var aspect = C.BW / C.BH;
    var w = box.w, h = w / aspect;
    if (h > box.h) { h = box.h; w = h * aspect; }
    w = Math.max(160, Math.floor(w));
    h = Math.floor(w / aspect);

    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    /* pin the wrapper to the chamber so the rails sit against it
       instead of drifting out to the window edges */
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';

    rectCache = null;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    SA.world.resize(w, h, dpr);
  }

  /* ══════════════════════════ flow ═══════════════════════════ */
  function reset() {
    applyBoard(measure());
    world.clear();
    SA.world.clearBodies();
    SA.fx.clear();
    score = 0; combo = 0; comboTimer = 0; maxTier = 0;
    dropCd = 0; acc = 0; playTime = 0; overTimer = 0; dangerLv = 0;
    pendingDrop = false; aimX = C.BW / 2;
    bufferedDrop = 0;
    currentLevel = SA.cfg.randSpawn();
    nextLevel = SA.cfg.randSpawn();
    skillCharges = 0; nextSkillAt = C.SKILL_STEP; armed = false; hovered = null;
    ptrX = -1; ptrY = -1;
    SA.world.setHover(null);
    SA.ui.setTargeting(false);

    SA.ui.setScore(0);
    SA.ui.setCombo(1, false);
    SA.ui.setMass(0); SA.ui.setCount(0); SA.ui.setTier(null); SA.ui.setTime(0);
    SA.ui.setBest(best);
    SA.ui.setNext(nextLevel);
    syncSkill();
    SA.ui.resetFound();
    SA.ui.alert(false);
    SA.ui.el.uiLog.innerHTML = '';
    SA.ui.log(SA.t('log.reset'));
    SA.ui.log(SA.t('log.standby') + LADDER[currentLevel].code);
    SA.world.setDanger(0);
  }

  /* the next charge's price: base 500, +50% for each charge held past
     the free-stockpile allowance — stockpiling is possible, not free */
  function nextSkillCost() {
    var over = Math.max(0, skillCharges - C.SKILL_ESCALATE);
    return Math.round(C.SKILL_STEP * Math.pow(1.5, over));
  }
  function skillProgress() {
    return SA.cfg.clamp((score - nextSkillAt) / nextSkillCost(), 0, 1);
  }
  function syncSkill() { SA.ui.setSkill(skillCharges, armed, skillProgress()); }

  function checkSkillUnlock() {
    var got = 0;
    while (score >= nextSkillAt && skillCharges < C.SKILL_MAX) {
      skillCharges++;
      got++;
      nextSkillAt += nextSkillCost();          /* price grows with stock */
    }
    if (score >= nextSkillAt) nextSkillAt = score + 1;  /* full: park the meter */
    if (got) {
      SA.ui.log(SA.t('log.skill') + skillCharges + '/' + C.SKILL_MAX + ')', true);
      SA.ui.toast(SA.t('toast.rejectReady'));
      SA.fx.floatText(C.BW / 2, C.BH * 0.34, '+' + got + ' REJECT', '#D63A2C', 1.15);
      SA.fx.wave(C.BW / 2, C.BH * 0.34, '#D63A2C', 22, 1.0);
    }
    syncSkill();
  }

  function armSkill() {
    if (state !== 'playing' || armed || skillCharges <= 0) return;
    armed = true;
    syncSkill(); SA.ui.setTargeting(true);
    if (SA.ui.el.armHint) SA.ui.el.armHint.classList.add('on');
    SA.ui.toast(SA.t('toast.rejectPick'));
  }
  function disarmSkill() {
    if (!armed) return;
    armed = false; hovered = null;
    syncSkill(); SA.ui.setTargeting(false);
    if (SA.ui.el.armHint) SA.ui.el.armHint.classList.remove('on');
    SA.world.setHover(null);
  }

  function bodyAt(bx, by) {
    var bs = world.bodies;
    for (var i = bs.length - 1; i >= 0; i--) {
      var b = bs[i];
      if (b.dead) continue;
      var dx = bx - b.x, dy = by - b.y;
      if (dx * dx + dy * dy <= b.r * b.r) return b;
    }
    return null;
  }

  function eliminate(b) {
    if (!b || b.dead) return;
    var L = LADDER[b.level];
    skillCharges--;
    b.dead = true;

    SA.fx.burst(b.x, b.y, L.col, 20, 1.35);
    SA.fx.burst(b.x, b.y, '#2A2A2A', 12, 1.1);
    SA.fx.wave(b.x, b.y, '#D63A2C', b.r * 2.2, 1.25);
    SA.world.setShake(0.55);
    SA.fx.hit(0.42);

    var wr = b.r + 24, wr2 = wr * wr;
    for (var k = 0; k < world.bodies.length; k++) {
      var o = world.bodies[k];
      if (o === b || o.dead) continue;
      var dx = o.x - b.x, dy = o.y - b.y;
      if (dx * dx + dy * dy < wr2) { o.sleeping = false; o.sleepTimer = 0; }
    }
    world.sweep();
    SA.ui.log(SA.t('log.reject') + L.code + SA.t('log.rejected'), true);
    disarmSkill();
  }

  var starting = false;
  function startGame() {
    if (starting || state === 'playing') return;
    starting = true;
    SA.ui.gate(SA.t('gate.spooling'), function () {
      starting = false;
      reset();
      state = 'playing';
      setTimeout(function () { inputArmed = true; }, 460);
      SA.ui.hide('ovStart'); SA.ui.hide('ovPause'); SA.ui.hide('ovOver');
      SA.ui.toast(SA.t('toast.start'));
      last = 0;
    });
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    SA.ui.show('ovPause');
  }
  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    SA.ui.hide('ovPause');
    last = 0;
  }

  function gameOver() {
    if (state !== 'playing') return;
    state = 'over';
    overTimer = 0;
    disarmSkill();
    var isNew = score > best;
    if (isNew) {
      best = score;
      try { localStorage.setItem('os_best', String(best)); } catch (_) {}
    }
    SA.ui.setBest(best);
    SA.ui.setOver(score, best, maxTier >= 0 ? maxTier : null, isNew);
    SA.ui.alert(false);
    SA.ui.show('ovOver');
    SA.ui.log(SA.t('log.abort'), true);
    SA.world.setShake(0.9);
    SA.fx.hit(0.7);
    for (var i = 0; i < world.bodies.length; i++) {
      var b = world.bodies[i];
      SA.fx.burst(b.x, b.y, LADDER[b.level].emis, 4, 0.5);
    }
  }

  /* ══════════════════════════ drop ═══════════════════════════ */
  function drop() {
    if (state !== 'playing' || !inputArmed) return;
    if (dropCd > 0) {                 /* remember the press, fire it later */
      bufferedDrop = C.INPUT_BUFFER;
      return;
    }
    if (world.bodies.length >= C.MAX_BODIES) { SA.ui.toast(SA.t('toast.full')); return; }
    var L = LADDER[currentLevel];
    var x = clamp(aimX, L.r + 1, C.BW - L.r - 1);
    world.spawn(x, C.DROP_Y, currentLevel, {
      vy: 14, vx: (Math.random() - 0.5) * 5, spin: (Math.random() - 0.5) * 3
    });
    SA.fx.burst(x, C.DROP_Y + L.r * 0.5, L.emis, 7, 0.55);
    SA.fx.wave(x, C.DROP_Y + L.r * 0.5, L.emis, L.r * 0.9, 0.35);

    currentLevel = nextLevel;
    nextLevel = SA.cfg.randSpawn();
    SA.ui.setNext(nextLevel);
    var nr = LADDER[currentLevel].r;
    aimX = clamp(aimX, nr + 1, C.BW - nr - 1);
    dropCd = C.DROP_CD;
  }

  /* ══════════════════════════ merges ═════════════════════════ */
  function handleMerges() {
    var guard = 0, any = false;
    while (guard++ < 8) {
      var list = world.mergePass();
      if (!list.length) break;
      any = true;
      for (var i = 0; i < list.length; i++) onMerge(list[i]);
    }
    return any;
  }

  function onMerge(ev) {
    var lv = ev.lv, L = LADDER[lv];

    if (comboTimer > 0) combo++; else combo = 1;
    /* the window stretches a little with each link, so a fast streak
       can run long, but it always closes if you stop feeding it */
    comboTimer = C.COMBO_WINDOW + Math.min(combo, 20) * 0.05;

    var base = (lv + 1) * (lv + 1);
    var mult = Math.min(combo, C.COMBO_CAP);
    var pts = base * mult;
    score += pts;

    SA.ui.setScore(score);
    checkSkillUnlock();
    SA.ui.setCombo(mult, true);
    var big = lv >= 6 ? 1.35 : (lv >= 3 ? 1.12 : 1);
    if (mult >= 10) big += 0.25;                  /* deep chains read louder */
    SA.fx.floatText(ev.x, ev.y - 5, '+' + pts, L.col, big);
    SA.fx.wave(ev.x, ev.y, L.emis, L.r, Math.min(1.15, 0.55 + lv * 0.09));
    SA.fx.burst(ev.x, ev.y, L.emis, 9 + lv * 3, Math.min(1.35, 0.8 + lv * 0.1));
    SA.world.setShake(Math.min(0.72, 0.16 + lv * 0.05));
    SA.fx.hit(Math.min(0.55, 0.16 + lv * 0.06));

    if (combo >= 2) SA.ui.comboPop('×' + mult + '  CHAIN');
    if (combo === C.COMBO_CAP) SA.ui.log('MAX · 连锁已到顶 ×' + C.COMBO_CAP, true);
    if (lv >= 3) SA.ui.log(SA.t('log.merge') + L.code + ' ×' + mult + '  +' + pts, lv >= 6);

    if (lv > maxTier) {
      maxTier = lv;
      SA.ui.setTier(lv);
      if (SA.ui.markFound(lv)) {
        SA.ui.log(SA.t('log.new') + L.code + ' ' + SA.partName(L), true);
        SA.ui.toast(SA.t('toast.newPart') + SA.partName(L));
      }
    }
    if (lv === MAX_LV) {
      SA.ui.log(SA.t('log.singularity'), true);
      SA.ui.toast(SA.t('toast.singularity'));
      SA.world.setShake(0.85);
      SA.fx.hit(0.8);
      for (var k = 0; k < 3; k++) SA.fx.wave(ev.x, ev.y, L.emis, L.r * (1 + k * 0.5), 1.2);
    }
  }

  /* ══════════════════════════ update ═════════════════════════ */
  function update(dt) {
    if (state === 'playing') {
      playTime += dt;
      if (dropCd > 0) dropCd -= dt;
      if (bufferedDrop > 0) {
        bufferedDrop -= dt;
        if (dropCd <= 0) { bufferedDrop = 0; drop(); }
      }

      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) { combo = 0; SA.ui.setCombo(1, false); }
      }

      acc += dt;
      if (acc > 0.1) acc = 0.1;
      var steps = 0;
      while (acc >= C.FIXED && steps < C.MAX_STEPS) {
        world.step(C.FIXED); acc -= C.FIXED; steps++;
      }
      if (steps >= C.MAX_STEPS) acc = 0;

      handleMerges();
      updateDanger(dt);

      if (armed) {
        var hb = ptrX >= 0 ? bodyAt(ptrX, ptrY) : null;
        if (hb !== hovered) hovered = hb;
        if (hovered) SA.world.setHover(hovered);
      }
    }

    SA.fx.update(dt, performance.now() / 1000);

    /* ── HUD readouts ── */
    var mass = 0, top = -1;
    for (var i = 0; i < world.bodies.length; i++) {
      var b = world.bodies[i];
      mass += LADDER[b.level].mass;
      if (b.level > top) top = b.level;
    }
    SA.ui.setMass(mass);
    SA.ui.setCount(world.bodies.length);
    if (top >= 0) SA.ui.setTier(Math.max(top, maxTier));
    SA.ui.setTime(playTime);
  }

  function updateDanger(dt) {
    var anyOver = false, closest = 0;
    for (var i = 0; i < world.bodies.length; i++) {
      var b = world.bodies[i];
      if (b.age < C.DROP_GRACE) continue;
      var topEdge = b.y - b.r * 0.35;
      if (topEdge < C.TOP_LINE) anyOver = true;
      var d = 1 - (topEdge - C.TOP_LINE) / 42;
      if (d > closest) closest = d;
    }
    closest = clamp(closest, 0, 1);
    dangerLv += (closest - dangerLv) * Math.min(1, dt * 6);
    SA.world.setDanger(dangerLv);

    if (anyOver) {
      overTimer += dt;
      SA.ui.alert(true, Math.max(0, C.OVER_TIME - overTimer));
      if (overTimer >= C.OVER_TIME) gameOver();
    } else if (overTimer > 0) {
      overTimer = 0;
      SA.ui.alert(false);
    }
  }

  /* ══════════════════════════ loop ═══════════════════════════ */
  var loopRunning = false;
  function frame(t) {
    requestAnimationFrame(frame);
    if (!last) last = t;
    var dt = (t - last) / 1000;
    last = t;
    if (dt > 0.05) dt = 0.05;
    else if (dt < 0) dt = 0;

    update(dt);

    /* ── 3D ── */
    SA.world.syncBodies(world.bodies);
    var showGhost = (state === 'playing' && !armed);
    var gr = LADDER[currentLevel].r;
    SA.world.updateGhost(currentLevel,
      clamp(aimX, gr + 1, C.BW - gr - 1), C.DROP_Y, showGhost);
    SA.world.render(dt, t / 1000);

    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) {
      var fps = Math.round(fpsFrames / fpsAcc);
      SA.ui.setFps(fps);
      govern(fps);
      fpsAcc = 0; fpsFrames = 0;
    }
  }

  /* true only after the gate curtain has fully retracted, so input
     during the 440ms closing animation is swallowed instead of firing
     a drop the player cannot see */
  var inputArmed = false;

  /* step the render quality up or down to hold the frame rate */
  var slowTicks = 0, fastTicks = 0;
  function govern(fps) {
    if (fps < 46) {
      slowTicks++; fastTicks = 0;
      if (slowTicks >= 3 && SA.world.setQuality(SA.world.quality + 1)) {
        layout(); slowTicks = 0;
        SA.ui.log('SYS · render quality → ' + (SA.world.quality === 1 ? 'MED' : 'LOW'));
      }
    } else if (fps > 57) {
      fastTicks++; slowTicks = 0;
      if (fastTicks >= 12 && SA.world.setQuality(SA.world.quality - 1)) {
        layout(); fastTicks = 0;
      }
    } else {
      slowTicks = 0; fastTicks = 0;
    }
  }

  /* ══════════════════════════ input ══════════════════════════ */
  function rect() {
    if (!rectCache) rectCache = canvas.getBoundingClientRect();
    return rectCache;
  }
  function boardX(clientX) {
    var r = rect();
    return (clientX - r.left) * (C.BW / r.width);
  }
  function boardY(clientY) {
    var r = rect();
    return (clientY - r.top) * (C.BH / r.height);
  }

  function bindInput() {
    stage.addEventListener('pointermove', function (e) {
      if (state !== 'playing' || !inputArmed) return;
      ptrX = boardX(e.clientX); ptrY = boardY(e.clientY);
      if (armed) { hovered = bodyAt(ptrX, ptrY); SA.world.setHover(hovered); return; }
      if (e.pointerType === 'mouse' || pendingDrop) aimX = ptrX;
    }, { passive: true });

    stage.addEventListener('pointerdown', function (e) {
      if (state !== 'playing' || !inputArmed) return;
      e.preventDefault();
      ptrX = boardX(e.clientX); ptrY = boardY(e.clientY);
      if (armed) {
        var t = bodyAt(ptrX, ptrY);
        if (t) eliminate(t); else disarmSkill();
        return;
      }
      aimX = ptrX;
      if (e.pointerType === 'mouse') drop();
      else pendingDrop = dropCd <= 0;
    });

    stage.addEventListener('pointerup', function () {
      if (armed) return;
      if (!pendingDrop) return;
      pendingDrop = false;
      drop();
    });
    stage.addEventListener('pointercancel', function () { pendingDrop = false; });
    stage.addEventListener('pointerleave', function () {
      ptrX = -1; ptrY = -1;
      if (armed) { hovered = null; SA.world.setHover(null); }
    });
    stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    window.addEventListener('keydown', function (e) {
      if (armed && e.key === 'Escape') { e.preventDefault(); disarmSkill(); return; }
      if ((e.key === 'q' || e.key === 'Q') && state === 'playing') {
        e.preventDefault();
        if (armed) disarmSkill(); else armSkill();
        return;
      }
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (state === 'paused') resumeGame();
        else if (state === 'playing') pauseGame();
        return;
      }
      if (state !== 'playing') {
        if ((e.key === ' ' || e.key === 'Enter') && state === 'ready') { e.preventDefault(); startGame(); }
        return;
      }
      if (armed) return;
      var r = LADDER[currentLevel].r;
      var step = Math.max(3.5, C.BW * 0.042);
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        aimX = clamp(aimX - step, r + 1, C.BW - r - 1); e.preventDefault();
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        aimX = clamp(aimX + step, r + 1, C.BW - r - 1); e.preventDefault();
      } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault(); drop();
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && autoPause) pauseGame();
    });

    window.addEventListener('resize', function () { layout(); });
    window.addEventListener('orientationchange', function () { setTimeout(layout, 220); });

    SA.ui.el.btnStart.addEventListener('click', startGame);
    SA.ui.el.btnRestart.addEventListener('click', startGame);
    SA.ui.el.btnRestart2.addEventListener('click', startGame);
    SA.ui.el.btnResume.addEventListener('click', resumeGame);
    SA.ui.el.skillBtn.addEventListener('click', function () {
      if (state !== 'playing') return;
      if (armed) disarmSkill(); else armSkill();
    });
    SA.ui.el.btnPause.addEventListener('click', function () {
      state === 'paused' ? resumeGame() : pauseGame();
    });
  }

  /* ══════════════════════════ boot ═══════════════════════════ */
  function boot() {
    canvas = document.getElementById('gl');
    stage = document.getElementById('stage');
    wrap = document.querySelector('.stage-wrap');

    SA.ui.init();
    SA.world.init(canvas);
    SA.fx.init(SA.world.scene);
    SA.world.buildSpecimens();

    layout();
    bindInput();

    SA.world.onLoaded(function () {
      SA.ui.boot(function () {
        state = 'ready';
        reset();
        if (!loopRunning) { loopRunning = true; requestAnimationFrame(frame); }
      });
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  root.SA.game = {
    get state() { return state; },
    start: startGame,
    drop: drop,
    pause: pauseGame,
    resume: resumeGame,
    setAutoPause: function (v) { autoPause = !!v; },
    armSkill: armSkill, disarmSkill: disarmSkill, eliminate: eliminate,
    get skill() { return { charges: skillCharges, armed: armed }; },
    world: world
  };
})(window);
