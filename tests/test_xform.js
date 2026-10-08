// Dönüşüm yaması testi: tüm nesneleri T ile yamala → yeniden oku → köşeler/bloklar/yazılar T(orijinal) ile aynı mı?
// Kullanım: node tests/test_xform.js girdi.dxf [cikti_klasoru]
'use strict';
const fs = require('fs');
const path = require('path');
const DXFCore = require('../js/dxf-core.js');
const core = DXFCore();

function parse(bytes) {
  const out = { chunks: [], E: { type: [], vs: [], vc: [], flags: [], chunk: [], is: [], ic: [], ts: [], tc: [], fs: [], fe: [], rs: [], rc: [] }, TX: { x: [], y: [], z: [], h: [], r: [], ent: [], str: [] }, IN: { m: [], z: [], ent: [] }, info: null };
  core.parseStream((o, l) => bytes.subarray(o, o + l), bytes.length, {}, (type, d) => {
    if (type === 'chunk') out.chunks[d.idx] = d;
    else if (type === 'ents') for (const k in out.E) for (let i = 0; i < d[k].length; i++) out.E[k].push(d[k][i]);
    else if (type === 'texts') { for (const k of ['x', 'y', 'z', 'h', 'r', 'ent']) for (let i = 0; i < d[k].length; i++) out.TX[k].push(d[k][i]); out.TX.str.push(...d.str); }
    else if (type === 'inst') { for (let i = 0; i < d.blk.length; i++) { out.IN.m.push(Array.from(d.m.slice(6 * i, 6 * i + 6))); out.IN.z.push([d.z[2 * i], d.z[2 * i + 1]]); out.IN.ent.push(d.ent[i]); } }
    else if (type === 'done') out.info = d;
  });
  return out;
}
// varlığın mutlak köşeleri (çizgi + nokta + üçgen)
function verts(P, id) {
  const E = P.E, ch = P.chunks[E.chunk[id]], o = P.info.origin, res = [];
  if (!ch) return res;
  const pts = (E.flags[id] & 16) !== 0;
  const A = pts ? ch.ppos : ch.pos, Z = pts ? ch.pz : ch.z;
  for (let v = E.vs[id]; v < E.vs[id] + E.vc[id]; v++) res.push([A[2 * v] + o[0], A[2 * v + 1] + o[1], Z[v]]);
  for (let v = E.rs[id]; v < E.rs[id] + E.rc[id]; v++) res.push([ch.tpos[2 * v] + o[0], ch.tpos[2 * v + 1] + o[1], ch.tz[v]]);
  return res;
}
// Şekil karşılaştırması: her iki yöndeki en büyük nokta–polyline uzaklığı, kutunun %0,3'ü içinde mi?
function hausdorffOk(va, vb, points) {
  if (!va.length || !vb.length) return va.length === vb.length;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of va) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const tol = Math.max(1e-3, 0.003 * Math.hypot(x1 - x0, y1 - y0));
  const dist = (p, S) => {
    let best = Infinity;
    if (points) { for (const q of S) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])); return best; }
    for (let i = 0; i + 1 < S.length; i += 2) {
      const a = S[i], b = S[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz;
      let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy, p[2] - a[2] - t * dz));
    }
    return best;
  };
  for (const p of va) if (dist(p, vb) > tol) return false;
  for (const p of vb) if (dist(p, va) > tol) return false;
  return true;
}
const key = (p, q) => p.map(v => Math.round(v / q)).join(',');

function run(file, name, T, outDir) {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const A = parse(bytes), info = A.info, dec = new TextDecoder(info.encoding);
  const n = A.E.type.length;
  const ops = [];
  for (let id = 0; id < n; id++) {
    const t = core.TYPE_NAMES[A.E.type[id]];
    if (t === 'DIMENSION' || t === 'ACAD_TABLE') continue;
    if (T.mir && t === 'HATCH') continue;
    ops.push({ fs: A.E.fs[id], fe: A.E.fe[id], kind: 'patch', ed: { T: T.T } });
  }
  const msg = { size: bytes.length, mode: 'full', encoding: info.encoding, eol: info.eol, version: info.version, owner: info.modelHandle,
    handseed: info.handseed, handseedHex: info.handseedHex, entStart: info.entStart, entEnd: info.entEnd, ops, copies: [], news: [] };
  const res = core.buildSaveParts((a, b) => bytes.subarray(a, b), msg);
  const parts = res.parts.map(p => Array.isArray(p) ? bytes.subarray(p[0], p[1]) : p);
  const total = parts.reduce((s, p) => s + p.length, 0), outB = new Uint8Array(total); let k = 0; for (const p of parts) { outB.set(p, k); k += p.length; }
  if (outDir) fs.writeFileSync(path.join(outDir, path.basename(file, '.dxf') + '_' + name + '.dxf'), outB);
  const B = parse(outB);
  const [a, b, c, d, e, f, zs, zt] = T.T, X = core.xfMake(T.T);
  const tr = (p) => [a * p[0] + b * p[1] + e, c * p[0] + d * p[1] + f, zs * p[2] + zt];
  const skip = new Set(ops.map(o => o.fs));
  let bad = 0, checked = 0, vtot = 0; const badTypes = {};
  const span = Math.max(1, Math.abs(e) + Math.abs(f)), q = 1e-6 * Math.max(1, Math.hypot(info.origin[0], info.origin[1])) * 20 + 1e-4;
  for (let id = 0; id < n; id++) {
    if (!skip.has(A.E.fs[id])) continue;
    const va = verts(A, id).map(tr), vb = verts(B, id);
    checked++; vtot += va.length;
    const ka = va.map(p => key(p, q * 10)).sort(), kb = vb.map(p => key(p, q * 10)).sort();
    let ok = va.length === vb.length;
    if (!ok || true) {
      // sıradan bağımsız karşılaştırma: her köşe için en yakın eş
      const sa = va.slice().sort((u, v) => u[0] - v[0] || u[1] - v[1]), sb = vb.slice().sort((u, v) => u[0] - v[0] || u[1] - v[1]);
      for (let i = 0; i < sa.length && ok; i++) {
        let best = Infinity; for (let j = Math.max(0, i - 8); j < Math.min(sb.length, i + 9); j++) best = Math.min(best, Math.hypot(sa[i][0] - sb[j][0], sa[i][1] - sb[j][1], sa[i][2] - sb[j][2]));
        if (best > q * 50) ok = false;
      }
    }
    if (!ok) ok = hausdorffOk(va, vb, (E => E.flags[id] & 16)(A.E));
    if (!ok) { bad++; const t = core.TYPE_NAMES[A.E.type[id]]; badTypes[t] = (badTypes[t] || 0) + 1; if (bad <= 3) console.log('   UYUMSUZ', t, 'köşe', va.length, vb.length, JSON.stringify(va.slice(0, 2)), JSON.stringify(vb.slice(0, 2))); }
  }
  // blok referansları
  let ibad = 0;
  const skipIds = new Set(); for (let id = 0; id < n; id++) if (!skip.has(A.E.fs[id])) skipIds.add(id);
  for (let i = 0; i < A.IN.m.length; i++) {
    if (skipIds.has(A.IN.ent[i])) continue;
    const m = A.IN.m[i], o1 = A.info.origin, o2 = B.info.origin;
    const tx = m[2] + o1[0], ty = m[5] + o1[1];
    const ex = [a * m[0] + b * m[3], a * m[1] + b * m[4], a * tx + b * ty + e - o2[0], c * m[0] + d * m[3], c * m[1] + d * m[4], c * tx + d * ty + f - o2[1]];
    const g = B.IN.m[i];
    if (!g || ex.some((v, j) => Math.abs(v - g[j]) > 1e-3 * Math.max(1, Math.abs(v)))) { ibad++; if (ibad <= 2) console.log('   BLOK UYUMSUZ', JSON.stringify(ex.map(v => +v.toFixed(4))), JSON.stringify(g && g.map(v => +v.toFixed(4)))); }
    const ez = [zs * A.IN.z[i][0], zs * A.IN.z[i][1] + zt];
    if (g && (Math.abs(ez[0] - B.IN.z[i][0]) > 1e-4 || Math.abs(ez[1] - B.IN.z[i][1]) > 1e-3)) { ibad++; }
  }
  // yazılar
  let tbad = 0;
  for (let i = 0; i < A.TX.x.length; i++) {
    if (skipIds.has(A.TX.ent[i])) continue;
    const o1 = A.info.origin, o2 = B.info.origin;
    const p = tr([A.TX.x[i] + o1[0], A.TX.y[i] + o1[1], A.TX.z[i]]);
    const okp = Math.abs(p[0] - (B.TX.x[i] + o2[0])) < q * 50 && Math.abs(p[1] - (B.TX.y[i] + o2[1])) < q * 50 && Math.abs(p[2] - B.TX.z[i]) < 1e-3;
    const okh = Math.abs(A.TX.h[i] * X.sc - B.TX.h[i]) < 1e-4 * Math.max(1, B.TX.h[i]);
    if (!okp || !okh) { tbad++; if (tbad <= 3) console.log('   YAZI UYUMSUZ', JSON.stringify(A.TX.str[i]), p.map(v => +v.toFixed(3)), [B.TX.x[i] + o2[0], B.TX.y[i] + o2[1], B.TX.z[i]].map(v => +v.toFixed(3)), A.TX.h[i] * X.sc, B.TX.h[i]); }
  }
  console.log(name.padEnd(10), 'varlık', checked, 'köşe', vtot, 'uyumsuz', bad, JSON.stringify(badTypes), '· blok', A.IN.m.length, 'uyumsuz', ibad, '· yazı', A.TX.x.length, 'uyumsuz', tbad, '· eklenen tutamaç', res.allocated);
  return bad + ibad + tbad;
}

const file = process.argv[2], outDir = process.argv[3];
const r = 30 * Math.PI / 180, s = 1.5;
const cases = [
  { name: 'oteleme', T: [1, 0, 0, 1, 123.25, -45.5, 1, 0] },
  { name: 'z', T: [1, 0, 0, 1, 0, 0, 2, 10] },
  { name: 'dondur', T: [Math.cos(r), -Math.sin(r), Math.sin(r), Math.cos(r), 1000, 2000, 1, 0] },
  { name: 'olcek', T: [s, 0, 0, s, -50, 25, s, 0] },
  { name: 'ayna', T: [-Math.cos(r), Math.sin(r), Math.sin(r), Math.cos(r), 10, 0, 1, 0], mir: true }
];
let fail = 0;
for (const cse of (process.argv[4] ? cases.filter(c => c.name === process.argv[4]) : cases)) fail += run(file, cse.name, cse, outDir);
console.log(fail ? 'HATA VAR' : 'TAMAM');
