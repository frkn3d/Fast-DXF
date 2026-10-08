// Geometri çekirdeği testleri: node tests/test_geom.js
'use strict';
const G = require('../js/geom.js');
let fail = 0;
const ok = (cond, msg, extra) => { if (!cond) { fail++; console.log('  HATA:', msg, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('  tamam:', msg); };
const near = (a, b, t) => Math.abs(a - b) <= (t || 1e-6);

console.log('Delaunay');
{
  // rastgele noktalar: boş çember özelliği + üçgen alanları toplamı = dışbükey zarf alanı
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const n of [10, 1000, 50000]) {
    const c = new Float64Array(2 * n); for (let i = 0; i < 2 * n; i++) c[i] = rnd() * 1000;
    const t0 = Date.now(); const T = G.delaunay(c); const ms = Date.now() - t0;
    let area = 0, viol = 0;
    const nt = T.length / 3;
    for (let k = 0; k < T.length; k += 3) {
      const a = T[k], b = T[k + 1], d = T[k + 2];
      area += Math.abs((c[2 * b] - c[2 * a]) * (c[2 * d + 1] - c[2 * a + 1]) - (c[2 * d] - c[2 * a]) * (c[2 * b + 1] - c[2 * a + 1])) / 2;
    }
    // zarf alanı (monoton zincir)
    const P = []; for (let i = 0; i < n; i++) P.push([c[2 * i], c[2 * i + 1]]); P.sort((u, v) => u[0] - v[0] || u[1] - v[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    const H = lo.slice(0, -1).concat(up.slice(0, -1)); let ha = 0; for (let i = 0; i < H.length; i++) { const p = H[i], q = H[(i + 1) % H.length]; ha += p[0] * q[1] - q[0] * p[1]; } ha = Math.abs(ha) / 2;
    // boş çember: örnek üçgenler için tüm noktalar (n küçükse) / rastgele 2000 nokta
    const sampleT = Math.min(nt, 300);
    for (let s = 0; s < sampleT; s++) {
      const k = Math.floor(rnd() * nt) * 3, a = T[k], b = T[k + 1], d = T[k + 2];
      const ax = c[2 * a], ay = c[2 * a + 1], bx = c[2 * b], by = c[2 * b + 1], cx = c[2 * d], cy = c[2 * d + 1];
      const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
      const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
      const r2 = (ax - ux) ** 2 + (ay - uy) ** 2;
      const lim = Math.min(n, 3000);
      for (let i = 0; i < lim; i++) { const j = n <= 3000 ? i : Math.floor(rnd() * n); if (j === a || j === b || j === d) continue; if ((c[2 * j] - ux) ** 2 + (c[2 * j + 1] - uy) ** 2 < r2 * (1 - 1e-9)) { viol++; break; } }
    }
    ok(near(area, ha, ha * 1e-9) && viol === 0 && nt >= n, 'n=' + n + ' üçgen ' + nt + ' alan ' + area.toFixed(3) + ' / zarf ' + ha.toFixed(3) + ' ihlal ' + viol + ' (' + ms + ' ms)');
  }
  // 1 milyon nokta süresi
  const n = 1000000, c = new Float64Array(2 * n); let s2 = 3; for (let i = 0; i < 2 * n; i++) { s2 = (s2 * 16807) % 2147483647; c[i] = s2 / 2147483647 * 10000; }
  const t0 = Date.now(); const T = G.delaunay(c); ok(T.length / 3 > 1.9e6, '1 milyon nokta: ' + (T.length / 3) + ' üçgen, ' + (Date.now() - t0) + ' ms');
}

console.log('Budama');
{
  const L = { type: 'LINE', x1: 0, y1: 0, x2: 10, y2: 0, layer: 'A', aci: 1 };
  const cut = [{ x1: 3, y1: -1, x2: 3, y2: 1, id: 1 }, { x1: 7, y1: -1, x2: 7, y2: 1, id: 2 }];
  let r = G.trim(L, [5, 0.1], cut, null);
  ok(r.defs.length === 2 && near(r.defs[0].x2, 3) && near(r.defs[1].x1, 7) && r.defs[0].layer === 'A', 'çizginin ortası budandı', r.defs.map(d => [d.x1, d.x2]));
  r = G.trim(L, [1, 0], cut, null);
  ok(r.defs.length === 1 && near(r.defs[0].x1, 3) && near(r.defs[0].x2, 10), 'çizginin ucu budandı');
  const C = { type: 'CIRCLE', cx: 0, cy: 0, r: 5 };
  r = G.trim(C, [0, 5], [{ x1: -10, y1: 3, x2: 10, y2: 3, id: 1 }], null);
  ok(r.defs.length === 1 && r.defs[0].type === 'ARC', 'daire → yay', r.defs[0]);
  // kalan yay alt kısım olmalı: a0 ≈ 143.13°'den a1 ≈ 36.87°'ye (saat yönü tersine, alttan geçerek)
  ok(near(r.defs[0].a0, 143.1301, 1e-3) && near(r.defs[0].a1, 36.8699, 1e-3), 'kalan yay açıları', [r.defs[0].a0, r.defs[0].a1]);
  // tam geometriyle düzeltme: kesen daire, yaklaşık parçalarla
  const circ = { type: 'CIRCLE', cx: 5, cy: 0, r: 2 };
  const segs = []; for (let i = 0; i < 64; i++) { const a = i / 64 * 2 * Math.PI, b = (i + 1) / 64 * 2 * Math.PI; segs.push({ x1: 5 + 2 * Math.cos(a), y1: 2 * Math.sin(a), x2: 5 + 2 * Math.cos(b), y2: 2 * Math.sin(b), id: 9 }); }
  r = G.trim(L, [5, 0], segs, (id) => id === 9 ? circ : null);
  ok(r.defs.length === 2 && near(r.defs[0].x2, 3, 1e-9) && near(r.defs[1].x1, 7, 1e-9), 'kesen daireye tam kesişim (yaklaşık parçalardan düzeltilmiş)', r.defs.map(d => [d.x1, d.x2]));
  const P = { type: 'LWPOLYLINE', xs: [0, 10, 10], ys: [0, 0, 10], bs: [0, 0, 0], closed: false, elev: 5 };
  r = G.trim(P, [10, 5], [{ x1: 5, y1: 3, x2: 15, y2: 3, id: 1 }], null);
  ok(r.defs.length === 1 && r.defs[0].type === 'LWPOLYLINE' && r.defs[0].xs.length === 3 && near(r.defs[0].ys[2], 3) && r.defs[0].elev === 5, 'polyline ucu budandı', r.defs[0]);
}

console.log('Uzatma');
{
  const L = { type: 'LINE', x1: 0, y1: 0, x2: 5, y2: 0 };
  let r = G.extend(L, [4.5, 0], [{ x1: 8, y1: -5, x2: 8, y2: 5, id: 1 }, { x1: 12, y1: -5, x2: 12, y2: 5, id: 2 }], null);
  ok(near(r.defs[0].x2, 8) && near(r.defs[0].x1, 0), 'çizgi en yakın sınıra uzadı', r.defs[0]);
  r = G.extend(L, [0.5, 0], [{ x1: -3, y1: -5, x2: -3, y2: 5, id: 1 }], null);
  ok(near(r.defs[0].x1, -3), 'başlangıç ucundan uzadı', r.defs[0]);
  const A = { type: 'ARC', cx: 0, cy: 0, r: 5, a0: 0, a1: 90 };
  r = G.extend(A, [0, 5], [{ x1: -10, y1: 3, x2: 0, y2: 3, id: 1 }], null);
  ok(near(r.defs[0].a1, 143.1301, 1e-3) && near(r.defs[0].a0, 0), 'yay uzadı', r.defs[0]);
}

console.log('Öteleme');
{
  const L = { type: 'LINE', x1: 0, y1: 0, x2: 10, y2: 0 };
  let r = G.offset(L, 2, [5, 5]);
  ok(near(r.defs[0].y1, 2) && near(r.defs[0].y2, 2), 'çizgi yukarı ötelendi');
  r = G.offset({ type: 'CIRCLE', cx: 0, cy: 0, r: 5 }, 1, [0, 1]);
  ok(near(r.defs[0].r, 4), 'daire içe ötelendi');
  const sq = { type: 'LWPOLYLINE', xs: [0, 10, 10, 0], ys: [0, 0, 10, 10], bs: [0, 0, 0, 0], closed: true, elev: 0 };
  r = G.offset(sq, 1, [5, 5]);
  const d = r.defs[0];
  ok(d.xs.length === 4 && d.closed && d.xs.every(x => near(x, 1) || near(x, 9)) && d.ys.every(y => near(y, 1) || near(y, 9)), 'kare içe ötelendi', [d.xs, d.ys]);
  r = G.offset(sq, 1, [-5, 5]);
  ok(r.defs[0].xs.every(x => near(x, -1) || near(x, 11)), 'kare dışa ötelendi', r.defs[0].xs);
  // yaylı polyline: 0,0 → 10,0 düz, 10,0 → 10,10 yarım daire (bulge 1)
  const pa = { type: 'LWPOLYLINE', xs: [0, 10, 10], ys: [0, 0, 10], bs: [0, 1, 0], closed: false, elev: 0 };
  r = G.offset(pa, 1, [5, 1]);
  const e = r.defs[0];
  ok(e.xs.length === 3 && near(e.ys[0], 1) && near(e.xs[2], 10) && near(e.ys[2], 9) && near(Math.abs(e.bs[1]), 1, 1e-6), 'yaylı polyline ötelendi', e);
}

console.log('Kavis / pah');
{
  const a = { type: 'LINE', x1: 0, y1: 0, x2: 10, y2: 0, layer: 'K' }, b = { type: 'LINE', x1: 12, y1: 2, x2: 12, y2: 10, layer: 'K' };
  let r = G.corner(a, [5, 0], b, [12, 6], 'fillet', 0);
  ok(near(r.defs[0].x2, 12) && near(r.defs[0].y2, 0) && near(r.defs[1].x2, 12) && near(r.defs[1].y2, 0), 'sıfır yarıçaplı kavis: köşe birleşti', r.defs);
  r = G.corner(a, [5, 0], b, [12, 6], 'fillet', 2);
  const arc = r.defs[2];
  ok(r.defs.length === 3 && near(r.defs[0].x2, 10) && near(r.defs[1].y2, 2) && arc.type === 'ARC' && near(arc.r, 2) && near(arc.cx, 10) && near(arc.cy, 2) && near(arc.a0, 270) && near(arc.a1, 0), 'R=2 kavis', arc);
  r = G.corner(a, [5, 0], b, [12, 6], 'chamfer', 1);
  ok(near(r.defs[2].x1, 11) && near(r.defs[2].y2, 1), 'pah', r.defs[2]);
}

console.log('Böl / birleştir / patlat');
{
  let r = G.breakAt({ type: 'LINE', x1: 0, y1: 0, x2: 10, y2: 0 }, [4, 0.2]);
  ok(r.defs.length === 2 && near(r.defs[0].x2, 4) && near(r.defs[1].x1, 4), 'çizgi bölündü');
  r = G.join([{ type: 'LINE', x1: 0, y1: 0, x2: 10, y2: 0 }, { type: 'LINE', x1: 10, y1: 10, x2: 10, y2: 0 }, { type: 'ARC', cx: 5, cy: 10, r: 5, a0: 0, a1: 180 }], 1e-6);
  const j = r.defs && r.defs[0];
  ok(j && j.xs.length === 4 && r.used === 3, 'çizgi + çizgi + yay birleşti', j);
  ok(j && j.bs.some(b => near(Math.abs(b), 1, 1e-6)), 'birleşik polyline yarım daire bulge taşıyor', j && j.bs);
  r = G.explode({ type: 'LWPOLYLINE', xs: [0, 10, 10], ys: [0, 0, 10], bs: [0, 1, 0], closed: false, elev: 3 });
  ok(r.defs.length === 2 && r.defs[0].type === 'LINE' && r.defs[1].type === 'ARC' && near(r.defs[1].r, 5) && r.defs[0].z1 === 3, 'polyline patlatıldı', r.defs);
}
console.log(fail ? fail + ' HATA' : 'TÜM GEOMETRİ TESTLERİ TAMAM');
process.exit(fail ? 1 : 0);
