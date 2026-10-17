(function (G) {
  const BC = (G.BC = G.BC || {});
  const DEFS = (BC.DEFS = {});

  // def(key, 默认ability, {before, play, hand, rep, other, main} 处理器)
  // 每个处理器收到 env = {S, j, idx, ab, ctx, rng, prob}，返回 effect | null
  function def(key, ab, h) {
    DEFS[key] = {
      ab: ab || null,
      calc: function (e) {
        const fn = h[e.ctx.type];
        return fn ? fn(e) : null;
      }
    };
  }
  BC.jokerAb = function (key) {
    const d = DEFS[key];
    return d && d.ab ? BC.deepClone(d.ab) : {};
  };

  // rng: false(min) | true(max) | 'exp'(期望)
  function roll(e, p) {
    const r = e.rng();
    if (r === 'exp') return p;
    return r ? 1 : 0;
  }
  function zx(p) { return p >= 1 ? 1 : p; }

  const nm = (k) => (BC.JMETA[k] ? BC.JMETA[k].zh : k);

  // 状态类字段：优先读小丑行 opts（UI 已移入小丑行），否则回退全局 S
  function st(e, key) {
    const o = e.j.opts;
    if (o && o[key] !== undefined && o[key] !== null && o[key] !== '') return +o[key] || 0;
    return e.S[key] || 0;
  }

  // ============================================= before（出牌前成长/变异）
  def('j_space', {}, {
    before: (e) => {
      const p = zx(e.prob / 4);
      const r = roll(e, p);
      if (r === 1) return { level_up: true, w: 1, _note: '太空小丑 升级+1(1/4)' };
      if (r === p && p > 0) return { level_up: true, w: p, _note: `太空小丑 期望+${p}级(1/4)` };
      return null;
    }
  });

  def('j_square', { extra: { chips: 0, chip_mod: 4 } }, {
    before: (e) => {
      if (e.ctx.blueprint) return null;
      if (e.ctx.fullHand.length === 4) { e.ab.extra.chips += e.ab.extra.chip_mod; return { _note: `方形小丑 成长+${e.ab.extra.chip_mod}` }; }
      return null;
    },
    main: (e) => ({ chip_mod: e.ab.extra.chips, _label: `方形小丑 +${e.ab.extra.chips}` })
  });

  def('j_runner', { extra: { chips: 0, chip_mod: 15 } }, {
    before: (e) => {
      if (e.ctx.blueprint) return null;
      if (e.ctx.pokerHands['Straight'] && e.ctx.pokerHands['Straight'].length) {
        e.ab.extra.chips += e.ab.extra.chip_mod;
        return { _note: `跑步选手 成长+${e.ab.extra.chip_mod}` };
      }
      return null;
    },
    main: (e) => ({ chip_mod: e.ab.extra.chips, _label: `跑步选手 +${e.ab.extra.chips}` })
  });

  def('j_trousers', { extra: 2, mult: 0 }, {
    before: (e) => {
      if (e.ctx.blueprint) return null;
      const p = e.ctx.pokerHands;
      if ((p['Two Pair'] && p['Two Pair'].length) || (p['Full House'] && p['Full House'].length)) {
        e.ab.mult += e.ab.extra;
        return { _note: `备用裤子 成长+${e.ab.extra}` };
      }
      return null;
    },
    main: (e) => (e.ab.mult > 0 ? { mult_mod: e.ab.mult, _label: `备用裤子 +${e.ab.mult}` } : null)
  });

  def('j_green_joker', { extra: { hand_add: 1, discard_sub: 1 }, mult: 0 }, {
    before: (e) => {
      if (e.ctx.blueprint) return null;
      e.ab.mult += e.ab.extra.hand_add;
      return { _note: `绿色小丑 成长+${e.ab.extra.hand_add}` };
    },
    main: (e) => (e.ab.mult > 0 ? { mult_mod: e.ab.mult, _label: `绿色小丑 +${e.ab.mult}` } : null)
  });

  def('j_ride_the_bus', { extra: 1, mult: 0 }, {
    before: (e) => {
      if (e.ctx.blueprint) return null;
      let faces = 0;
      for (const c of e.ctx.scoringHand) if (BC.isFaceC(e.S, c)) faces++;
      if (faces > 0) { e.ab.mult = 0; return { _note: '搭乘巴士 含人头→清零' }; }
      e.ab.mult += e.ab.extra;
      return { _note: `搭乘巴士 成长+${e.ab.extra}` };
    },
    main: (e) => (e.ab.mult > 0 ? { mult_mod: e.ab.mult, _label: `搭乘巴士 +${e.ab.mult}` } : null)
  });

  def('j_obelisk', { extra: 0.2, x_mult: 1 }, {
    before: (e) => {
      if (e.ctx.blueprint) return null;
      const cur = e.S.handPlayed[e.ctx.scoringName] || 0;
      let maxOther = 0;
      for (const k of Object.keys(e.S.handPlayed)) {
        if (k !== e.ctx.scoringName) maxOther = Math.max(maxOther, e.S.handPlayed[k] || 0);
      }
      if (cur > maxOther) { e.ab.x_mult += e.ab.extra; return { _note: `方尖石塔 成长×${fmt(e.ab.x_mult)}` }; }
      if (e.ab.x_mult !== 1) { e.ab.x_mult = 1; return { _note: '方尖石塔 重置×1' }; }
      return null;
    },
    main: xMain()
  });

  def('j_vampire', { extra: 0.1, x_mult: 1 }, {
    before: (e) => {
      if (e.ctx.blueprint) return null;
      let n = 0;
      for (const c of e.ctx.scoringHand) if (c.enh !== 'none' && !c.debuff) { c.enh = 'none'; n++; }
      if (n > 0) { e.ab.x_mult += e.ab.extra * n; return { _note: `吸血鬼 吸${n}张→×${fmt(e.ab.x_mult)}` }; }
      return null;
    },
    main: xMain()
  });

  def('j_midas_mask', null, {
    before: (e) => {
      let n = 0;
      for (const c of e.ctx.scoringHand) {
        if (BC.isFaceC(e.S, c) && c.enh !== 'gold') { c.enh = 'gold'; n++; }
      }
      return n > 0 ? { _note: `迈达斯 ${n}张人头→黄金` } : null;
    }
  });

  // ============================================= play 单牌 individual
  const SUIT_MULT = {
    j_greedy_joker: ['Diamonds', 3], j_lusty_joker: ['Hearts', 3],
    j_wrathful_joker: ['Spades', 3], j_gluttenous_joker: ['Clubs', 3]
  };
  for (const k of Object.keys(SUIT_MULT)) {
    const [suit, m] = SUIT_MULT[k];
    def(k, { extra: { s_mult: m, suit } }, {
      play: (e) => (BC.isSuit(e.S, e.ctx.card, suit) ? { mult: m, _label: nm(k) } : null)
    });
  }

  def('j_arrowhead', { extra: 50 }, {
    play: (e) => (BC.isSuit(e.S, e.ctx.card, 'Spades') ? { chips: 50, _label: '箭头' } : null)
  });

  def('j_onyx_agate', { extra: 7 }, {
    play: (e) => (BC.isSuit(e.S, e.ctx.card, 'Clubs') ? { mult: 7, _label: '缟玛瑙' } : null)
  });

  def('j_bloodstone', { extra: { odds: 2, Xmult: 1.5 } }, {
    play: (e) => {
      if (!BC.isSuit(e.S, e.ctx.card, 'Hearts')) return null;
      const p = zx(e.prob / e.ab.extra.odds);
      const r = roll(e, p);
      if (r === 1) return { x_mult: e.ab.extra.Xmult, _note: '血石触发×1.5' };
      if (r === p && p > 0) return { x_mult: 1 + 0.5 * p, _note: `血石期望×${fmt(1 + 0.5 * p)}(${fmt(p)})` };
      return null;
    }
  });

  def('j_even_steven', { extra: 4 }, {
    play: (e) => {
      const id = BC.cardId(e.ctx.card);
      return (id >= 0 && id <= 10 && id % 2 === 0) ? { mult: 4, _label: '偶数史蒂文' } : null;
    }
  });

  def('j_odd_todd', { extra: 31 }, {
    play: (e) => {
      const id = BC.cardId(e.ctx.card);
      return (id === 14 || (id > 0 && id <= 10 && id % 2 === 1)) ? { chips: 31, _label: '奇数托德' } : null;
    }
  });

  def('j_fibonacci', { extra: 8 }, {
    play: (e) => ([2, 3, 5, 8, 14].includes(BC.cardId(e.ctx.card)) ? { mult: 8, _label: '斐波那契' } : null)
  });

  def('j_scholar', { extra: { mult: 4, chips: 20 } }, {
    play: (e) => (BC.cardId(e.ctx.card) === 14 ? { chips: 20, mult: 4, _label: '学者' } : null)
  });

  def('j_walkie_talkie', { extra: { chips: 10, mult: 4 } }, {
    play: (e) => {
      const id = BC.cardId(e.ctx.card);
      return (id === 10 || id === 4) ? { chips: 10, mult: 4, _label: '对讲机' } : null;
    }
  });

  def('j_photograph', { extra: 2 }, {
    play: (e) => {
      const c = e.ctx.card;
      if (!BC.isFaceC(e.S, c)) return null;
      let first = null;
      for (const s of e.ctx.scoringHand) if (BC.isFaceC(e.S, s)) { first = s; break; }
      return c === first ? { x_mult: 2, _note: '照片 首张人头×2' } : null;
    }
  });

  def('j_scary_face', { extra: 30 }, {
    play: (e) => (BC.isFaceC(e.S, e.ctx.card) ? { chips: 30, _label: '恐怖面孔' } : null)
  });

  def('j_smiley', { extra: 5 }, {
    play: (e) => (BC.isFaceC(e.S, e.ctx.card) ? { mult: 5, _label: '微笑表情' } : null)
  });

  def('j_triboulet', { extra: 2 }, {
    play: (e) => {
      const id = BC.cardId(e.ctx.card);
      return (id === 12 || id === 13) ? { x_mult: 2, _note: '特里布莱 Q/K×2' } : null;
    }
  });

  def('j_ancient', { extra: 1.5 }, {
    play: (e) => {
      const suit = e.j.opts.suit || 'Hearts';
      return BC.isSuit(e.S, e.ctx.card, suit)
        ? { x_mult: 1.5, _note: `古老小丑(${BC.SUIT_ZH[BC.suitShort(suit)]})×1.5` } : null;
    }
  });

  def('j_idol', { extra: 2 }, {
    play: (e) => {
      const c = e.ctx.card;
      const r = e.j.opts.rank || 14, s = BC.suitLong(e.j.opts.suit || 'S');
      return (BC.cardId(c) === r && BC.suitLong(c.suit) === s)
        ? { x_mult: 2, _note: `偶像 ${BC.RANK_LABEL[r]}${BC.SUIT_SYM[BC.suitShort(s)]}×2` } : null;
    }
  });

  def('j_hiker', { extra: 5 }, {
    play: (e) => {
      e.ctx.card.perma = (e.ctx.card.perma || 0) + e.ab.extra;
      return { _note: `徒步者 该牌永久+${e.ab.extra}(下次计分生效)` };
    }
  });

  def('j_lucky_cat', { Xmult: 1, extra: 0.25, x_mult: 1 }, {
    play: (e) => {
      if (e.ctx.blueprint) return null;
      const t = e.ctx.card.luckyTrigger;
      const w = typeof t === 'number' ? t : (t ? 1 : 0);
      if (!w) return null;
      e.ab.x_mult += e.ab.extra * w;
      return { _note: w === 1 ? `招财猫 成长×${fmt(e.ab.x_mult)}` : `招财猫 期望成长×${fmt(e.ab.x_mult)}` };
    },
    main: xMain()
  });

  def('j_wee', { extra: { chips: 0, chip_mod: 8 } }, {
    play: (e) => {
      if (e.ctx.blueprint) return null;
      if (BC.cardId(e.ctx.card) !== 2) return null;
      e.ab.extra.chips += e.ab.extra.chip_mod;
      return { _note: `小小丑 成长+${e.ab.extra.chips}` };
    },
    main: (e) => ({ chip_mod: e.ab.extra.chips, _label: `小小丑 +${e.ab.extra.chips}` })
  });

  def('j_rough_gem', { extra: 1 }, {
    play: (e) => (BC.isSuit(e.S, e.ctx.card, 'Diamonds') ? { dollars: 1, _label: '璞玉 $1' } : null)
  });

  def('j_ticket', { extra: 4 }, {
    play: (e) => (e.ctx.card.enh === 'gold' ? { dollars: 4, _label: '黄金门票 $4' } : null)
  });

  def('j_business', { extra: 2 }, {
    play: (e) => {
      if (!BC.isFaceC(e.S, e.ctx.card)) return null;
      const p = zx(e.prob / 2);
      const r = roll(e, p);
      if (r === 1) return { dollars: 2, _label: '名片 $2' };
      if (r === p && p > 0) return { dollars: 2 * p, _note: `名片 期望$${fmt(2 * p)}` };
      return null;
    }
  });

  def('j_8_ball', { extra: 4 }, {
    play: (e) => {
      if (BC.cardId(e.ctx.card) !== 8) return null;
      const p = zx(e.prob / 4);
      const r = roll(e, p);
      if (r === 1) return { dollars: 0, _note: '八号球 生成塔罗(不影响分数)' };
      if (r === p && p > 0) return { dollars: 0, _note: `八号球 期望(不影响分数)` };
      return null;
    }
  });

  // ============================================= hand 单牌 individual
  def('j_baron', { extra: 1.5 }, {
    hand: (e) => {
      const c = e.ctx.card;
      if (BC.cardId(c) !== 13) return null;
      if (c.debuff) return { message: 'debuffed', _label: '男爵(被减益)' };
      return { x_mult: 1.5, _note: '男爵 K×1.5' };
    }
  });

  def('j_shoot_the_moon', { extra: 13 }, {
    hand: (e) => {
      const c = e.ctx.card;
      if (BC.cardId(c) !== 12) return null;
      if (c.debuff) return { message: 'debuffed', _label: '射月(被减益)' };
      return { h_mult: 13, _note: '射月 Q+13倍率' };
    }
  });

  def('j_raised_fist', null, {
    hand: (e) => {
      // card.lua:3320-3340：base.id 最低（并列取手牌中靠后的），倍率 = 2 × base.nominal
      let tempID = 15, raised = null;
      for (const c of e.S.hand) {
        if (c.enh === 'stone') continue;
        if (tempID >= c.rank) { tempID = c.rank; raised = c; }
      }
      if (!raised || raised !== e.ctx.card) return null;
      if (e.ctx.card.debuff) return { message: 'debuffed', _label: '致胜之拳(被减益)' };
      const v = 2 * BC.RANK_CHIPS[e.ctx.card.rank];
      return { h_mult: v, _note: `致胜之拳 最低${BC.RANK_LABEL[e.ctx.card.rank]} +${v}` };
    }
  });

  def('j_reserved_parking', { extra: { odds: 2, dollars: 1 } }, {
    hand: (e) => {
      const c = e.ctx.card;
      // 源码条件先判 is_face()：被减益牌直接不触发（card.lua:3303）
      if (!BC.isFaceC(e.S, c)) return null;
      const p = zx(e.prob / 2);
      const r = roll(e, p);
      if (r === 1) return { dollars: 1, _label: '私人车位 $1' };
      if (r === p && p > 0) return { dollars: p, _note: `车位 期望$${fmt(p)}` };
      return null;
    }
  });

  // ============================================= repetition
  def('j_sock_and_buskin', { extra: 1 }, {
    rep: (e) => (e.ctx.area === 'play' && BC.isFaceC(e.S, e.ctx.card)
      ? { repetitions: 1, _note: '喜与悲 人头+1触发' } : null)
  });

  def('j_hanging_chad', { extra: 2 }, {
    rep: (e) => (e.ctx.area === 'play' && e.ctx.scoringHand[0] === e.ctx.card
      ? { repetitions: 2, _note: '未断选票 首张计分牌+2触发' } : null)
  });

  def('j_dusk', { extra: 1 }, {
    rep: (e) => (e.ctx.area === 'play' && st(e, 'handsLeft') === 0
      ? { repetitions: 1, _note: '黄昏 最后一手+1触发' } : null)
  });

  def('j_selzer', { extra: 10 }, {
    rep: (e) => (e.ctx.area === 'play' ? { repetitions: 1, _note: '苏打水+1触发' } : null)
  });

  def('j_hack', { extra: 1 }, {
    rep: (e) => {
      if (e.ctx.area !== 'play') return null;
      const id = BC.cardId(e.ctx.card);
      return (id >= 2 && id <= 5) ? { repetitions: 1, _note: 'Hack 2-5点+1触发' } : null;
    }
  });

  def('j_mime', { extra: 1 }, {
    rep: (e) => {
      if (e.ctx.area !== 'hand') return null;
      const fx = e.ctx.cardEffects;
      if (!fx || !fx.length) return null;
      const own = fx[0] && Object.keys(fx[0]).length > 0;
      if (own || fx.length > 1) return { repetitions: 1, _note: '哑剧演员 手牌效果+1触发' };
      return null;
    }
  });

  // ============================================= other_joker
  def('j_baseball', { extra: 1.5 }, {
    other: (e) => {
      const t = e.S.jokers[e.ctx.otherJokerIdx];
      if (!t || e.idx === e.ctx.otherJokerIdx) return null;
      const meta = BC.JMETA[t.key];
      if (meta && meta.r === 2) return { Xmult_mod: 1.5, _note: `棒球卡→${nm(t.key)} ×1.5` };
      return null;
    }
  });

  // ============================================= joker_main
  // 牌型「包含」判定（card.lua:3653: next(context.poker_hands[type])）：
  // poker_hands 表同时填所有成立的牌型（如 同花五条 含 四条/五条/对子/同花），
  // 与真正计分的 scoringName（优先级最高那一个）不同。
  function handHas(e, type) {
    if (!type) return true;
    const p = e.ctx && e.ctx.pokerHands;
    if (p && p[type]) return p[type].length > 0;
    return !!(e.ctx && e.ctx.scoringName === type);
  }

  // 通用成长型 X 倍率（card.lua:3653-3659）：x_mult>1 且 (无牌型限定或包含该牌型)
  function xMain() {
    return (e) => {
      const x = e.ab.x_mult;
      if (x !== undefined && x > 1 && handHas(e, e.ab.type)) {
        return { Xmult_mod: x, _label: `${nm(e.j.key)} ×${fmt(x)}` };
      }
      return null;
    };
  }

  // 牌型加算/筹码/乘算
  const T_DEFS = [
    ['j_jolly', 'Pair', { t_mult: 8 }, 'mult_mod'],
    ['j_mad', 'Two Pair', { t_mult: 10 }, 'mult_mod'],
    ['j_zany', 'Three of a Kind', { t_mult: 12 }, 'mult_mod'],
    ['j_crazy', 'Straight', { t_mult: 12 }, 'mult_mod'],
    ['j_droll', 'Flush', { t_mult: 10 }, 'mult_mod'],
    ['j_sly', 'Pair', { t_chips: 50 }, 'chip_mod'],
    ['j_wily', 'Three of a Kind', { t_chips: 100 }, 'chip_mod'],
    ['j_clever', 'Two Pair', { t_chips: 80 }, 'chip_mod'],
    ['j_devious', 'Straight', { t_chips: 100 }, 'chip_mod'],
    ['j_crafty', 'Flush', { t_chips: 80 }, 'chip_mod'],
    ['j_duo', 'Pair', { x_mult: 2, type: 'Pair' }, 'Xmult_mod'],
    ['j_trio', 'Three of a Kind', { x_mult: 3, type: 'Three of a Kind' }, 'Xmult_mod'],
    ['j_family', 'Four of a Kind', { x_mult: 4, type: 'Four of a Kind' }, 'Xmult_mod'],
    ['j_order', 'Straight', { x_mult: 3, type: 'Straight' }, 'Xmult_mod'],
    ['j_tribe', 'Flush', { x_mult: 2, type: 'Flush' }, 'Xmult_mod']
  ];
  for (const [key, type, ab, field] of T_DEFS) {
    const abFull = Object.assign({ type }, ab);
    if (field === 'Xmult_mod') {
      def(key, abFull, { main: xMain() });
    } else {
      def(key, abFull, {
        main: (e) => {
          if (!handHas(e, e.ab.type)) return null;
          return field === 'mult_mod'
            ? { mult_mod: e.ab.t_mult, _label: `${nm(key)} +${e.ab.t_mult}` }
            : { chip_mod: e.ab.t_chips, _label: `${nm(key)} +${e.ab.t_chips}` };
        }
      });
    }
  }

  // 成长型 X（独立配置）
  def('j_campfire', { extra: 0.25, x_mult: 1 }, { main: xMain() });
  def('j_constellation', { extra: 0.1, Xmult: 1, x_mult: 1 }, { main: xMain() });
  def('j_glass', { extra: 0.75, Xmult: 1, x_mult: 1 }, { main: xMain() });
  def('j_hit_the_road', { extra: 0.5, x_mult: 1 }, { main: xMain() });
  def('j_hologram', { extra: 0.25, Xmult: 1, x_mult: 1 }, { main: xMain() });
  def('j_madness', { extra: 0.5, x_mult: 1 }, { main: xMain() });
  def('j_ramen', { Xmult: 2, extra: 0.01, x_mult: 2 }, { main: xMain() });
  def('j_throwback', { extra: 0.25, x_mult: 1 }, { main: xMain() });
  def('j_yorick', { extra: { xmult: 1, discards: 23 }, x_mult: 1 }, { main: xMain() });

  def('j_joker', { mult: 4 }, {
    main: (e) => ({ mult_mod: e.ab.mult, _label: `小丑 +${e.ab.mult}` })
  });

  def('j_abstract', { extra: 3 }, {
    main: (e) => {
      let n = 0;
      for (const j of e.S.jokers) if (!j.disabled) n++;
      return { mult_mod: e.ab.extra * n, _label: `抽象小丑 +${e.ab.extra}×${n}` };
    }
  });

  def('j_acrobat', { extra: 3 }, {
    main: (e) => (st(e, 'handsLeft') === 0 ? { Xmult_mod: 3, _note: '杂技演员 最后一手×3' } : null)
  });

  def('j_banner', { extra: 30 }, {
    main: (e) => {
      const d = Math.max(0, st(e, 'discardsLeft'));
      return d > 0
        ? { chip_mod: 30 * d, _label: `旗帜 +${30 * d}(剩${d}弃)` } : null;
    }
  });

  def('j_mystic_summit', { extra: { mult: 15, d_remaining: 0 } }, {
    main: (e) => (st(e, 'discardsLeft') === 0 ? { mult_mod: 15, _label: '神秘之峰 +15' } : null)
  });

  def('j_misprint', { extra: { max: 23, min: 0 } }, {
    main: (e) => {
      const r = e.rng();
      if (r === 'exp') return { mult_mod: 11.5, _note: '印错 期望+11.5倍率(0-23)' };
      return { mult_mod: r ? 23 : 0, _note: r ? '印错 +23' : '印错 +0' };
    }
  });

  def('j_stuntman', { extra: { h_size: 2, chip_mod: 250 } }, {
    main: (e) => ({ chip_mod: 250, _label: '特技演员 +250' })
  });

  def('j_supernova', { extra: 1 }, {
    main: (e) => {
      const n = e.S.handPlayed[e.ctx.scoringName] || 0;
      return { mult_mod: n, _label: `超新星 +${n}(含本手)` };
    }
  });

  def('j_ceremonial', { mult: 0 }, {
    main: (e) => (e.ab.mult > 0 ? { mult_mod: e.ab.mult, _label: `仪式匕首 +${e.ab.mult}` } : null)
  });

  def('j_flower_pot', { extra: 3 }, {
    main: (e) => {
      const suits = { Spades: false, Hearts: false, Clubs: false, Diamonds: false };
      for (const c of e.ctx.scoringHand) {
        for (const s of Object.keys(suits)) if (!suits[s] && BC.isSuit(e.S, c, s)) suits[s] = true;
      }
      return Object.values(suits).every(Boolean) ? { Xmult_mod: 3, _note: '花盆 四花色×3' } : null;
    }
  });

  def('j_seeing_double', { extra: 2 }, {
    main: (e) => {
      const need = { Spades: false, Hearts: false, Diamonds: false, Clubs: false };
      for (const c of e.ctx.scoringHand) {
        for (const s of Object.keys(need)) if (!need[s] && BC.isSuit(e.S, c, s)) need[s] = true;
      }
      return (need.Clubs && need.Spades && need.Hearts && need.Diamonds)
        ? { Xmult_mod: 2, _note: '重影 四花色含梅花×2' } : null;
    }
  });

  def('j_castle', { extra: { chips: 0, chip_mod: 3 } }, {
    main: (e) => ({ chip_mod: e.ab.extra.chips, _label: `城堡 +${e.ab.extra.chips}` })
  });

  def('j_blue_joker', { extra: 2 }, {
    main: (e) => {
      const v = 2 * Math.max(0, st(e, 'deckRemaining'));
      return { chip_mod: v, _label: `蓝色小丑 +${v}(牌堆${Math.max(0, st(e, 'deckRemaining'))}张)` };
    }
  });

  def('j_erosion', { extra: 4 }, {
    main: (e) => {
      const n = Math.max(0, st(e, 'erosionMissing'));
      return n > 0 ? { mult_mod: 4 * n, _label: `侵蚀 +${4 * n}(${n}张已移除)` } : null;
    }
  });

  def('j_ice_cream', { extra: { chips: 100, chip_mod: 5 } }, {
    main: (e) => ({ chip_mod: e.ab.extra.chips, _label: `冰淇淋 +${e.ab.extra.chips}` })
  });

  def('j_stone', { extra: 25 }, {
    main: (e) => {
      const n = Math.max(0, st(e, 'stoneCount'));
      return n > 0 ? { chip_mod: 25 * n, _label: `石头小丑 +${25 * n}` } : null;
    }
  });

  def('j_steel_joker', { extra: 0.2 }, {
    main: (e) => {
      const n = Math.max(0, st(e, 'steelCount'));
      const x = 1 + 0.2 * n;
      return x > 1 ? { Xmult_mod: x, _note: `钢铁小丑 ×${fmt(x)}(${n}张)` } : null;
    }
  });

  def('j_bull', { extra: 2 }, {
    main: (e) => {
      const v = 2 * Math.max(0, st(e, 'money'));
      return { chip_mod: v, _label: `斗牛 +${v}($${st(e, 'money')})` };
    }
  });

  def('j_drivers_license', { extra: 3 }, {
    main: (e) => (st(e, 'enhancedCount') >= 16 ? { Xmult_mod: 3, _note: '驾驶执照 ×3(≥16强化牌)' } : null)
  });

  def('j_blackboard', { extra: 3 }, {
    main: (e) => {
      if (!e.S.hand.length) return null;
      for (const c of e.S.hand) {
        if (!BC.isSuit(e.S, c, 'Spades') && !BC.isSuit(e.S, c, 'Clubs')) return null;
      }
      return { Xmult_mod: 3, _note: '黑板 手牌全黑×3' };
    }
  });

  def('j_stencil', null, {
    main: (e) => {
      let live = 0, stencils = 0;
      for (const j of e.S.jokers) {
        if (j.disabled) continue;
        live++;
        if (j.key === 'j_stencil') stencils++;
      }
      const slots = Math.max(e.S.jokerSlots, st(e, 'jokerSlots') || e.S.jokerSlots, live);
      const x = Math.max(0, slots - live) + stencils;
      return { Xmult_mod: x, _note: `模具 ×${x}(空槽${Math.max(0, slots - live)}+模具${stencils})` };
    }
  });

  def('j_swashbuckler', { mult: 1 }, {
    main: (e) => {
      let sum = 0;
      for (let i = 0; i < e.S.jokers.length; i++) {
        if (i === e.idx) continue;
        const o = e.S.jokers[i];
        if (o.disabled) continue;
        if (o.key === '__placeholder') { sum += Math.floor((o.opts.cost || 0) / 2); continue; }
        const meta = BC.JMETA[o.key];
        if (meta) sum += Math.floor(meta.cost / 2);
      }
      return sum > 0 ? { mult_mod: sum, _label: `侠盗 +${sum}(其它小丑售价和/2)` } : null;
    }
  });

  def('j_flash', { extra: 2, mult: 0 }, {
    main: (e) => (e.ab.mult > 0 ? { mult_mod: e.ab.mult, _label: `闪示卡 +${e.ab.mult}` } : null)
  });

  def('j_popcorn', { mult: 20, extra: 4 }, {
    main: (e) => ({ mult_mod: e.ab.mult, _label: `爆米花 +${e.ab.mult}` })
  });

  def('j_fortune_teller', { extra: 1 }, {
    main: (e) => {
      const n = Math.max(0, st(e, 'tarotUsed'));
      return n > 0 ? { mult_mod: n, _label: `占卜师 +${n}(塔罗${n}张)` } : null;
    }
  });

  def('j_gros_michel', { extra: { odds: 6, mult: 15 } }, {
    main: (e) => ({ mult_mod: 15, _label: '大麦克 +15' })
  });

  def('j_cavendish', { extra: { odds: 1000, Xmult: 3 } }, {
    main: (e) => ({ Xmult_mod: 3, _note: '卡文迪什 ×3' })
  });

  def('j_red_card', { extra: 3, mult: 0 }, {
    main: (e) => (e.ab.mult > 0 ? { mult_mod: e.ab.mult, _label: `红牌 +${e.ab.mult}` } : null)
  });

  def('j_card_sharp', { extra: { Xmult: 3 } }, {
    main: (e) => {
      const n = e.S.handPlayedRound[e.ctx.scoringName] || 0;
      return n > 1 ? { Xmult_mod: 3, _note: `老千 ×3(本回合该牌型${n}次,含本手)` } : null;
    }
  });

  def('j_bootstraps', { extra: { mult: 2, dollars: 5 } }, {
    main: (e) => {
      const money = Math.max(0, st(e, 'money'));
      const times = Math.floor(money / 5);
      return times >= 1 ? { mult_mod: 2 * times, _label: `提靴带 +${2 * times}($${money})` } : null;
    }
  });

  def('j_caino', { extra: 1, x_mult: 1 }, {
    main: (e) => (e.ab.x_mult > 1 ? { Xmult_mod: e.ab.x_mult, _note: `卡尼奥 ×${fmt(e.ab.x_mult)}` } : null)
  });

  def('j_half', { extra: { mult: 20, size: 3 } }, {
    main: (e) => (e.ctx.fullHand.length <= 3 ? { mult_mod: 20, _label: '半张小丑 +20' } : null)
  });

  def('j_loyalty_card', { extra: { Xmult: 4, every: 5 } }, {
    main: (e) => {
      const every = (e.ab && e.ab.extra && e.ab.extra.every) || 5;
      // 游戏内蓝图与非蓝图都在 loyalty_remaining == every 时触发 Xmult（card.lua:3635/3645）；
      // 非蓝图的 ==0 分支仅 juice 动画，不返回倍率。输入即计分时将取到的 loyalty_remaining。
      const rem = e.j.opts.loyalty !== undefined ? +e.j.opts.loyalty : every;
      return rem === every ? { Xmult_mod: 4, _note: '积分卡 ×4' } : null;
    }
  });

  // 复制者：引擎层处理，这里占位
  def('j_blueprint', null, {});
  def('j_brainstorm', null, {});

  // 占位小丑（用户自定义）
  def('__placeholder', null, {
    main: (e) => {
      const o = e.j.opts || {};
      const eff = {};
      if (o.mult) eff.mult_mod = +o.mult;
      if (o.chips) eff.chip_mod = +o.chips;
      if (o.xmult && +o.xmult !== 1) eff.Xmult_mod = +o.xmult;
      if (eff.mult_mod || eff.chip_mod || eff.Xmult_mod) {
        eff._label = `占位(筹码${o.chips || 0}/倍率${o.mult || 0}/×${o.xmult || 1})`;
        return eff;
      }
      return null;
    }
  });

  function fmt(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
  }
  BC.fmtNum = fmt;
})(typeof window !== 'undefined' ? window : globalThis);
