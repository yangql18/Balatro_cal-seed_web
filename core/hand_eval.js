(function (G) {
  const BC = (G.BC = G.BC || {});

  function cardId(c) {
    if (c.enh === 'stone') return -((c.uid % 900) + 100); // 石头：负数，永不配对/进顺子 (card.lua:957)
    return c.rank;
  }
  BC.cardId = cardId;

  function isStone(c) { return c.enh === 'stone'; }

  // nominal 基础筹码（card.lua:976-982）：石头只有 bonus(+perma)
  function chipBonus(c) {
    if (c.debuff) return 0;
    if (isStone(c)) return 50 + (c.perma || 0); // config m_stone bonus=50
    return BC.RANK_CHIPS[c.rank] + enhBonus(c) + (c.perma || 0);
  }
  function enhBonus(c) {
    return c.enh === 'bonus' ? 30 : 0;
  }
  BC.chipBonus = chipBonus;

  // get_nominal (card.lua:950-555)
  function getNominal(c) {
    const mult = isStone(c) ? -1000 : 1;
    const sn = BC.SUIT_NOMINAL[c.suit] || 0;
    return (BC.RANK_CHIPS[c.rank] || 0) + sn * mult + sn * 0.0001 * mult +
      (BC.RANK_FACE_NOMINAL[c.rank] || 0) + 0.000001 * c.uid;
  }
  BC.getNominal = getNominal;

  // is_suit (card.lua:4064-4089)
  function isSuit(S, c, suit, opts) {
    opts = opts || {};
    const flushCalc = !!opts.flushCalc;
    const bypass = !!opts.bypassDebuff;
    const smeared = S.flags.smeared;
    const cs = BC.suitLong(c.suit), ss = BC.suitLong(suit);
    const group = (s) => (s === 'Hearts' || s === 'Diamonds') ? 'red' : 'black';
    if (flushCalc) {
      if (isStone(c)) return false;
      if (c.enh === 'wild' && !c.debuff) return true;
      if (smeared && group(cs) === group(ss)) return true;
      return cs === ss;
    } else {
      if (c.debuff && !bypass) return false;
      if (isStone(c)) return false;
      if (c.enh === 'wild') return true;
      if (smeared && group(cs) === group(ss)) return true;
      return cs === ss;
    }
  }
  BC.isSuit = isSuit;

  function isFaceC(S, c, fromBoss) {
    if (c.debuff && !fromBoss) return false;
    if (c.rank === 11 || c.rank === 12 || c.rank === 13) return true;
    return !!S.flags.pareidolia;
  }
  BC.isFaceC = isFaceC;

  // ---- 牌型部件 ----

  function getXsame(num, hand) {
    const vals = [];
    for (let i = 0; i <= 14; i++) vals[i] = [];
    for (let i = hand.length - 1; i >= 0; i--) {
      const curr = [hand[i]];
      for (let j = 0; j < hand.length; j++) {
        if (j !== i && cardId(hand[i]) === cardId(hand[j])) curr.push(hand[j]);
      }
      if (curr.length === num) {
        const id = cardId(hand[i]);
        if (id >= 1 && id <= 14) vals[id] = curr;
      }
    }
    const ret = [];
    for (let i = 14; i >= 1; i--) if (vals[i].length) ret.push(vals[i]);
    return ret;
  }

  function getFlush(S, hand) {
    const ret = [];
    const fourF = S.flags.fourFingers;
    const need = 5 - (fourF ? 1 : 0);
    if (hand.length > 5 || hand.length < need) return ret;
    for (const suit of ['Spades', 'Hearts', 'Clubs', 'Diamonds']) {
      const t = [];
      for (const c of hand) if (isSuit(S, c, suit, { flushCalc: true })) t.push(c);
      if (t.length >= need) { ret.push(t); return ret; }
    }
    return ret;
  }

  function getStraight(S, hand) {
    const ret = [];
    const fourF = S.flags.fourFingers;
    const need = 5 - (fourF ? 1 : 0);
    if (hand.length > 5 || hand.length < need) return ret;
    const IDS = {};
    for (const c of hand) {
      const id = cardId(c);
      if (id > 1 && id < 15) {
        if (!IDS[id]) IDS[id] = [];
        IDS[id].push(c);
      }
    }
    let len = 0, straight = false;
    const canSkip = S.flags.shortcut;
    let skipped = false;
    let t = [];
    for (let j = 1; j <= 14; j++) {
      const id = j === 1 ? 14 : j;
      if (IDS[id]) {
        len++; skipped = false;
        for (const c of IDS[id]) t.push(c);
      } else if (canSkip && !skipped && j !== 14) {
        skipped = true;
      } else {
        len = 0; skipped = false;
        if (!straight) t = [];
        if (straight) break;
      }
      if (len >= need) straight = true;
    }
    if (!straight) return ret;
    ret.push(t);
    return ret;
  }

  function getHighest(hand) {
    if (!hand.length) return [];
    let highest = null;
    for (const v of hand) if (!highest || getNominal(v) > getNominal(highest)) highest = v;
    return [[highest]];
  }

  // evaluate_poker_hand (misc_functions.lua:376-520)
  function evaluatePokerHand(S, hand) {
    const results = {};
    for (const h of BC.HAND_ORDER) results[h] = [];
    results.top = null;

    const p = {
      _5: getXsame(5, hand),
      _4: getXsame(4, hand),
      _3: getXsame(3, hand),
      _2: getXsame(2, hand),
      _flush: getFlush(S, hand),
      _straight: getStraight(S, hand),
      _highest: getHighest(hand)
    };
    const nonEmpty = (x) => x.length > 0;
    const setTop = (name) => { if (!results.top) results.top = results[name]; };

    if (nonEmpty(p._5) && nonEmpty(p._flush)) { results['Flush Five'] = p._5; setTop('Flush Five'); }
    if (nonEmpty(p._3) && nonEmpty(p._2) && nonEmpty(p._flush)) {
      results['Flush House'] = [p._3[0].concat(p._2[0])]; setTop('Flush House');
    }
    if (nonEmpty(p._5)) { results['Five of a Kind'] = p._5; setTop('Five of a Kind'); }
    if (nonEmpty(p._flush) && nonEmpty(p._straight)) {
      const ret = [];
      for (const v of p._flush[0]) ret.push(v);
      for (const v of p._straight[0]) {
        let inStraight = false;
        for (const vv of p._flush[0]) if (vv === v) inStraight = true;
        if (!inStraight) ret.push(v);
      }
      results['Straight Flush'] = [ret]; setTop('Straight Flush');
    }
    if (nonEmpty(p._4)) { results['Four of a Kind'] = p._4; setTop('Four of a Kind'); }
    if (nonEmpty(p._3) && nonEmpty(p._2)) {
      results['Full House'] = [p._3[0].concat(p._2[0])]; setTop('Full House');
    }
    if (nonEmpty(p._flush)) { results['Flush'] = p._flush; setTop('Flush'); }
    if (nonEmpty(p._straight)) { results['Straight'] = p._straight; setTop('Straight'); }
    if (nonEmpty(p._3)) { results['Three of a Kind'] = p._3; setTop('Three of a Kind'); }
    if (p._2.length === 2 || (p._3.length === 1 && p._2.length === 1)) {
      let a = p._2[0], b = p._2[1];
      if (!b) b = p._3[0];
      results['Two Pair'] = [a.concat(b)]; setTop('Two Pair');
    }
    if (nonEmpty(p._2)) { results['Pair'] = p._2; setTop('Pair'); }
    if (nonEmpty(p._highest)) { results['High Card'] = p._highest; setTop('High Card'); }

    // 覆盖修正 (misc_functions.lua:507-517)：Lua {g,nil,nil,nil} === {g}
    if (results['Five of a Kind'].length) results['Four of a Kind'] = results['Five of a Kind'];
    if (results['Four of a Kind'].length) results['Three of a Kind'] = results['Four of a Kind'];
    if (results['Three of a Kind'].length) results['Pair'] = results['Three of a Kind'];

    return results;
  }
  BC.evaluatePokerHand = evaluatePokerHand;

  // get_poker_hand_info (state_events.lua:540-568)
  BC.getHandInfo = function (S, played) {
    const pokerHands = evaluatePokerHand(S, played);
    let text = null, scoringHand = [];
    for (const h of BC.HAND_ORDER) {
      if (pokerHands[h].length) { text = h; scoringHand = pokerHands[h][0]; break; }
    }
    let disp = text;
    if (text === 'Straight Flush' && scoringHand.length) {
      let min = 10;
      for (const c of scoringHand) if (cardId(c) < min) min = cardId(c);
      if (min >= 10) disp = 'Royal Flush';
    }
    return { text, disp, pokerHands, scoringHand };
  };
})(typeof window !== 'undefined' ? window : globalThis);
