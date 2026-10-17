(function (G) {
  const BC = (G.BC = G.BC || {});

  BC.fmtSci = function (n) {
    if (n === undefined || n === null || !isFinite(n)) return String(n);
    const a = Math.abs(n);
    if (a < 1e6) return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
    return n.toExponential(2).replace('e+', 'e');
  };

  function superscript(n) {
    const map = {
      '0': '\u2070', '1': '\u00b9', '2': '\u00b2', '3': '\u00b3', '4': '\u2074',
      '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079',
      '.': '\u00b7', '-': '\u207b'
    };
    return String(n).split('').map((c) => map[c] || c).join('');
  }

  function normLabel(label) {
    let lab = String(label);
    lab = lab.replace(/\[[^\]]*\]\s*/g, '');
    lab = lab.replace(/\u91cd\u89e6\u53d1\d+(\([^)]*\))?\s*/g, '');
    lab = lab.replace(/\s+/g, ' ').trim();
    return lab;
  }

  function mergeTrace(trace) {
    const map = new Map();
    const order = [];
    for (const t of trace) {
      if (t.tag === '\u6700\u7ec8') continue;
      const clean = normLabel(t.label);
      const key = t.tag + '\u0000' + clean;
      const g = map.get(key);
      if (g) {
        g.count++;
        g.chips = t.chips;
        g.mult = t.mult;
      } else {
        const item = { tag: t.tag, label: clean, count: 1, chips: t.chips, mult: t.mult };
        map.set(key, item);
        order.push(item);
      }
    }
    return order;
  }

  function parseStep(label) {
    let m = label.match(/[\u00d7x]\s*([0-9.]+)/);
    if (m) return { kind: 'x', v: parseFloat(m[1]) };
    m = label.match(/\+([0-9.]+)/);
    if (m) return { kind: '+', v: parseFloat(m[1]) };
    return null;
  }

  BC.formatResult = function (sc) {
    const r = sc.main;
    const lines = [];
    if (r.invalid) {
      lines.push('\u274c \u65e0\u6548\uff1a' + r.invalid);
      return lines;
    }
    const zhHand = (BC.NAMES && BC.NAMES.poker_hands[r.handType]) || r.disp || r.handType;
    lines.push(`\u724c\u578b\uff1a${zhHand}\u3000Lv.${BC.fmtSci(r.level)}`);
    lines.push('');
    lines.push(`\u2500\u2500 \u89e6\u53d1 \u2500\u2500`);
    const groups = mergeTrace(r.trace);
    for (const g of groups) {
      let detail = '';
      if (g.count > 1) {
        const step = parseStep(g.label);
        if (step && step.kind === 'x') {
          const eff = Math.pow(step.v, g.count);
          detail = `\uff08\u89e6\u53d1${g.count}\u6b21 \u2192 \u7b49\u6548\u00d7${fmt2(eff)} = ${step.v}${superscript(g.count)}\uff09`;
        } else if (step && step.kind === '+') {
          const total = step.v * g.count;
          detail = `\uff08\u89e6\u53d1${g.count}\u6b21 \u2192 \u5408\u8ba1+${fmt2(total)}\uff09`;
        } else {
          detail = `\uff08\u89e6\u53d1${g.count}\u6b21\uff09`;
        }
      }
      lines.push(`[${g.tag}] ${g.label}${detail}`);
    }
    lines.push('');
    lines.push(`\u7ed3\u679c\uff1a${BC.fmtSci(r.score)}`);
    lines.push(`\u7b79\u7801 ${BC.fmtSci(r.chips)} \u00d7 \u500d\u7387 ${BC.fmtSci(r.mult)}`);
    if (sc.hasRng) {
      lines.push(`\u968f\u673a\u533a\u95f4\uff1a${BC.fmtSci(sc.min)} \uff5e ${BC.fmtSci(sc.max)}`);
      lines.push('\u203b \u4e3b\u503c=\u671f\u671b\u8fd1\u4f3c\uff1b\u5e78\u8fd0/\u8840\u77f3/\u592a\u7a7a\u6309\u671f\u671b\u6298\u7b97\uff0c\u73bb\u7483\u788e\u88c2\u4e0d\u5f71\u54cd\u672c\u624b\u3002');
    }
    return lines;
  };

  function fmt2(n) {
    if (n === undefined || n === null) return '-';
    if (Number.isInteger(n)) return String(n);
    if (Math.abs(n) >= 1e6) return BC.fmtSci(n);
    return String(Number(n.toFixed(4)));
  }
  BC.fmt2 = fmt2;
  BC.superscript = superscript;
})(typeof window !== 'undefined' ? window : globalThis);
