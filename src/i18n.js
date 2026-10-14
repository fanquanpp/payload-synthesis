/* ══════════════════════════════════════════════════════════════════
   i18n.js — two-language UI (zh-CN / en).

   Chinese keeps the bilingual "中文 English" label style the NASA-punk
   manual language uses; English shows the plain term. Text is bound
   declaratively through data-i18n / data-i18n-html attributes so the
   markup stays readable.
   Exposed as SA.t, SA.setLang, SA.i18n
   ══════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var DICT = {
    zh: {
      'lang.other': 'EN',

      'brand.sub': '载荷合成 <i>·</i> STD 1/1',
      'hud.score': 'Score 得分',
      'hud.best': 'Best 最高',
      'hud.chain': 'Chain 连锁',
      'hud.next': 'Next 待装配',
      'hud.reject': '剔除 REJECT',

      'rail.system': 'System Check 状态',
      'rail.mass': 'Mass 质量',
      'rail.units': 'Units 件数',
      'rail.highest': 'Highest 最高级',
      'rail.elapsed': 'Elapsed 用时',
      'rail.log': 'Activity Log',
      'rail.catalog': 'Parts Catalog 部件表',
      'rail.nextArticle': 'Next Article',

      'stage.bay': 'Bay 01',
      'stage.alert': 'Limit Exceeded 越限',
      'stage.rejectHint': 'Select unit to reject / 选择要剔除的部件',

      'foot.move': 'Move 移动',
      'foot.release': 'Release 投放',
      'foot.reject': 'Reject 剔除',
      'foot.click': 'Click · Touch',
      'foot.style': 'NASA-PUNK · STD 1/1',

      'start.eyebrow': 'Mission Brief · 任务简报',
      'start.t1': '载荷',
      'start.t2': '合成',
      'start.desc': '将同级载荷投入装配舱，两者接触即合并为更高一级的部件。<br>越限后持续 <b>{overTime} 秒</b> 将触发任务中止。<br>每 <b>{skillStep}</b> 分获得一次「剔除」，可移除任意一个部件。',
      'start.btn': '开始装配',
      'start.foot': '操作 · 方向键移动 / 空格投放 / 点击亦可<br>目标 · 装配运载火箭 LV-11',
      'start.note': '注：越限 {overTime} 秒即中止。<br>别把大件堆到限位线以上。',

      'pause.eyebrow': 'System Hold · 已暂停',
      'pause.title': '装配挂起',
      'pause.desc': '装配终端运行已暂停，载荷状态已冻结。',
      'pause.resume': '继续',
      'pause.reset': '重开',

      'over.eyebrow': 'Mission Abort · 任务中止',
      'over.title': '装配失败',
      'over.score': 'SCORE 得分',
      'over.best': 'BEST',
      'over.tier': 'TIER',
      'over.new': 'New Record · 新纪录',
      'over.retry': '再次装配',

      'gate.spooling': 'SPOOLING',
      'gate.ready': 'READY',

      'toast.full': '装配舱已达容量上限',
      'toast.start': '投放部件 · 同级接触即合并',
      'toast.rejectReady': '剔除单元就绪 · REJECT READY',
      'toast.rejectPick': '选择要剔除的部件',
      'toast.newPart': '新部件入库 · ',
      'toast.singularity': 'LV-11 · LAUNCH VEHICLE 装配完成',

      'log.reset': 'SYS · 装配舱已复位',
      'log.standby': 'SYS · 待装配 ',
      'log.skill': 'SYS · 剔除单元 +1  (',
      'log.merge': 'ASM ',
      'log.new': 'NEW · ',
      'log.reject': 'REJ · ',
      'log.rejected': ' 已剔除',
      'log.abort': 'ERR · MISSION ABORT 任务中止',
      'log.singularity': 'LV-11 · 运载火箭装配完成',

      'boot.1': 'SYS · 装配终端上电…',
      'boot.2': 'SYS · 载入部件规格表 11 项',
      'boot.3': 'SYS · 装配舱压力 101.3 kPa 正常',
      'boot.4': 'SYS · 物理求解器 ONLINE',
      'boot.5': 'OK  · READY / 就绪'
    },

    en: {
      'lang.other': '中文',

      'brand.sub': 'PAYLOAD SYNTHESIS <i>·</i> STD 1/1',
      'hud.score': 'Score',
      'hud.best': 'Best',
      'hud.chain': 'Chain',
      'hud.next': 'Next',
      'hud.reject': 'Reject',

      'rail.system': 'System Check',
      'rail.mass': 'Mass',
      'rail.units': 'Units',
      'rail.highest': 'Highest',
      'rail.elapsed': 'Elapsed',
      'rail.log': 'Activity Log',
      'rail.catalog': 'Parts Catalog',
      'rail.nextArticle': 'Next Article',

      'stage.bay': 'Bay 01',
      'stage.alert': 'Limit Exceeded',
      'stage.rejectHint': 'Select unit to reject',

      'foot.move': 'Move',
      'foot.release': 'Release',
      'foot.reject': 'Reject',
      'foot.click': 'Click · Touch',
      'foot.style': 'NASA-PUNK · STD 1/1',

      'start.eyebrow': 'Mission Brief',
      'start.t1': 'Payload',
      'start.t2': ' Synthesis',
      'start.desc': 'Release hardware into the assembly bay. Two units of the same tier merge into the next one.<br>Cross the limit line for <b>{overTime} seconds</b> and the mission aborts.<br>Every <b>{skillStep}</b> points earns one Reject charge — remove any unit.',
      'start.btn': 'Initiate',
      'start.foot': 'Controls · Arrows to move / Space to release / Click or tap<br>Objective · assemble LV-11 LAUNCH VEHICLE',
      'start.note': 'Note: {overTime} s over the line aborts.<br>Keep the big hardware low.',

      'pause.eyebrow': 'System Hold',
      'pause.title': 'Assembly Held',
      'pause.desc': 'The assembly terminal is suspended and all payload state is frozen.',
      'pause.resume': 'Resume',
      'pause.reset': 'Reset',

      'over.eyebrow': 'Mission Abort',
      'over.title': 'Assembly Failed',
      'over.score': 'SCORE',
      'over.best': 'BEST',
      'over.tier': 'TIER',
      'over.new': 'New Record',
      'over.retry': 'Retry',

      'gate.spooling': 'SPOOLING',
      'gate.ready': 'READY',

      'toast.full': 'Assembly bay at capacity',
      'toast.start': 'Release hardware · same tier merges',
      'toast.rejectReady': 'Reject unit ready',
      'toast.rejectPick': 'Select a unit to reject',
      'toast.newPart': 'New part catalogued · ',
      'toast.singularity': 'LV-11 · LAUNCH VEHICLE assembled',

      'log.reset': 'SYS · bay reset',
      'log.standby': 'SYS · standby ',
      'log.skill': 'SYS · reject unit +1  (',
      'log.merge': 'ASM ',
      'log.new': 'NEW · ',
      'log.reject': 'REJ · ',
      'log.rejected': ' rejected',
      'log.abort': 'ERR · MISSION ABORT',
      'log.singularity': 'LV-11 · launch vehicle assembled',

      'boot.1': 'SYS · assembly terminal powering up…',
      'boot.2': 'SYS · loading parts catalogue (11 items)',
      'boot.3': 'SYS · bay pressure 101.3 kPa nominal',
      'boot.4': 'SYS · physics solver ONLINE',
      'boot.5': 'OK  · READY'
    }
  };

  var lang = 'zh';

  function detect() {
    try {
      var saved = localStorage.getItem('ps_lang');
      if (saved && DICT[saved]) return saved;
    } catch (_) {}
    var nav = (navigator.language || 'zh').toLowerCase();
    return nav.indexOf('zh') === 0 ? 'zh' : 'en';
  }

  /* Gameplay numbers in the copy come from cfg, so the brief can never
     drift from the mechanic again — it advertised 500 points per reject
     long after the price became flat 10000. Resolved lazily: cfg.js is
     loaded after this file. */
  function fill(s) {
    if (s == null || s.indexOf('{') < 0) return s;
    var C = root.SA && root.SA.cfg && root.SA.cfg.CFG;
    if (!C) return s;
    return s
      .split('{skillStep}').join(String(C.SKILL_STEP).replace(/\B(?=(\d{3})+(?!\d))/g, ','))
      .split('{overTime}').join(String(C.OVER_TIME))
      .split('{comboCap}').join(String(C.COMBO_CAP))
      .split('{skillMax}').join(String(C.SKILL_MAX));
  }

  function t(key) {
    var d = DICT[lang] || DICT.zh;
    var v = d[key];
    if (v == null) v = (DICT.zh[key] != null ? DICT.zh[key] : key);
    return fill(v);
  }

  /* walk the document and re-render every bound node */
  function apply(scope) {
    var nodes = (scope || document).querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
    var htmls = (scope || document).querySelectorAll('[data-i18n-html]');
    for (var j = 0; j < htmls.length; j++) {
      htmls[j].innerHTML = t(htmls[j].getAttribute('data-i18n-html'));
    }
    var phs = (scope || document).querySelectorAll('[data-i18n-ph]');
    for (var k = 0; k < phs.length; k++) {
      phs[k].setAttribute('placeholder', t(phs[k].getAttribute('data-i18n-ph')));
    }
    if (document.documentElement) document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
  }

  function setLang(code, silent) {
    if (!DICT[code] || code === lang) { apply(); return; }
    lang = code;
    try { localStorage.setItem('ps_lang', lang); } catch (_) {}
    apply();
    if (!silent && root.SA && root.SA.ui && root.SA.ui.onLangChange) root.SA.ui.onLangChange();
  }

  /* the ladder stores both names; pick the one for the active language */
  function partName(L) { return lang === 'zh' ? L.name : L.en; }

  lang = detect();

  root.SA = root.SA || {};
  root.SA.t = t;
  root.SA.setLang = setLang;
  root.SA.partName = partName;
  root.SA.i18n = { apply: apply, DICT: DICT, get lang() { return lang; } };
})(window);
