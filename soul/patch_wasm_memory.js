// 把 immolate.wasm 的 memory 上限从 258 页(16MB) 放开到 32768 页(2GB)，
// 使 JS 侧的 emscripten_resize_heap 实现能真正 grow（否则 4000 条/底注必 OOM）。
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'immolate.wasm');
const b = fs.readFileSync(file);

function lebAt(buf, pos) {
  let r = 0, s = 0, x, i = pos;
  do { x = buf[i++]; r |= (x & 127) << s; s += 7; } while (x & 128);
  return { val: r, next: i };
}
function enc(v) {
  const out = [];
  do { let d = v & 127; v >>>= 7; if (v) d |= 128; out.push(d); } while (v);
  return Buffer.from(out);
}

const MAX_PAGES = 32768; // 2GB（emscripten 32 位指针的安全上限）
let i = 8;
const parts = [b.slice(0, 8)]; // \0asm + version
let patched = false;
while (i < b.length) {
  const id = b[i];
  let p = lebAt(b, i + 1);
  const size = p.val, start = p.next, end = start + size;
  const payload = b.slice(start, end);
  if (id === 5) {
    const q = lebAt(payload, 0);
    if (q.val !== 1) throw new Error('unexpected memory count ' + q.val);
    const fl = payload[q.next];
    const ini = lebAt(payload, q.next + 1);
    const oldMax = lebAt(payload, ini.next);
    console.log('memory: flags=' + fl + ' initial=' + ini.val + ' oldMax=' + oldMax.val + ' nextByte=' + payload[oldMax.next]);
    if (oldMax.next !== payload.length) throw new Error('memory payload not fully consumed');
    if (ini.val > MAX_PAGES) throw new Error('initial > max');
    const np = Buffer.concat([enc(q.val), Buffer.from([fl]), enc(ini.val), enc(MAX_PAGES)]);
    parts.push(Buffer.from([id]), enc(np.length), np);
    patched = true;
    console.log('patched max -> ' + MAX_PAGES + ' pages (' + (MAX_PAGES * 64 / 1024) + ' MB)');
  } else {
    parts.push(b.slice(i, end));
  }
  i = end;
}
if (!patched) throw new Error('memory section not found');
const out = Buffer.concat(parts);
if (out[0] !== 0 || out[1] !== 0x61 || out[2] !== 0x73 || out[3] !== 0x6d) throw new Error('bad magic');
fs.writeFileSync(file, out);
console.log('wrote', file, out.length, 'bytes (was', b.length + ')');
