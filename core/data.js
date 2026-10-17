(function (G) {
  const BC = (G.BC = G.BC || {});

  BC.HAND_ORDER = ['Flush Five','Flush House','Five of a Kind','Straight Flush','Four of a Kind','Full House','Flush','Straight','Three of a Kind','Two Pair','Pair','High Card'];

  // game.lua:2002-2013
  BC.HAND_BASE = {
    'Flush Five':      { s_chips:160, s_mult:16, l_chips:50, l_mult:3 },
    'Flush House':     { s_chips:140, s_mult:14, l_chips:40, l_mult:4 },
    'Five of a Kind':  { s_chips:120, s_mult:12, l_chips:35, l_mult:3 },
    'Straight Flush':  { s_chips:100, s_mult:8,  l_chips:40, l_mult:4 },
    'Four of a Kind':  { s_chips:60,  s_mult:7,  l_chips:30, l_mult:3 },
    'Full House':      { s_chips:40,  s_mult:4,  l_chips:25, l_mult:2 },
    'Flush':           { s_chips:35,  s_mult:4,  l_chips:15, l_mult:2 },
    'Straight':        { s_chips:30,  s_mult:4,  l_chips:30, l_mult:3 },
    'Three of a Kind': { s_chips:30,  s_mult:3,  l_chips:20, l_mult:2 },
    'Two Pair':        { s_chips:20,  s_mult:2,  l_chips:20, l_mult:1 },
    'Pair':            { s_chips:10,  s_mult:2,  l_chips:15, l_mult:1 },
    'High Card':       { s_chips:5,   s_mult:1,  l_chips:10, l_mult:1 }
  };

  // card.lua:122-134  2-10 面值，J/Q/K=10，A=11
  BC.RANK_CHIPS = { 2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,11:10,12:10,13:10,14:11 };
  BC.RANK_FACE_NOMINAL = { 11:0.1, 12:0.2, 13:0.3, 14:0.4 };
  BC.SUIT_NOMINAL = { D:0.01, C:0.02, H:0.03, S:0.04 };
  BC.SUITS = ['S','H','C','D'];
  BC.SUIT_ZH = { S:'黑桃', H:'红桃', C:'梅花', D:'方片' };
  BC.SUIT_SYM = { S:'♠', H:'♥', C:'♣', D:'♦' };
  BC.SUIT_LONG = { S:'Spades', H:'Hearts', C:'Clubs', D:'Diamonds' };
  BC.SUIT_SHORT = { Spades:'S', Hearts:'H', Clubs:'C', Diamonds:'D' };
  BC.suitLong = function (s) { return BC.SUIT_LONG[s] || s; };
  BC.suitShort = function (s) { return BC.SUIT_SHORT[s] || s; };
  BC.RANK_LABEL = {2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A'};

  BC.ENH_KEYS = ['none','bonus','mult','wild','glass','steel','stone','gold','lucky'];
  BC.ED_KEYS = ['base','foil','holo','poly','negative'];
  BC.SEAL_KEYS = ['none','red','gold','blue','purple'];

  BC.ENH_ZH = { none:'无', bonus:'奖励', mult:'倍率', wild:'万能', glass:'玻璃', steel:'钢铁', stone:'石头', gold:'黄金', lucky:'幸运' };
  BC.ED_ZH = { base:'无', foil:'烫金', holo:'全息', poly:'多彩', negative:'负片' };
  BC.SEAL_ZH = { none:'无', red:'红', gold:'金', blue:'蓝', purple:'紫' };

  // Boss：影响单手计分/合法性的（blind.lua / game.lua G.P_BLINDS）
  BC.BOSS_LIST = [
    { key:'none',     zh:'无 Boss' },
    { key:'club',     zh:'The Club 梅花减益' },
    { key:'goad',     zh:'The Goad 黑桃减益' },
    { key:'head',     zh:'The Head 红桃减益' },
    { key:'window',   zh:'The Window 方片减益' },
    { key:'plant',    zh:'The Plant 人头牌减益' },
    { key:'leaf',     zh:'Verdant Leaf 非小丑全减益' },
    { key:'heart',    zh:'Crimson Heart 随机1个小丑减益' },
    { key:'flint',    zh:'The Flint 基础筹码/倍率减半' },
    { key:'psychic',  zh:'The Psychic 必须打5张' },
    { key:'eye',      zh:'The Eye 牌型不可重复' },
    { key:'mouth',    zh:'The Mouth 整轮只允许一种牌型' },
    { key:'arm',      zh:'The Arm 牌型等级-1' }
  ];

  BC.PLANET_HANDS = [
    ['c_pluto','High Card'],['c_mercury','Pair'],['c_venus','Three of a Kind'],
    ['c_earth','Full House'],['c_mars','Four of a Kind'],['c_jupiter','Flush'],
    ['c_saturn','Straight'],['c_uranus','Two Pair'],['c_neptune','Straight Flush'],
    ['c_planet_x','Five of a Kind'],['c_ceres','Flush House'],['c_eris','Flush Five']
  ];

  BC.deepClone = function (o) {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(BC.deepClone);
    const r = {};
    for (const k of Object.keys(o)) r[k] = BC.deepClone(o[k]);
    return r;
  };

  BC.makeCard = function (rank, suit, enh, edition, seal) {
    return {
      uid: (BC._uid = (BC._uid || 0) + 1),
      rank: rank, suit: suit,
      enh: enh || 'none',
      edition: edition || 'base',
      seal: seal || 'none',
      perma: 0,
      userDebuff: false
    };
  };

  BC.makeJoker = function (key, edition) {
    return { key: key, edition: edition || 'base', disabled: false, debuffed: false, val: undefined, opts: {} };
  };
})(typeof window !== 'undefined' ? window : globalThis);
