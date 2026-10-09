/* Fast DXF — görünüm yardımcıları
 *  · Sol alt köşede eksen göstergesi (3ds Max gibi): X kırmızı, Y yeşil, Z mavi; görünümle birlikte döner
 *  · 0,0,0 başlangıç noktası: soluk eksen çizgileri ve küçük üçlü
 *  · 3B görünümde hafif zemin ızgarası (plan ızgarasıyla aynı adım mantığı; her 5 aralıkta koyu çizgi) */
'use strict';

const AX_COL = ['#e5534b', '#3fb950', '#4c9aff'];

class ViewAids {
  constructor(app) { this.app = app; this.R = app.R; }
  // ızgara adımı: ekranda en az minPx piksel
  step(minPx) {
    let st = Math.pow(10, Math.floor(Math.log10(minPx / this.R.scale)));
    for (const k of [1, 2, 5, 10]) if (st * k * this.R.scale >= minPx) { st *= k; break; }
    return st;
  }
  gridZ() { const zr = this.app.store.zext; return !zr || (zr[0] <= 0 && zr[1] >= 0) ? 0 : zr[0]; }
  grid3D(ctx) {
    const app = this.app, R = this.R, S = app.store; if (!S.info) return;
    const { f } = R.basis(); if (Math.abs(f[2]) < 0.08) return;   // zemin düzlemi ekrana dik: ızgara görünmez
    const z = this.gridZ(), o = S.info.origin, cam = R.cam();
    const c = R.ray(R.W / 2, R.H / 2, z); if (!c) return;
    let st = this.step(22);
    // görünen alan: köşe ışınları; ufkun ötesindeyse merkezden sınırlı
    const pts = [[0, 0], [R.W, 0], [0, R.H], [R.W, R.H]].map(q => R.ray(q[0], q[1], z));
    let bb;
    const lim = st * 120;
    if (pts.every(Boolean)) {
      bb = [Infinity, Infinity, -Infinity, -Infinity];
      for (const p of pts) { bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); }
    } else bb = [c[0] - lim, c[1] - lim, c[0] + lim, c[1] + lim];
    bb = [Math.max(bb[0], c[0] - lim * 4), Math.max(bb[1], c[1] - lim * 4), Math.min(bb[2], c[0] + lim * 4), Math.min(bb[3], c[1] + lim * 4)];
    while ((bb[2] - bb[0]) / st > 240 || (bb[3] - bb[1]) / st > 240) st *= 5;
    const ax0 = Math.floor((bb[0] + o[0]) / st), ax1 = Math.ceil((bb[2] + o[0]) / st), ay0 = Math.floor((bb[1] + o[1]) / st), ay1 = Math.ceil((bb[3] + o[1]) / st);
    const dark = R.dark, P = [0, 0], Q = [0, 0];
    const line = (x1, y1, x2, y2) => {
      const n = R.persp ? 12 : 1;
      for (let k = 0; k < n; k++) {
        const a = k / n, b = (k + 1) / n;
        if (cam.project(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, z, P) && cam.project(x1 + (x2 - x1) * b, y1 + (y2 - y1) * b, z, Q)) { ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); }
      }
    };
    ctx.save(); ctx.lineWidth = 1;
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.13)') : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)');
      ctx.beginPath();
      for (let i = ax0; i <= ax1; i++) { if ((i % 5 === 0) !== !!pass) continue; const x = i * st - o[0]; line(x, ay0 * st - o[1], x, ay1 * st - o[1]); }
      for (let j = ay0; j <= ay1; j++) { if ((j % 5 === 0) !== !!pass) continue; const y = j * st - o[1]; line(ax0 * st - o[0], y, ax1 * st - o[0], y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  // 0,0,0 noktası
  origin(ctx) {
    const app = this.app, R = this.R, S = app.store; if (!S.info) return;
    const o = app.rel(0, 0), sc = R.w2s(o[0], o[1], 0); if (!isFinite(sc[0])) return;
    ctx.save(); ctx.lineWidth = 1;
    if (R.is2D) {
      // soluk tam eksen çizgileri
      if (sc[1] >= 0 && sc[1] <= R.H) { ctx.strokeStyle = 'rgba(229,83,75,.30)'; ctx.beginPath(); ctx.moveTo(0, Math.round(sc[1]) + .5); ctx.lineTo(R.W, Math.round(sc[1]) + .5); ctx.stroke(); }
      if (sc[0] >= 0 && sc[0] <= R.W) { ctx.strokeStyle = 'rgba(63,185,80,.30)'; ctx.beginPath(); ctx.moveTo(Math.round(sc[0]) + .5, 0); ctx.lineTo(Math.round(sc[0]) + .5, R.H); ctx.stroke(); }
    } else {
      // 3B: ızgara kapsamında eksen çizgileri
      const L = 2000 / R.scale, cam = R.cam(), P = [0, 0], Q = [0, 0], n = R.persp ? 16 : 1;
      [[1, 0, 0], [0, 1, 0]].forEach((a, i) => {
        ctx.strokeStyle = i ? 'rgba(63,185,80,.32)' : 'rgba(229,83,75,.32)'; ctx.beginPath();
        for (let k = 0; k < n; k++) {
          const t0 = -L + 2 * L * k / n, t1 = -L + 2 * L * (k + 1) / n;
          if (cam.project(o[0] + a[0] * t0, o[1] + a[1] * t0, 0, P) && cam.project(o[0] + a[0] * t1, o[1] + a[1] * t1, 0, Q)) { ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); }
        }
        ctx.stroke();
      });
    }
    if (sc[0] < -40 || sc[0] > R.W + 40 || sc[1] < -40 || sc[1] > R.H + 40) { ctx.restore(); return; }
    // küçük üçlü (24 px)
    const len = 24 / R.scale;
    [[len, 0, 0], [0, len, 0], [0, 0, len]].forEach((a, i) => {
      if (R.is2D && i === 2) return;
      const e = R.w2s(o[0] + a[0], o[1] + a[1], a[2]); if (!isFinite(e[0])) return;
      ctx.strokeStyle = AX_COL[i]; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sc[0], sc[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
    });
    ctx.globalAlpha = 0.85; ctx.fillStyle = R.dark ? '#d6dae0' : '#333'; ctx.beginPath(); ctx.arc(sc[0], sc[1], 2.2, 0, 2 * Math.PI); ctx.fill();
    ctx.font = '10px "Segoe UI", sans-serif'; ctx.globalAlpha = 0.6; ctx.textAlign = 'left'; ctx.fillText('0,0,0', sc[0] + 5, sc[1] + 12);
    ctx.restore();
  }
  // sol alt köşe eksen göstergesi
  tripod(ctx) {
    const R = this.R, { r, u, f } = R.basis(), cx = 40, cy = R.H - 40, L = 26;
    const ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((a, i) => ({ i, x: a[0] * r[0] + a[1] * r[1] + a[2] * r[2], y: -(a[0] * u[0] + a[1] * u[1] + a[2] * u[2]), d: a[0] * f[0] + a[1] * f[1] + a[2] * f[2] }));
    ax.sort((a, b) => b.d - a.d);   // uzaktakiler önce
    ctx.save();
    ctx.fillStyle = R.dark ? 'rgba(17,19,23,.45)' : 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(cx, cy, 34, 0, 2 * Math.PI); ctx.fill();
    ctx.font = '600 11px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const a of ax) {
      const ex = cx + a.x * L, ey = cy + a.y * L, back = a.d > 0.2, len = Math.hypot(a.x, a.y);
      ctx.globalAlpha = back ? 0.78 : 1; ctx.strokeStyle = ctx.fillStyle = AX_COL[a.i]; ctx.lineWidth = 2.2;
      if (len < 0.12) {   // eksen bakış doğrultusunda: nokta (bize doğru) ya da halka (uzağa)
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 2 * Math.PI); if (a.d < 0) ctx.fill(); else { ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.fillText('XYZ'[a.i], cx + 9, cy - 9); continue;
      }
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey, 2.6, 0, 2 * Math.PI); ctx.fill();
      ctx.fillText('XYZ'[a.i], ex + a.x / len * 9, ey + a.y / len * 9);
    }
    ctx.restore();
  }
}

FastDXF.use({
  name: 'gorunum-yardimcilari',
  init(app) {
    const V = app.viewAids = new ViewAids(app);
    app.hooks.under.push((ctx) => {
      if (app.settings.grid && !app.R.is2D) V.grid3D(ctx);
      if (app.settings.originMark !== false) V.origin(ctx);
    });
    app.hooks.preview.push((ctx) => { if (app.settings.axisTripod !== false && app.store.file) V.tripod(ctx); });
  }
});
