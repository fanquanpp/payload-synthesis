/* ══════════════════════════════════════════════════════════════════
   ui.js — DOM layer. HUD, specimen codex, overlays, transitions.
   Exposed as SA.ui
   ══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var SA = root.SA, LADDER = SA.cfg.LADDER, MAX_LV = SA.cfg.MAX_LV, C = SA.cfg.CFG;

  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  var imgs = [];
  var ladderCells = [];
  var startCells = [];
  var clockTimer = null;

  function hexRgba(hex, a) {
    var h = hex.replace('#', '');
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function init() {
    ['uiScore', 'uiBest', 'uiCombo', 'comboWrap', 'uiMass', 'uiCount', 'uiTier', 'uiTime',
     'uiLog', 'uiClock', 'uiFps', 'ladder', 'deploy', 'deployName', 'deployMeta',
     'alert', 'alertTime', 'comboPop', 'toast', 'nextCv', 'startLadder',
     'ovStart', 'ovPause', 'ovOver', 'overScore', 'overBest', 'overTier', 'overNew',
     'boot', 'bootBar', 'bootLog', 'app', 'stage',
     'gateTop', 'gateBottom', 'gateStatus', 'gateTxt',
     'skillBtn', 'skillCount', 'skillMeter',
     'btnStart', 'btnRestart', 'btnRestart2', 'btnResume', 'btnPause',
     'btnLang', 'armHint'].forEach(function (k) { el[k] = $(k); });

    /* load albedo thumbnails for the 2D codex / preview */
    LADDER.forEach(function (L, i) {
      var im = new Image();
      im.onload = function () { refreshToken(i); };
      im.src = 'assets/tex/final/' + L.tex + '_a.jpg';
      imgs[i] = im;
    });

    buildLadder();
    buildStartLadder();
    SA.i18n.apply();
    if (el.btnLang) {
      el.btnLang.addEventListener('click', function () {
        SA.setLang(SA.i18n.lang === 'zh' ? 'en' : 'zh');
      });
    }
    el.ovStart.classList.add('show');
  }

  /* everything that is rendered from data rather than from markup */
  function onLangChange() {
    ladderCells.forEach(function (c) {
      c.node.title = SA.partName(LADDER[c.lv]) + ' · ' + LADDER[c.lv].code;
    });
    if (nextShown >= 0) setNext(nextShown);
    if (el.uiLog) {
      while (el.uiLog.firstChild) el.uiLog.removeChild(el.uiLog.firstChild);
    }
  }

  /* redraw every 2D surface that shows specimen `i` once its bitmap lands */
  function refreshToken(i) {
    var cell = ladderCells[i];
    if (cell) {
      var g = cell.cv.getContext('2d');
      g.clearRect(0, 0, 96, 96);
      if (found[i]) drawToken(g, 96, i, { glow: i >= 5 });
    }
    if (startCells[i]) {
      drawToken(startCells[i].getContext('2d'), 96, i, { glow: i >= 7 });
    }
    if (nextShown === i) setNext(i);
  }

  /* ── 2D specimen token: a painted part seen face-on ───────── */
  function drawToken(ctx, size, level, opts) {
    opts = opts || {};
    var L = LADDER[level];
    var cx = size / 2, cy = size / 2;
    var R = size * 0.42;
    ctx.clearRect(0, 0, size, size);

    /* painted face — the specimen's own functional pattern */
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    var im = imgs[level];
    if (im && im.complete && im.naturalWidth) {
      var s = Math.max((R * 2) / im.naturalWidth, (R * 2) / im.naturalHeight);
      ctx.drawImage(im, cx - im.naturalWidth * s / 2, cy - im.naturalHeight * s / 2,
                    im.naturalWidth * s, im.naturalHeight * s);
    } else {
      ctx.fillStyle = '#ECE5D6';
      ctx.fillRect(0, 0, size, size);
    }
    /* matte shading — documentation lighting, not neon */
    var g = ctx.createRadialGradient(cx - R * .34, cy - R * .40, R * .06, cx, cy, R * 1.05);
    g.addColorStop(0, 'rgba(255,255,255,.20)');
    g.addColorStop(.55, 'rgba(255,255,255,.01)');
    g.addColorStop(1, 'rgba(42,42,42,.24)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    /* a wash of the specimen's one vivid accent, so tiers stay
       distinguishable even at 26px in the mission-brief strip */
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = L.col;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
    ctx.restore();

    /* ink outline — the line-work that carries this whole language */
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.6, size * 0.030);
    ctx.strokeStyle = '#2A2A2A';
    ctx.stroke();

    /* the one vivid accent: a notch on the rim */
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1, -Math.PI * 0.34, Math.PI * 0.34);
    ctx.lineWidth = Math.max(2.6, size * 0.072);
    ctx.strokeStyle = L.col;
    ctx.stroke();
  }

  function buildLadder() {
    el.ladder.innerHTML = '';
    LADDER.forEach(function (L, i) {
      var d = document.createElement('div');
      d.className = 'spec';
      d.title = SA.partName(L) + ' · ' + L.code;
      var c = document.createElement('canvas');
      c.width = c.height = 96;
      d.appendChild(c);
      var n = document.createElement('i');
      n.textContent = (i + 1);
      d.appendChild(n);
      el.ladder.appendChild(d);
      ladderCells.push({ node: d, cv: c, lv: i, drawn: false });
    });
  }

  function buildStartLadder() {
    el.startLadder.innerHTML = '';
    LADDER.forEach(function (L, i) {
      var c = document.createElement('canvas');
      c.width = c.height = 96;
      c.style.width = '24px'; c.style.height = '24px';
      el.startLadder.appendChild(c);
      drawToken(c.getContext('2d'), 96, i, { glow: i >= 7 });
      startCells.push(c);
    });
  }

  var found = {};
  function markFound(level, silent) {
    var cell = ladderCells[level];
    if (!cell || found[level]) return false;
    found[level] = true;
    drawToken(cell.cv.getContext('2d'), 96, level, { glow: level >= 5 });
    cell.node.classList.add('found');
    if (level > 0 && !silent) {
      cell.node.classList.add('new');
      setTimeout(function () { cell.node.classList.remove('new'); }, 850);
    }
    return true;
  }

  function resetFound() {
    found = {};
    ladderCells.forEach(function (c) {
      c.node.classList.remove('found', 'new');
      c.cv.getContext('2d').clearRect(0, 0, 96, 96);
    });
    /* seed the spawnable tiers as already catalogued */
    for (var i = 0; i <= C.MAX_SPAWN; i++) markFound(i, true);
  }

  /* ── next-drop preview ───────────────────────────────────── */
  var nextShown = -1;
  function setNext(level) {
    nextShown = level;
    drawToken(el.nextCv.getContext('2d'), el.nextCv.width, level, { glow: level >= 4 });
    var L = LADDER[level];
    el.deployName.textContent = SA.partName(L);
    el.deployMeta.textContent = L.code + ' · R' + L.r.toFixed(1) + ' · M' + L.mass;
    el.deploy.style.borderColor = L.col;
  }

  /* ── stats ────────────────────────────────────────────────── */
  function setScore(v) {
    el.uiScore.textContent = v;
    el.uiScore.classList.remove('bump');
    void el.uiScore.offsetWidth;
    el.uiScore.classList.add('bump');
  }
  function setBest(v) { el.uiBest.textContent = v; }
  function setCombo(mult, alive) {
    el.uiCombo.textContent = '×' + mult;
    el.comboWrap.classList.toggle('hot', !!alive && mult > 1);
  }
  function setMass(v) { el.uiMass.textContent = v; }
  function setCount(v) { el.uiCount.textContent = v; }
  function setTier(lv) {
    el.uiTier.textContent = lv == null ? '—' : LADDER[lv].code.replace('ORIG-', 'T');
    el.uiTier.classList.toggle('hot', lv != null && lv >= 6);
  }
  function setTime(sec) { el.uiTime.textContent = SA.cfg.fmtTime(sec); }
  function setFps(v) { el.uiFps.textContent = v + ' FPS'; }

  /* ── log ──────────────────────────────────────────────────── */
  function log(text, hi) {
    var d = document.createElement('div');
    d.textContent = text;
    if (hi) d.className = 'hi';
    el.uiLog.insertBefore(d, el.uiLog.firstChild);
    while (el.uiLog.children.length > C.MAX_LOG) el.uiLog.removeChild(el.uiLog.lastChild);
  }

  /* ── alert / combo / toast ───────────────────────────────── */
  function alert(on, remain) {
    el.alert.classList.toggle('on', !!on);
    if (on && remain != null) el.alertTime.textContent = remain.toFixed(1) + 's';
  }
  function comboPop(text) {
    el.comboPop.textContent = text;
    el.comboPop.classList.remove('go');
    void el.comboPop.offsetWidth;
    el.comboPop.classList.add('go');
  }
  var toastT = null;
  function toast(text) {
    el.toast.textContent = text;
    el.toast.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.toast.classList.remove('on'); }, 1900);
  }

  /* ── overlays ─────────────────────────────────────────────── */
  function show(id) { el[id].classList.add('show'); }
  function hide(id) { el[id].classList.remove('show'); }
  function setOver(score, best, tier, isNew) {
    el.overScore.textContent = score;
    el.overBest.textContent = best;
    el.overTier.textContent = tier == null ? '—' : LADDER[tier].code;
    el.overNew.classList.toggle('on', !!isNew);
  }

  /* ── clock ────────────────────────────────────────────────── */
  function startClock() {
    stopClock();
    clockTimer = setInterval(function () {
      var d = new Date();
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      el.uiClock.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }, 1000);
  }
  function stopClock() { if (clockTimer) clearInterval(clockTimer); clockTimer = null; }

  /* ── boot sequence ────────────────────────────────────────── */
  function boot(done) {
    var lines = [SA.t('boot.1'), SA.t('boot.2'), SA.t('boot.3'), SA.t('boot.4'), SA.t('boot.5')];
    var i = 0;
    var step = function () {
      if (i < lines.length) {
        el.bootLog.textContent = lines[i];
        el.bootBar.style.right = (100 - (i + 1) / lines.length * 100) + '%';
        i++;
        setTimeout(step, 190 + Math.random() * 130);
      } else {
        setTimeout(function () {
          el.boot.classList.add('gone');
          el.app.classList.add('on');
          el.app.setAttribute('aria-hidden', 'false');
          startClock();
          if (done) done();
        }, 300);
      }
    };
    setTimeout(step, 220);
  }

  /* ── mechanical double gate ───────────────────────────────── */
  var gateBusy = false;
  function gate(text, cb) {
    if (gateBusy) { if (cb) cb(); return; }
    gateBusy = true;
    el.gateTxt.textContent = text || 'LOADING';
    el.gateStatus.classList.add('show');
    el.gateTop.classList.add('cover');
    el.gateBottom.classList.add('cover');
    setTimeout(function () {
      if (cb) cb();
      el.gateTxt.textContent = SA.t('gate.ready');
      setTimeout(function () {
        el.gateStatus.classList.remove('show');
        el.gateTop.classList.remove('cover');
        el.gateBottom.classList.remove('cover');
        setTimeout(function () { gateBusy = false; }, 430);
      }, 180);
    }, 440);
  }

  /* ── purge skill widget ───────────────────────────────────── */
  function setSkill(charges, armed, progress) {
    el.skillCount.textContent = charges;
    el.skillBtn.classList.toggle('armed', !!armed);
    el.skillBtn.classList.toggle('disabled', charges <= 0 && !armed);
    el.skillMeter.style.width = Math.round(SA.cfg.clamp(progress || 0, 0, 1) * 100) + '%';
  }
  function setTargeting(on) {
    if (el.stage) el.stage.classList.toggle('arm', !!on);
  }

  SA.ui = {
    init: init, boot: boot,
    el: el,
    setScore: setScore, setBest: setBest, setCombo: setCombo,
    setMass: setMass, setCount: setCount, setTier: setTier,
    setTime: setTime, setFps: setFps, setNext: setNext,
    markFound: markFound, resetFound: resetFound,
    log: log, alert: alert, comboPop: comboPop, toast: toast,
    show: show, hide: hide, setOver: setOver,
    drawToken: drawToken, stopClock: stopClock, onLangChange: onLangChange,
    gate: gate, setSkill: setSkill, setTargeting: setTargeting
  };
})(window);
