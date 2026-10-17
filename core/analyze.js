(function (G) {
  const BC = (G.BC = G.BC || {});

  const N = (k) => (BC.JMETA[k] ? BC.JMETA[k].zh : (k === '__placeholder' ? '占位小丑' : k));

  // ------------------------------------------------------------ 排序敏感判定
  function orderSensitive(inp) {
    const js = inp.jokers || [];
    if (js.some((j) => j.key === 'j_blueprint' || j.key === 'j_brainstorm')) return true;
    if (js.some((j) => j.edition === 'poly')) return true;
    for (const j of js) {
      if (['j_hanging_chad', 'j_photograph', 'j_sock_and_buskin', 'j_dusk', 'j_selzer', 'j_hack', 'j_mime'].includes(j.key)) return true;
    }
    const hasAdd = js.some((j) => ['j_smiley', 'j_scary_face', 'j_jolly', 'j_mad', 'j_abstract'].includes(j.key));
    const hasMul = js.some((j) => ['j_photograph', 'j_baron', 'j_steel_joker', 'j_ancient', 'j_idol'].includes(j.key));
    if (hasAdd && hasMul) return true;
    return js.length > 0;
  }

  function permute(n) {
    const out = [];
    const arr = Array.from({ length: n }, (_, i) => i);
    const rec = (k) => {
      if (k === n) { out.push(arr.slice()); return; }
      for (let i = k; i < n; i++) {
        [arr[k], arr[i]] = [arr[i], arr[k]];
        rec(k + 1);
        [arr[k], arr[i]] = [arr[i], arr[k]];
      }
    };
    rec(0);
    return out;
  }
  function fact(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }

  function applyOrders(inp, jOrder, pOrder, hOrder) {
    const o = BC.deepClone(inp);
    if (jOrder) o.jokers = jOrder.map((i) => o.jokers[i]);
    if (pOrder) o.played = pOrder.map((i) => o.played[i]);
    if (hOrder) o.hand = hOrder.map((i) => o.hand[i]);
    return o;
  }

  function evalScore(inp) {
    return BC.evaluate(inp, 'expected').score;
  }

  // ------------------------------------------------------------ 最优排序
  // phase: 'quick'(默认) | 'full'（full 放宽枚举上限：nJ≤6）
  BC.optimizeOrder = function (inp, phase) {
    const nJ = (inp.jokers || []).length;
    const nP = (inp.played || []).length;
    const base = evalScore(inp);

    if (!orderSensitive(inp)) {
      return { jokers: inp.jokers, played: inp.played, hand: inp.hand, score: base, baseScore: base, improved: false, note: '顺序不影响结果', groups: null, second: null };
    }

    let best = BC.deepClone(inp);
    let bestScore = base;
    let improved = false;
    let exhausted = false;

    const jLim = phase === 'full' ? 6 : 5;
    const jFact = fact(Math.min(nJ, jLim)), pFact = fact(Math.min(nP, 5));
    const fullJoint = nJ <= jLim && nP <= 5 && jFact * pFact <= 14400 * (phase === 'full' ? 6 : 1);

    if (fullJoint) {
      const jPerms = nJ ? permute(nJ) : [null];
      const pPerms = nP ? permute(nP) : [null];
      for (const jp of jPerms) {
        for (const pp of pPerms) {
          const cand = applyOrders(inp, jp, pp, null);
          const s = evalScore(cand);
          if (s > bestScore) { bestScore = s; best = cand; improved = true; }
        }
      }
      exhausted = true;
    } else {
      for (let round = 0; round < 6; round++) {
        let roundImproved = false;
        const tryPerms = (which) => {
          const cur = best;
          const n = which === 'j' ? cur.jokers.length : which === 'p' ? cur.played.length : cur.hand.length;
          if (n <= 1) return;
          if (n <= 6) {
            for (const pm of permute(n)) {
              const cand = which === 'j' ? applyOrders(cur, pm, null, null)
                : which === 'p' ? applyOrders(cur, null, pm, null)
                  : applyOrders(cur, null, null, pm);
              const s = evalScore(cand);
              if (s > bestScore) { bestScore = s; best = cand; roundImproved = true; }
            }
          } else {
            for (let i = 0; i < n - 1; i++) {
              const cand = BC.deepClone(best);
              const key = which === 'j' ? 'jokers' : which === 'p' ? 'played' : 'hand';
              [cand[key][i], cand[key][i + 1]] = [cand[key][i + 1], cand[key][i]];
              const s = evalScore(cand);
              if (s > bestScore) { bestScore = s; best = cand; roundImproved = true; }
            }
          }
        };
        tryPerms('j'); tryPerms('p'); tryPerms('h');
        if (!roundImproved) break;
        improved = true;
      }
    }

    if (bestScore > base) improved = true;
    const eq = exhausted && bestScore > 0 ? BC.equivalenceGroups(best, bestScore) : null;
    const second = eq && eq.hasNonSwapEquivalent ? eq.second : null;
    return {
      jokers: best.jokers, played: best.played, hand: best.hand,
      score: bestScore, baseScore: base, improved,
      note: exhausted ? '全联合枚举' : '坐标上升',
      groups: eq ? eq.groups : null,
      second: second || null
    };
  };

  // ------------------------------------------------------------ 等价分组
  // 成对交换保分 → 并查集；A(0)-B(1)-C(1)-D(2)
  // hasNonSwapEquivalent：存在与最优解分数相同但非纯交换得到的第二解
  BC.equivalenceGroups = function (best, bestScore, budget) {
    budget = budget || 400;
    const n = (best.jokers || []).length;
    if (n <= 1) return { groups: n ? [0] : [], hasNonSwapEquivalent: false, second: null };
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

    let evals = 0;
    const tryCand = (cand) => {
      if (evals >= budget) return false;
      evals++;
      const s = evalScore(cand);
      if (Math.abs(s - bestScore) <= 1e-6) return s;
      return false;
    };

    // 相邻交换
    for (let i = 0; i < n - 1 && evals < budget; i++) {
      const cand = BC.deepClone(best);
      [cand.jokers[i], cand.jokers[i + 1]] = [cand.jokers[i + 1], cand.jokers[i]];
      if (tryCand(cand)) union(i, i + 1);
    }
    // 组内非相邻交换（补全同组关系）
    const groupsNow = [];
    const seen = {};
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!seen[r]) { seen[r] = groupsNow.length; groupsNow.push([]); }
      groupsNow[seen[r]].push(i);
    }
    for (const g of groupsNow) {
      for (let a = 0; a < g.length && evals < budget; a++) {
        for (let b = a + 1; b < g.length && evals < budget; b++) {
          const i = g[a], j = g[b];
          if (Math.abs(i - j) === 1) continue;
          const cand = BC.deepClone(best);
          [cand.jokers[i], cand.jokers[j]] = [cand.jokers[j], cand.jokers[i]];
          if (tryCand(cand)) union(i, j);
        }
      }
    }

    const labels = Array.from({ length: n }, (_, i) => find(i));
    const order = [];
    const lab2id = {};
    for (const l of labels) {
      if (!(l in lab2id)) { lab2id[l] = order.length; order.push(l); }
    }
    const groups = labels.map((l) => lab2id[l]);

    // 非交换等价第二解：从不同起点做一次上升，找到同分不同组序列的解
    let second = null;
    if (evals < budget) {
      const rotated = BC.deepClone(best);
      rotated.jokers.push(rotated.jokers.shift());
      const s = tryCand(rotated);
      if (s) {
        const sig = rotated.jokers.map((j) => j.key + (j.edition || '')).join('|');
        const bestSig = best.jokers.map((j) => j.key + (j.edition || '')).join('|');
        if (sig !== bestSig) second = rotated;
      }
    }
    return { groups, hasNonSwapEquivalent: !!second, second };
  };

  // 等效乘率标注：删除该张后分数除以多少 = score_full / score_without
  BC.removalEquivalent = function (inp) {
    const base = evalScore(inp);
    const rows = [];
    const n = (inp.jokers || []).length;
    for (let i = 0; i < n; i++) {
      const test = BC.deepClone(inp);
      test.jokers.splice(i, 1);
      const s = evalScore(test);
      rows.push({
        index: i,
        key: inp.jokers[i].key,
        zh: N(inp.jokers[i].key),
        scoreWithout: s,
        ratio: s > 0 ? base / s : Infinity,
        label: `${N(inp.jokers[i].key)} ×${fmtRatio(base / s)}`
      });
    }
    rows.sort((a, b) => b.ratio - a.ratio);
    return { base, rows };
  };

  function fmtRatio(r) {
    if (!isFinite(r)) return '∞';
    if (r >= 1e6) return r.toExponential(2).replace('e+', 'e');
    return String(Math.round(r * 1000) / 1000);
  }
  BC.fmtRatio = fmtRatio;

  // ------------------------------------------------------------ 全量出牌搜索
  // 从 hand∪played 池选 1~5 张（多重集签名去重）× 顺序 × 小丑顺序 → 最高分
  BC.optimizeFull = function (inp, opts) {
    opts = opts || {};
    const budget = opts.budget || 8000;
    const maxN = opts.maxN || 5;
    const pool = [].concat(inp.played || [], inp.hand || []);
    if (!pool.length) return { score: 0, invalid: '无可用牌' };

    // 签名去重：相同 rank/suit/enh/edition/seal 的牌只算一次选卡（但保留副本张数）
    const sig = (c) => [c.rank, c.suit, c.enh, c.edition, c.seal, (c.debuffed || c.userDebuff) ? 1 : 0, c.perma || 0].join(',');
    const counts = {};
    for (const c of pool) counts[sig(c)] = (counts[sig(c)] || 0) + 1;
    const distinct = Object.keys(counts);

    const baseOrder = BC.optimizeOrder(inp, 'full');
    // 时间预算从选牌阶段起算（不含上面的小丑序优化）
    const t0 = Date.now();
    let best = { score: baseOrder.score, played: inp.played, hand: inp.hand, jokers: baseOrder.jokers, n: (inp.played || []).length, evals: 0 };
    const evals = [0];
    const evalCand = (cand) => {
      evals[0]++;
      return evalScore(cand);
    };

    // 阶段1：枚举组合（多重集，1..maxN 张），签名去重
    const comboCache = [];
    for (let n = 1; n <= maxN; n++) {
      const before = comboCache.length;
      const used = {};
      recPick(n, distinct, counts, pool, used, comboCache, maxN);
      if (comboCache.length - before > 600) break;
      if (Date.now() - t0 > (opts.timeLimit || 2500) * 0.5) break;
    }

    function recPick(n, dkeys, cnt, pl, usedSet, out, maxN) {
      // 按签名计数选卡，但实例取自池中未用过的对象
      const cur = [];
      const usedIdx = new Set();
      const walk = (start) => {
        if (Date.now() - t0 > (opts.timeLimit || 2500)) return;
        if (cur.length === n) {
          const key = cur.map(sig).sort().join(';');
          if (!usedSet[key]) { usedSet[key] = 1; out.push(cur.slice()); }
          return;
        }
        for (let i = start; i < dkeys.length; i++) {
          const s = dkeys[i];
          const have = cur.filter((x) => sig(x) === s).length;
          if (have >= cnt[s]) continue;
          let ci = -1;
          for (let p = 0; p < pl.length; p++) {
            if (usedIdx.has(p)) continue;
            if (sig(pl[p]) === s) { ci = p; break; }
          }
          if (ci < 0) continue;
          usedIdx.add(ci);
          cur.push(pl[ci]);
          walk(i);
          cur.pop();
          usedIdx.delete(ci);
        }
      };
      walk(0);
    }

    // 阶段2：对每个组合：打出顺序用全排列（n≤4→24）或采样序；手牌=池剩余；小丑用 full 优化序
    for (const combo of comboCache) {
      if (Date.now() - t0 > (opts.timeLimit || 2500)) break;
      if (evals[0] > budget) break;
      const playedCand = combo.slice();
      const rest = [];
      const taken = new Set(combo);
      for (const c of pool) {
        if (taken.has(c)) { taken.delete(c); continue; }
        rest.push(c);
      }
      const handCand = rest;

      const nP = playedCand.length;
      const orders = nP <= 4 ? permute(nP) : sampleOrders(nP, 24);
      for (const ord of orders) {
        const cand = BC.deepClone(inp);
        cand.played = ord.map((i) => playedCand[i]);
        cand.hand = handCand;
        if (baseOrder.jokers) cand.jokers = baseOrder.jokers;
        const s = evalCand(cand);
        if (s > best.score) {
          best = { score: s, played: cand.played, hand: cand.hand, jokers: cand.jokers, n: nP, evals: evals[0] };
        }
      }
    }

    // 阶段3：对 top 结果做小丑顺序 full 优化
    if (best.score > 0) {
      const topInp = BC.deepClone(inp);
      topInp.played = best.played;
      topInp.hand = best.hand;
      topInp.jokers = best.jokers;
      const jo = BC.optimizeOrder(topInp, 'full');
      if (jo.score > best.score) {
        best = { score: jo.score, played: best.played, hand: best.hand, jokers: jo.jokers, n: best.n, evals: evals[0], groups: jo.groups, second: jo.second };
      } else {
        best.groups = jo.groups;
        best.second = jo.second;
      }
    }

    best.evals = evals[0];
    best.elapsed = Date.now() - t0;
    return best;
  };

  function sampleOrders(n, take) {
    const all = permute(n);
    if (all.length <= take) return all;
    const out = [all[0], all[all.length - 1]];
    const step = Math.floor(all.length / take);
    for (let i = 1; out.length < take && i < all.length; i += step) out.push(all[i]);
    return out;
  }

  // 拼音首字母排序（多音字修正：奇数→ji、重影→chong 等按首字实际读音）
  const PY1 = {
    '一': 'y', '三': 's', '上': 's', '乌': 'w', '二': 'e', '交': 'j', '仪': 'y', '侠': 'x', '侵': 'q', '信': 'x',
    '偶': 'o', '全': 'q', '八': 'b', '六': 'l', '冲': 'c', '卡': 'k', '半': 'b', '占': 'z', '卫': 'w', '印': 'y',
    '叠': 'd', '古': 'g', '名': 'm', '吸': 'x', '哑': 'y', '喜': 'x', '四': 's', '回': 'h', '城': 'c', '备': 'b',
    '大': 'd', '天': 't', '太': 't', '头': 't', '奇': 'j', '奸': 'j', '学': 'x', '对': 'd', '射': 's', '小': 'x',
    '希': 'x', '帕': 'p', '幻': 'h', '延': 'y', '开': 'k', '待': 'd', '徒': 't', '微': 'w', '快': 'k', '恐': 'k',
    '愤': 'f', '抽': 'c', '拉': 'l', '招': 'z', '捷': 'j', '提': 't', '搭': 'd', '摔': 's', '斐': 'f', '斗': 'd',
    '方': 'f', '旗': 'q', '无': 'w', '星': 'x', '暴': 'b', '未': 'w', '杂': 'z', '棒': 'b', '模': 'm', '流': 'l',
    '混': 'h', '游': 'y', '滑': 'h', '火': 'h', '烂': 'l', '烧': 's', '照': 'z', '爆': 'b', '特': 't', '狂': 'k',
    '狡': 'j', '玻': 'b', '璞': 'p', '男': 'n', '疯': 'f', '石': 's', '礼': 'l', '神': 's', '私': 's', '秩': 'z',
    '积': 'j', '窃': 'q', '第': 'd', '箭': 'j', '篝': 'g', '精': 'j', '红': 'h', '约': 'y', '绿': 'l', '缟': 'g',
    '老': 'l', '聪': 'c', '致': 'z', '色': 's', '花': 'h', '苏': 's', '蓝': 'l', '血': 'x', '冰': 'b', '证': 'z',
    '贪': 't', '超': 'c', '跑': 'p', '迈': 'm', '通': 't', '邮': 'y', '部': 'b', '醉': 'z', '重': 'c', '钢': 'g',
    '闪': 's', '阴': 'y', '隐': 'y', '零': 'l', '飞': 'f', '马': 'm', '驾': 'j', '骷': 'k', '鸡': 'j', '黄': 'h',
    '黑': 'h', '9': '9'
  };
  BC.py1 = function (s) {
    s = String(s || '');
    const c = s[0];
    if (/[A-Za-z]/.test(c)) return c.toLowerCase();
    if (/[0-9]/.test(c)) return c;
    return PY1[c] || '~';
  };
  BC.zhCompare = function (a, b) {
    const ka = BC.py1(a), kb = BC.py1(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return String(a).localeCompare(String(b), 'zh');
  };

  // ------------------------------------------------------------ 小丑替换候选（UI 添加下拉用，含非计分）
  BC.candidates = function (opts) {
    const includeNs = !opts || opts.ns !== false;
    const out = [];
    for (const k of Object.keys(BC.JMETA)) {
      if (includeNs || !BC.JMETA[k].ns) out.push(k);
    }
    out.push('__placeholder');
    return out.sort((a, b) => BC.zhCompare(N(a), N(b)));
  };

  // 状态类字段（移入小丑行 opts 的）：[字段名, 中文标签]
  BC.STATE_OPT_FIELDS = {
    j_bull: [['money', '金币']],
    j_bootstraps: [['money', '金币']],
    j_blue_joker: [['deckRemaining', '牌堆剩余']],
    j_erosion: [['erosionMissing', '腐蚀缺失']],
    j_stone: [['stoneCount', '石头牌数']],
    j_steel_joker: [['steelCount', '钢铁牌数']],
    j_drivers_license: [['enhancedCount', '强化牌数']],
    j_fortune_teller: [['tarotUsed', '塔罗数']],
    j_idol: null,
    j_ancient: null,
    j_acrobat: [['handsLeft', '剩手牌']],
    j_dusk: [['handsLeft', '剩手牌']],
    j_banner: [['discardsLeft', '剩弃牌']],
    j_mystic_summit: [['discardsLeft', '剩弃牌']],
    j_stencil: [['jokerSlots', '小丑槽位']]
  };

  // 等级/目标 opts 编辑（idol rank/suit、ancient suit、loyalty）
  BC.SPECIAL_OPTS = {
    j_idol: { rank: 13, suit: 'S' },
    j_ancient: { suit: 'H' },
    j_loyalty_card: { loyalty: 5 }
  };

  // ab 字段显示规则（小丑行/候选参数共用）：白名单优先，其次排除固定项，只放成长/数值项
  const AB_GROW = /(mult|chips|x_mult|xmult)/i;
  const AB_FIXED = /^(odds|every|size|cost|Xmult|w)$/;
  BC.abShow = function (key, path) {
    const ui = BC.AB_UI || {};
    if (Object.prototype.hasOwnProperty.call(ui, key)) return ui[key].indexOf(path) >= 0;
    const leaf = path.split('.').pop();
    if (AB_FIXED.test(leaf)) return false;
    return AB_GROW.test(path);
  };
  // 候选/小丑可编辑的 ab 字段：[{path, value}]（如 星座 → [{path:'x_mult', value:1}]）
  BC.candAbFields = function (key) {
    const d = BC.DEFS && BC.DEFS[key];
    const out = [];
    if (!d || !d.ab || typeof d.ab !== 'object') return out;
    const walk = (obj, prefix) => {
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        const path = prefix ? prefix + '.' + k : k;
        if (typeof v === 'number') {
          if (BC.abShow(key, path)) out.push({ path, value: v });
        } else if (v && typeof v === 'object') walk(v, path);
      }
    };
    walk(d.ab, '');
    return out;
  };

  function setDeep(obj, path, v) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) {
      if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {};
      o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = v;
  }

  // 新替换计算：对每个现有小丑槽位，换成候选后取最优摆法
  // skipNegative: 负片小丑不参与替换；onlyIndex 只算指定槽位（最低正向替换用）
  BC.replaceWith = function (inp, candKey, candOpts, candEdition, skipNegative, onlyIndex) {
    if (skipNegative === undefined) skipNegative = true;
    const base = evalScore(inp);
    const rows = [];
    const n = (inp.jokers || []).length;
    for (let i = 0; i < n; i++) {
      if (onlyIndex !== undefined && onlyIndex !== null && i !== onlyIndex) continue;
      const cur = inp.jokers[i];
      if (skipNegative && cur.edition === 'negative') {
        rows.push({
          index: i, skipped: true,
          replaced: { key: cur.key, zh: N(cur.key) },
          candidate: { key: candKey, zh: N(candKey) },
          score: base, ratio: 1, improved: false,
          played: inp.played, hand: inp.hand, jokers: inp.jokers,
          groups: null, second: null
        });
        continue;
      }
      const test = BC.deepClone(inp);
      const nj = BC.makeJoker(candKey, candEdition || 'base');
      nj.disabled = cur.disabled;
      nj.debuffed = cur.debuffed;
      // 被替换者若是同 key，保留其参数；否则用用户给的候选参数
      if (candKey === cur.key) {
        nj.ab = BC.deepClone(cur.ab || {});
        nj.opts = BC.deepClone(cur.opts || {});
      } else if (candOpts) {
        // 成长字段（ab 路径，如星座 x_mult）写入 ab，其余（状态/特殊 opts）写入 opts
        const abPaths = (BC.candAbFields ? BC.candAbFields(candKey) : []).map((f) => f.path);
        const opts = {};
        if (!nj.ab || typeof nj.ab !== 'object') nj.ab = BC.jokerAb(candKey);
        for (const kk of Object.keys(candOpts)) {
          if (abPaths.indexOf(kk) >= 0) {
            if (nj.ab && typeof nj.ab === 'object') setDeep(nj.ab, kk, candOpts[kk]);
          } else {
            opts[kk] = candOpts[kk];
          }
        }
        nj.opts = opts;
      }
      test.jokers[i] = nj;
      const opt = BC.optimizeOrder(test, 'full');
      rows.push({
        index: i, skipped: false,
        replaced: { key: cur.key, zh: N(cur.key) },
        candidate: { key: candKey, zh: N(candKey) },
        score: opt.score,
        ratio: base > 0 ? opt.score / base : 1,
        improved: opt.score > base + 1e-6,
        played: opt.played,
        hand: opt.hand,
        jokers: opt.jokers,
        groups: opt.groups,
        second: opt.second,
        note: opt.note
      });
    }
    // 跳过的排最后，其余按分数降序
    rows.sort((a, b) => {
      if (a.skipped !== b.skipped) return a.skipped ? 1 : -1;
      return b.score - a.score;
    });
    return { base, rows, candZh: N(candKey) };
  };

  // 最低正向替换：候选需达到当前牌组里等效乘率最低（最弱）那张小丑的等效乘率
  // 返回：最弱者信息 + 还差倍数 k + 需补 筹码/倍率/×倍率（k≤1 表示候选已达标）
  BC.minPositiveReplace = function (inp, candKey, candOpts, candEdition) {
    const rem = BC.removalEquivalent(inp);
    const base = rem.base;
    if (!rem.rows.length || !(base > 0)) return null;
    let weak = rem.rows[0];
    for (const r of rem.rows) if (r.ratio < weak.ratio) weak = r;
    const ra = BC.replaceWith(inp, candKey, candOpts, candEdition || 'base', false, weak.index);
    const row = ra.rows[0];
    if (!row || row.skipped || !(row.score > 0)) return null;
    const k = base / row.score;
    const test = BC.deepClone(inp);
    test.jokers = row.jokers;
    test.played = row.played;
    test.hand = row.hand;
    const d = BC.evaluate(test, 'expected');
    // plasma：evaluate 返回平分后的 C/M，xmultNeed 需用平分前的原始值
    const C = d.rawChips !== undefined ? d.rawChips : (d.chips || 0);
    const M = d.rawMult !== undefined ? d.rawMult : (d.mult || 0);
    const plasma = inp.deckType === 'plasma';
    let chipsNeed = 0, multNeed = 0, xmultNeed = 1;
    if (k > 1) {
      if (plasma) {
        // 等离子：结算前筹码/倍率取平均，得分 = ((C+M)/2)^2
        const s = Math.sqrt(k), tot = C + M;
        chipsNeed = tot * (s - 1);
        multNeed = tot * (s - 1);
        xmultNeed = M > 0 ? (s * tot - C) / M : Infinity;
      } else {
        chipsNeed = C * (k - 1);
        multNeed = M * (k - 1);
        xmultNeed = k;
      }
    }
    return {
      weakZh: weak.zh, weakRatio: weak.ratio, weakIndex: weak.index,
      base, candScore: row.score, k, C, M, plasma,
      achieved: k <= 1 + 1e-9,
      chipsNeed, multNeed, xmultNeed
    };
  };

  // 旧全量替换分析（保留给测试）
  BC.replaceAnalysis = function (inp, topN) {
    topN = topN || 6;
    const base = evalScore(inp);
    const cands = BC.candidates();
    const slots = [];
    for (let i = 0; i < (inp.jokers || []).length; i++) {
      const cur = inp.jokers[i];
      const rows = [];
      for (const k of cands) {
        const test = BC.deepClone(inp);
        const nj = BC.makeJoker(k, cur.edition);
        nj.disabled = cur.disabled;
        nj.debuffed = cur.debuffed;
        if (k === cur.key) { nj.ab = BC.deepClone(cur.ab || {}); nj.opts = BC.deepClone(cur.opts || {}); }
        test.jokers[i] = nj;
        const s = evalScore(test);
        rows.push({ key: k, zh: N(k), score: s, delta: s - base, isCurrent: k === cur.key });
      }
      rows.sort((a, b) => b.delta - a.delta);
      slots.push({
        index: i,
        current: { key: cur.key, zh: N(cur.key) },
        top: rows.slice(0, topN),
        worst: rows.slice(-2).reverse()
      });
    }
    return { base, slots };
  };

  // ------------------------------------------------------------ 等效倍率列举（旧 tab 保留）
  BC.equivalent = function (inp, target) {
    const r = BC.evaluate(inp, 'expected');
    if (r.invalid) return { invalid: r.invalid };
    const t = target > 0 ? target : r.score;
    const chips = r.chips, mult = r.mult;
    const rows = [];
    const chipSteps = [...new Set([chips, 100, 500, 1000, 5000, 10000, 100000, 1000000, 10000000])]
      .filter((c) => c > 0).sort((a, b) => a - b);
    for (const c of chipSteps) {
      rows.push({ chips: c, needMult: t / c });
    }
    return {
      target: t,
      currentChips: chips,
      currentMult: mult,
      currentScore: r.score,
      needX: mult > 0 ? t / (chips * mult) : Infinity,
      rows
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
