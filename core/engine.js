(function (G) {
  const BC = (G.BC = G.BC || {});

  function zx(p) { return p >= 1 ? 1 : p; }
  const fmt = (n) => (Number.isInteger(n) ? String(n) : Number(n.toFixed(4)).toString());

  // ------------------------------------------------------------ 状态规整
  BC.normalize = function (inp) {
    const S = BC.deepClone(inp);
    S.played = S.played || [];
    S.hand = S.hand || [];
    S.jokers = S.jokers || [];
    S.levels = S.levels || {};
    S.handPlayed = S.handPlayed || {};
    S.handPlayedRound = S.handPlayedRound || {};
    S.money = S.money || 0;
    S.handsLeft = S.handsLeft === undefined ? 1 : S.handsLeft;
    S.discardsLeft = S.discardsLeft === undefined ? 0 : S.discardsLeft;
    S.deckRemaining = S.deckRemaining || 0;
    S.erosionMissing = S.erosionMissing || 0;
    S.steelCount = S.steelCount || 0;
    S.stoneCount = S.stoneCount || 0;
    S.enhancedCount = S.enhancedCount || 0;
    S.tarotUsed = S.tarotUsed || 0;
    S.jokerSlots = S.jokerSlots || Math.max(5, S.jokers.length);
    S.deckType = S.deckType || 'normal';
    S.boss = S.boss || 'none';
    S.bossOff = !!S.bossOff;
    S.leafCleared = !!S.leafCleared;
    S.eyeUsed = S.eyeUsed || [];
    S.mouthHand = S.mouthHand || '';
    S.observatory = !!S.observatory;
    S.planets = S.planets || [];
    S.planetCounts = S.planetCounts || {};
    for (const j of S.jokers) {
      if (!j.opts) j.opts = {};
      if (!j.ab) j.ab = BC.jokerAb(j.key);
      j.disabled = !!j.disabled;
      j.debuffed = !!j.debuffed;
      j.edition = j.edition || 'base';
      if (j.key === '__placeholder' && !j.opts.cost) j.opts.cost = 0;
    }
    const fixCard = (c) => {
      if (!c.uid) c.uid = (BC._uid = (BC._uid || 0) + 1);
      c.suit = BC.suitShort(c.suit) || 'S';
      c.rank = Math.min(14, Math.max(2, c.rank | 0));
      c.enh = c.enh || 'none';
      c.edition = c.edition || 'base';
      c.seal = c.seal || 'none';
      c.perma = c.perma || 0;
      c.userDebuff = !!c.userDebuff;
      return c;
    };
    S.played = S.played.map(fixCard);
    S.hand = S.hand.map(fixCard);
    return S;
  };

  // ------------------------------------------------------------ Boss 减益
  function computeDebuffs(S) {
    for (const c of S.played) c.debuff = !!c.userDebuff;
    for (const c of S.hand) c.debuff = !!c.userDebuff;
    if (S.bossOff) return;
    const hit = (c) => {
      switch (S.boss) {
        case 'leaf': return !S.leafCleared;
        case 'club': return BC.isSuit(S, c, 'Clubs', { bypass: true });
        case 'goad': return BC.isSuit(S, c, 'Spades', { bypass: true });
        case 'head': return BC.isSuit(S, c, 'Hearts', { bypass: true });
        case 'window': return BC.isSuit(S, c, 'Diamonds', { bypass: true });
        case 'plant': return BC.isFaceC(S, c, true);
        default: return false;
      }
    };
    for (const c of S.played) if (hit(c)) c.debuff = true;
    for (const c of S.hand) if (hit(c)) c.debuff = true;
  }

  // ------------------------------------------------------------ 被动旗标
  function buildFlags(S) {
    const on = (key) => S.jokers.some((j) => j.key === key && !j.disabled && !j.debuffed);
    S.flags = {
      fourFingers: on('j_four_fingers'),
      shortcut: on('j_shortcut'),
      pareidolia: on('j_pareidolia'),
      smeared: on('j_smeared'),
      splash: on('j_splash')
    };
    let oops = 0;
    for (const j of S.jokers) if (j.key === 'j_oops' && !j.disabled && !j.debuffed) oops++;
    S.prob = Math.pow(2, oops);
    S.oopsCount = oops;
  }

  // ------------------------------------------------------------ 复制者递归
  function calcJoker(S, idx, ctx, rng) {
    const j = S.jokers[idx];
    if (!j || j.disabled || j.debuffed) return null;
    if (j.key === 'j_blueprint' || j.key === 'j_brainstorm') {
      const target = j.key === 'j_blueprint' ? idx + 1 : 0;
      if (target >= S.jokers.length || target === idx) return null;
      ctx.blueprint = (ctx.blueprint || 0) + 1;
      if (ctx.blueprint > S.jokers.length + 1) return null;
      if (ctx.blueprintCard === undefined) ctx.blueprintCard = idx;
      const ret = calcJoker(S, target, ctx, rng);
      if (ret) {
        ret._copy = ctx.blueprintCard;
        ret._copyVia = j.key === 'j_blueprint' ? '蓝图' : '头脑风暴';
      }
      return ret;
    }
    const d = BC.DEFS[j.key];
    if (!d || !d.calc) return null;
    if (!j.ab && d.ab) j.ab = BC.deepClone(d.ab);
    return d.calc({
      S, j, idx, ab: j.ab || {}, ctx,
      rng, prob: S.prob
    });
  }

  // ------------------------------------------------------------ 效果应用
  function applyPlayEffect(S, eff, trace, tag, cardLabel) {
    let note = eff._note || '';
    if (eff.chips) { S.chips += eff.chips; }
    if (eff.mult) { S.mult += eff.mult; }
    if (eff.p_dollars) { S.money += eff.p_dollars; }
    if (eff.dollars) { S.money += eff.dollars; }
    if (eff.extra) {
      if (eff.extra.mult_mod) S.mult += eff.extra.mult_mod;
      if (eff.extra.chip_mod) S.chips += eff.extra.chip_mod;
    }
    if (eff.x_mult) { S.mult *= eff.x_mult; }
    if (eff.edition) {
      if (eff.edition.chips) S.chips += eff.edition.chips;
      if (eff.edition.mult) S.mult += eff.edition.mult;
      if (eff.edition.x) S.mult *= eff.edition.x;
    }
    const label = eff._label || note || describeEff(eff);
    if (label || (eff.chips || eff.mult || eff.x_mult)) {
      trace.push({
        tag, label: cardLabel ? `${cardLabel} ${label}` : label,
        chips: S.chips, mult: S.mult, note
      });
    }
  }

  function describeEff(eff) {
    const parts = [];
    if (eff.chips) parts.push(`筹码+${fmt(eff.chips)}`);
    if (eff.mult) parts.push(`倍率+${fmt(eff.mult)}`);
    if (eff.x_mult) parts.push(`倍率×${fmt(eff.x_mult)}`);
    if (eff.h_mult) parts.push(`倍率+${fmt(eff.h_mult)}`);
    if (eff.message) parts.push('提示(被减益)');
    return parts.join(' ');
  }

  function applyHandEffect(S, eff, trace, cardLabel) {
    if (eff.dollars) S.money += eff.dollars;
    if (eff.h_mult) S.mult += eff.h_mult;
    if (eff.x_mult) S.mult *= eff.x_mult;
    const label = eff._label || eff._note || describeEff(eff);
    if (label) trace.push({ tag: '手持', label: `${cardLabel} ${label}`, chips: S.chips, mult: S.mult, note: eff._note || '' });
  }

  function applyMainEffect(S, eff, trace, srcName) {
    if (eff.mult_mod) S.mult += eff.mult_mod;
    if (eff.chip_mod) S.chips += eff.chip_mod;
    if (eff.Xmult_mod) S.mult *= eff.Xmult_mod;
    const label = eff._label || eff._note || describeEff(eff);
    if (label) trace.push({ tag: 'Joker', label: (eff._copyVia ? `${eff._copyVia}复制·` : '') + label, chips: S.chips, mult: S.mult, note: eff._note || '' });
  }

  function cardLabel(S, c) {
    return `${BC.RANK_LABEL[c.rank]}${BC.SUIT_SYM[c.suit]}`;
  }

  // ------------------------------------------------------------ 主流程
  // mode: 'expected' | 'min' | 'max'
  BC.evaluate = function (inp, mode) {
    mode = mode || 'expected';
    const S = BC.normalize(inp);
    const trace = [];
    const rng = () => (mode === 'min' ? false : mode === 'max' ? true : 'exp');

    buildFlags(S);
    computeDebuffs(S);

    const res = {
      mode, score: 0, chips: 0, mult: 0,
      handType: null, disp: null, level: 1,
      invalid: null, trace
    };

    if (!S.played.length) { res.invalid = '没有打出的牌'; return res; }

    // 1) 牌型判定
    const info = BC.getHandInfo(S, S.played);
    res.handType = info.text;
    res.disp = info.disp;
    if (!info.text) { res.invalid = '无法判定牌型'; return res; }

    // 2) 计分牌集合（Splash / 石头补入）
    let scoringSet;
    if (S.flags.splash) {
      scoringSet = new Set(S.played);
    } else {
      scoringSet = new Set(info.scoringHand);
      for (const c of S.played) if (c.enh === 'stone') scoringSet.add(c);
    }
    const scoringHand = S.played.filter((c) => scoringSet.has(c));

    // 3) Boss 合法性
    if (!S.bossOff) {
      if (S.boss === 'psychic' && S.played.length !== 5) {
        res.invalid = 'The Psychic：必须打出5张牌';
        res.trace.push({ tag: 'Boss', label: res.invalid, chips: 0, mult: 0 });
        return res;
      }
      if (S.boss === 'eye' && S.eyeUsed.includes(info.text)) {
        res.invalid = `The Eye：牌型「${info.text}」本盲注已用过`;
        res.trace.push({ tag: 'Boss', label: res.invalid, chips: 0, mult: 0 });
        return res;
      }
      if (S.boss === 'mouth' && S.mouthHand && info.text !== S.mouthHand) {
        res.invalid = `The Mouth：本盲注只允许「${S.mouthHand}」，打出「${info.text}」`;
        res.trace.push({ tag: 'Boss', label: res.invalid, chips: 0, mult: 0 });
        return res;
      }
    }

    // 4) 牌型等级（含 The Arm）
    let level = S.levels[info.text] || 1;
    let armNote = '';
    if (S.boss === 'arm' && !S.bossOff && level > 1) {
      level -= 1;
      armNote = 'The Arm -1级';
    }
    res.level = level;

    const base = BC.HAND_BASE[info.text];
    const readBase = (L) => ({
      chips: base.s_chips + (L - 1) * base.l_chips,
      mult: base.s_mult + (L - 1) * base.l_mult
    });
    let b = readBase(level);
    S.chips = b.chips;
    S.mult = b.mult;
    const zhHandName = (BC.NAMES && BC.NAMES.poker_hands[info.text]) || info.text;
    trace.push({
      tag: '基础',
      label: `${zhHandName} Lv.${fmt(level)}${armNote ? '（' + armNote + '）' : ''} → ${fmt(b.chips)}筹码/${fmt(b.mult)}倍率`,
      chips: S.chips, mult: S.mult
    });

    const mkCtx = (type, extra) => Object.assign({
      type,
      fullHand: S.played,
      scoringHand,
      scoringName: info.text,
      pokerHands: info.pokerHands
    }, extra || {});

    // 5) before 循环（成长/变异/升级）
    for (let i = 0; i < S.jokers.length; i++) {
      const ctx = mkCtx('before');
      const eff = calcJoker(S, i, ctx, rng);
      if (eff) {
        if (eff.level_up) {
          const w = eff.w === undefined ? 1 : eff.w;
          level += w;
          res.level = level;
        }
        if (eff._note) trace.push({ tag: '成长', label: eff._note, chips: S.chips, mult: S.mult });
      }
    }

    // 6) 重读基础（等级可能变化）
    b = readBase(level);
    S.chips = b.chips;
    S.mult = b.mult;

    // 7) Flint
    if (S.boss === 'flint' && !S.bossOff) {
      S.chips = Math.max(Math.floor(S.chips * 0.5 + 0.5), 0);
      S.mult = Math.max(Math.floor(S.mult * 0.5 + 0.5), 1);
      trace.push({ tag: 'Boss', label: 'The Flint 基础减半', chips: S.chips, mult: S.mult });
    } else if (level !== (S.levels[info.text] || 1)) {
      trace.push({
        tag: '基础', label: `升级后重读 → ${fmt(S.chips)}筹码/${fmt(S.mult)}倍率`,
        chips: S.chips, mult: S.mult
      });
    }

    // 8) 打出牌循环（逐张、逐次重触发）
    for (const card of scoringHand) {
      const cl = cardLabel(S, card);
      if (card.debuff) {
        trace.push({ tag: '打出', label: `${cl} 被减益→不计分`, chips: S.chips, mult: S.mult });
        continue;
      }
      // 收集重触发（state_events.lua:666-684：每张牌只判定一次）
      const reps = [{ note: '' }];
      if (card.seal === 'red') reps.push({ note: '红蜡封' });
      for (let i = 0; i < S.jokers.length; i++) {
        const ctx = mkCtx('rep', { area: 'play', card });
        const eff = calcJoker(S, i, ctx, rng);
        if (eff && eff.repetitions) {
          for (let k = 0; k < eff.repetitions; k++) reps.push({ note: eff._note || (BC.JMETA[S.jokers[i].key] ? BC.JMETA[S.jokers[i].key].zh : S.jokers[i].key) });
        }
      }

      for (let r = 0; r < reps.length; r++) {
        const where = r === 0 ? `[${cl}]` : `[${cl}]重触发${r}(${reps[r].note || '?'})`;
        // 牌自身效果（每次重触发重新评估，state_events.lua:692）
        const own = {};
        const ch = BC.chipBonus(card);
        if (ch > 0) own.chips = ch;
        let m = 0;
        if (card.enh === 'lucky') {
          const p = zx(S.prob / 5);
          const rr = rng();
          if (rr === true) { m = 20; card.luckyTrigger = true; own._note = '幸运+20触发(1/5)'; }
          else if (rr === 'exp') { m = 20 * p; if (p > 0) card.luckyTrigger = p; own._note = `幸运期望+${fmt(20 * p)}`; }
        } else if (card.enh === 'mult') {
          m = 4;
        }
        if (m > 0) own.mult = m;
        if (card.enh === 'glass') { own.x_mult = 2; own._note = (own._note ? own._note + ' ' : '') + '玻璃×2(本手必生效)'; }
        let dollars = 0;
        if (card.seal === 'gold') dollars += 3;
        if (card.enh === 'lucky') {
          const p = zx(S.prob / 15);
          const rr = rng();
          if (rr === true) { dollars += 20; card.luckyTrigger = true; }
          else if (rr === 'exp') { dollars += 20 * p; if (p > 0) card.luckyTrigger = p; }
        }
        if (dollars > 0) own.p_dollars = dollars;
        if (card.edition === 'foil') own.edition = { chips: 50 };
        else if (card.edition === 'holo') own.edition = { mult: 10 };
        else if (card.edition === 'poly') own.edition = { x: 1.5 };

        const effects = [own];
        for (let i = 0; i < S.jokers.length; i++) {
          const ctx = mkCtx('play', { card });
          const eff = calcJoker(S, i, ctx, rng);
          if (eff) effects.push(eff);
        }
        // 个体读取完毕后清除幸运标记（state_events.lua:700）
        delete card.luckyTrigger;

        for (const eff of effects) applyPlayEffect(S, eff, trace, r === 0 ? '打出' : '重触发', where);
      }
    }

    // 9) 手持牌循环
    for (const card of S.hand) {
      const cl = cardLabel(S, card);
      const buildEffects = () => {
        const own = {};
        if (!card.debuff && card.enh === 'steel') own.x_mult = 1.5;
        const effects = [];
        if (Object.keys(own).length) effects.push(own);
        for (let i = 0; i < S.jokers.length; i++) {
          const ctx = mkCtx('hand', { card });
          const eff = calcJoker(S, i, ctx, rng);
          if (eff) effects.push(eff);
        }
        return effects;
      };

      let effects = buildEffects();
      // 重触发判定（仅首遍，state_events.lua:809-830）
      const reps = [{ note: '' }];
      const hasEffect = (effects[0] && Object.keys(effects[0]).length > 0) || effects.length > 1;
      if (!card.debuff && card.seal === 'red' && hasEffect) reps.push({ note: '红蜡封' });
      for (let i = 0; i < S.jokers.length; i++) {
        const ctx = mkCtx('rep', { area: 'hand', card, cardEffects: effects });
        const eff = calcJoker(S, i, ctx, rng);
        if (eff && eff.repetitions) {
          for (let k = 0; k < eff.repetitions; k++) reps.push({ note: eff._note || (BC.JMETA[S.jokers[i].key] ? BC.JMETA[S.jokers[i].key].zh : S.jokers[i].key) });
        }
      }

      for (let r = 0; r < reps.length; r++) {
        if (r > 0) effects = buildEffects(); // 每次重触发重新评估
        const where = r === 0 ? `[${cl}]` : `[${cl}]重触发${r}(${reps[r].note || '?'})`;
        for (const eff of effects) applyHandEffect(S, eff, trace, where);
      }
    }

    // 10) 小丑主阶段（逐个：版本加算 → 主效果 → other_joker → 多彩乘算）
    for (let i = 0; i < S.jokers.length; i++) {
      const j = S.jokers[i];
      if (j.disabled) continue;
      const jn = BC.JMETA[j.key] ? BC.JMETA[j.key].zh : (j.key === '__placeholder' ? '占位小丑' : j.key);
      // 版本加算
      if (!j.debuffed) {
        if (j.edition === 'foil') { S.chips += 50; trace.push({ tag: 'Joker', label: `${jn} 烫金+50筹码`, chips: S.chips, mult: S.mult }); }
        else if (j.edition === 'holo') { S.mult += 10; trace.push({ tag: 'Joker', label: `${jn} 全息+10倍率`, chips: S.chips, mult: S.mult }); }
      }
      // 主效果
      if (!j.debuffed) {
        const ctx = mkCtx('main');
        const eff = calcJoker(S, i, ctx, rng);
        if (eff) applyMainEffect(S, eff, trace, jn);
      }
      // other_joker：所有小丑对 _card=j 的互相触发（Baseball）
      for (let v = 0; v < S.jokers.length; v++) {
        if (S.jokers[v].disabled) continue;
        const ctx = mkCtx('other', { otherJokerIdx: i });
        const eff = calcJoker(S, v, ctx, rng);
        if (eff) applyMainEffect(S, eff, trace, BC.JMETA[S.jokers[v].key] ? BC.JMETA[S.jokers[v].key].zh : S.jokers[v].key);
      }
      // 多彩最后乘算
      if (!j.debuffed && j.edition === 'poly') {
        S.mult *= 1.5;
        trace.push({ tag: 'Joker', label: `${jn} 多彩×1.5`, chips: S.chips, mult: S.mult });
      }
    }

    // 10b) 持有星球牌 + 天文台（每张对应星球 ×1.5，可叠）
    if (S.observatory) {
      let n = 0;
      if (S.planetCounts && S.planetCounts[info.text]) {
        n = Math.max(0, S.planetCounts[info.text] | 0);
      } else if (S.planets) {
        n = S.planets.filter((pk) => {
          const pair = BC.PLANET_HANDS.find((p) => p[0] === pk);
          return pair && pair[1] === info.text;
        }).length;
      }
      if (n > 0) {
        S.mult *= Math.pow(1.5, n);
        const zhH = (BC.NAMES && BC.NAMES.poker_hands[info.text]) || info.text;
        const sup = n > 1 ? String(n).split('').map((c) => ({ '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹' }[c] || c)).join('') : '';
        trace.push({ tag: 'Joker', label: `天文台·${zhH}星球×${n}张 ×1.5${sup}`, chips: S.chips, mult: S.mult });
      }
    }

    // 11) Plasma 牌组
    if (S.deckType === 'plasma') {
      res.rawChips = S.chips;
      res.rawMult = S.mult;
      const tot = S.chips + S.mult;
      S.chips = Math.floor(tot / 2);
      S.mult = Math.floor(tot / 2);
      trace.push({ tag: '牌组', label: `等离子：平分 → ${BC.fmtSci(S.chips)}/${BC.fmtSci(S.mult)}`, chips: S.chips, mult: S.mult });
    }

    // 12) 最终分
    res.chips = S.chips;
    res.mult = S.mult;
    res.score = Math.max(0, Math.floor(S.chips * S.mult));
    trace.push({
      tag: '最终',
      label: `最终 ${BC.fmtSci(res.score)}（${BC.fmtSci(S.chips)} × ${BC.fmtSci(S.mult)}）`,
      chips: S.chips, mult: S.mult
    });
    res.money = S.money;
    return res;
  };

  // 三模式一次跑完：期望(主体) + 区间
  BC.score = function (inp) {
    const main = BC.evaluate(inp, 'expected');
    const minR = BC.evaluate(inp, 'min');
    const maxR = BC.evaluate(inp, 'max');
    return {
      main,
      min: minR.score,
      max: maxR.score,
      hasRng: minR.score !== maxR.score
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
