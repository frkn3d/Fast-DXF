/* Fast DXF — seçim dönüşüm tutamacı (gizmo):
 *  Taşı    : X/Y/Z okları (tek eksen), XY/YZ/XZ kareleri (düzlem), merkez (ekran düzleminde serbest)
 *  Döndür  : X/Y/Z halkaları (ön yarı etkin), dış gri halka (ekran ekseni)
 *  Ölçekle : X/Y/Z uçları (tek eksen), eksen arası şeritler (iki eksen), merkez (orantılı)
 * Dönüşümler 3×4 afin matris (12 sayı, göreli koordinat) olarak üretilir; sürüklerken GPU'da önizlenir,
 * bırakınca tek bir geri alınabilir komut olarak uygulanır. Shift: adımlı (taşı: ızgara adımı, döndür: 15°, ölçek: 0,1). */
'use strict';

const GZ_COL = { x: '#ff5a52', y: '#45d16a', z: '#4c9aff', v: '#c9d1db', hi: '#ffd166' };
const GZ_AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const M_ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

// u ekseni etrafında θ (radyan) dönme, O noktası sabit — 3×4
function gzRot(O, u, th) {
  const [x, y, z] = u, c = Math.cos(th), s = Math.sin(th), t = 1 - c;
  const R = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  return [R[0], R[1], R[2], O[0] - (R[0] * O[0] + R[1] * O[1] + R[2] * O[2]),
    R[3], R[4], R[5], O[1] - (R[3] * O[0] + R[4] * O[1] + R[5] * O[2]),
    R[6], R[7], R[8], O[2] - (R[6] * O[0] + R[7] * O[1] + R[8] * O[2])];
}
function gzScale(O, sx, sy, sz) { return [sx, 0, 0, O[0] * (1 - sx), 0, sy, 0, O[1] * (1 - sy), 0, 0, sz, O[2] * (1 - sz)]; }
function gzMove(dx, dy, dz) { return [1, 0, 0, dx, 0, 1, 0, dy, 0, 0, 1, dz]; }
const gzDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const gzCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const gzNorm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// "güzel" adım: 1, 2, 5 × 10^n
function gzNice(v) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-12)))), m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }

class Gizmo {
  constructor(app) {
    this.app = app; this.R = app.R; this.S = app.store;
    this.mode = 'move';        // 'move' | 'rotate' | 'scale'
    this.enabled = true;
    this.hover = null; this.drag = null; this.center = null;
    this.ARM = 92;             // ekranda kol uzunluğu (piksel)
  }
  // nokta düzenleme kipinde gizmo gizlenir (yalnız nokta tutamaçları)
  get active() { return this.enabled && !this.app.pointMode && this.app.toolName === 'select' && this.S.done && this.S.selList.length > 0; }
  invalidate() { this.center = null; }
  // seçimin merkezi (göreli x,y ve gerçek z)
  origin() {
    if (this.center) return this.center;
    const S = this.S, E = S.E, b = E.bb.a, zr = E.zr.a;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const id of S.selList) {
      x0 = Math.min(x0, b[4 * id]); y0 = Math.min(y0, b[4 * id + 1]); x1 = Math.max(x1, b[4 * id + 2]); y1 = Math.max(y1, b[4 * id + 3]);
      z0 = Math.min(z0, zr[2 * id]); z1 = Math.max(z1, zr[2 * id + 1]);
    }
    this.center = [(x0 + x1) / 2, (y0 + y1) / 2, isFinite(z0) ? (z0 + z1) / 2 : 0];
    return this.center;
  }
  // Ekrandaki çerçeve: O (dünya) için piksel geometrisi
  frame(Ow) {
    const R = this.R, cam = R.cam(), p = [0, 0], q = [0, 0];
    if (!cam.project(Ow[0], Ow[1], Ow[2], p)) return null;
    cam.project(Ow[0] + cam.r[0], Ow[1] + cam.r[1], Ow[2], q);
    const ppu = Math.max(1e-12, Math.hypot(q[0] - p[0], q[1] - p[1])), L = this.ARM / ppu, zs = R.zs || 1;
    const P = (w) => { const o = [0, 0]; return cam.project(w[0], w[1], w[2], o) ? o : null; };
    // eksen doğrultuları (dünya); Z ekranda düşey abartıyla aynı boyda görünsün
    const dir = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1 / zs] };
    const at = (k, s) => { const d = dir[k]; return P([Ow[0] + d[0] * L * s, Ow[1] + d[1] * L * s, Ow[2] + d[2] * L * s]); };
    const pl = (a, b, u, v) => { const da = dir[a], db = dir[b]; return P([Ow[0] + (da[0] * u + db[0] * v) * L, Ow[1] + (da[1] * u + db[1] * v) * L, Ow[2] + (da[2] * u + db[2] * v) * L]); };
    const g = { O: p, Ow, L, ppu, cam, P, at, pl, dir, end: {}, vis: {}, f: cam.f };
    for (const k of ['x', 'y', 'z']) { g.end[k] = at(k, 1); g.vis[k] = !!g.end[k] && Math.hypot(g.end[k][0] - p[0], g.end[k][1] - p[1]) > 0.22 * this.ARM; }
    // düzlem görünürlüğü: normali bakışa dik değilse
    const fz = [cam.f[0], cam.f[1], cam.f[2]];
    g.pvis = { xy: Math.abs(fz[2]) > 0.18, yz: Math.abs(fz[0]) > 0.18, xz: Math.abs(fz[1]) > 0.18 };
    return g;
  }
  // Ekran noktasından dünya ışını (z gerçek)
  ray(sx, sy) {
    const R = this.R, { r, u, f } = R.basis(), zs = R.zs || 1, s = R.scale;
    const a = (sx - R.W / 2) / s, b = (R.H / 2 - sy) / s, T = [R.cx, R.cy, R.cz * zs];
    const q = [T[0] + r[0] * a + u[0] * b, T[1] + r[1] * a + u[1] * b, T[2] + u[2] * b];
    let o, d;
    if (R.persp) { const D = (R.H / 2) / (s * Math.tan(R.fov * Math.PI / 360)); o = [T[0] - f[0] * D, T[1] - f[1] * D, T[2] - f[2] * D]; d = [q[0] - o[0], q[1] - o[1], q[2] - o[2]]; }
    else { o = q; d = f.slice(); }
    return { o: [o[0], o[1], o[2] / zs], d: [d[0], d[1], d[2] / zs] };
  }
  rayPlane(ray, P0, n) {
    const den = gzDot(ray.d, n); if (Math.abs(den) < 1e-12) return null;
    const t = gzDot([P0[0] - ray.o[0], P0[1] - ray.o[1], P0[2] - ray.o[2]], n) / den;
    return [ray.o[0] + ray.d[0] * t, ray.o[1] + ray.d[1] * t, ray.o[2] + ray.d[2] * t];
  }
  // ışına en yakın eksen noktasının parametresi (O + s·u)
  rayAxis(ray, O, u) {
    const w0 = [O[0] - ray.o[0], O[1] - ray.o[1], O[2] - ray.o[2]];
    const a = gzDot(u, u), b = gzDot(u, ray.d), c = gzDot(ray.d, ray.d), d = gzDot(u, w0), e = gzDot(ray.d, w0), den = a * c - b * b;
    if (Math.abs(den) < 1e-12 * a * c) return null;
    return (b * e - c * d) / den;
  }
  // Halka noktaları (dünya) — k ekseni etrafında, yarıçap L
  ring(g, k, n) {
    const O = g.Ow, L = g.L, e = k === 'x' ? [[0, 1, 0], [0, 0, 1]] : k === 'y' ? [[0, 0, 1], [1, 0, 0]] : [[1, 0, 0], [0, 1, 0]];
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
      pts.push([O[0] + L * (e[0][0] * c + e[1][0] * s), O[1] + L * (e[0][1] * c + e[1][1] * s), O[2] + L * (e[0][2] * c + e[1][2] * s)]);
    }
    return { pts, e };
  }
  // halka tam yandan görünmüyorsa (ekseni bakışa dik değilse) gösterilir — plan görünümde yalnız Z halkası
  ringVis(g, k) { const u = GZ_AX[k], zs = this.R.zs || 1; return Math.abs(gzDot(gzNorm([u[0], u[1], u[2] * zs]), g.f)) > 0.06; }
  // göze dönük mü (halka noktası)
  front(g, w) { const f = g.f, zs = this.R.zs || 1; return (w[0] - g.Ow[0]) * -f[0] + (w[1] - g.Ow[1]) * -f[1] + (w[2] - g.Ow[2]) * zs * -f[2] >= -1e-9 * g.L; }

  hit(sx, sy) {
    if (!this.active) return null;
    const g = this.frame(this.origin()); if (!g) return null;
    const d = (a, b) => (a && b) ? segDist(sx, sy, a[0], a[1], b[0], b[1]) : Infinity;
    const near = (pt, r) => pt && Math.hypot(sx - pt[0], sy - pt[1]) <= r;
    const quad = (a, b, u0, u1) => [g.pl(a, b, u0, u0), g.pl(a, b, u1, u0), g.pl(a, b, u1, u1), g.pl(a, b, u0, u1)];
    const PL = [['xy', 'x', 'y'], ['yz', 'y', 'z'], ['xz', 'x', 'z']];
    if (this.mode === 'move') {
      if (near(g.O, 8)) return 'v';
      let best = null, bd = 7;
      for (const k of ['x', 'y', 'z']) if (g.vis[k]) { const e = g.at(k, 1.12), dd = d(g.O, e); if (dd < bd && Math.hypot(sx - g.O[0], sy - g.O[1]) > 10) { bd = dd; best = k; } }
      if (best) return best;
      for (const [pk, a, b] of PL) if (g.pvis[pk]) { const Q = quad(a, b, 0.2, 0.46); if (Q.every(Boolean) && pointInPoly(sx, sy, Q)) return pk; }
      return null;
    }
    if (this.mode === 'rotate') {
      let best = null, bd = 7;
      for (const k of ['x', 'y', 'z']) {
        if (!this.ringVis(g, k)) continue;
        const { pts } = this.ring(g, k, 72), sp = pts.map(g.P);
        for (let i = 1; i < pts.length; i++) {
          if (!sp[i - 1] || !sp[i] || !this.front(g, pts[i - 1]) || !this.front(g, pts[i])) continue;
          const dd = d(sp[i - 1], sp[i]); if (dd < bd) { bd = dd; best = k; }
        }
      }
      if (best) return best;
      const rr = Math.hypot(sx - g.O[0], sy - g.O[1]);
      if (Math.abs(rr - this.ARM * 1.22) < 7) return 'v';
      return null;
    }
    // ölçek
    if (near(g.O, 9)) return 'xyz';
    for (const k of ['x', 'y', 'z']) if (g.vis[k] && near(g.end[k], 9)) return k;
    for (const [pk, a, b] of PL) if (g.pvis[pk]) {
      const Q = [g.at(a, 0.42), g.at(a, 0.68), g.at(b, 0.68), g.at(b, 0.42)];
      if (Q.every(Boolean) && pointInPoly(sx, sy, Q)) return pk;
    }
    for (const k of ['x', 'y', 'z']) if (g.vis[k] && d(g.O, g.end[k]) < 6) return k;
    return null;
  }

  begin(handle, e) {
    const O = this.origin().slice(), g = this.frame(O); if (!g) return false;
    const D = { h: handle, sx: e.offsetX, sy: e.offsetY, O, g, M: M_ID.slice(), label: '', disp: O.slice(), k: [1, 1, 1] };
    const ray = this.ray(e.offsetX, e.offsetY), zs = this.R.zs || 1;
    if (this.mode === 'move') {
      if (GZ_AX[handle]) D.s0 = this.rayAxis(ray, O, GZ_AX[handle]);
      else {
        D.n = handle === 'v' ? gzNorm([g.f[0], g.f[1], g.f[2] * zs]) : handle === 'xy' ? [0, 0, 1] : handle === 'yz' ? [1, 0, 0] : [0, 1, 0];
        D.p0 = this.rayPlane(ray, O, D.n);
      }
    } else if (this.mode === 'rotate') {
      if (handle === 'v') { D.axis = gzNorm([-g.f[0], -g.f[1], -g.f[2] * zs]); D.a0 = Math.atan2(-(e.offsetY - g.O[1]), e.offsetX - g.O[0]); }
      else {
        const u = GZ_AX[handle]; D.axis = u;
        const { pts, e: E2 } = this.ring(g, handle, 144); D.e = E2;
        // halka ekrana dönükse düzlemde açı izle; yan görünüyorsa teğet boyunca sürükle
        const fd = Math.abs(gzDot(gzNorm([u[0], u[1], u[2] * zs]), g.f));
        if (fd > 0.3) { D.plane = true; const p = this.rayPlane(ray, O, u); D.a0 = p ? this.ang(D, p) : 0; }
        else {
          let bi = 0, bd = Infinity;
          pts.forEach((w, i) => { const s = g.P(w); if (s && this.front(g, w)) { const dd = Math.hypot(s[0] - e.offsetX, s[1] - e.offsetY); if (dd < bd) { bd = dd; bi = i; } } });
          const G = pts[bi], t = gzCross(u, [G[0] - O[0], G[1] - O[1], G[2] - O[2]]);
          const s0 = g.P(G), s1 = g.P([G[0] + t[0] * 0.05, G[1] + t[1] * 0.05, G[2] + t[2] * 0.05]);
          const tx = s1[0] - s0[0], ty = s1[1] - s0[1], tl = Math.hypot(tx, ty) || 1;
          D.tan = [tx / tl, ty / tl]; D.grab = G;
        }
      }
      D.deg = 0;
    }
    this.drag = D;
    return true;
  }
  ang(D, p) { const v = [p[0] - D.O[0], p[1] - D.O[1], p[2] - D.O[2]]; return Math.atan2(gzDot(v, D.e[1]), gzDot(v, D.e[0])); }
  move(e, shift) {
    const D = this.drag; if (!D) return;
    const g = D.g, O = D.O, h = D.h, R = this.R, F = fmtC, u = this.app.unit();
    const mx = e.offsetX - D.sx, my = e.offsetY - D.sy, ray = this.ray(e.offsetX, e.offsetY);
    let M = M_ID.slice(), label = '';
    if (this.mode === 'move') {
      let dv = [0, 0, 0];
      if (GZ_AX[h]) {
        const s = this.rayAxis(ray, O, GZ_AX[h]);
        if (s !== null && D.s0 !== null) { let t = s - D.s0; if (shift) { const st = gzNice(g.L / 8); t = Math.round(t / st) * st; } dv = GZ_AX[h].map(c => c * t); }
      } else if (D.p0) {
        const p = this.rayPlane(ray, O, D.n);
        if (p) { dv = [p[0] - D.p0[0], p[1] - D.p0[1], p[2] - D.p0[2]]; if (shift) { const st = gzNice(g.L / 8); dv = dv.map(c => Math.round(c / st) * st); } }
      }
      M = gzMove(dv[0], dv[1], dv[2]);
      D.disp = [O[0] + dv[0], O[1] + dv[1], O[2] + dv[2]];
      const parts = []; if (h !== 'y' && h !== 'z' && h !== 'yz') parts.push('ΔX ' + F(dv[0])); if (h !== 'x' && h !== 'z' && h !== 'xz') parts.push('ΔY ' + F(dv[1])); if (h === 'z' || h === 'yz' || h === 'xz' || (h === 'v' && Math.abs(dv[2]) > 0)) parts.push('ΔZ ' + F(dv[2]));
      label = parts.join('  ') + (u || '');
    } else if (this.mode === 'rotate') {
      let a;
      if (h === 'v') { a = Math.atan2(-(e.offsetY - g.O[1]), e.offsetX - g.O[0]) - D.a0; }
      else if (D.plane) { const p = this.rayPlane(ray, O, D.axis); a = p ? this.ang(D, p) - D.a0 : 0; }
      else a = (mx * D.tan[0] + my * D.tan[1]) / this.ARM;
      let deg = a * 180 / Math.PI; while (deg > 180) deg -= 360; while (deg <= -180) deg += 360;
      deg = shift ? Math.round(deg / 15) * 15 : Math.round(deg * 10) / 10;
      D.deg = deg;
      M = gzRot(O, D.axis, deg * Math.PI / 180);
      label = (h === 'v' ? 'Ekran' : h.toUpperCase()) + ' ekseni  ' + deg.toFixed(1) + '°';
    } else {
      const dirOf = (pt) => { const vx = pt[0] - g.O[0], vy = pt[1] - g.O[1], l = Math.hypot(vx, vy) || 1; return [vx / l, vy / l]; };
      let k;
      if (h === 'xyz') k = 1 + (mx - my) / (this.ARM * 1.3);
      else if (GZ_AX[h]) { const dd = dirOf(g.end[h]); k = 1 + (mx * dd[0] + my * dd[1]) / this.ARM; }
      else { const a = g.end[h[0]], b = g.end[h[1]], dd = dirOf([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); k = 1 + (mx * dd[0] + my * dd[1]) / (this.ARM * 0.8); }
      if (shift) k = Math.round(k * 10) / 10;
      k = Math.max(0.001, k);
      const sx = h.indexOf('x') >= 0 ? k : 1, sy = h.indexOf('y') >= 0 ? k : 1, sz = h.indexOf('z') >= 0 ? k : 1;
      D.k = [sx, sy, sz];
      M = gzScale(O, sx, sy, sz);
      label = (h === 'xyz' ? 'Ölçek ' : h.toUpperCase() + ' ölçeği ') + k.toFixed(3);
    }
    D.M = M; D.label = label;
    R.xf = M; R.request();
  }
  end() {
    const D = this.drag; this.drag = null;
    this.R.xf = [1, 0, 0, 1, 0, 0, 1, 0];
    if (!D) return;
    const ed = this.app.editor, ids = this.S.selList.slice();
    if (ed.core.xfIdentity(D.M)) { this.R.request(); return; }
    const kind = this.mode === 'rotate' ? 'rotate' : this.mode === 'scale' ? 'scale' : 'move';
    const label = ids.length + ' nesne ' + (kind === 'move' ? 'taşındı' : kind === 'rotate' ? 'döndürüldü' : 'ölçeklendi') + ' (' + D.label + ')';
    ed.xform(ids, D.M, kind, label);
    this.invalidate(); this.app.selChanged();
  }
  cancel() { if (this.drag) { this.drag = null; this.R.xf = [1, 0, 0, 1, 0, 0, 1, 0]; this.R.request(); } }

  draw(ctx) {
    if (!this.active) return;
    const D = this.drag, g = this.frame(D ? D.disp : this.origin()); if (!g) return;
    const hv = D ? D.h : this.hover, C = GZ_COL;
    const line = (a, b, col, w, alpha) => { if (!a || !b) return; ctx.globalAlpha = alpha || 1; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.globalAlpha = 1; };
    const poly = (Q, fill, stroke, alpha) => { if (!Q.every(Boolean)) return; ctx.beginPath(); Q.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1; if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } };
    const arrow = (a, b, col) => {
      if (!a || !b) return;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), tip = [b[0] + Math.cos(ang) * 13, b[1] + Math.sin(ang) * 13];
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(b[0] + Math.cos(ang + Math.PI / 2) * 5, b[1] + Math.sin(ang + Math.PI / 2) * 5); ctx.lineTo(b[0] + Math.cos(ang - Math.PI / 2) * 5, b[1] + Math.sin(ang - Math.PI / 2) * 5);
      ctx.closePath(); ctx.fill();
    };
    const box = (p, col, s) => { if (!p) return; ctx.fillStyle = col; ctx.fillRect(p[0] - s, p[1] - s, 2 * s, 2 * s); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1; ctx.strokeRect(p[0] - s + .5, p[1] - s + .5, 2 * s - 1, 2 * s - 1); };
    const isOn = (k) => hv === k || (hv && hv.length > 1 && hv !== 'xyz' && hv.indexOf(k) >= 0 && this.mode !== 'rotate') || (hv === 'xyz' && this.mode === 'scale');
    const PL = [['xy', 'x', 'y'], ['yz', 'y', 'z'], ['xz', 'x', 'z']];
    ctx.save(); ctx.lineCap = 'round';
    if (this.mode === 'move') {
      for (const [pk, a, b] of PL) if (g.pvis[pk] && g.vis[a] && g.vis[b]) {
        const Q = [g.pl(a, b, 0.2, 0.2), g.pl(a, b, 0.46, 0.2), g.pl(a, b, 0.46, 0.46), g.pl(a, b, 0.2, 0.46)], on = hv === pk;
        poly(Q, on ? C.hi : (pk === 'xy' ? C.z : pk === 'yz' ? C.x : C.y), on ? C.hi : 'rgba(255,255,255,.35)', on ? 0.5 : 0.18);
      }
      for (const k of ['x', 'y', 'z']) if (g.vis[k]) { const col = isOn(k) ? C.hi : C[k]; line(g.O, g.end[k], col, isOn(k) ? 3 : 2); arrow(g.O, g.end[k], col); }
      ctx.fillStyle = hv === 'v' ? C.hi : '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
      ctx.fillRect(g.O[0] - 4.5, g.O[1] - 4.5, 9, 9); ctx.strokeRect(g.O[0] - 4.5, g.O[1] - 4.5, 9, 9);
      if (D) { const s = g.P(D.O); if (s) { ctx.setLineDash([4, 4]); line(s, g.O, '#ffffff', 1, 0.6); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(s[0], s[1], 3, 0, 2 * Math.PI); ctx.fill(); } }
    } else if (this.mode === 'rotate') {
      // dış ekran halkası
      ctx.strokeStyle = hv === 'v' ? C.hi : C.v; ctx.lineWidth = hv === 'v' ? 3 : 1.5; ctx.globalAlpha = hv === 'v' ? 1 : 0.7;
      ctx.beginPath(); ctx.arc(g.O[0], g.O[1], this.ARM * 1.22, 0, 2 * Math.PI); ctx.stroke(); ctx.globalAlpha = 1;
      // arka yarılar soluk, ön yarılar belirgin
      for (const pass of [0, 1]) for (const k of ['x', 'y', 'z']) {
        if (!this.ringVis(g, k)) continue;
        const { pts } = this.ring(g, k, 96), sp = pts.map(g.P), on = hv === k;
        ctx.strokeStyle = on ? C.hi : C[k]; ctx.lineWidth = pass ? (on ? 3.5 : 2.2) : 1.2; ctx.globalAlpha = pass ? 1 : 0.28;
        ctx.beginPath(); let pen = false;
        for (let i = 0; i < pts.length; i++) {
          const fr = this.front(g, pts[i]);
          if (!sp[i] || (pass ? !fr : fr)) { pen = false; continue; }
          if (!pen) { ctx.moveTo(sp[i][0], sp[i][1]); pen = true; } else ctx.lineTo(sp[i][0], sp[i][1]);
        }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (D && D.deg) {
        // taranan açı dilimi
        ctx.beginPath(); ctx.moveTo(g.O[0], g.O[1]);
        const sw = D.deg * Math.PI / 180, n = 48;
        if (D.h === 'v') { for (let i = 0; i <= n; i++) { const a = D.a0 + sw * i / n, r = this.ARM * 1.22; ctx.lineTo(g.O[0] + r * Math.cos(a), g.O[1] - r * Math.sin(a)); } }
        else {
          const u = D.axis, O = D.O;
          let v0 = D.grab ? [D.grab[0] - O[0], D.grab[1] - O[1], D.grab[2] - O[2]] : (() => { const p = D.e, c = Math.cos(D.a0), s = Math.sin(D.a0); return [(p[0][0] * c + p[1][0] * s) * g.L, (p[0][1] * c + p[1][1] * s) * g.L, (p[0][2] * c + p[1][2] * s) * g.L]; })();
          for (let i = 0; i <= n; i++) { const Mr = gzRot([0, 0, 0], u, sw * i / n), w = [Mr[0] * v0[0] + Mr[1] * v0[1] + Mr[2] * v0[2] + O[0], Mr[4] * v0[0] + Mr[5] * v0[1] + Mr[6] * v0[2] + O[1], Mr[8] * v0[0] + Mr[9] * v0[1] + Mr[10] * v0[2] + O[2]]; const s = g.P(w); if (s) ctx.lineTo(s[0], s[1]); }
        }
        ctx.closePath(); ctx.globalAlpha = 0.22; ctx.fillStyle = D.h === 'v' ? C.v : C[D.h]; ctx.fill(); ctx.globalAlpha = 0.9; ctx.strokeStyle = C.hi; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(g.O[0], g.O[1], 3, 0, 2 * Math.PI); ctx.fill();
    } else {
      const ks = D ? D.k : [1, 1, 1], kOf = { x: ks[0], y: ks[1], z: ks[2] };
      for (const [pk, a, b] of PL) if (g.pvis[pk] && g.vis[a] && g.vis[b]) {
        const on = hv === pk || hv === 'xyz';
        poly([g.at(a, 0.42), g.at(a, 0.68), g.at(b, 0.68), g.at(b, 0.42)], on ? C.hi : '#ffffff', on ? C.hi : 'rgba(255,255,255,.45)', on ? 0.45 : 0.12);
      }
      for (const k of ['x', 'y', 'z']) if (g.vis[k]) {
        const e = g.at(k, Math.max(0.05, Math.min(4, kOf[k]))), on = isOn(k), col = on ? C.hi : C[k];
        line(g.O, e, col, on ? 3 : 2); box(e, col, on ? 6 : 5);
      }
      box(g.O, hv === 'xyz' ? C.hi : '#ffffff', 6);
    }
    if (D && D.label) {
      const m = this.app.mouse; ctx.font = '600 12px "Segoe UI", sans-serif';
      const w = ctx.measureText(D.label).width + 16;
      ctx.fillStyle = 'rgba(21,23,27,.92)'; ctx.strokeStyle = 'rgba(255,209,102,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(m.sx + 16, m.sy + 14, w, 24, 5); else ctx.rect(m.sx + 16, m.sy + 14, w, 24); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd166'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(D.label, m.sx + 24, m.sy + 26.5);
    }
    ctx.restore();
  }
}
function pointInPoly(x, y, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) if (((P[i][1] > y) !== (P[j][1] > y)) && (x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0])) c = !c;
  return c;
}
