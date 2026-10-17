(function () {
  const BC = window.BC;
  const $ = (id) => document.getElementById(id);
  const RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const RANK_LABEL = BC.RANK_LABEL || { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2' };
  const HAND_KEYS = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Five of a Kind', 'Flush Five', 'Flush House', 'Royal Flush'];
  const ENH_OPTS = ['none', 'bonus', 'mult', 'glass', 'steel', 'stone', 'gold', 'lucky', 'wild'];
  const ED_OPTS = ['base', 'foil', 'holo', 'poly', 'negative'];
  const SEAL_OPTS = ['none', 'blue', 'gold', 'red', 'purple'];
  const ENH_LABEL = { none: '无', bonus: '奖励牌', mult: '倍率牌', glass: '玻璃牌', steel: '钢铁牌', stone: '石头牌', gold: '黄金牌', lucky: '幸运牌', wild: '万能牌' };
  const ED_LABEL = { base: '基础', foil: '闪箔', holo: '镭射', poly: '多彩', negative: '负片' };
  const SEAL_LABEL = { none: '无', blue: '蓝封', gold: '金封', red: '红封', purple: '紫封' };
  const BOSS_OPTS = [
    ['none', '无'], ['club', '梅花(The Club)'], ['goad', '黑桃(The Goad)'], ['head', '红桃(The Head)'],
    ['window', '方片(The Window)'], ['plant', '人头(The Plant)'], ['psychic', '灵媒(The Psychic)'],
    ['eye', '眼睛(The Eye)'], ['mouth', '嘴巴(The Mouth)'], ['arm', '手臂(The Arm)'],
    ['flint', '燧石(The Flint)'], ['leaf', '翠叶(The Leaf)']
  ];
  // ab 字段显示规则统一在 core（BC.abShow / BC.candAbFields）
  function showAb(key, path) { return BC.abShow(key, path); }

  let state = {
    played: [], hand: [], jokers: [],
    levels: {}, handPlayed: {}, handPlayedRound: {}, planetCounts: {},
    money: 0, handsLeft: 1, discardsLeft: 0, deckRemaining: 30,
    erosionMissing: 0, steelCount: 0, stoneCount: 0, enhancedCount: 0, tarotUsed: 0,
    jokerSlots: 5, deckType: 'normal', boss: 'none', bossOff: false, observatory: false,
    eyeUsed: [], mouthHand: '',
    planets: []
  };
  let editing = null;
  let lastOpt = null;
  let dragInfo = null;
  let jokerDragIdx = null;
  let cardSeq = 1000;
  const favKey = 'balatro_calc_favs';
  let favs = new Set((() => {
    try {
      const v = JSON.parse(localStorage.getItem(favKey) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (_) { return []; }
  })());

  function saveFavs() { try { localStorage.setItem(favKey, JSON.stringify([...favs])); } catch (_) {} }
  const fmtSci = BC.fmtSci || ((n) => String(n));

  // ---------------- 初始化选项 ----------------
  function fillSelect(sel, items, fmt) {
    sel.innerHTML = items.map((it) => `<option value="${it}">${fmt(it)}</option>`).join('');
  }
  fillSelect($('ed-rank'), RANKS, (r) => RANK_LABEL[r]);
  fillSelect($('ed-suit'), ['S', 'H', 'C', 'D'], (s) => `${BC.SUIT_SYM[s]} ${BC.SUIT_ZH[s]}`);
  fillSelect($('ed-enh'), ENH_OPTS, (e) => ENH_LABEL[e] || e);
  fillSelect($('ed-edition'), ED_OPTS, (e) => ED_LABEL[e] || e);
  fillSelect($('ed-seal'), SEAL_OPTS, (s) => SEAL_LABEL[s] || s);
  $('g-boss').innerHTML = BOSS_OPTS.map(([k, z]) => `<option value="${k}">${z}</option>`).join('');
  // 嘴巴Boss：仅允许某牌型（下拉）；眼睛Boss：已用牌型（复选框，可多选）
  $('g-mouth-hand').innerHTML = `<option value="">（未设）</option>` + HAND_KEYS.map((k) => `<option value="${k}">${BC.NAMES.poker_hands[k] || k}</option>`).join('');
  $('g-eye-hands').innerHTML = HAND_KEYS.map((k) => `<label><input type="checkbox" data-eyehand="${k}">${BC.NAMES.poker_hands[k] || k}</label>`).join('');
  function syncBossExtra() {
    const b = state.boss;
    $('boss-extra').style.display = (b === 'eye' || b === 'mouth') ? '' : 'none';
    $('boss-eye-wrap').style.display = b === 'eye' ? '' : 'none';
    $('g-eye-hands').style.display = b === 'eye' ? '' : 'none';
    $('boss-mouth-wrap').style.display = b === 'mouth' ? '' : 'none';
  }
  function syncEyeChecks() {
    const used = new Set(state.eyeUsed || []);
    $('g-eye-hands').querySelectorAll('input[data-eyehand]').forEach((cb) => { cb.checked = used.has(cb.dataset.eyehand); });
  }

  const candKeys = BC.candidates();
  function jokerOptHtml(k) {
    const m = BC.JMETA[k] || { zh: '占位小丑', r: 0 };
    const rar = { 1: '普通', 2: '罕见', 3: '稀有', 4: '传奇' }[m.r] || '自定义';
    const star = favs.has(k) ? '★' : '';
    return `<option value="${k}">${star}${m.zh}（${rar}）</option>`;
  }
  // 排序：收藏置顶 → 拼音首字母（多音字修正）；搜索过滤只作用于添加下拉
  function sortedCandKeys(filter) {
    const f = (filter || '').trim().toLowerCase();
    let keys = candKeys.slice();
    if (f) {
      keys = keys.filter((k) => {
        const m = BC.JMETA[k] || {};
        return ((m.zh || '') + k).toLowerCase().includes(f);
      });
    }
    keys.sort((a, b) => {
      const fa = favs.has(a) ? 0 : 1;
      const fb = favs.has(b) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return BC.zhCompare((BC.JMETA[a] || {}).zh || a, (BC.JMETA[b] || {}).zh || b);
    });
    return keys;
  }
  // 候选参数表单需在 refreshCandSelect 首次调用前就绪（let TDZ）
  let candOpts = {};
  function renderCandOpts() {
    const k = $('cand-key').value;
    candOpts = {};
    const parts = [];
    const sp = BC.SPECIAL_OPTS[k];
    if (sp) {
      for (const [f, dv] of Object.entries(sp)) {
        candOpts[f] = dv;
        if (f === 'rank') {
          parts.push(`<label class="f">点数<select data-co="${f}">${RANKS.map((r) => `<option value="${r}"${r === dv ? ' selected' : ''}>${RANK_LABEL[r]}</option>`).join('')}</select></label>`);
        } else if (f === 'suit') {
          parts.push(`<label class="f">花色<select data-co="${f}">${['S', 'H', 'C', 'D'].map((s) => `<option value="${s}"${s === dv ? ' selected' : ''}>${BC.SUIT_ZH[s]}</option>`).join('')}</select></label>`);
        } else if (f === 'loyalty') {
          parts.push(`<label class="f">剩余触发<input type="number" data-co="${f}" value="${dv}"></label>`);
        }
      }
    }
    const fields = BC.STATE_OPT_FIELDS && BC.STATE_OPT_FIELDS[k];
    if (fields) {
      for (const [f, label] of fields) {
        if (f === 'extra') continue;
        const dv = (state[f] !== undefined && state[f] !== '') ? state[f] : 0;
        candOpts[f] = dv;
        parts.push(`<label class="f">${label}<input type="number" step="any" data-co="${f}" value="${dv}"></label>`);
      }
    }
    // 成长/配置字段（与小丑行同一套规则），如 星座 的当前 ×倍率
    const AB_LAB = { x_mult: '倍率×', xmult: '倍率×', mult: '倍率+', chips: '筹码+' };
    for (const f of (BC.candAbFields ? BC.candAbFields(k) : [])) {
      candOpts[f.path] = f.value;
      const leaf = f.path.split('.').pop();
      const label = f.path.indexOf('.') >= 0 ? f.path : (AB_LAB[leaf] || leaf);
      parts.push(`<label class="f">${label}<input type="number" step="any" data-co="${f.path}" value="${f.value}"></label>`);
    }
    if (k === '__placeholder') {
      candOpts = { mult: 0, chips: 0, xmult: 1, cost: 0 };
      parts.push(`<label class="f">倍率+<input type="number" step="any" data-co="mult" value="0"></label>`);
      parts.push(`<label class="f">筹码+<input type="number" step="any" data-co="chips" value="0"></label>`);
      parts.push(`<label class="f">倍率×<input type="number" step="any" data-co="xmult" value="1"></label>`);
    }
    $('cand-opts').innerHTML = parts.join('');
  }
  $('cand-key').onchange = renderCandOpts;
  $('cand-opts').addEventListener('input', (e) => {
    const f = e.target.dataset.co;
    if (f) candOpts[f] = e.target.tagName === 'SELECT' && f === 'rank' ? +e.target.value : (f === 'suit' ? e.target.value : +e.target.value || 0);
  });

  function refreshAddSelects() {
    const f = $('joker-search').value;
    const keys = sortedCandKeys(f);
    const html = keys.map(jokerOptHtml).join('') || '<option value="">（无匹配）</option>';
    $('add-joker-sel').innerHTML = html;
  }
  function refreshCandSelect() {
    const cf = ($('cand-search') && $('cand-search').value) || '';
    const prev = $('cand-key').value;
    const candList = sortedCandKeys(cf);
    $('cand-key').innerHTML = candList.map(jokerOptHtml).join('') || '<option value="">（无匹配）</option>';
    if (candList.indexOf(prev) >= 0) $('cand-key').value = prev;
    else $('cand-key').selectedIndex = 0;
    renderCandOpts();
  }
  $('joker-search').addEventListener('input', refreshAddSelects);
  if ($('cand-search')) $('cand-search').addEventListener('input', refreshCandSelect);
  refreshAddSelects();
  refreshCandSelect();
  $('cand-edition').innerHTML = ED_OPTS.filter((e) => e !== 'negative')
    .map((e) => `<option value="${e}">${ED_LABEL[e] || e}</option>`).join('');

  // 牌型等级（两列一排）+ 天文台星球张数 + 出牌计数（超新星/方尖石塔/老千）
  function renderLevels() {
    const showObs = state.observatory;
    $('obs-hint').style.display = showObs ? '' : 'none';
    $('g-levels').innerHTML = `<div class="lvl-grid">` + HAND_KEYS.map((k) => {
      const zh = BC.NAMES.poker_hands[k] || k;
      const lv = state.levels[k] || 1;
      const pc = (state.planetCounts && state.planetCounts[k]) || 0;
      const hp = (state.handPlayed && state.handPlayed[k]) || 0;
      const hpr = (state.handPlayedRound && state.handPlayedRound[k]) || 0;
      return `<div class="lvl-item">
        <span class="name">${zh}</span>
        <input type="number" data-level="${k}" value="${lv}" min="1" title="牌型等级">
        <input type="number" class="planet${showObs ? ' show' : ''}" data-planet-count="${k}" value="${pc}" min="0" title="持有星球牌张数">
        <input type="number" class="playedtot" data-handplayed="${k}" value="${hp}" min="0" title="本牌型整局累计打出次数（超新星/方尖石塔）">
        <input type="number" class="playedrnd" data-handplayed-round="${k}" value="${hpr}" min="0" title="本牌型本盲注内打出次数（老千）">
      </div>`;
    }).join('') + `</div>`;
  }

  // ---------------- 卡片渲染 ----------------
  function cardText(c) {
    const red = c.suit === 'H' || c.suit === 'D';
    let s = `${RANK_LABEL[c.rank]}${BC.SUIT_SYM[c.suit]}`;
    const bits = [];
    if (c.enh && c.enh !== 'none') bits.push(ENH_LABEL[c.enh] || c.enh);
    if (c.edition && c.edition !== 'base') bits.push(ED_LABEL[c.edition] || c.edition);
    if (c.seal && c.seal !== 'none') bits.push((SEAL_LABEL[c.seal] || c.seal));
    if (bits.length) s += `·${bits.join('·')}`;
    return { s, red };
  }
  function renderZone(zone) {
    const el = $('zone-' + zone);
    const arr = state[zone];
    if (!arr.length) {
      el.innerHTML = `<div class="zh">${zone === 'played' ? '（空）点击添加' : '（空）'}</div>`;
      return;
    }
    el.innerHTML = arr.map((c, i) => {
      const { s, red } = cardText(c);
      const cls = red ? 'red' : 'black';
      const deb = !!(c.debuffed || c.userDebuff);
      return `<span class="cardchip ${cls}${deb ? ' on' : ''}" draggable="true" data-zone="${zone}" data-idx="${i}" style="${deb ? 'outline:1px solid var(--red)' : ''}">${s}${deb ? '⚠' : ''} <button class="mini" data-copy="${zone}:${i}" title="复制此牌" style="padding:0 4px">⧉</button><button class="mini" data-del="${zone}:${i}" title="删除" style="padding:0 4px;margin-left:2px">×</button></span>`;
    }).join('');
    el.querySelectorAll('.zh').forEach((n) => n.remove());
  }

  function renderJokers() {
    const box = $('joker-list');
    if (!state.jokers.length) {
      box.innerHTML = '<div class="zh" style="color:var(--dim);font-size:12px">（无小丑）</div>';
      return;
    }
    const rows = [];
    for (let i = 0; i < state.jokers.length; i++) {
      const j = state.jokers[i];
      const meta = BC.JMETA[j.key] || { zh: j.key };
      const d = BC.DEFS[j.key];
      let abHtml = '';
      if (d && d.ab && typeof d.ab === 'object' && Object.keys(d.ab).length) {
        const inputs = [];
        const walk = (obj, prefix) => {
          for (const k of Object.keys(obj)) {
            const v = obj[k];
            const path = prefix ? prefix + '.' + k : k;
            if (typeof v === 'number') {
              if (showAb(j.key, path)) inputs.push(`<label>${k}<input type="number" step="any" data-ab="${i}:${path}" value="${(j.ab && getPath(j.ab, path)) ?? v}"></label>`);
            } else if (v && typeof v === 'object') walk(v, path);
          }
        };
        walk(d.ab, '');
        if (inputs.length) abHtml = inputs.join('');
      }
      // 状态类字段（原全局状态）
      const stateFields = (BC.STATE_OPT_FIELDS && BC.STATE_OPT_FIELDS[j.key]) || [];
      for (const [f, label] of stateFields) {
        if (f === 'extra') continue;
        const val = (j.opts && j.opts[f] !== undefined && j.opts[f] !== '') ? j.opts[f] : (state[f] !== undefined ? state[f] : 0);
        abHtml += `<label>${label}<input type="number" step="any" data-sopt="${i}:${f}" value="${val}"></label>`;
      }
      // 特殊 opts（偶像点数花色等）
      const SOPT_LABEL = { loyalty: '剩余触发' };
      const sp = BC.SPECIAL_OPTS[j.key];
      if (sp) {
        for (const [f, dv] of Object.entries(sp)) {
          const cur = (j.opts && j.opts[f] !== undefined) ? j.opts[f] : dv;
          if (f === 'rank') {
            abHtml += `<label>点数<select data-sopt-sel="${i}:${f}">${RANKS.map((r) => `<option value="${r}"${+cur === r ? ' selected' : ''}>${RANK_LABEL[r]}</option>`).join('')}</select></label>`;
          } else if (f === 'suit') {
            abHtml += `<label>花色<select data-sopt-sel="${i}:${f}">${['S', 'H', 'C', 'D'].map((s) => `<option value="${s}"${cur === s || BC.suitShort(cur) === s ? ' selected' : ''}>${BC.SUIT_ZH[s]}</option>`).join('')}</select></label>`;
          } else {
            abHtml += `<label>${SOPT_LABEL[f] || f}<input type="number" step="any" data-sopt="${i}:${f}" value="${cur}"></label>`;
          }
        }
      }
      if (j.key === '__placeholder') {
        abHtml = `
          <label>倍率+<input type="number" step="any" data-ph="${i}:mult" value="${j.opts.mult || 0}"></label>
          <label>筹码+<input type="number" step="any" data-ph="${i}:chips" value="${j.opts.chips || 0}"></label>
          <label>倍率×<input type="number" step="any" data-ph="${i}:xmult" value="${j.opts.xmult || 1}"></label>
          <label>费用$<input type="number" step="any" data-ph="${i}:cost" value="${j.opts.cost || 0}"></label>`;
      }
      const isFav = favs.has(j.key);
      rows.push(`<div class="jokerrow" draggable="true" data-jidx="${i}">
        <span style="min-width:22px;color:var(--dim)">${i + 1}.</span>
        <span class="tag ${isFav ? 'on' : ''}" data-jfav="${i}" title="收藏">★</span>
        <select data-jsel="${i}">${candKeys.map((k) => `<option value="${k}"${k === j.key ? ' selected' : ''}>${(BC.JMETA[k] || {}).zh || k}</option>`).join('')}</select>
        <select data-jed="${i}">${ED_OPTS.map((e) => `<option value="${e}"${e === (j.edition || 'base') ? ' selected' : ''}>${ED_LABEL[e] || e}</option>`).join('')}</select>
        <span class="tag ${j.disabled ? 'on2' : ''}" data-jdis="${i}" title="禁用">禁</span>
        <span class="tag ${j.debuffed ? 'debuff' : ''}" data-jdeb="${i}" title="减益（如 Crimson Heart 随机减 1 小丑）">减</span>
        <span class="ab">${abHtml}</span>
        <button class="mini" data-jdel="${i}">×</button>
      </div>`);
    }
    box.innerHTML = rows.join('') || '<div class="zh" style="color:var(--dim);font-size:12px">（无小丑）</div>';
    bindJokerDnD(box);
  }

  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj); }

  function bindJokerDnD(box) {
    box.querySelectorAll('.jokerrow').forEach((row) => {
      row.addEventListener('dragstart', (e) => {
        jokerDragIdx = +row.dataset.jidx;
        row.style.opacity = '.4';
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', row.dataset.jidx); } catch (_) {}
      });
      row.addEventListener('dragend', () => {
        row.style.opacity = '';
        jokerDragIdx = null;
        box.querySelectorAll('.jokerrow').forEach((r) => (r.style.borderLeft = ''));
      });
      row.addEventListener('dragover', (e) => {
        if (jokerDragIdx === null) return;
        e.preventDefault();
        row.style.borderLeft = '3px solid var(--gold)';
      });
      row.addEventListener('dragleave', () => (row.style.borderLeft = ''));
      row.addEventListener('drop', (e) => {
        if (jokerDragIdx === null) return;
        e.preventDefault();
        e.stopPropagation();
        row.style.borderLeft = '';
        const to = +row.dataset.jidx;
        const from = jokerDragIdx;
        if (from === to) return;
        const [j] = state.jokers.splice(from, 1);
        state.jokers.splice(to, 0, j);
        jokerDragIdx = null;
        renderJokers();
      });
    });
  }

  function renderAll() {
    renderZone('played');
    renderZone('hand');
    renderJokers();
    refreshAddSelects();
    renderLevels();
    $('g-decktype').value = state.deckType;
    $('g-boss').value = state.boss;
    $('g-boss-off').classList.toggle('on', !!state.bossOff);
    $('g-observatory').classList.toggle('on2', state.observatory);
    // 恢复眼/嘴输入
    syncEyeChecks();
    if ($('g-mouth-hand')) $('g-mouth-hand').value = state.mouthHand || '';
    syncBossExtra();
  }

  // ---------------- 事件：zone ----------------
  function newCard() { return { uid: cardSeq++, rank: 14, suit: 'S', enh: 'none', edition: 'base', seal: 'none', debuffed: false }; }

  function bindZoneDnD(el) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('droptarget'); });
    el.addEventListener('dragleave', () => el.classList.remove('droptarget'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('droptarget');
      if (!dragInfo) return;
      const zone = el.dataset.zone;
      const card = state[dragInfo.zone].splice(dragInfo.idx, 1)[0];
      state[zone].push(card);
      dragInfo = null;
      renderAll();
    });
  }
  bindZoneDnD($('zone-played'));
  bindZoneDnD($('zone-hand'));

  document.addEventListener('dragstart', (e) => {
    const t = e.target.closest && e.target.closest('.cardchip');
    if (!t) return;
    dragInfo = { zone: t.dataset.zone, idx: +t.dataset.idx };
    t.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', t.dataset.idx); } catch (_) {}
  });
  document.addEventListener('dragend', () => {
    document.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
    document.querySelectorAll('.dropbefore').forEach((n) => n.classList.remove('dropbefore'));
    dragInfo = null;
  });

  document.addEventListener('dragover', (e) => {
    const t = e.target.closest && e.target.closest('.cardchip');
    if (t && dragInfo) { e.preventDefault(); t.classList.add('dropbefore'); }
  });
  document.addEventListener('dragleave', (e) => {
    const t = e.target.closest && e.target.closest('.cardchip');
    if (t) t.classList.remove('dropbefore');
  });
  document.addEventListener('drop', (e) => {
    const t = e.target.closest && e.target.closest('.cardchip');
    if (!t || !dragInfo) return;
    e.preventDefault(); e.stopPropagation();
    const toZone = t.dataset.zone, toIdx = +t.dataset.idx;
    const card = state[dragInfo.zone].splice(dragInfo.idx, 1)[0];
    let ins = toIdx;
    if (dragInfo.zone === toZone && dragInfo.idx < toIdx) ins--;
    state[toZone].splice(ins, 0, card);
    if (editing && (editing.zone === dragInfo.zone || editing.zone === toZone)) closeEditor();
    dragInfo = null;
    document.querySelectorAll('.dropbefore').forEach((n) => n.classList.remove('dropbefore'));
    renderAll();
  }, true);

  // ---------------- 事件：点击 ----------------
  document.addEventListener('click', (e) => {
    const ds = e.target.dataset || {};
    if (ds.del) {
      const [z, i] = ds.del.split(':');
      state[z].splice(+i, 1);
      if (editing && editing.zone === z) closeEditor();
      renderAll();
      e.stopPropagation();
      return;
    }
    if (ds.copy) {
      const [z, i] = ds.copy.split(':');
      const clone = JSON.parse(JSON.stringify(state[z][+i]));
      clone.uid = cardSeq++;
      state[z].splice(+i + 1, 0, clone);
      if (editing && editing.zone === z) closeEditor();
      renderAll();
      e.stopPropagation();
      return;
    }
    const chip = e.target.closest && e.target.closest('.cardchip');
    if (chip && !e.target.closest('button')) {
      openEditor(chip.dataset.zone, +chip.dataset.idx);
      return;
    }
    if (ds.jdis !== undefined) {
      state.jokers[+ds.jdis].disabled = !state.jokers[+ds.jdis].disabled;
      renderJokers();
      return;
    }
    if (ds.jdeb !== undefined) {
      const j = state.jokers[+ds.jdeb];
      j.debuffed = !j.debuffed;
      renderJokers();
      return;
    }
    if (ds.jfav !== undefined) {
      const k = state.jokers[+ds.jfav].key;
      if (favs.has(k)) favs.delete(k); else favs.add(k);
      saveFavs();
      renderJokers();
      refreshAddSelects();
      refreshCandSelect();
      return;
    }
    if (ds.jdel !== undefined) {
      state.jokers.splice(+ds.jdel, 1);
      renderJokers();
      return;
    }
    if (e.target.id === 'g-observatory') {
      state.observatory = !state.observatory;
      e.target.classList.toggle('on2', state.observatory);
      renderLevels();
    }
    if (e.target.id === 'g-boss-off') {
      state.bossOff = !state.bossOff;
      e.target.classList.toggle('on', state.bossOff);
      renderAll();
    }
  });

  // 编辑器
  function openEditor(zone, idx) {
    editing = { zone, idx };
    const c = state[zone][idx];
    $('editor-panel').style.display = '';
    $('editor-title').textContent = `编辑牌 #${idx + 1}`;
    $('ed-rank').value = c.rank || 14;
    $('ed-suit').value = c.suit || 'S';
    $('ed-enh').value = c.enh || 'none';
    $('ed-edition').value = c.edition || 'base';
    $('ed-seal').value = c.seal || 'none';
    $('ed-debuff').classList.toggle('on', !!c.debuffed);
    $('ed-negative').classList.toggle('on', (c.edition || 'base') === 'negative');
  }
  $('ed-done').onclick = () => { closeEditor(); };
  function closeEditor() { editing = null; $('editor-panel').style.display = 'none'; }
  $('ed-del').onclick = () => {
    if (editing) { state[editing.zone].splice(editing.idx, 1); closeEditor(); renderAll(); }
  };
  $('ed-debuff').onclick = () => {
    if (!editing) return;
    const c = state[editing.zone][editing.idx];
    if (!c) { closeEditor(); return; }
    c.debuffed = !c.debuffed;
    $('ed-debuff').classList.toggle('on', c.debuffed);
    renderAll();
  };
  $('ed-negative').onclick = () => {
    if (!editing) return;
    const c = state[editing.zone][editing.idx];
    if (!c) { closeEditor(); return; }
    c.edition = (c.edition || 'base') === 'negative' ? 'base' : 'negative';
    $('ed-edition').value = c.edition;
    $('ed-negative').classList.toggle('on', c.edition === 'negative');
    renderAll();
  };
  ['ed-rank', 'ed-suit', 'ed-enh', 'ed-edition', 'ed-seal'].forEach((id) => {
    $(id).onchange = () => {
      if (!editing) return;
      const c = state[editing.zone][editing.idx];
      if (!c) { closeEditor(); return; }
      c.rank = +$('ed-rank').value;
      c.suit = $('ed-suit').value;
      c.enh = $('ed-enh').value;
      c.edition = $('ed-edition').value;
      c.seal = $('ed-seal').value;
      renderAll();
    };
  });

  $('add-played').onclick = () => { state.played.push(newCard()); renderAll(); };
  $('clear-played').onclick = () => { state.played = []; renderAll(); };
  $('add-hand').onclick = () => { state.hand.push(newCard()); renderAll(); };
  $('add-joker').onclick = () => {
    const k = $('add-joker-sel').value;
    if (!k) return; // 搜索无匹配时下拉为空值，不加入空 key 小丑
    const j = BC.makeJoker ? BC.makeJoker(k, 'base') : { key: k, edition: 'base', ab: BC.jokerAb(k), opts: {} };
    if (!j.ab) j.ab = BC.jokerAb(k);
    if (!j.opts) j.opts = {};
    // 初始化状态字段默认值
    const fields = (BC.STATE_OPT_FIELDS && BC.STATE_OPT_FIELDS[k]) || [];
    for (const [f] of fields) {
      if (f === 'extra') continue;
      if (j.opts[f] === undefined) j.opts[f] = state[f] !== undefined ? state[f] : 0;
    }
    const sp = BC.SPECIAL_OPTS[k];
    if (sp) for (const [f, dv] of Object.entries(sp)) if (j.opts[f] === undefined) j.opts[f] = dv;
    state.jokers.push(j);
    renderJokers();
  };
  $('add-placeholder').onclick = () => {
    state.jokers.push({ key: '__placeholder', edition: 'base', ab: {}, opts: { mult: 0, chips: 0, xmult: 1, cost: 0 }, disabled: false, debuffed: false });
    renderJokers();
  };

  // joker 行内输入
  $('joker-list').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.jsel !== undefined) {
      const i = +t.dataset.jsel;
      const k = t.value;
      const keep = state.jokers[i];
      state.jokers[i] = { key: k, edition: keep.edition || 'base', ab: BC.jokerAb(k), opts: keep.opts || {}, disabled: keep.disabled, debuffed: keep.debuffed };
      const fields = (BC.STATE_OPT_FIELDS && BC.STATE_OPT_FIELDS[k]) || [];
      for (const [f] of fields) {
        if (f === 'extra') continue;
        if (state.jokers[i].opts[f] === undefined) state.jokers[i].opts[f] = state[f] !== undefined ? state[f] : 0;
      }
      const sp = BC.SPECIAL_OPTS[k];
      if (sp) for (const [f, dv] of Object.entries(sp)) if (state.jokers[i].opts[f] === undefined) state.jokers[i].opts[f] = dv;
      renderJokers();
    } else if (t.dataset.jed !== undefined) {
      state.jokers[+t.dataset.jed].edition = t.value;
    } else if (t.dataset.ab !== undefined) {
      const [i, path] = t.dataset.ab.split(':');
      setPath(state.jokers[+i].ab, path, +t.value);
    } else if (t.dataset.sopt !== undefined) {
      const [i, f] = t.dataset.sopt.split(':');
      const j = state.jokers[+i];
      if (!j.opts) j.opts = {};
      j.opts[f] = +t.value || 0;
    } else if (t.dataset.soptSel !== undefined) {
      const [i, f] = t.dataset.soptSel.split(':');
      const j = state.jokers[+i];
      if (!j.opts) j.opts = {};
      j.opts[f] = f === 'rank' ? +t.value : t.value;
    } else if (t.dataset.ph !== undefined) {
      const [i, f] = t.dataset.ph.split(':');
      const ph = state.jokers[+i];
      if (ph && ph.key === '__placeholder') ph.opts[f] = +t.value;
    }
  });
  function setPath(obj, path, v) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) {
      if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {};
      o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = v;
  }

  // 全局输入
  $('g-decktype').onchange = () => { state.deckType = $('g-decktype').value; };
  $('g-boss').onchange = () => { state.boss = $('g-boss').value; syncBossExtra(); };
  $('g-eye-hands').addEventListener('change', () => {
    state.eyeUsed = [...$('g-eye-hands').querySelectorAll('input[data-eyehand]:checked')].map((cb) => cb.dataset.eyehand);
  });
  $('g-mouth-hand').onchange = () => { state.mouthHand = $('g-mouth-hand').value; };
  $('g-levels').addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.level) state.levels[t.dataset.level] = Math.max(1, +t.value || 1);
    if (t.dataset.planetCount) {
      if (!state.planetCounts) state.planetCounts = {};
      state.planetCounts[t.dataset.planetCount] = Math.max(0, +t.value || 0);
    }
    if (t.dataset.handplayed) {
      if (!state.handPlayed) state.handPlayed = {};
      state.handPlayed[t.dataset.handplayed] = Math.max(0, +t.value || 0);
    }
    if (t.dataset.handplayedRound) {
      if (!state.handPlayedRound) state.handPlayedRound = {};
      state.handPlayedRound[t.dataset.handplayedRound] = Math.max(0, +t.value || 0);
    }
  });

  // ---------------- 收集输入 ----------------
  function fix(c) {
    return {
      uid: c.uid, rank: c.rank, suit: c.suit, enh: c.enh, edition: c.edition, seal: c.seal,
      userDebuff: !!c.debuffed
    };
  }
  function collect(extraLevels) {
    const inp = {
      played: state.played.map(fix),
      hand: state.hand.map(fix),
      jokers: state.jokers.map((j) => ({
        key: j.key, edition: j.edition || 'base',
        ab: j.ab ? JSON.parse(JSON.stringify(j.ab)) : undefined,
        opts: j.opts ? JSON.parse(JSON.stringify(j.opts)) : undefined,
        disabled: !!j.disabled, debuffed: !!j.debuffed
      })),
      levels: Object.assign({}, state.levels),
      handPlayed: Object.assign({}, state.handPlayed),
      handPlayedRound: Object.assign({}, state.handPlayedRound),
      money: state.money, handsLeft: state.handsLeft, discardsLeft: state.discardsLeft,
      deckRemaining: state.deckRemaining,
      erosionMissing: state.erosionMissing || 0, steelCount: state.steelCount || 0,
      stoneCount: state.stoneCount || 0, enhancedCount: state.enhancedCount || 0,
      tarotUsed: state.tarotUsed || 0, jokerSlots: state.jokerSlots,
      deckType: state.deckType, boss: state.boss, bossOff: state.bossOff,
      observatory: state.observatory,
      planetCounts: Object.assign({}, state.planetCounts || {}),
      planets: [],
      eyeUsed: (state.eyeUsed || []).slice(), mouthHand: state.mouthHand || '', leafCleared: state.bossOff
    };
    if (extraLevels) Object.assign(inp.levels, extraLevels);
    return inp;
  }

  // ---------------- 主操作 ----------------
  function renderResult(sc) {
    const r = sc.main;
    let html = '';
    if (r.invalid) {
      html = `<div class="err">❌ ${r.invalid}</div>`;
    } else {
      html += `<div class="score">${fmtSci(sc.main.score)}</div>`;
      const zhHand = (BC.NAMES && BC.NAMES.poker_hands[r.handType]) || r.disp;
      html += `<div style="color:var(--dim)">${zhHand} · Lv.${BC.fmtSci(r.level)} · 筹码 <b style="color:var(--blue)">${fmtSci(r.chips)}</b> × 倍率 <b style="color:var(--accent)">${fmtSci(r.mult)}</b></div>`;
      if (sc.hasRng) {
        html += `<div class="rng">随机区间：${fmtSci(sc.min)} ～ ${fmtSci(sc.max)}</div>`;
      } else {
        html += `<div style="color:var(--green);font-size:12px">无随机因素</div>`;
      }
      const lines = BC.formatResult(sc);
      html += `<div style="margin-top:8px;border-top:1px dashed var(--line);padding-top:6px">${escapeHtml(lines.join('\n'))}</div>`;
    }
    $('result').innerHTML = html;
  }
  function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  $('btn-calc').onclick = () => {
    try {
      const inp = collect();
      const sc = BC.score(inp);
      renderResult(sc);
      if (!sc.main.invalid) {
        $('panel-analysis').style.display = '';
        renderRemovalEq(inp);
        // 候选参数表单仅在 cand-key 变化时重建，避免清掉用户已填的值
      }
      lastOpt = null;
      $('panel-opt').style.display = 'none';
    } catch (err) {
      $('result').innerHTML = `<div class="err">错误：${escapeHtml(String(err && err.stack || err))}</div>`;
      console.error(err);
    }
  };

  // ---------------- 最优排序（含等价分组 + 第二解） ----------------
  function jokerLabelSeq(jokers, groups) {
    const zh = jokers.map((j) => (BC.JMETA[j.key] || {}).zh || j.key);
    if (!groups) return zh.map((z) => z).join('-');
    return zh.map((z, i) => `${z}(${groups[i]})`).join('-');
  }

  // 检查某手牌是否被眼/嘴 Boss 禁用（禁用时引擎判 invalid、计 0 分），返回提示语或空
  function bossDisableWarn(inp, played, hand) {
    if (!inp || (inp.boss !== 'eye' && inp.boss !== 'mouth') || inp.bossOff) return '';
    if (!played || !played.length) return ''; // 空手由调用方的通用说明兜底，避免误报
    try {
      const chk = BC.evaluate(Object.assign({}, inp, { played: played, hand: hand || [] }), 'expected');
      if (chk.invalid) return '⚠ 这手牌会被 Boss 禁用、实际计 0 分：' + chk.invalid;
    } catch (e) {}
    return '';
  }

  function renderOpt(opt) {
    $('panel-opt').style.display = '';
    const seq = jokerLabelSeq(opt.jokers, opt.groups);
    const cardLine = (arr) => arr.map((c) => RANK_LABEL[c.rank] + BC.SUIT_SYM[c.suit]).join(' ') || '（空）';
    let html = `
      <div>原始分：<b>${fmtSci(opt.baseScore || 0)}</b></div>
      <div>最优分：<b style="color:var(--gold)">${fmtSci(opt.score)}</b>${opt.improved ? ' <span style="color:var(--green)">↑已提升</span>' : ' <span style="color:var(--dim)">(已是最优)</span>'}</div>
      <div style="color:var(--dim);font-size:12px;margin-top:4px">方式：${opt.note || ''}　评估 ${opt.evals || 0} 次${opt.elapsed ? ` · ${opt.elapsed}ms` : ''}</div>`;
    if (opt.warn) html += `<div style="color:var(--red);font-size:12px;margin-top:2px">${escapeHtml(opt.warn)}</div>`;
    html += `
      <div style="margin-top:6px">小丑顺序：${seq}</div>
      <div>打出顺序（${opt.played.length}张）：${cardLine(opt.played)}</div>
      <div>手牌顺序（${opt.hand.length}张）：${cardLine(opt.hand)}</div>`;
    if (opt.second && opt.second.jokers) {
      const seq2 = jokerLabelSeq(opt.second.jokers, null);
      html += `<div style="margin-top:6px;color:var(--green)">第二解（同分）：${seq2}　打出 ${cardLine(opt.second.played)}</div>`;
    }
    $('opt-result').innerHTML = html;
  }

  $('btn-opt').onclick = () => {
    try {
      const inp = collect();
      const opt = BC.optimizeOrder(inp, 'full');
      opt.warn = bossDisableWarn(inp, opt.played, opt.hand);
      lastOpt = opt;
      renderOpt(opt);
    } catch (err) {
      $('result').innerHTML = `<div class="err">排序错误：${escapeHtml(String(err && err.stack || err))}</div>`;
      console.error(err);
    }
  };
  $('btn-full').onclick = () => {
    try {
      const btn = $('btn-full');
      btn.disabled = true; btn.textContent = '搜索中…';
      setTimeout(() => {
        try {
          const inp = collect();
          const base = BC.evaluate(inp, 'expected').score;
          const full = BC.optimizeFull(inp, { budget: 4000, maxN: 5, timeLimit: 4000 });
          if (full.invalid) { $('result').innerHTML = `<div class="err">全量搜索：${escapeHtml(full.invalid)}</div>`; return; }
          let warn = bossDisableWarn(inp, full.played, full.hand);
          // 所有可出组合都被 Boss 禁用 → 最优分为 0，补一句说明避免用户困惑
          if (!warn && full.score === 0 && (inp.boss === 'eye' || inp.boss === 'mouth') && !inp.bossOff) {
            warn = '⚠ 当前 Boss（眼/嘴）禁用了相关牌型，可能没有可正常计分的牌型，最优分为 0';
          }
          lastOpt = {
            jokers: full.jokers, played: full.played, hand: full.hand,
            score: full.score, baseScore: base,
            improved: full.score > base,
            note: `全量出牌搜索(n=${full.n}, 评估${full.evals}次)`,
            groups: full.groups, second: full.second, evals: full.evals, elapsed: full.elapsed,
            warn: warn
          };
          renderOpt(lastOpt);
        } catch (err) {
          $('result').innerHTML = `<div class="err">全量搜索错误：${escapeHtml(String(err && err.stack || err))}</div>`;
          console.error(err);
        } finally {
          btn.disabled = false; btn.textContent = '全量出牌搜索';
        }
      }, 30);
    } catch (err) {
      $('result').innerHTML = `<div class="err">全量搜索错误：${escapeHtml(String(err && err.stack || err))}</div>`;
      console.error(err);
    }
  };
  $('btn-apply-opt').onclick = () => {
    if (!lastOpt) return;
    state.jokers = lastOpt.jokers;
    state.played = lastOpt.played;
    state.hand = lastOpt.hand;
    renderAll();
    $('btn-calc').click();
  };

  // ---------------- 分析面板 ----------------
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      $('tab-replace').style.display = b.dataset.tab === 'replace' ? '' : 'none';
      $('tab-equiv').style.display = b.dataset.tab === 'equiv' ? '' : 'none';
    };
  });

  // 等效乘率（新定义：删除该张后分数除以多少）
  function renderRemovalEq(inp) {
    try {
      const rem = BC.removalEquivalent(inp);
      let html = `<div style="margin-bottom:6px;color:var(--dim)">基准分：${fmtSci(rem.base)}　·　等效乘率 = 基准分 ÷ 拿掉该小丑后的分数</div>`;
      html += `<table class="an"><tr><th>小丑</th><th>拿掉后分数</th><th>等效乘率</th></tr>`;
      for (const row of rem.rows) {
        html += `<tr><td>${row.zh}（槽${row.index + 1}）</td><td>${fmtSci(row.scoreWithout)}</td><td class="pos">×${BC.fmtRatio(row.ratio)}</td></tr>`;
      }
      html += '</table>';
      $('tab-equiv').innerHTML = html;
    } catch (err) {
      $('tab-equiv').innerHTML = `<div class="err">${escapeHtml(String(err))}</div>`;
    }
  }

  // 最低正向替换：候选追平当前最弱小丑所需的筹码/+倍率/×倍率
  function renderMinReplace(inp, candKey, opts, ed) {
    const box = $('min-replace');
    if (!box) return;
    try {
      const m = BC.minPositiveReplace(inp, candKey, opts, ed);
      if (!m) { box.innerHTML = ''; return; }
      const fr = BC.fmtRatio;
      const need = (v, fmtv) => (isFinite(v) ? fmtv(v) : '—');
      let html = `<div style="color:var(--dim);margin:6px 0 4px">最低正向替换：候选需达到当前最弱小丑 <b style="color:var(--gold)">${escapeHtml(m.weakZh)}</b>（等效乘率 ×${fr(m.weakRatio)}）</div>`;
      if (m.achieved) {
        html += `<div class="pos">候选已达目标（替换得分 ${fmtSci(m.candScore)} ≥ 基准 ${fmtSci(m.base)}），无需加成。</div>`;
      } else {
        html += `<div>还差 ×${fr(m.k)}，任加其一即可追平：
          <b class="pos">筹码 +${need(m.chipsNeed, fmtSci)}</b> ｜
          <b class="pos">倍率 +${need(m.multNeed, fmtSci)}</b> ｜
          <b class="pos">倍率 ×${need(m.xmultNeed, fr)}</b></div>
          <div style="color:var(--dim);font-size:12px">按该摆法 筹码 ${fmtSci(m.C)} × 倍率 ${fmtSci(m.M)} 计算${m.plasma ? '（等离子牌组已折算）' : ''}。</div>`;
      }
      box.innerHTML = html;
    } catch (err) {
      box.innerHTML = `<div class="err">${escapeHtml(String(err && err.message || err))}</div>`;
    }
  }

  // 替换计算：选候选+版本+参数 → 逐个替换现有小丑（负片跳过），各取最优摆法
  $('btn-replace').onclick = () => {
    try {
      const btn = $('btn-replace');
      btn.disabled = true; btn.textContent = '计算中…';
      setTimeout(() => {
        try {
          const inp = collect();
          const k = $('cand-key').value;
          if (!k) { $('replace-out').innerHTML = '<div class="err">请先选择候选小丑</div>'; return; }
          const ed = $('cand-edition').value || 'base';
          const opts = Object.assign({}, candOpts);
          const ra = BC.replaceWith(inp, k, opts, ed, true);
          let html = `<div style="margin-bottom:8px;color:var(--dim)">基准：<b style="color:var(--gold)">${fmtSci(ra.base)}</b>　候选：<b>${ra.candZh}</b>·${ED_LABEL[ed] || ed}　（负片槽跳过）</div>`;
          let rank = 0;
          for (const row of ra.rows) {
            if (row.skipped) {
              html += `<div style="margin:8px 0;padding:6px;border:1px dashed var(--line);border-radius:6px;color:var(--dim)">
                （跳过）${row.replaced.zh} 为负片，不参与替换</div>`;
              continue;
            }
            rank++;
            const up = row.improved;
            const cls = up ? 'pos' : 'neg';
            const tag = up ? '提升' : (row.score < ra.base - 1e-6 ? '下降' : '持平');
            html += `<div style="margin:8px 0;padding:6px;border:1px solid var(--line);border-radius:6px">
              <div><b>${rank}. 替换${row.replaced.zh}</b> <span class="${cls}">${tag}</span></div>
              <div>最大分数：<b class="${cls}" style="font-size:15px">${fmtSci(row.score)}</b>
                等效乘率：<span class="${cls}">×${BC.fmtRatio(row.ratio)}</span></div>
              <div style="color:var(--dim);font-size:12px">最优摆法：${jokerLabelSeq(row.jokers, row.groups)}</div>
              <div style="color:var(--dim);font-size:12px">打出：${row.played.map((c) => RANK_LABEL[c.rank] + BC.SUIT_SYM[c.suit]).join(' ')}${row.note ? '　·' + row.note : ''}</div>`;
            if (row.second && row.second.jokers) {
              html += `<div style="color:var(--green);font-size:12px">第二解：${jokerLabelSeq(row.second.jokers, null)}</div>`;
            }
            html += `</div>`;
          }
          html += `<div class="hint">等效乘率 = 该最优摆法分数 ÷ 基准分（&gt;1 才值得换）。</div>`;
          $('replace-out').innerHTML = html;
          renderMinReplace(inp, k, opts, ed);
        } catch (err) {
          $('replace-out').innerHTML = `<div class="err">${escapeHtml(String(err && err.stack || err))}</div>`;
          const mr = $('min-replace');
          if (mr) mr.innerHTML = '';
          console.error(err);
        } finally {
          btn.disabled = false; btn.textContent = '计算';
        }
      }, 30);
    } catch (err) {
      $('replace-out').innerHTML = `<div class="err">${escapeHtml(String(err && err.stack || err))}</div>`;
      console.error(err);
    }
  };

  // ---------------- 预设（快捷栏已删，保留清空入口：双击标题栏） ----------------
  document.querySelector('header h1').title = '双击清空全部输入';
  document.querySelector('header h1').ondblclick = () => {
    if (!confirm('清空全部输入？')) return;
    state = {
      played: [], hand: [], jokers: [], levels: {}, handPlayed: {}, handPlayedRound: {},
      money: 0, handsLeft: 1, discardsLeft: 0, deckRemaining: 30,
      erosionMissing: 0, steelCount: 0, stoneCount: 0, enhancedCount: 0, tarotUsed: 0,
      jokerSlots: 5, deckType: 'normal', boss: 'none', bossOff: false, observatory: false,
      eyeUsed: [], mouthHand: '', planets: []
    };
    renderAll();
    $('result').innerHTML = '<span style="color:var(--dim)">点击「计算分数」…</span>';
  };

  renderAll();
})();
