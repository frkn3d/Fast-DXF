/* Fast DXF — hizalama: nesne yakalama izi (OTRACK, F11) ve kutupsal izleme (POLAR, F10), AutoCAD gibi
 *  · Yakalama noktası üzerinde imleç ~0,4 sn bekletilirse nokta "alınır" (yeşil +); tekrar bekletilirse bırakılır (en çok 7).
 *  · Alınan noktalardan yatay/dikey (kutupsal açıksa tüm açı adımlarında) sonsuz hiza çizgileri çıkar; imleç çizgiye,
 *    iki çizginin kesişimine oturur.
 *  · Kutupsal: aracın son noktasından açı adımlarında (90°, 45°, 30°…) ışınlar.
 *  · Çizilmekte olan nesnenin önceki noktaları (polyline köşeleri…) kendiliğinden hizalanır.
 *  · Hiza etkinken sayı yazmak: o yönde o uzaklıkta nokta (doğrudan uzaklık girişi). */
'use strict';

// birim yön; 90°'nin katlarında tam değer (cos 90° = 6e-17 artığı yatay/düşey hizayı bozmasın)
function dirOf(deg) {
  const k = ((deg % 360) + 360) % 360;
  if (Math.abs(k - Math.round(k / 90) * 90) < 1e-9) return [[1, 0], [0, 1], [-1, 0], [0, -1]][Math.round(k / 90) % 4];
  const r = deg * Math.PI / 180; return [Math.cos(r), Math.sin(r)];
}

class Tracker {
  constructor(app) {
    this.app = app; this.R = app.R;
    const st = app.settings;
    this.otrack = st.otrack !== false; this.polar = st.polar !== false; this.inc = st.polarInc || 90;
    this.acq = [];            // alınan noktalar [x, y, z] (göreli)
    this.hover = null;        // { key, t, p }
    this.active = null;       // son hesaplanan hiza { p, lines:[{o, ang}], label }
    this.timer = 0;
  }
  reset() { this.acq = []; this.hover = null; this.active = null; }
  enabled() { const t = this.app.tool; return (this.otrack || this.polar) && t && t.wantsPoints && this.R.is2D && this.app.store.grid; }
  // yakalama sonrası: bekletilen noktayı al / bırak
  onSnap() {
    if (!this.otrack || !this.enabled()) { this.hover = null; return; }
    const sp = this.app.snapPt;
    if (!sp) { this.hover = null; return; }
    // aynı nokta mı: ekranda 3 pikselden yakın (tam koordinata düzeltme sayacı sıfırlamasın)
    const tol = 3 / this.R.scale, h = this.hover;
    if (h && Math.hypot(h.p[0] - sp.p[0], h.p[1] - sp.p[1]) <= tol) return;
    this.hover = { t: performance.now(), p: sp.p.slice(), done: false };
    clearTimeout(this.timer);
    const me = this.hover;
    this.timer = setTimeout(() => this.dwell(me), 420);
  }
  dwell(h) {
    if (this.hover !== h || h.done) return;
    const sp = this.app.snapPt; if (!sp || Math.hypot(h.p[0] - sp.p[0], h.p[1] - sp.p[1]) > 3 / this.R.scale) return;
    h.done = true;
    const p = sp.p.slice(), tol = 1e-9 + 1 / this.R.scale;
    const k = this.acq.findIndex(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol);
    if (k >= 0) this.acq.splice(k, 1); else { this.acq.push(p); if (this.acq.length > 7) this.acq.shift(); }
    this.R.request();
  }
  angles() { const out = []; for (let a = 0; a < 360 - 1e-9; a += this.inc) out.push(a); return out; }
  // İmleç noktası için hiza (yoksa null)
  solve(p, base) {
    this.active = null;
    if (!this.enabled()) return null;
    const tol = (this.app.settings.aperture || 12) / this.R.scale;
    const lines = [];
    const trackAng = this.polar ? this.angles() : [0, 90, 180, 270];
    // alınan noktalar ve çizilmekte olan nesnenin önceki noktaları (ör. polyline'ın ilk noktası): iki yönlü sonsuz çizgi
    const own = this.otrack ? this.app.toolPts().slice(-6).filter(q => !(base && Math.hypot(q[0] - base[0], q[1] - base[1]) < 1e-9)) : [];
    for (const q of this.acq.concat(own)) for (const a of trackAng) if (a < 180) lines.push({ o: q, ang: a, both: true, src: 'iz' });
    // kutupsal: son noktadan ışın
    if (this.polar && base) for (const a of this.angles()) lines.push({ o: base, ang: a, both: false, src: 'kutupsal' });
    if (!lines.length) return null;
    const cand = [];
    for (const L of lines) {
      const [dx, dy] = dirOf(L.ang);
      const vx = p[0] - L.o[0], vy = p[1] - L.o[1], t = vx * dx + vy * dy;
      if (!L.both && t <= 0) continue;
      const d = Math.abs(-vx * dy + vy * dx);
      if (d <= tol) cand.push({ L, t, d, dx, dy });
    }
    if (!cand.length) return null;
    cand.sort((a, b) => a.d - b.d);
    let best = cand[0], pt = [best.L.o[0] + best.dx * best.t, best.L.o[1] + best.dy * best.t];
    let used = [best];
    // iki farklı çizginin kesişimi imlece yakınsa oraya otur
    for (let i = 1; i < cand.length; i++) {
      const c = cand[i]; if (c.L.o === best.L.o && c.L.ang === best.L.ang) continue;
      const den = best.dx * c.dy - best.dy * c.dx; if (Math.abs(den) < 1e-9) continue;
      const wx = c.L.o[0] - best.L.o[0], wy = c.L.o[1] - best.L.o[1], s = (wx * c.dy - wy * c.dx) / den;
      const X = [best.L.o[0] + best.dx * s, best.L.o[1] + best.dy * s];
      // yatay / düşey hizada ilgili koordinat tam kaynak noktanınki
      for (const q of [best, c]) { if (q.dy === 0) X[1] = q.L.o[1]; if (q.dx === 0) X[0] = q.L.o[0]; }
      if (Math.hypot(X[0] - p[0], X[1] - p[1]) <= tol * 1.5) { pt = X; used = [best, c]; break; }
    }
    const z = best.L.o[2] !== undefined ? best.L.o[2] : 0;
    const res = [pt[0], pt[1], z];
    const head = used[0], dist = Math.hypot(pt[0] - head.L.o[0], pt[1] - head.L.o[1]);
    let ang = Math.atan2(pt[1] - head.L.o[1], pt[0] - head.L.o[0]) * 180 / Math.PI; if (ang < 0) ang += 360;
    const label = used.length > 1 ? 'Hiza kesişimi' : (head.L.src === 'kutupsal' ? 'Kutupsal' : 'Hiza') + ': ' + fmtC(dist) + ' < ' + (+ang.toFixed(2)) + '°';
    const dir = used.length === 1 ? (head.t >= 0 ? [head.dx, head.dy] : [-head.dx, -head.dy]) : dirOf(ang);
    this.active = { p: res, used, label, from: head.L.o, dir };
    return res;
  }
  // doğrudan uzaklık girişi: hiza yönünde
  distance(L) {
    const a = this.active; if (!a || a.used.length > 1) return null;
    return [a.from[0] + a.dir[0] * L, a.from[1] + a.dir[1] * L, a.from[2] || 0];
  }
  draw(ctx) {
    if (!this.enabled()) return;
    const R = this.R, W = R.W, H = R.H;
    ctx.save();
    // alınan noktalar
    ctx.strokeStyle = '#3fb950'; ctx.lineWidth = 1.5;
    for (const q of this.acq) { const s = R.w2s(q[0], q[1]); ctx.beginPath(); ctx.moveTo(s[0] - 5, s[1]); ctx.lineTo(s[0] + 5, s[1]); ctx.moveTo(s[0], s[1] - 5); ctx.lineTo(s[0], s[1] + 5); ctx.stroke(); }
    // bekletme göstergesi
    if (this.hover && !this.hover.done && this.otrack) {
      const k = Math.min(1, (performance.now() - this.hover.t) / 420), s = R.w2s(this.hover.p[0], this.hover.p[1]);
      ctx.strokeStyle = 'rgba(63,185,80,.8)'; ctx.beginPath(); ctx.arc(s[0], s[1], 11, -Math.PI / 2, -Math.PI / 2 + k * 2 * Math.PI); ctx.stroke();
      if (k < 1) requestAnimationFrame(() => R.request());
    }
    const a = this.active;
    if (a && !this.app.snapPt) {
      ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(63,185,80,.95)'; ctx.lineWidth = 1;
      for (const u of a.used) {
        const o = R.w2s(u.L.o[0], u.L.o[1]), r = u.L.ang * Math.PI / 180, dx = Math.cos(r), dy = -Math.sin(r), far = (W + H) * 2;
        ctx.beginPath(); ctx.moveTo(u.L.both ? o[0] - dx * far : o[0], u.L.both ? o[1] - dy * far : o[1]); ctx.lineTo(o[0] + dx * far, o[1] + dy * far); ctx.stroke();
      }
      ctx.setLineDash([]);
      const s = R.w2s(a.p[0], a.p[1]);
      ctx.strokeStyle = '#3fb950'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s[0] - 5, s[1] - 5); ctx.lineTo(s[0] + 5, s[1] + 5); ctx.moveTo(s[0] + 5, s[1] - 5); ctx.lineTo(s[0] - 5, s[1] + 5); ctx.stroke();
      ctx.font = '12px "Segoe UI", sans-serif';
      const w = ctx.measureText(a.label).width + 12;
      ctx.fillStyle = 'rgba(21,23,27,.9)'; ctx.fillRect(s[0] + 14, s[1] + 12, w, 20);
      ctx.fillStyle = '#9be9a8'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(a.label, s[0] + 20, s[1] + 22);
    }
    ctx.restore();
  }
  setPolar(on) { this.polar = on; this.app.setSetting('polar', on); $('tPolar').classList.toggle('on', on); this.active = null; this.R.request(); }
  setOtrack(on) { this.otrack = on; this.app.setSetting('otrack', on); $('tOtrack').classList.toggle('on', on); if (!on) this.reset(); this.R.request(); }
  setInc(v) { this.inc = v; this.app.setSetting('polarInc', v); $('tPolar').title = 'Kutupsal izleme ' + v + '° (F10) — sağ tık: açı adımı'; if (!this.polar) this.setPolar(true); this.R.request(); }
}

FastDXF.use({
  name: 'hizalama',
  init(app) {
    const T = app.tracker = new Tracker(app);
    app.hooks.snap.push(() => T.onSnap());
    app.hooks.point.push((p, base) => T.solve(p, base));
    app.hooks.distance.push((L) => T.distance(L));
    app.hooks.preview.push((ctx) => T.draw(ctx));
    app.hooks.tool.push(() => T.reset());
    // durum çubuğu düğmeleri
    const ortho = $('tOrtho');
    ortho.insertAdjacentHTML('beforebegin', '<span class="tog" id="tPolar"></span><span class="tog" id="tOtrack" title="Nesne yakalama izi (OTRACK): yakalama noktasında yarım saniye bekleyin, o noktaya hizalanın">İZ</span>');
    const pb = $('tPolar'); pb.textContent = 'KUTUPSAL'; pb.title = 'Kutupsal izleme ' + T.inc + '° (F10) — sağ tık: açı adımı';
    pb.classList.toggle('on', T.polar); $('tOtrack').classList.toggle('on', T.otrack);
    pb.onclick = () => T.setPolar(!T.polar);
    $('tOtrack').onclick = () => T.setOtrack(!T.otrack);
    pb.oncontextmenu = (e) => {
      e.preventDefault();
      app.contextMenu(e.clientX, e.clientY, [90, 45, 30, 22.5, 15, 10, 5].map(v => ({ label: (v === T.inc ? '✓ ' : '   ') + v + '° adım', fn: () => T.setInc(v) })));
    };
    document.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'F10') { e.preventDefault(); T.setPolar(!T.polar); app.toast('Kutupsal izleme ' + (T.polar ? 'açık (' + T.inc + '°)' : 'kapalı')); }
    });
    app.addCommand(['polar', 'kutupsal'], 'polar', 'Kutupsal izleme aç/kapat (F10)', 'Araçlar', () => T.setPolar(!T.polar));
    app.addCommand(['otrack', 'iz', 'hiza'], 'otrack', 'Nesne yakalama izi aç/kapat', 'Araçlar', () => T.setOtrack(!T.otrack));
  }
});
