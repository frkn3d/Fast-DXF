// Kaydetme motoru testi: düzenle → kaydet → yeniden ayrıştır → doğrula
// Kullanım: node tests/test_save.js girdi.dxf cikti.dxf
const fs = require('fs');
const path = require('path');
const { parseFile, core } = require('./test_parse.js');

const inp = process.argv[2], outp = process.argv[3];
const A = parseFile(inp);
const d = A.done;
// varlık dizilerini birleştir
const cat = (k, T) => { const n = A.entArr.reduce((s, e) => s + e[k].length, 0); const r = new T(n); let o = 0; for (const e of A.entArr) { r.set(e[k], o); o += e[k].length; } return r; };
const type = cat('type', Uint8Array), fsA = cat('fs', Float64Array), feA = cat('fe', Float64Array), bb = cat('bb', Float32Array);
const N = type.length;
const byType = {};
for (let i = 0; i < N; i++) (byType[core.TYPE_NAMES[type[i]]] = byType[core.TYPE_NAMES[type[i]]] || []).push(i);
console.log('varlık', N, Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])));

const ops = [], copies = [];
const pick = (t, from, n) => (byType[t] || []).slice(from, from + n);
const moved = pick('LINE', 0, 300).concat(pick('LWPOLYLINE', 0, 100), pick('TEXT', 0, 100), pick('INSERT', 0, 20), pick('POLYLINE', 0, 20), pick('CIRCLE', 0, 20));
for (const i of moved) ops.push({ fs: fsA[i], fe: feA[i], kind: 'patch', ed: { T: [1, 0, 0, 1, 10, 20, 1, 0] } });
const deleted = pick('LINE', 300, 300).concat(pick('POINT', 0, 200));
for (const i of deleted) ops.push({ fs: fsA[i], fe: feA[i], kind: 'del' });
for (const i of pick('LINE', 600, 50)) ops.push({ fs: fsA[i], fe: feA[i], kind: 'patch', ed: { aci: 1 } });
for (const i of pick('LWPOLYLINE', 100, 50)) ops.push({ fs: fsA[i], fe: feA[i], kind: 'patch', ed: { layer: 'YENİ_KATMAN_ŞĞÜ' === 'x' ? '' : '0', aci: 256 } });
const copied = pick('LWPOLYLINE', 200, 10).concat(pick('TEXT', 200, 10), pick('INSERT', 30, 5), pick('POLYLINE', 30, 5), pick('LINE', 700, 10));
for (const i of copied) copies.push({ fs: fsA[i], fe: feA[i], ed: { T: [1, 0, 0, 1, 100, -50, 1, 0] } });
const ox = d.origin[0], oy = d.origin[1];
const news = [
  { type: 'LINE', layer: '0', aci: 2, x1: ox, y1: oy, x2: ox + 100, y2: oy + 100 },
  { type: 'LWPOLYLINE', layer: '0', xs: [ox, ox + 50, ox + 50], ys: [oy, oy, oy + 50], bs: [0, 0.5, 0], closed: true, elev: 12 },
  { type: 'CIRCLE', layer: '0', aci: 3, cx: ox + 20, cy: oy + 20, r: 7.5 },
  { type: 'ARC', layer: '0', cx: ox + 40, cy: oy + 20, r: 5, a0: 30, a1: 200 },
  { type: 'ELLIPSE', layer: '0', cx: ox + 60, cy: oy + 20, mx: 8, my: 2, ratio: 0.4 },
  { type: 'SPLINE', layer: '0', xs: [ox, ox + 10, ox + 20, ox + 30], ys: [oy + 40, oy + 50, oy + 40, oy + 50], zs: [0, 1, 2, 3], deg: 3 },
  { type: 'POINT', layer: '0', x: ox + 5, y: oy + 5, z: 100 },
  { type: 'TEXT', layer: '0', x: ox, y: oy - 10, h: 2.5, rot: 15, str: 'Deneme ŞĞÜİıöç' }
].map(def => ({ def, ed: { T: [0, -1, 1, 0, ox + oy, oy - ox, 1, 5] } }));  // yeni nesneler 90° döndürülmüş + Z 5
const fd = fs.openSync(inp, 'r');
const read = (a, b) => { const buf = Buffer.allocUnsafe(b - a); fs.readSync(fd, buf, 0, b - a, a); return new Uint8Array(buf.buffer, buf.byteOffset, b - a); };
const t0 = Date.now();
const res = core.buildSaveParts(read, {
  size: A.size, mode: 'full', encoding: d.encoding, eol: d.eol, version: d.version, owner: d.modelHandle,
  handseed: d.handseed, handseedHex: d.handseedHex, entStart: d.entStart, entEnd: d.entEnd, ops, copies, news
});
console.log('plan parça', res.parts.length, 'yeni tutamaç', res.allocated, (Date.now() - t0) + ' ms');
const out = fs.openSync(outp, 'w');
for (const p of res.parts) {
  if (Array.isArray(p)) { let a = p[0]; while (a < p[1]) { const n = Math.min(64 << 20, p[1] - a); fs.writeSync(out, Buffer.from(read(a, a + n))); a += n; } }
  else fs.writeSync(out, Buffer.from(p.buffer, p.byteOffset, p.length));
}
fs.closeSync(out); fs.closeSync(fd);
console.log('yazıldı', (Date.now() - t0) + ' ms', fs.statSync(outp).size, 'bayt');

const B = parseFile(outp);
const bt = {}; for (const e of B.entArr) for (const t of e.type) bt[core.TYPE_NAMES[t]] = (bt[core.TYPE_NAMES[t]] || 0) + 1;
const exp = N - deleted.length + copied.length + news.length;
const nb = B.entArr.reduce((s, e) => s + e.type.length, 0);
console.log('yeniden ayrıştırma: varlık', nb, 'beklenen', exp, nb === exp ? 'TAMAM' : 'HATA', bt);
console.log('handseed', d.handseedHex, '->', B.done.handseedHex);
// Taşınan ilk çizginin sınır kutusu 10,20 kaymış olmalı (silinenlerden önce geldiği için aynı sırada)
const bb2 = (() => { const r = new Float32Array(4); const e = B.entArr[0]; return e; })();
const i0 = moved[0];
let j0 = -1; for (let i = 0, k = 0; i < N; i++) { if (deleted.includes(i)) continue; if (i === i0) { j0 = k; break; } k++; }
const bbB = B.entArr[0].bb;
console.log('ilk taşınan çizgi kutusu önce', Array.from(bb.slice(4 * i0, 4 * i0 + 4)).map(v => (v + 0).toFixed(3)).join(','), ' sonra', Array.from(bbB.slice(4 * j0, 4 * j0 + 4)).map(v => (v + 0).toFixed(3)).join(','));
