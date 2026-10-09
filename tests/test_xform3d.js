// 3B dönüşüm yaması testi: tüm nesneleri genel 3B afin M ile yamala → yeniden oku → köşeler M(orijinal) ile aynı şekli veriyor mu?
// Kullanım: node tests/test_xform3d.js girdi.dxf [cikti_klasoru] [durum]
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../js/dxf-core.js')();

function parse(bytes) {
  const out = { chunks: [], E: { type: [], vs: [], vc: [], flags: [], chunk: [], fs: [], fe: [], rs: [], rc: [], is: [], ic: [] }, TX: { x: [], y: [], z: [], h: [], ent: [], str: [] }, IN: { m: [], ent: [], blk: [] }, info: null };
  core.parseStream((o, l) => bytes.subarray(o, o + l), bytes.length, {}, (type, d) => {
    if (type === 'chunk') out.chunks[d.idx] = d;
    else if (type === 'ents') for (const k in out.E) for (let i = 0; i < d[k].length; i++) out.E[k].push(d[k][i]);
    else if (type === 'texts') { for (const k of ['x', 'y', 'z', 'h', 'ent']) for (let i = 0; i < d[k].length; i++) out.TX[k].push(d[k][i]); out.TX.str.push(...d.str); }
    else if (type === 'inst') for (let i = 0; i < d.blk.length; i++) {
      const m = d.m, z = d.z, x = d.x;
      // 3×4: [a b q0 tx; c d q1 ty; q2 q3 sz tz] (tx, ty göreli)
      out.IN.m.push([m[6 * i], m[6 * i + 1], x[4 * i], m[6 * i + 2], m[6 * i + 3], m[6 * i + 4], x[4 * i + 1], m[6 * i + 5], x[4 * i + 2], x[4 * i + 3], z[2 * i], z[2 * i + 1]]);
      out.IN.ent.push(d.ent[i]); out.IN.blk.push(d.blk[i]);
    }
    else if (type === 'done') out.info = d;
  });
  return out;
}
function verts(P, id) {
  const E = P.E, ch = P.chunks[E.chunk[id]], o = P.info.origin, res = [];
  if (!ch) return res;
  const pts = (E.flags[id] & 16) !== 0;
  const A = pts ? ch.ppos : ch.pos, Z = pts ? ch.pz : ch.z;
  for (let v = E.vs[id]; v < E.vs[id] + E.vc[id]; v++) res.push([A[2 * v] + o[0], A[2 * v + 1] + o[1], Z[v]]);
  for (let v = E.rs[id]; v < E.rs[id] + E.rc[id]; v++) res.push([ch.tpos[2 * v] + o[0], ch.tpos[2 * v + 1] + o[1], ch.tz[v]]);
  return res;
}
// iki yönlü en büyük nokta–parça uzaklığı (çizgiler çift çift)
function hausdorff(va, vb, points) {
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
  let h = 0;
  for (const p of va) h = Math.max(h, dist(p, vb));
  for (const p of vb) h = Math.max(h, dist(p, va));
  return h;
}
const mp = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + M[3], M[4] * p[0] + M[5] * p[1] + M[6] * p[2] + M[7], M[8] * p[0] + M[9] * p[1] + M[10] * p[2] + M[11]];

function run(file, name, M, outDir) {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const A = parse(bytes), info = A.info, n = A.E.type.length;
  const ops = [];
  for (let id = 0; id < n; id++) {
    const t = core.TYPE_NAMES[A.E.type[id]];
    if (t === 'DIMENSION' || t === 'ACAD_TABLE') continue;
    ops.push({ fs: A.E.fs[id], fe: A.E.fe[id], kind: 'patch', ed: { T: M } });
  }
  const msg = { size: bytes.length, mode: 'full', encoding: info.encoding, eol: info.eol, version: info.version, owner: info.modelHandle,
    handseed: info.handseed, handseedHex: info.handseedHex, entStart: info.entStart, entEnd: info.entEnd, ops, copies: [], news: [] };
  const res = core.buildSaveParts((a, b) => bytes.subarray(a, b), msg);
  const parts = res.parts.map(p => Array.isArray(p) ? bytes.subarray(p[0], p[1]) : p);
  const outB = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let k = 0; for (const p of parts) { outB.set(p, k); k += p.length; }
  if (outDir) fs.writeFileSync(path.join(outDir, path.basename(file, '.dxf') + '_' + name + '.dxf'), outB);
  const B = parse(outB);
  const patched = new Set(ops.map(o => o.fs));
  let bad = 0, checked = 0; const badTypes = {};
  for (let id = 0; id < n; id++) {
    if (!patched.has(A.E.fs[id])) continue;
    const t = core.TYPE_NAMES[A.E.type[id]];
    if (t === 'INSERT' || t === 'TEXT' || t === 'MTEXT' || t === 'ATTDEF') continue;   // örnek ve yazılar ayrı denetlenir
    const va = verts(A, id).map(p => mp(M, p)), vb = verts(B, id);
    if (!va.length && !vb.length) continue;
    checked++;
    let x0 = Infinity, x1 = -Infinity; for (const p of va) for (let j = 0; j < 3; j++) { x0 = Math.min(x0, p[j]); x1 = Math.max(x1, p[j]); }
    const tol = Math.max(2e-3, 0.004 * (x1 - x0));
    const h = va.length && vb.length ? hausdorff(va, vb, (A.E.flags[id] & 16) !== 0) : Infinity;
    if (!(h <= tol)) { bad++; badTypes[t] = (badTypes[t] || 0) + 1; if (bad <= 4) console.log('   UYUMSUZ', t, 'köşe', va.length, vb.length, 'sapma', h.toFixed(4), 'tol', tol.toFixed(4)); }
  }
  // blok örnekleri: beklenen = M ∘ I
  let ibad = 0, icnt = 0;
  const o1 = A.info.origin, o2 = B.info.origin;
  const excl = new Set(); for (let id = 0; id < n; id++) if (!patched.has(A.E.fs[id])) excl.add(id);
  for (let i = 0; i < A.IN.m.length; i++) {
    if (excl.has(A.IN.ent[i])) continue;
    const I = A.IN.m[i].slice(); I[3] += o1[0]; I[7] += o1[1];
    const ex = core.mMul(M, I); ex[3] -= o2[0]; ex[7] -= o2[1];
    const g = B.IN.m[i]; icnt++;
    const err = g ? Math.max(...ex.map((v, j) => Math.abs(v - g[j]) / Math.max(1, Math.abs(v)))) : Infinity;
    if (!(err < 2e-4)) { ibad++; if (ibad <= 2) console.log('   BLOK UYUMSUZ', JSON.stringify(ex.map(v => +v.toFixed(4))), JSON.stringify(g && g.map(v => +v.toFixed(4)))); }
  }
  // yazı konumları
  let tbad = 0;
  for (let i = 0; i < A.TX.x.length; i++) {
    if (excl.has(A.TX.ent[i])) continue;
    const p = mp(M, [A.TX.x[i] + o1[0], A.TX.y[i] + o1[1], A.TX.z[i]]);
    const q = [B.TX.x[i] + o2[0], B.TX.y[i] + o2[1], B.TX.z[i]];
    const tol = Math.max(5e-3, 0.02 * A.TX.h[i]);
    if (!(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < tol)) { tbad++; if (tbad <= 3) console.log('   YAZI UYUMSUZ', JSON.stringify(A.TX.str[i]).slice(0, 30), p.map(v => +v.toFixed(3)), q.map(v => +v.toFixed(3))); }
  }
  console.log(name.padEnd(12), 'varlık', checked, 'uyumsuz', bad, JSON.stringify(badTypes), '· blok örneği', icnt, 'uyumsuz', ibad, '· yazı', A.TX.x.length, 'uyumsuz', tbad);
  return { bad, ibad, tbad };
}

const rot = (ax, deg) => {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  if (ax === 'x') return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0];
  if (ax === 'y') return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0];
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0];
};
const tr = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
const sc = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0];
const C = (...ms) => ms.reduce((a, b) => core.mMul(a, b));
const cases = {
  rotx90: C(tr(10, -20, 5), rot('x', 90)),
  roty35z20: C(tr(-300, 120, 40), rot('z', 20), rot('y', 35)),
  rotxyz: C(rot('x', 17), rot('y', -63), rot('z', 141)),
  olcekx: C(tr(5, 5, 0), sc(2, 1, 1)),
  olcekxyz: C(rot('x', 30), sc(2, 0.5, 3)),
  aynaz: sc(1, 1, -1),
  aynax3d: C(rot('y', 10), sc(-1, 1, 1))
};
const file = process.argv[2], outDir = process.argv[3], only = process.argv[4];
let fail = 0;
for (const [name, M] of Object.entries(cases)) {
  if (only && name !== only) continue;
  const r = run(file, name, M, outDir);
  fail += r.bad + r.tbad;
}
console.log(fail ? 'HATA VAR' : 'TAMAM');
