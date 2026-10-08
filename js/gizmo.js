/* DXF Okuyucu — seçim dönüşüm tutamacı (gizmo): Taşı (X/Y/Z okları, XY düzlemi), Döndür (Z halkası), Ölçekle (XYZ / XY / Z)
 * Sürüklerken seçim GPU'da önizlenir (Renderer.xf); bırakınca tek bir geri alınabilir komut olarak uygulanır. */
'use strict';

class Gizmo {
  constructor(app) {
    this.app = app; this.R = app.R; this.S = app.store;
    this.mode = 'move';        // 'move' | 'rotate' | 'scale'
    this.enabled = true;
    this.hover = null; this.drag = null; this.center = null;
    this.ARM = 85;             // ekranda kol uzunluğu (piksel)
  }
  get active() { return this.enabled && this.app.toolName === 'select' && this.S.done && this.S.selList.length > 0; }
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
  // ekrandaki çizim elemanları
  geom() {
    const R = this.R, O = this.origin(), cam = R.cam(), p = [0, 0], q = [0, 0];
    if (!cam.project(O[0], O[1], O[2], p)) return null;
    // O'daki piksel/birim (kamera sağ yönünde)
    cam.project(O[0] + cam.r[0], O[1] + cam.r[1], O[2], q);
    const ppu = Math.max(1e-12, Math.hypot(q[0] - p[0], q[1] - p[1])), L = this.ARM / ppu;
    const end = (dx, dy, dz) => { const o = [0, 0]; cam.project(O[0] + dx * L, O[1] + dy * L, O[2] + dz * L / R.zs, o); return o; };
    const g = { O: p.slice(), L, ppu, x: end(1, 0, 0), y: end(0, 1, 0), z: end(0, 0, 1), cam };
    const len = (e) => Math.hypot(e[0] - p[0], e[1] - p[1]);
    g.showZ = len(g.z) > 14; g.showX = len(g.x) > 14; g.showY = len(g.y) > 14;
    g.ring = []; for (let k = 0; k <= 64; k++) { const a = k / 64 * 2 * Math.PI, o = [0, 0]; cam.project(O[0] + Math.cos(a) * L, O[1] + Math.sin(a) * L, O[2], o); g.ring.push(o); }
    g.xy = [end(0.28, 0, 0), end(0.28, 0.28, 0), end(0, 0.28, 0)];
    return g;
  }
  hit(sx, sy) {
    if (!this.active) return null;
    const g = this.geom(); if (!g) return null;
    const d = (a, b) => segDist(sx, sy, a[0], a[1], b[0], b[1]);
    const near = (pt, r) => Math.hypot(sx - pt[0], sy - pt[1]) <= r;
    if (this.mode === 'move') {
      // XY düzlem karesi
      const P = [g.O, g.xy[0], g.xy[1], g.xy[2]];
      if (g.showX && g.showY && pointInPoly(sx, sy, P)) return 'xy';
      if (g.showZ && d(g.O, g.z) < 7) return 'z';
      if (g.showX && d(g.O, g.x) < 7) return 'x';
      if (g.showY && d(g.O, g.y) < 7) return 'y';
      if (near(g.O, 9)) return 'xy';
    } else if (this.mode === 'rotate') {
      for (let k = 1; k < g.ring.length; k++) if (d(g.ring[k - 1], g.ring[k]) < 7) return 'ring';
    } else {
      if (near(g.O, 9)) return 's';
      if (g.showZ && near(g.z, 9)) return 'sz';
      if ((g.showX && near(g.x, 9)) || (g.showY && near(g.y, 9))) return 'sxy';
      if (g.showZ && d(g.O, g.z) < 6) return 'sz';
      if ((g.showX && d(g.O, g.x) < 6) || (g.showY && d(g.O, g.y) < 6)) return 'sxy';
    }
    return null;
  }
  // dünya noktası: Z düzlemi (O.z) üzerinde
  planePt(sx, sy) {
    const R = this.R, O = this.origin();
    if (R.is2D) return R.s2w(sx, sy);
    const p = R.ray(sx, sy, O[2]); return p ? [p[0], p[1]] : null;
  }
  begin(handle, e) {
    const g = this.geom(); if (!g) return false;
    this.drag = { h: handle, sx: e.offsetX, sy: e.offsetY, g, O: this.origin().slice(), p0: this.planePt(e.offsetX, e.offsetY), T: [1, 0, 0, 1, 0, 0, 1, 0], label: '' };
    return true;
  }
  move(e, shift) {
    const D = this.drag; if (!D) return;
    const g = D.g, O = D.O, h = D.h, R = this.R;
    const mx = e.offsetX - D.sx, my = e.offsetY - D.sy;
    const axisDelta = (end) => { const vx = end[0] - g.O[0], vy = end[1] - g.O[1], l = Math.hypot(vx, vy); return (mx * vx + my * vy) / l / l * g.L; };
    const snap = (v, st) => shift ? Math.round(v / st) * st : v;
    let T = [1, 0, 0, 1, 0, 0, 1, 0], label = '';
    const u = this.app.unit(), F = fmtC;
    if (h === 'x' || h === 'y') {
      const dd = axisDelta(h === 'x' ? g.x : g.y);
      T = h === 'x' ? [1, 0, 0, 1, dd, 0, 1, 0] : [1, 0, 0, 1, 0, dd, 1, 0];
      label = (h === 'x' ? 'ΔX ' : 'ΔY ') + F(dd) + u;
    } else if (h === 'z') {
      const dd = axisDelta(g.z) / R.zs; T = [1, 0, 0, 1, 0, 0, 1, dd]; label = 'ΔZ ' + F(dd) + u;
    } else if (h === 'xy') {
      const p = this.planePt(e.offsetX, e.offsetY);
      if (p && D.p0) { const dx = p[0] - D.p0[0], dy = p[1] - D.p0[1]; T = [1, 0, 0, 1, dx, dy, 1, 0]; label = 'ΔX ' + F(dx) + '  ΔY ' + F(dy); }
    } else if (h === 'ring') {
      const p = this.planePt(e.offsetX, e.offsetY);
      if (p && D.p0) {
        let a = Math.atan2(p[1] - O[1], p[0] - O[0]) - Math.atan2(D.p0[1] - O[1], D.p0[0] - O[0]);
        let deg = a * 180 / Math.PI; while (deg > 180) deg -= 360; while (deg <= -180) deg += 360;
        deg = shift ? Math.round(deg / 15) * 15 : Math.round(deg * 10) / 10;
        T = this.app.editor.rotT(O[0], O[1], deg); label = 'Açı ' + deg.toFixed(1) + '°';
        D.deg = deg;
      }
    } else {
      // ölçek: başlangıca göre ekrandaki uzaklık oranı
      let k;
      if (h === 'sz') { const vx = g.z[0] - g.O[0], vy = g.z[1] - g.O[1], l = Math.hypot(vx, vy); k = 1 + (mx * vx + my * vy) / l / l; }
      else { const r0 = Math.max(4, Math.hypot(D.sx - g.O[0], D.sy - g.O[1])), r1 = Math.hypot(e.offsetX - g.O[0], e.offsetY - g.O[1]); k = h === 's' && r0 < 12 ? Math.exp(-my / 120) : r1 / r0; }
      k = Math.max(1e-4, k); k = snap(k, 0.25) || 0.25;
      if (h === 'sz') { T = this.app.editor.scaleT(O[0], O[1], O[2], 1, k); label = 'Z ölçeği ' + k.toFixed(3); }
      else if (h === 'sxy') { T = this.app.editor.scaleT(O[0], O[1], O[2], k, 1); label = 'XY ölçeği ' + k.toFixed(3); }
      else { T = this.app.editor.scaleT(O[0], O[1], O[2], k, k); label = 'Ölçek ' + k.toFixed(3); }
      D.k = k;
    }
    D.T = T; D.label = label;
    R.xf = T; R.request();
  }
  end() {
    const D = this.drag; this.drag = null;
    this.R.xf = [1, 0, 0, 1, 0, 0, 1, 0];
    if (!D) return;
    const ed = this.app.editor, ids = this.S.selList.slice();
    const h = D.h, T = D.T;
    if (ed.core.xfIdentity(T)) { this.R.request(); return; }
    const kind = h === 'ring' ? 'rotate' : (h[0] === 's' ? 'scale' : 'move');
    const label = ids.length + ' nesne ' + (kind === 'move' ? 'taşındı (' + D.label + ')' : kind === 'rotate' ? 'döndürüldü (' + D.label + ')' : 'ölçeklendi (' + D.label + ')');
    ed.xform(ids, T, kind, label);
    this.invalidate(); this.app.selChanged();
  }
  cancel() { if (this.drag) { this.drag = null; this.R.xf = [1, 0, 0, 1, 0, 0, 1, 0]; this.R.request(); } }
  draw(ctx) {
    if (!this.active) return;
    const g = this.drag ? this.drag.g : this.geom(); if (!g) return;
    const hv = this.drag ? this.drag.h : this.hover;
    const col = { x: '#e5534b', y: '#3fb950', z: '#4c9aff', hi: '#ffd166' };
    const arrow = (a, b, c, hl) => {
      ctx.strokeStyle = hl ? col.hi : c; ctx.fillStyle = hl ? col.hi : c; ctx.lineWidth = hl ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.beginPath(); ctx.moveTo(b[0] + Math.cos(ang) * 10, b[1] + Math.sin(ang) * 10);
      ctx.lineTo(b[0] + Math.cos(ang + 2.5) * 9, b[1] + Math.sin(ang + 2.5) * 9); ctx.lineTo(b[0] + Math.cos(ang - 2.5) * 9, b[1] + Math.sin(ang - 2.5) * 9); ctx.closePath(); ctx.fill();
    };
    const box = (p, c, hl, s) => { s = s || 5; ctx.fillStyle = hl ? col.hi : c; ctx.fillRect(p[0] - s, p[1] - s, 2 * s, 2 * s); ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.strokeRect(p[0] - s + .5, p[1] - s + .5, 2 * s - 1, 2 * s - 1); };
    ctx.save();
    if (this.mode === 'move') {
      if (g.showX && g.showY) {
        ctx.beginPath(); ctx.moveTo(g.O[0], g.O[1]); for (const p of g.xy) ctx.lineTo(p[0], p[1]); ctx.closePath();
        ctx.fillStyle = hv === 'xy' ? 'rgba(255,209,102,.45)' : 'rgba(255,209,102,.16)'; ctx.fill();
        ctx.strokeStyle = hv === 'xy' ? col.hi : 'rgba(255,209,102,.7)'; ctx.lineWidth = 1; ctx.stroke();
      }
      if (g.showX) arrow(g.O, g.x, col.x, hv === 'x');
      if (g.showY) arrow(g.O, g.y, col.y, hv === 'y');
      if (g.showZ) arrow(g.O, g.z, col.z, hv === 'z');
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(g.O[0], g.O[1], 3.5, 0, 2 * Math.PI); ctx.fill();
    } else if (this.mode === 'rotate') {
      ctx.strokeStyle = hv === 'ring' ? col.hi : col.z; ctx.lineWidth = hv === 'ring' ? 3.5 : 2.5;
      ctx.beginPath(); g.ring.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      if (this.drag && this.drag.deg) {
        // taranan açı dilimi
        const O = this.drag.O, R = this.R, cam = g.cam, a0 = Math.atan2(this.drag.p0[1] - O[1], this.drag.p0[0] - O[0]), sw = this.drag.deg * Math.PI / 180;
        ctx.beginPath(); ctx.moveTo(g.O[0], g.O[1]);
        for (let k = 0; k <= 32; k++) { const a = a0 + sw * k / 32, o = [0, 0]; cam.project(O[0] + Math.cos(a) * g.L, O[1] + Math.sin(a) * g.L, O[2], o); ctx.lineTo(o[0], o[1]); }
        ctx.closePath(); ctx.fillStyle = 'rgba(76,154,255,.22)'; ctx.fill();
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(g.O[0], g.O[1], 3.5, 0, 2 * Math.PI); ctx.fill();
    } else {
      ctx.lineWidth = 2;
      if (g.showX) { ctx.strokeStyle = col.x; ctx.beginPath(); ctx.moveTo(g.O[0], g.O[1]); ctx.lineTo(g.x[0], g.x[1]); ctx.stroke(); box(g.x, col.x, hv === 'sxy'); }
      if (g.showY) { ctx.strokeStyle = col.y; ctx.beginPath(); ctx.moveTo(g.O[0], g.O[1]); ctx.lineTo(g.y[0], g.y[1]); ctx.stroke(); box(g.y, col.y, hv === 'sxy'); }
      if (g.showZ) { ctx.strokeStyle = col.z; ctx.beginPath(); ctx.moveTo(g.O[0], g.O[1]); ctx.lineTo(g.z[0], g.z[1]); ctx.stroke(); box(g.z, col.z, hv === 'sz'); }
      box(g.O, '#ffffff', hv === 's', 6);
    }
    if (this.drag && this.drag.label) {
      const m = this.app.mouse; ctx.font = '600 12px "Segoe UI", sans-serif';
      const w = ctx.measureText(this.drag.label).width + 14;
      ctx.fillStyle = 'rgba(21,23,27,.9)'; ctx.fillRect(m.sx + 14, m.sy + 14, w, 22);
      ctx.fillStyle = '#ffd166'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(this.drag.label, m.sx + 21, m.sy + 25);
    }
    ctx.restore();
  }
}
function pointInPoly(x, y, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) if (((P[i][1] > y) !== (P[j][1] > y)) && (x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0])) c = !c;
  return c;
}
