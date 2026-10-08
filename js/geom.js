/* DXF Okuyucu — geometri çekirdeği: düzenleme araçları (budama, uzatma, öteleme, kavis, pah, böl, birleştir, patlat)
 * ve arazi yüzeyi için Delaunay üçgenleme. Tüm tanımlar mutlak WCS koordinatlarında, plan (XY) düzleminde çalışır. */
'use strict';

const Geom = (function () {
  const TAU = 2 * Math.PI, EPS = 1e-9;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const nrm = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };

  // ───────────── ilkel parçalar: L (doğru parçası), A (yay: a başlangıç açısı, sw işaretli tarama)
  function bulgeArc(x1, y1, x2, y2, b) {
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
    const th = 4 * Math.atan(b), off = (d / 2) / Math.tan(th / 2);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, nx = -dy / d, ny = dx / d;
    const cx = mx + nx * off, cy = my + ny * off, r = Math.abs((d / 2) / Math.sin(th / 2));
    return { k: 'A', cx, cy, r, a: Math.atan2(y1 - cy, x1 - cx), sw: th };
  }
  // Tanım → ilkel listesi (+ kapalı mı)
  function prims(def) {
    const t = def.type, z = def.elev || def.cz || 0;
    if (t === 'LINE') return { P: [{ k: 'L', x1: def.x1, y1: def.y1, x2: def.x2, y2: def.y2, z1: def.z1 || 0, z2: def.z2 || 0 }], closed: false, z: def.z1 || 0 };
    if (t === 'ARC') { let sw = nrm(def.a1 * D2R - def.a0 * D2R); if (sw < EPS) sw = TAU; return { P: [{ k: 'A', cx: def.cx, cy: def.cy, r: def.r, a: def.a0 * D2R, sw }], closed: false, z: def.cz || 0 }; }
    if (t === 'CIRCLE') return { P: [{ k: 'A', cx: def.cx, cy: def.cy, r: def.r, a: 0, sw: TAU }], closed: true, z: def.cz || 0 };
    if (t === 'LWPOLYLINE') {
      const n = def.xs.length, P = [], bs = def.bs || [];
      const segs = def.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % n, x1 = def.xs[i], y1 = def.ys[i], x2 = def.xs[j], y2 = def.ys[j];
        if (Math.hypot(x2 - x1, y2 - y1) < EPS) continue;
        P.push(Math.abs(bs[i] || 0) > 1e-12 ? bulgeArc(x1, y1, x2, y2, bs[i]) : { k: 'L', x1, y1, x2, y2, z1: z, z2: z });
      }
      return { P, closed: !!def.closed, z };
    }
    return null;
  }
  function at(p, t) {
    if (p.k === 'L') return [p.x1 + (p.x2 - p.x1) * t, p.y1 + (p.y2 - p.y1) * t];
    const a = p.a + p.sw * t; return [p.cx + p.r * Math.cos(a), p.cy + p.r * Math.sin(a)];
  }
  // Yön (birim teğet)
  function tangent(p, t) {
    if (p.k === 'L') { const dx = p.x2 - p.x1, dy = p.y2 - p.y1, l = Math.hypot(dx, dy); return [dx / l, dy / l]; }
    const a = p.a + p.sw * t, s = Math.sign(p.sw); return [-Math.sin(a) * s, Math.cos(a) * s];
  }
  // Noktanın ilkel üzerindeki en yakın yerel parametresi ve uzaklığı
  function project(p, x, y) {
    if (p.k === 'L') {
      const dx = p.x2 - p.x1, dy = p.y2 - p.y1, l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((x - p.x1) * dx + (y - p.y1) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const q = at(p, t); return { t, d: Math.hypot(q[0] - x, q[1] - y) };
    }
    const t = arcParam(p, Math.atan2(y - p.cy, x - p.cx));
    let tt = t;
    if (t < 0 || t > 1) { const q0 = at(p, 0), q1 = at(p, 1); tt = Math.hypot(q0[0] - x, q0[1] - y) < Math.hypot(q1[0] - x, q1[1] - y) ? 0 : 1; }
    const q = at(p, tt); return { t: tt, d: Math.hypot(q[0] - x, q[1] - y) };
  }
  // Açının yay üzerindeki parametresi (taramaya göre; aralık dışı ise <0 ya da >1)
  function arcParam(p, ang) {
    let d = p.sw > 0 ? nrm(ang - p.a) : nrm(p.a - ang);
    const S = Math.abs(p.sw);
    if (S >= TAU - 1e-12) return d / TAU;
    if (d > S + 1e-12) { // aralık dışı: başlangıca mı sona mı daha yakın
      const before = TAU - d, after = d - S;
      return before < after ? -before / S : 1 + after / S;
    }
    return d / S;
  }
  // Tüm varlık üzerindeki genel parametre: s = i + t
  function nearestS(G, x, y) {
    let best = { s: 0, d: Infinity };
    G.P.forEach((p, i) => { const r = project(p, x, y); if (r.d < best.d) best = { s: i + r.t, d: r.d }; });
    return best;
  }
  const pointAtS = (G, s) => { const i = Math.min(G.P.length - 1, Math.max(0, Math.floor(s))); return at(G.P[i], s - i); };

  // ───────────── kesişimler (sonsuz değil, parça/yay üzerindeki parametrelerle)
  // ilkel × doğru parçası → [{t (ilkelde), u (parçada)}]
  function hitSeg(p, x1, y1, x2, y2, extend) {
    const out = [];
    if (p.k === 'L') {
      const rx = p.x2 - p.x1, ry = p.y2 - p.y1, sx = x2 - x1, sy = y2 - y1, den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-15 * (Math.abs(rx * sy) + Math.abs(ry * sx) + 1e-300)) return out;
      const qx = x1 - p.x1, qy = y1 - p.y1;
      const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
      if (u >= -1e-9 && u <= 1 + 1e-9 && (extend || (t >= -1e-9 && t <= 1 + 1e-9))) out.push({ t, u });
      return out;
    }
    const dx = x2 - x1, dy = y2 - y1, fx = x1 - p.cx, fy = y1 - p.cy;
    const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - p.r * p.r;
    const disc = b * b - 4 * a * c;
    if (a < 1e-300 || disc < 0) return out;
    const sq = Math.sqrt(disc);
    for (const u of disc === 0 ? [-b / (2 * a)] : [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      const X = x1 + dx * u, Y = y1 + dy * u, t = arcParam(p, Math.atan2(Y - p.cy, X - p.cx));
      if (extend || (t >= -1e-9 && t <= 1 + 1e-9)) out.push({ t, u });
    }
    return out;
  }
  // iki ilkelin tam kesişim noktaları (sonsuz doğru/tam çember olarak) → [[x,y]]
  function hitPrim(p, q) {
    if (p.k === 'L' && q.k === 'L') {
      const rx = p.x2 - p.x1, ry = p.y2 - p.y1, sx = q.x2 - q.x1, sy = q.y2 - q.y1, den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-15) return [];
      const t = ((q.x1 - p.x1) * sy - (q.y1 - p.y1) * sx) / den;
      return [[p.x1 + rx * t, p.y1 + ry * t]];
    }
    if (p.k === 'A' && q.k === 'L') return hitPrim(q, p);
    if (p.k === 'L') {
      const dx = p.x2 - p.x1, dy = p.y2 - p.y1, fx = p.x1 - q.cx, fy = p.y1 - q.cy;
      const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - q.r * q.r, disc = b * b - 4 * a * c;
      if (disc < 0) return [];
      const sq = Math.sqrt(disc);
      return [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].map(u => [p.x1 + dx * u, p.y1 + dy * u]);
    }
    const dx = q.cx - p.cx, dy = q.cy - p.cy, d = Math.hypot(dx, dy);
    if (d < 1e-12 || d > p.r + q.r || d < Math.abs(p.r - q.r)) return [];
    const a = (p.r * p.r - q.r * q.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, p.r * p.r - a * a));
    const mx = p.cx + dx * a / d, my = p.cy + dy * a / d;
    return [[mx - dy * h / d, my + dx * h / d], [mx + dy * h / d, my - dx * h / d]];
  }

  // ───────────── parça (s0..s1) → tanım
  function sliceDef(def, G, s0, s1) {
    const base = copyProps(def);
    const N = G.P.length;
    // kapalıda sarmalama: s1 < s0 ise sona kadar + baştan s1'e
    const ranges = [];
    if (s1 >= s0) ranges.push([s0, s1]); else { ranges.push([s0, N]); ranges.push([0, s1]); }
    const pieces = [];
    for (const [a, b] of ranges) {
      const i0 = Math.floor(a), i1 = Math.min(N - 1, Math.ceil(b) - 1);
      for (let i = i0; i <= i1; i++) {
        const t0 = Math.max(0, a - i), t1 = Math.min(1, b - i);
        if (t1 - t0 < 1e-12) continue;
        pieces.push({ p: G.P[i], t0, t1 });
      }
    }
    if (!pieces.length) return null;
    if (def.type === 'LINE') {
      const { p, t0, t1 } = pieces[0], A = at(p, t0), B = at(p, t1);
      return Object.assign(base, { type: 'LINE', x1: A[0], y1: A[1], z1: p.z1 + (p.z2 - p.z1) * t0, x2: B[0], y2: B[1], z2: p.z1 + (p.z2 - p.z1) * t1 });
    }
    if ((def.type === 'ARC' || def.type === 'CIRCLE') && pieces.length >= 1) {
      // tek yay (çemberde sarmalanan iki parça birleşir)
      const p = pieces[0].p, a0 = p.a + p.sw * pieces[0].t0, last = pieces[pieces.length - 1], a1 = last.p.a + last.p.sw * last.t1;
      return Object.assign(base, { type: 'ARC', cx: p.cx, cy: p.cy, cz: G.z, r: p.r, a0: nrm(a0) * R2D, a1: nrm(a1) * R2D });
    }
    // çoklu çizgi
    const xs = [], ys = [], bs = [];
    for (const { p, t0, t1 } of pieces) {
      const A = at(p, t0);
      if (!xs.length || Math.hypot(xs[xs.length - 1] - A[0], ys[ys.length - 1] - A[1]) > 1e-9) { xs.push(A[0]); ys.push(A[1]); bs.push(0); }
      bs[bs.length - 1] = p.k === 'A' ? Math.tan(p.sw * (t1 - t0) / 4) : 0;
      const B = at(p, t1); xs.push(B[0]); ys.push(B[1]); bs.push(0);
    }
    return Object.assign(base, { type: 'LWPOLYLINE', xs, ys, bs, closed: false, elev: G.z });
  }
  function copyProps(def) {
    const o = {};
    for (const k of ['layer', 'aci', 'ltype', 'lweight', 'ltscale', 'tcolor', 'thick']) if (def[k] !== undefined) o[k] = def[k];
    return o;
  }

  // ───────────── BUDA: kesen kenarlar segs = [{x1,y1,x2,y2,id}] (yaklaşık, ekrandaki görünür geometri), exact(id) → tanım|null
  function trim(def, pick, segs, exactOf) {
    const G = prims(def); if (!G || !G.P.length) return { err: 'Bu nesne tipi budanamaz (çizgi, yay, daire ve polyline desteklenir).' };
    const sp = nearestS(G, pick[0], pick[1]).s, N = G.P.length;
    const cuts = cutParams(G, segs, false);
    if (!cuts.length) return { del: true };
    // tıklanan noktanın iki yanındaki en yakın kesişimler
    let lo = null, hi = null;
    for (const c of cuts) {
      if (c.s < sp - 1e-9 && (!lo || c.s > lo.s)) lo = c;
      if (c.s > sp + 1e-9 && (!hi || c.s < hi.s)) hi = c;
    }
    if (G.closed) {
      if (cuts.length < 2) return { err: 'Kapalı nesneyi budamak için en az iki kesişim gerekir.' };
      if (!lo) lo = cuts.reduce((m, c) => c.s > m.s ? c : m, cuts[0]);
      if (!hi) hi = cuts.reduce((m, c) => c.s < m.s ? c : m, cuts[0]);
      refine(G, lo, exactOf); refine(G, hi, exactOf);
      return { defs: [sliceDef(def, G, hi.s, lo.s)].filter(Boolean) };
    }
    if (lo) refine(G, lo, exactOf); if (hi) refine(G, hi, exactOf);
    const out = [];
    if (lo && lo.s > 1e-9) out.push(sliceDef(def, G, 0, lo.s));
    if (hi && hi.s < N - 1e-9) out.push(sliceDef(def, G, hi.s, N));
    return { defs: out.filter(Boolean) };
  }
  function cutParams(G, segs, extend) {
    const cuts = [];
    G.P.forEach((p, i) => {
      for (const sg of segs) for (const h of hitSeg(p, sg.x1, sg.y1, sg.x2, sg.y2, extend)) {
        if (!extend && (h.t < -1e-9 || h.t > 1 + 1e-9)) continue;
        cuts.push({ s: i + Math.max(0, Math.min(1, h.t)), i, t: h.t, id: sg.id, x: 0, y: 0 });
      }
    });
    cuts.sort((a, b) => a.s - b.s);
    return cuts;
  }
  // yaklaşık kesişimi kesen nesnenin tam geometrisiyle düzelt
  function refine(G, c, exactOf) {
    const d = exactOf && exactOf(c.id); if (!d) return;
    const H = prims(d); if (!H) return;
    const p = G.P[c.i], q0 = at(p, c.s - c.i);
    let best = null;
    for (const q of H.P) for (const X of hitPrim(p, q)) {
      const dd = Math.hypot(X[0] - q0[0], X[1] - q0[1]);
      if (!best || dd < best.d) best = { d: dd, X };
    }
    if (!best || best.d > 0.05 * (p.k === 'A' ? p.r : Math.hypot(p.x2 - p.x1, p.y2 - p.y1)) + 1e-6) return;
    const t = p.k === 'L' ? project(p, best.X[0], best.X[1]).t : arcParam(p, Math.atan2(best.X[1] - p.cy, best.X[0] - p.cx));
    if (t >= -1e-9 && t <= 1 + 1e-9) c.s = c.i + Math.max(0, Math.min(1, t));
  }

  // ───────────── UZAT: açık nesnenin tıklanan ucunu en yakın sınıra uzat
  function extend(def, pick, segs, exactOf) {
    const G = prims(def); if (!G || !G.P.length) return { err: 'Bu nesne tipi uzatılamaz.' };
    if (G.closed) return { err: 'Kapalı nesneler uzatılamaz.' };
    const N = G.P.length, sp = nearestS(G, pick[0], pick[1]).s, atEnd = sp > N / 2;
    const i = atEnd ? N - 1 : 0, p = G.P[i];
    // uzatılmış ilkelle kesişimler: uçtan ötesi
    let best = null;
    for (const sg of segs) for (const h of hitSeg(p, sg.x1, sg.y1, sg.x2, sg.y2, true)) {
      let ext;
      if (p.k === 'L') ext = atEnd ? h.t - 1 : -h.t;
      else { // yayda: uçtan ötede kalan açı (tarama yönünde)
        const S = Math.abs(p.sw); if (S >= TAU - 1e-9) continue;
        const X = sg.x1 + (sg.x2 - sg.x1) * h.u, Y = sg.y1 + (sg.y2 - sg.y1) * h.u, ang = Math.atan2(Y - p.cy, X - p.cx);
        const d = p.sw > 0 ? nrm(ang - p.a) : nrm(p.a - ang);
        if (d <= S + 1e-9) continue;
        ext = atEnd ? (d - S) / S : (TAU - d) / S;
      }
      if (ext > 1e-9 && (!best || ext < best.ext)) best = { ext, id: sg.id };
    }
    if (!best) return { err: 'Uzatılacak sınır bulunamadı (ekranda görünen nesneler sınır kabul edilir).' };
    // yeni uç noktası
    let np, out;
    if (p.k === 'L') {
      const t = atEnd ? 1 + best.ext : -best.ext;
      np = at(p, t);
      // tam geometriyle düzelt
      const d = exactOf && exactOf(best.id), H = d && prims(d);
      if (H) { let bb = null; for (const q of H.P) for (const X of hitPrim(p, q)) { const dd = Math.hypot(X[0] - np[0], X[1] - np[1]); if (!bb || dd < bb.d) bb = { d: dd, X }; } if (bb && bb.d < 0.05 * Math.hypot(p.x2 - p.x1, p.y2 - p.y1) + 1e-6) np = bb.X; }
    } else {
      const S = Math.abs(p.sw), add = best.ext * S, sgn = Math.sign(p.sw);
      const ang = atEnd ? p.a + p.sw + sgn * add : p.a - sgn * add;
      np = [p.cx + p.r * Math.cos(ang), p.cy + p.r * Math.sin(ang)];
      const d = exactOf && exactOf(best.id), H = d && prims(d);
      if (H) { let bb = null; for (const q of H.P) for (const X of hitPrim(p, q)) { const dd = Math.hypot(X[0] - np[0], X[1] - np[1]); if (!bb || dd < bb.d) bb = { d: dd, X }; } if (bb && bb.d < 0.05 * p.r + 1e-6) np = bb.X; }
    }
    const base = copyProps(def);
    if (def.type === 'LINE') {
      out = Object.assign({}, def, base);
      if (atEnd) { out.x2 = np[0]; out.y2 = np[1]; } else { out.x1 = np[0]; out.y1 = np[1]; }
    } else if (def.type === 'ARC') {
      out = Object.assign({}, def);
      const a = Math.atan2(np[1] - p.cy, np[0] - p.cx) * R2D;
      if (atEnd) out.a1 = (a + 360) % 360; else out.a0 = (a + 360) % 360;
    } else { // LWPOLYLINE
      out = JSON.parse(JSON.stringify(def));
      const n = out.xs.length, bs = out.bs || (out.bs = new Array(n).fill(0));
      if (p.k === 'L') { if (atEnd) { out.xs[n - 1] = np[0]; out.ys[n - 1] = np[1]; } else { out.xs[0] = np[0]; out.ys[0] = np[1]; } }
      else {
        const S = Math.abs(p.sw), sw = Math.sign(p.sw) * S * (1 + best.ext);
        if (atEnd) { out.xs[n - 1] = np[0]; out.ys[n - 1] = np[1]; bs[n - 2] = Math.tan(sw / 4); }
        else { out.xs[0] = np[0]; out.ys[0] = np[1]; bs[0] = Math.tan(sw / 4); }
      }
    }
    return { defs: [out] };
  }

  // ───────────── ÖTELE
  function offset(def, dist, side) {
    const G = prims(def); if (!G || !G.P.length) return { err: 'Bu nesne ötelenemez (çizgi, yay, daire ve polyline desteklenir).' };
    const base = copyProps(def);
    const ns = nearestS(G, side[0], side[1]), pi = Math.min(G.P.length - 1, Math.floor(ns.s)), p = G.P[pi];
    const tq = at(p, ns.s - pi), tg = tangent(p, ns.s - pi);
    const left = (tg[0] * (side[1] - tq[1]) - tg[1] * (side[0] - tq[0])) > 0;
    const off = left ? dist : -dist;  // sola pozitif
    const offPrim = (q) => {
      if (q.k === 'L') {
        const dx = q.x2 - q.x1, dy = q.y2 - q.y1, l = Math.hypot(dx, dy), nx = -dy / l * off, ny = dx / l * off;
        return { k: 'L', x1: q.x1 + nx, y1: q.y1 + ny, x2: q.x2 + nx, y2: q.y2 + ny, z1: q.z1, z2: q.z2 };
      }
      const r = q.r - Math.sign(q.sw) * off; // saat yönü tersinde sol = merkeze doğru
      return r > 1e-9 ? Object.assign({}, q, { r }) : null;
    };
    if (def.type === 'LINE') { const q = offPrim(G.P[0]); return { defs: [Object.assign({}, def, { x1: q.x1, y1: q.y1, x2: q.x2, y2: q.y2 })] }; }
    if (def.type === 'CIRCLE' || def.type === 'ARC') {
      const inside = Math.hypot(side[0] - def.cx, side[1] - def.cy) < def.r;
      const r = inside ? def.r - dist : def.r + dist;
      if (r <= 1e-9) return { err: 'Öteleme uzaklığı yarıçaptan büyük.' };
      return { defs: [Object.assign({}, def, { r })] };
    }
    // çoklu çizgi: her parçayı ötele, köşeleri komşu parçaların kesişimiyle birleştir
    const Q = G.P.map(offPrim);
    if (Q.some(q => !q)) return { err: 'Öteleme uzaklığı bir yayın yarıçapından büyük.' };
    const n = Q.length, pts = [], joint = (a, b, orig) => {
      const X = hitPrim(a, b).sort((u, v) => Math.hypot(u[0] - orig[0], u[1] - orig[1]) - Math.hypot(v[0] - orig[0], v[1] - orig[1]))[0];
      return X && Math.hypot(X[0] - orig[0], X[1] - orig[1]) < Math.abs(dist) * 20 ? X : null;
    };
    const startOf = (q) => at(q, 0), endOf = (q) => at(q, 1);
    const J = [];
    for (let i = 0; i < n; i++) {
      const j = i + 1;
      if (j < n || G.closed) {
        const a = Q[i], b = Q[j % n], orig = at(G.P[i], 1);
        J.push(joint(a, b, orig));
      }
    }
    if (!G.closed) pts.push(startOf(Q[0]));
    for (let i = 0; i < n; i++) {
      if (G.closed && i === 0) pts.push(J[n - 1] || startOf(Q[0]));
      if (i < n - 1 || G.closed) { const X = J[i]; if (X) pts.push(X); else { pts.push(endOf(Q[i])); pts.push(startOf(Q[(i + 1) % n])); } }
    }
    if (!G.closed) pts.push(endOf(Q[n - 1]));
    if (G.closed) pts.pop(); // son birleşim = ilk nokta
    // bulge'ları yeniden hesapla: köşe çiftleri hangi parçaya ait
    const xs = [], ys = [], bs = [];
    let qi = 0;
    for (let k = 0; k < pts.length; k++) { xs.push(pts[k][0]); ys.push(pts[k][1]); bs.push(0); }
    // her parça (sırayla) art arda iki nokta arasında; köşe boşlukları (birleşim yoksa) düz çizgi
    const segOf = [];
    for (let i = 0, k = 0; i < n && k < pts.length; i++) {
      segOf.push([k, i]); k++;
      if ((i < n - 1 || G.closed) && !J[i]) { k++; }
    }
    for (const [k, i] of segOf) {
      const q = Q[i]; if (q.k !== 'A') continue;
      const a = pts[k], b = pts[(k + 1) % pts.length]; if (!a || !b) continue;
      const a0 = Math.atan2(a[1] - q.cy, a[0] - q.cx), a1 = Math.atan2(b[1] - q.cy, b[0] - q.cx);
      let sw = q.sw > 0 ? nrm(a1 - a0) : -nrm(a0 - a1);
      if (Math.abs(sw) < 1e-12) sw = q.sw;
      bs[k] = Math.tan(sw / 4);
    }
    return { defs: [Object.assign(base, { type: 'LWPOLYLINE', xs, ys, bs, closed: G.closed, elev: G.z })] };
  }

  // ───────────── KAVİS / PAH: iki çizgi (LINE)
  function corner(d1, p1, d2, p2, mode, r) {
    if (d1.type !== 'LINE' || d2.type !== 'LINE') return { err: 'Kavis ve pah iki çizgi (LINE) arasında çalışır.' };
    const L1 = { k: 'L', x1: d1.x1, y1: d1.y1, x2: d1.x2, y2: d1.y2 }, L2 = { k: 'L', x1: d2.x1, y1: d2.y1, x2: d2.x2, y2: d2.y2 };
    const X = hitPrim(L1, L2)[0]; if (!X) return { err: 'Çizgiler paralel.' };
    // her çizgide tıklanan tarafa doğru birim yön ve korunacak uç
    const side = (d, L, p) => {
      const dx = L.x2 - L.x1, dy = L.y2 - L.y1, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
      const tp = (p[0] - X[0]) * ux + (p[1] - X[1]) * uy, s = tp >= 0 ? 1 : -1;
      const keep = s > 0 ? ((L.x2 - X[0]) * ux + (L.y2 - X[1]) * uy > (L.x1 - X[0]) * ux + (L.y1 - X[1]) * uy ? [L.x2, L.y2, d.z2 || 0] : [L.x1, L.y1, d.z1 || 0])
        : ((L.x2 - X[0]) * ux + (L.y2 - X[1]) * uy < (L.x1 - X[0]) * ux + (L.y1 - X[1]) * uy ? [L.x2, L.y2, d.z2 || 0] : [L.x1, L.y1, d.z1 || 0]);
      return { u: [ux * s, uy * s], keep };
    };
    const A = side(d1, L1, p1), B = side(d2, L2, p2);
    const cosf = A.u[0] * B.u[0] + A.u[1] * B.u[1], phi = Math.acos(Math.max(-1, Math.min(1, cosf)));
    const mkLine = (d, from, keep) => Object.assign(copyProps(d), { type: 'LINE', x1: keep[0], y1: keep[1], z1: keep[2], x2: from[0], y2: from[1], z2: keep[2] });
    if (mode === 'fillet' && r > 0) {
      if (phi < 1e-6 || phi > Math.PI - 1e-6) return { err: 'Kavis için çizgiler kesişmeli ve paralel olmamalı.' };
      const t = r / Math.tan(phi / 2);
      const T1 = [X[0] + A.u[0] * t, X[1] + A.u[1] * t], T2 = [X[0] + B.u[0] * t, X[1] + B.u[1] * t];
      const bx = A.u[0] + B.u[0], by = A.u[1] + B.u[1], bl = Math.hypot(bx, by), h = r / Math.sin(phi / 2);
      const C = [X[0] + bx / bl * h, X[1] + by / bl * h];
      let a0 = Math.atan2(T1[1] - C[1], T1[0] - C[0]), a1 = Math.atan2(T2[1] - C[1], T2[0] - C[0]);
      if (nrm(a1 - a0) > Math.PI) { const tt = a0; a0 = a1; a1 = tt; }
      const arc = Object.assign(copyProps(d1), { type: 'ARC', cx: C[0], cy: C[1], cz: A.keep[2], r, a0: nrm(a0) * R2D, a1: nrm(a1) * R2D });
      return { defs: [mkLine(d1, T1, A.keep), mkLine(d2, T2, B.keep), arc] };
    }
    if (mode === 'chamfer' && r > 0) {
      const T1 = [X[0] + A.u[0] * r, X[1] + A.u[1] * r], T2 = [X[0] + B.u[0] * r, X[1] + B.u[1] * r];
      const ch = Object.assign(copyProps(d1), { type: 'LINE', x1: T1[0], y1: T1[1], z1: A.keep[2], x2: T2[0], y2: T2[1], z2: B.keep[2] });
      return { defs: [mkLine(d1, T1, A.keep), mkLine(d2, T2, B.keep), ch] };
    }
    return { defs: [mkLine(d1, X, A.keep), mkLine(d2, X, B.keep)] };
  }

  // ───────────── BÖL (noktada)
  function breakAt(def, pt) {
    const G = prims(def); if (!G || !G.P.length) return { err: 'Bu nesne bölünemez.' };
    const N = G.P.length, s = nearestS(G, pt[0], pt[1]).s;
    if (def.type === 'CIRCLE') return { err: 'Daire tek noktada bölünemez; budama kullanın.' };
    if (G.closed) return { defs: [sliceDef(def, G, s, s - 1e-12 < 0 ? N : s)].filter(Boolean).map(d => Object.assign(d, { closed: false })) };
    if (s < 1e-9 || s > N - 1e-9) return { err: 'Uç noktasında bölünemez.' };
    return { defs: [sliceDef(def, G, 0, s), sliceDef(def, G, s, N)].filter(Boolean) };
  }

  // ───────────── BİRLEŞTİR: uç uca değen çizgi/yay/polyline'lar → tek polyline
  function join(defs, tol) {
    const parts = [];
    defs.forEach((d, idx) => {
      const G = prims(d); if (!G || G.closed) return;
      const pts = [], bs = [];
      G.P.forEach((p, i) => { const A = at(p, 0); if (i === 0) { pts.push(A); } bs.push(p.k === 'A' ? Math.tan(p.sw / 4) : 0); pts.push(at(p, 1)); });
      parts.push({ pts, bs, d, z: G.z, idx });
    });
    if (parts.length < 2) return { err: 'Birleştirmek için uç uca değen en az iki çizgi, yay ya da açık polyline seçin.' };
    const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
    const rev = (p) => ({ pts: p.pts.slice().reverse(), bs: p.bs.slice().reverse().map(b => -b), d: p.d, z: p.z, idx: p.idx });
    let chain = parts.shift(); let used = 1; const usedIdx = [chain.idx];
    for (let changed = true; changed && parts.length;) {
      changed = false;
      for (let k = 0; k < parts.length; k++) {
        let p = parts[k]; const e = chain.pts[chain.pts.length - 1], s = chain.pts[0];
        if (same(e, p.pts[p.pts.length - 1])) p = rev(p);
        if (same(e, p.pts[0])) { chain = { pts: chain.pts.concat(p.pts.slice(1)), bs: chain.bs.concat(p.bs), d: chain.d, z: chain.z }; }
        else {
          if (same(s, p.pts[0])) p = rev(p);
          if (same(s, p.pts[p.pts.length - 1])) chain = { pts: p.pts.concat(chain.pts.slice(1)), bs: p.bs.concat(chain.bs), d: chain.d, z: chain.z };
          else continue;
        }
        usedIdx.push(p.idx); parts.splice(k, 1); k--; used++; changed = true;
      }
    }
    const closed = chain.pts.length > 3 && same(chain.pts[0], chain.pts[chain.pts.length - 1]);
    const pts = closed ? chain.pts.slice(0, -1) : chain.pts, bs = chain.bs.slice(0, pts.length);
    while (bs.length < pts.length) bs.push(0);
    const out = Object.assign(copyProps(chain.d), { type: 'LWPOLYLINE', xs: pts.map(p => p[0]), ys: pts.map(p => p[1]), bs, closed, elev: chain.z });
    return { defs: [out], used, usedIdx, left: parts.length };
  }

  // ───────────── PATLAT: polyline → çizgi ve yaylar
  function explode(def) {
    if (def.type === 'POLY3D') {
      const out = [], n = def.xs.length, segs = def.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) { const j = (i + 1) % n; out.push(Object.assign(copyProps(def), { type: 'LINE', x1: def.xs[i], y1: def.ys[i], z1: def.zs[i], x2: def.xs[j], y2: def.ys[j], z2: def.zs[j] })); }
      return { defs: out };
    }
    if (def.type !== 'LWPOLYLINE') return { err: 'Yalnızca polyline nesneleri patlatılabilir.' };
    const G = prims(def), out = [];
    for (const p of G.P) {
      if (p.k === 'L') out.push(Object.assign(copyProps(def), { type: 'LINE', x1: p.x1, y1: p.y1, z1: G.z, x2: p.x2, y2: p.y2, z2: G.z }));
      else {
        const a0 = p.sw > 0 ? p.a : p.a + p.sw, a1 = p.sw > 0 ? p.a + p.sw : p.a;
        out.push(Object.assign(copyProps(def), { type: 'ARC', cx: p.cx, cy: p.cy, cz: G.z, r: p.r, a0: nrm(a0) * R2D, a1: nrm(a1) * R2D }));
      }
    }
    return { defs: out };
  }

  // ───────────── Delaunay üçgenleme (Delaunator algoritması: kenar yayılımı + legalleştirme)
  function delaunay(coords) {
    const n = coords.length >> 1;
    if (n < 3) return new Uint32Array(0);
    const maxT = Math.max(2 * n - 5, 0);
    const triangles = new Uint32Array(maxT * 3), halfedges = new Int32Array(maxT * 3);
    const hashSize = Math.ceil(Math.sqrt(n));
    const hullPrev = new Uint32Array(n), hullNext = new Uint32Array(n), hullTri = new Uint32Array(n), hullHash = new Int32Array(hashSize).fill(-1);
    const ids = new Uint32Array(n), dists = new Float64Array(n);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) { const x = coords[2 * i], y = coords[2 * i + 1]; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; ids[i] = i; }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const dist = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
    let i0 = 0, i1 = 0, i2 = 0, minDist = Infinity;
    for (let i = 0; i < n; i++) { const d = dist(cx, cy, coords[2 * i], coords[2 * i + 1]); if (d < minDist) { i0 = i; minDist = d; } }
    const i0x = coords[2 * i0], i0y = coords[2 * i0 + 1];
    minDist = Infinity;
    for (let i = 0; i < n; i++) { if (i === i0) continue; const d = dist(i0x, i0y, coords[2 * i], coords[2 * i + 1]); if (d < minDist && d > 0) { i1 = i; minDist = d; } }
    let i1x = coords[2 * i1], i1y = coords[2 * i1 + 1];
    const circumradius = (ax, ay, bx, by, cx2, cy2) => {
      const dx = bx - ax, dy = by - ay, ex = cx2 - ax, ey = cy2 - ay, bl = dx * dx + dy * dy, cl = ex * ex + ey * ey, d = 0.5 / (dx * ey - dy * ex);
      const x = (ey * bl - dy * cl) * d, y = (dx * cl - ex * bl) * d; return x * x + y * y;
    };
    const circumcenter = (ax, ay, bx, by, cx2, cy2) => {
      const dx = bx - ax, dy = by - ay, ex = cx2 - ax, ey = cy2 - ay, bl = dx * dx + dy * dy, cl = ex * ex + ey * ey, d = 0.5 / (dx * ey - dy * ex);
      return [ax + (ey * bl - dy * cl) * d, ay + (dx * cl - ex * bl) * d];
    };
    let minRadius = Infinity;
    for (let i = 0; i < n; i++) { if (i === i0 || i === i1) continue; const r = circumradius(i0x, i0y, i1x, i1y, coords[2 * i], coords[2 * i + 1]); if (r < minRadius) { i2 = i; minRadius = r; } }
    let i2x = coords[2 * i2], i2y = coords[2 * i2 + 1];
    if (minRadius === Infinity) return new Uint32Array(0); // hepsi doğrusal
    const orient = (px, py, qx, qy, rx, ry) => (qy - py) * (rx - qx) - (qx - px) * (ry - qy) < 0;
    if (orient(i0x, i0y, i1x, i1y, i2x, i2y)) { const i = i1, x = i1x, y = i1y; i1 = i2; i1x = i2x; i1y = i2y; i2 = i; i2x = x; i2y = y; }
    const center = circumcenter(i0x, i0y, i1x, i1y, i2x, i2y), ccx = center[0], ccy = center[1];
    for (let i = 0; i < n; i++) dists[i] = dist(coords[2 * i], coords[2 * i + 1], ccx, ccy);
    // uzaklığa göre sırala
    const order = Array.from(ids).sort((a, b) => dists[a] - dists[b]);
    const hashKey = (x, y) => { const dx = x - ccx, dy = y - ccy, p = dx / (Math.abs(dx) + Math.abs(dy)); return Math.floor((dy > 0 ? 3 - p : 1 + p) / 4 * hashSize) % hashSize; };
    let hullStart = i0, trianglesLen = 0;
    hullNext[i0] = hullPrev[i2] = i1; hullNext[i1] = hullPrev[i0] = i2; hullNext[i2] = hullPrev[i1] = i0;
    hullTri[i0] = 0; hullTri[i1] = 1; hullTri[i2] = 2;
    hullHash[hashKey(i0x, i0y)] = i0; hullHash[hashKey(i1x, i1y)] = i1; hullHash[hashKey(i2x, i2y)] = i2;
    const link = (a, b) => { halfedges[a] = b; if (b !== -1) halfedges[b] = a; };
    const addTri = (i0_, i1_, i2_, a, b, c) => {
      const t = trianglesLen; triangles[t] = i0_; triangles[t + 1] = i1_; triangles[t + 2] = i2_;
      link(t, a); link(t + 1, b); link(t + 2, c); trianglesLen += 3; return t;
    };
    const inCircle = (ax, ay, bx, by, cx2, cy2, px, py) => {
      const dx = ax - px, dy = ay - py, ex = bx - px, ey = by - py, fx = cx2 - px, fy = cy2 - py;
      const ap = dx * dx + dy * dy, bp = ex * ex + ey * ey, cp = fx * fx + fy * fy;
      return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx) < 0;
    };
    const EDGE_STACK = new Uint32Array(512);
    const legalize = (a) => {
      let i = 0, ar = 0;
      while (true) {
        const b = halfedges[a];
        const a0 = a - a % 3; ar = a0 + (a + 2) % 3;
        if (b === -1) { if (i === 0) break; a = EDGE_STACK[--i]; continue; }
        const b0 = b - b % 3, al = a0 + (a + 1) % 3, bl = b0 + (b + 2) % 3;
        const p0 = triangles[ar], pr = triangles[a], pl = triangles[al], p1 = triangles[bl];
        const illegal = inCircle(coords[2 * p0], coords[2 * p0 + 1], coords[2 * pr], coords[2 * pr + 1], coords[2 * pl], coords[2 * pl + 1], coords[2 * p1], coords[2 * p1 + 1]);
        if (illegal) {
          triangles[a] = p1; triangles[b] = p0;
          const hbl = halfedges[bl];
          if (hbl === -1) { let e = hullStart; do { if (hullTri[e] === bl) { hullTri[e] = a; break; } e = hullPrev[e]; } while (e !== hullStart); }
          link(a, hbl); link(b, halfedges[ar]); link(ar, bl);
          const br = b0 + (b + 1) % 3;
          if (i < EDGE_STACK.length) EDGE_STACK[i++] = br;
        } else { if (i === 0) break; a = EDGE_STACK[--i]; }
      }
      return ar;
    };
    addTri(i0, i1, i2, -1, -1, -1);
    let xp = 0, yp = 0;
    for (let k = 0; k < order.length; k++) {
      const i = order[k], x = coords[2 * i], y = coords[2 * i + 1];
      if (k > 0 && Math.abs(x - xp) <= 1e-12 && Math.abs(y - yp) <= 1e-12) continue;
      xp = x; yp = y;
      if (i === i0 || i === i1 || i === i2) continue;
      let start = 0;
      for (let j = 0, key = hashKey(x, y); j < hashSize; j++) { start = hullHash[(key + j) % hashSize]; if (start !== -1 && start !== hullNext[start]) break; }
      start = hullPrev[start];
      let e = start, q;
      while (q = hullNext[e], !orient(x, y, coords[2 * e], coords[2 * e + 1], coords[2 * q], coords[2 * q + 1])) { e = q; if (e === start) { e = -1; break; } }
      if (e === -1) continue;
      let t = addTri(e, i, hullNext[e], -1, -1, hullTri[e]);
      hullTri[i] = legalize(t + 2); hullTri[e] = t;
      let nn = hullNext[e];
      while (q = hullNext[nn], orient(x, y, coords[2 * nn], coords[2 * nn + 1], coords[2 * q], coords[2 * q + 1])) {
        t = addTri(nn, i, q, hullTri[i], -1, hullTri[nn]); hullTri[i] = legalize(t + 2); hullNext[nn] = nn; nn = q;
      }
      if (e === start) {
        while (q = hullPrev[e], orient(x, y, coords[2 * q], coords[2 * q + 1], coords[2 * e], coords[2 * e + 1])) {
          t = addTri(q, i, e, -1, hullTri[e], hullTri[q]); legalize(t + 2); hullTri[q] = t; hullNext[e] = e; e = q;
        }
      }
      hullStart = hullPrev[i] = e; hullNext[e] = hullPrev[nn] = i; hullNext[i] = nn;
      hullHash[hashKey(x, y)] = i; hullHash[hashKey(coords[2 * e], coords[2 * e + 1])] = e;
    }
    return triangles.subarray(0, trianglesLen);
  }

  return { prims, at, nearestS, pointAtS, hitSeg, hitPrim, trim, extend, offset, corner, breakAt, join, explode, delaunay, sliceDef };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Geom;
