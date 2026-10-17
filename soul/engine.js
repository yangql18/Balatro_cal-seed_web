// 查种器核心：调用 Immolate(WASM) 生成种子分析文本（格式与 TheSoul 原站一致）
// 可在浏览器与 Node 中运行（测试用），不依赖 DOM。
(function (G) {
  const SOUL = (G.SOUL = G.SOUL || {});

  // 与 TheSoul 原站一致的 61 个可解锁项（顺序即解锁开关顺序）
  SOUL.OPTIONS = [
    'Negative Tag', 'Foil Tag', 'Holographic Tag', 'Polychrome Tag', 'Rare Tag',
    'Golden Ticket', 'Mr. Bones', 'Acrobat', 'Sock and Buskin', 'Swashbuckler',
    'Troubadour', 'Certificate', 'Smeared Joker', 'Throwback', 'Hanging Chad',
    'Rough Gem', 'Bloodstone', 'Arrowhead', 'Onyx Agate', 'Glass Joker',
    'Showman', 'Flower Pot', 'Blueprint', 'Wee Joker', 'Merry Andy',
    'Oops! All 6s', 'The Idol', 'Seeing Double', 'Matador', 'Hit the Road',
    'The Duo', 'The Trio', 'The Family', 'The Order', 'The Tribe',
    'Stuntman', 'Invisible Joker', 'Brainstorm', 'Satellite', 'Shoot the Moon',
    "Driver's License", 'Cartomancer', 'Astronomer', 'Burnt Joker', 'Bootstraps',
    'Overstock Plus', 'Liquidation', 'Glow Up', 'Reroll Glut', 'Omen Globe',
    'Observatory', 'Nacho Tong', 'Recyclomancy', 'Tarot Tycoon', 'Planet Tycoon',
    'Money Tree', 'Antimatter', 'Illusion', 'Petroglyph', 'Retcon', 'Palette'
  ];

  // 原站分析前先锁定的 16 张升级类优惠券（配合解锁开关逐步放行）
  SOUL.INITIAL_VOUCHERS = [
    'Overstock Plus', 'Liquidation', 'Glow Up', 'Reroll Glut', 'Omen Globe',
    'Observatory', 'Nacho Tong', 'Recyclomancy', 'Tarot Tycoon', 'Planet Tycoon',
    'Money Tree', 'Antimatter', 'Illusion', 'Petroglyph', 'Retcon', 'Palette'
  ];

  // opt: { seed, ante, cards:number[], deck, stake, version, selected:boolean[] }
  SOUL.buildOutput = function (opt) {
    const seed = String(opt.seed || '').toUpperCase().replace(/0/g, 'O');
    const ante = Math.max(1, Math.min(999, parseInt(opt.ante, 10) || 8));
    const cards = opt.cards || [];
    const deck = opt.deck || 'Plasma Deck';
    const stake = opt.stake || 'White Stake';
    const version = parseInt(opt.version, 10) || 10106;
    const selected = opt.selected || SOUL.OPTIONS.map(() => true);

    if (!G.Immolate || !G.Immolate.Instance) throw new Error('Immolate 引擎未就绪');

    let out = '';
    const inst = new G.Immolate.Instance(seed);
    inst.params = new G.Immolate.InstParams(deck, stake, false, version);
    inst.initLocks(1, false, false);
    SOUL.INITIAL_VOUCHERS.forEach((v) => inst.lock(v));
    for (let i = 0; i < SOUL.OPTIONS.length; i++) {
      if (selected[i] === false) inst.lock(SOUL.OPTIONS[i]);
    }
    inst.setStake(stake);
    inst.setDeck(deck);
    const ghostDeck = deck === 'Ghost Deck';
    void ghostDeck;

    for (let a = 1; a <= ante; a++) {
      inst.initUnlocks(a, false);
      out += '==ANTE ' + a + '==\n';
      out += 'Boss: ' + inst.nextBoss(a) + '\n';
      const voucher = inst.nextVoucher(a);
      out += 'Voucher: ' + voucher + '\n';
      inst.lock(voucher);
      for (let i = 0; i < G.Immolate.VOUCHERS.size(); i += 2) {
        if (G.Immolate.VOUCHERS.get(i) === voucher) {
          const nxt = G.Immolate.VOUCHERS.get(i + 1);
          if (selected[SOUL.OPTIONS.indexOf(nxt)]) inst.unlock(nxt);
        }
      }
      out += 'Tags: ' + inst.nextTag(a) + ', ' + inst.nextTag(a) + '\n';

      out += 'Shop Queue: \n';
      const n = cards[a - 1] == null ? 0 : cards[a - 1];
      for (let q = 1; q <= n; q++) {
        out += q + ') ';
        const item = inst.nextShopItem(a);
        if (item.type === 'Joker') {
          if (item.jokerData.stickers.eternal) out += 'Eternal ';
          if (item.jokerData.stickers.perishable) out += 'Perishable ';
          if (item.jokerData.stickers.rental) out += 'Rental ';
          if (item.jokerData.edition !== 'No Edition') out += item.jokerData.edition + ' ';
        }
        out += item.item + '\n';
        item.delete();
      }

      out += '\nPacks: \n';
      const numPacks = a === 1 ? 4 : 6;
      for (let p = 1; p <= numPacks; p++) {
        const pack = inst.nextPack(a);
        out += pack + ' - ';
        const packInfo = G.Immolate.packInfo(pack);
        let cs = null;
        if (packInfo.type === 'Celestial Pack') cs = inst.nextCelestialPack(packInfo.size, a);
        else if (packInfo.type === 'Arcana Pack') cs = inst.nextArcanaPack(packInfo.size, a);
        else if (packInfo.type === 'Spectral Pack') cs = inst.nextSpectralPack(packInfo.size, a);
        else if (packInfo.type === 'Buffoon Pack') cs = inst.nextBuffoonPack(packInfo.size, a);
        else if (packInfo.type === 'Standard Pack') cs = inst.nextStandardPack(packInfo.size, a);
        if (cs) {
          for (let c = 0; c < packInfo.size; c++) {
            if (packInfo.type === 'Buffoon Pack') {
              const joker = cs.get(c);
              if (joker.stickers.eternal) out += 'Eternal ';
              if (joker.stickers.perishable) out += 'Perishable ';
              if (joker.stickers.rental) out += 'Rental ';
              if (joker.edition !== 'No Edition') out += joker.edition + ' ';
              out += joker.joker;
              joker.delete();
            } else if (packInfo.type === 'Standard Pack') {
              const card = cs.get(c);
              if (card.seal !== 'No Seal') out += card.seal + ' ';
              if (card.edition !== 'No Edition') out += card.edition + ' ';
              if (card.enhancement !== 'No Enhancement') out += card.enhancement + ' ';
              const rank = card.base[2];
              out += rank === 'T' ? '10' : rank === 'J' ? 'Jack' : rank === 'Q' ? 'Queen' : rank === 'K' ? 'King' : rank === 'A' ? 'Ace' : rank;
              out += ' of ';
              const suit = card.base[0];
              out += suit === 'C' ? 'Clubs' : suit === 'S' ? 'Spades' : suit === 'D' ? 'Diamonds' : 'Hearts';
              card.delete();
            } else {
              out += cs.get(c);
            }
            out += (c + 1 !== packInfo.size) ? ', ' : '';
          }
          cs.delete();
        }
        out += '\n';
      }
      out += '\n';
    }
    inst.delete();
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
