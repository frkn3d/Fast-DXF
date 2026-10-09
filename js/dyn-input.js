/* Fast DXF — dinamik giriş: imlecin yanında değer alanları
 *  · Önceki nokta varken: [uzunluk] [açı°] — açı X ekseninden saat yönü tersine (mutlak)
 *  · İlk noktada (çizim / taşıma araçları): [X] [Y] mutlak koordinat
 *  · Sayı yazmak etkin alana girer; Tab: yazılan değeri kilitler ve diğer alana geçer (kilitli alan imleci kısıtlar)
 *  · Enter / boşluk: noktayı koyar · Geri tuşu: karakter sil, boş alanda kilidi aç · Esc: alanları temizle
 *  · Yalnız ilk alana yazılıp Enter'a basılırsa aracın kendi sayı anlamı geçerli (yarıçap, açı, çarpan, öteleme uzaklığı…)
 *  · "<" uzunluktan açıya geçer (10<45) · "," önceki nokta varken metni komut satırına aktarır (@dx,dy / x,y girişi için) */
'use strict';

// İlk noktası da klavyeden (X, Y) girilebilen araçlar
const DYN_XY = new Set(['line', 'pline', 'spline', 'rect', 'polygon', 'circle', 'circle3', 'arc', 'ellipse', 'point', 'move', 'copy', 'rotate', 'scale', 'mirror',
  'measure', 'area', 'dimlinear', 'dimaligned', 'grip']);

class DynInput {
  constructor(app) { this.app = app; this.R = app.R; this.reset(); }
  reset() { this.f = ['', '']; this.lock = [null, null]; this.i = 0; }
  dirty() { return !!(this.f[0] || this.f[1] || this.lock[0] !== null || this.lock[1] !== null); }
  // 'polar' (uzunluk/açı), 'xy' ya da null
  mode() {
    const app = this.app, t = app.tool;
    if (app.settings.dynFields === false || !t || !t.wantsPoints || app.toolName === 'select' || !app.store.done) return null;
    if (document.querySelector('.tedit')) return null;
    if (app.toolBase()) return 'polar';
    return DYN_XY.has(app.toolName) ? 'xy' : null;
  }
  val(k) { if (this.lock[k] !== null) return this.lock[k]; const v = num(this.f[k]); return this.f[k] && isFinite(v) ? v : null; }
  // İmleç noktasını kilitlere / yazılan değerlere göre kısıtla (önizleme ve tıklama)
  constrain(p, base) {
    const m = this.mode(); if (!m || !this.dirty()) return null;
    const L = this.val(0), A = this.val(1);
    if (m === 'xy') {
      const a = this.app.absP(p), X = L !== null ? L : a[0], Y = A !== null ? A : a[1], r = this.app.rel(X, Y);
      return [r[0], r[1], p[2] !== undefined ? p[2] : 0];
    }
    if (!base) return null;
    const dx = p[0] - base[0], dy = p[1] - base[1], z = base[2] !== undefined ? base[2] : (p[2] || 0);
    let ang = A !== null ? A * Math.PI / 180 : Math.atan2(dy, dx), len;
    if (L !== null) len = L;
    else len = Math.max(0, dx * Math.cos(ang) + dy * Math.sin(ang));   // yalnız açı: imlecin ışın üzerindeki iz düşümü
    if (A === null && !(Math.hypot(dx, dy) > 0)) ang = 0;
    return [base[0] + len * Math.cos(ang), base[1] + len * Math.sin(ang), z];
  }
  // Alanlarda gösterilecek değerler (yazılmamışsa imlecin anlık değeri)
  live() {
    const app = this.app, m = this.mode(), base = app.toolBase(), p = app.point(base);
    if (m === 'xy') { const a = app.absP(p); return [a[0], a[1]]; }
    const dx = p[0] - base[0], dy = p[1] - base[1];
    let a = Math.atan2(dy, dx) * 180 / Math.PI; if (a < 0) a += 360;
    return [Math.hypot(dx, dy), a];
  }
  key(e) {
    const m = this.mode(); if (!m) return false;
    const k = e.key, app = this.app;
    if (/^[0-9]$/.test(k) || k === '.' || (k === '-' && !this.f[this.i])) { this.f[this.i] += k; return true; }
    if (k === ',' ) {
      if (m === 'xy') { this.tab(); return true; }
      // önceki nokta varken virgül: koordinat yazılıyor → komut satırına aktar
      const c = $('cmdin'); c.value = (this.f[0] || '') + ','; this.reset(); c.focus(); app.suggest(c.value); return true;
    }
    if (k === '<' && m === 'polar') { if (this.f[0]) this.lock[0] = this.val(0); this.f[0] = ''; this.i = 1; return true; }
    if (k === 'Tab') { this.tab(); return true; }
    if (!this.dirty()) return false;
    if (k === 'Backspace') {
      if (this.f[this.i]) this.f[this.i] = this.f[this.i].slice(0, -1);
      else if (this.lock[this.i] !== null) this.lock[this.i] = null;
      else if (this.lock[1 - this.i] !== null || this.f[1 - this.i]) { this.i = 1 - this.i; }
      return true;
    }
    if (k === 'Escape') { this.reset(); return true; }
    if (k === 'Enter' || k === ' ') { this.commit(); return true; }
    return false;
  }
  tab() {
    const v = num(this.f[this.i]);
    if (this.f[this.i] && isFinite(v)) this.lock[this.i] = v;
    this.f[this.i] = ''; this.i = 1 - this.i;
  }
  commit() {
    const app = this.app, t = app.tool, m = this.mode();
    // yalnız ilk alan yazılmış, kilit yok: aracın kendi sayı girişi (yarıçap, açı, çarpan…)
    if (this.f[0] && !this.f[1] && this.lock[0] === null && this.lock[1] === null && t.input) {
      const s = this.f[0]; this.reset();
      if (t.input(s)) { app.updatePrompt(); app.updateSnap(); this.R.request(); return; }
      this.f[0] = s;   // araç bu sayıyı kullanmadı: genel nokta girişi (eksik alan imleçten)
    }
    const base = app.toolBase(), p = this.constrain(app.rawPoint(base), base);
    this.reset();
    if (p) app.commitPoint(p);
  }
  // Alanlar imlecin sağ altında, yakalama etiketinin altında; hiza etiketi imlecin üstünde kalır (üst üste binmesin)
  draw(ctx) {
    const m = this.mode(); if (!m || !this.app.mouseIn) return;
    const app = this.app, sx = app.mouse.sx, sy = app.mouse.sy, cur = this.live();
    const dec = (v, k) => { if (!isFinite(v)) return '—'; return (m === 'polar' && k === 1) ? (+v.toFixed(2)).toLocaleString('tr-TR') + '°' : fmtC(+v.toFixed(4)); };
    const lab = m === 'xy' ? ['X', 'Y'] : null;   // kutupsal kipte yazı yerine simge: uzunluk |—|, açı ∠
    const glyph = (k, x, y, col) => {
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath();
      if (k === 0) { ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.moveTo(x + 12, y - 4); ctx.lineTo(x + 12, y + 4); ctx.moveTo(x, y); ctx.lineTo(x + 12, y); }
      else { ctx.moveTo(x + 12, y + 5); ctx.lineTo(x, y + 5); ctx.lineTo(x + 9, y - 5); ctx.moveTo(x + 6.5, y + 5); ctx.arc(x, y + 5, 6.5, 0, -0.84, true); }
      ctx.stroke(); ctx.restore();
    };
    const blink = (performance.now() / 530 | 0) % 2 === 0;
    ctx.save(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let x0 = sx + 16, y = sy + 34;
    if (x0 + 240 > this.R.W) x0 = sx - 256; if (y + 26 > this.R.H) y = sy - 56;
    let x = x0;
    for (let k = 0; k < 2; k++) {
      const typed = this.f[k], locked = this.lock[k] !== null, act = this.i === k;
      const val = typed ? typed + (m === 'polar' && k === 1 ? '°' : '') : dec(locked ? this.lock[k] : cur[k], k);
      ctx.font = '600 10px "Segoe UI", sans-serif'; const lw = lab ? ctx.measureText(lab[k]).width : 12;
      ctx.font = '12px "Segoe UI", sans-serif'; const vw = ctx.measureText(val).width;
      const w = Math.max(lab ? 84 : 76, lw + vw + (locked ? 36 : 24));
      ctx.fillStyle = act ? 'rgba(13,22,38,.97)' : 'rgba(21,23,27,.86)'; ctx.fillRect(x, y, w, 22);
      ctx.strokeStyle = act ? '#4c9aff' : locked ? '#d29922' : 'rgba(255,255,255,.22)'; ctx.lineWidth = act ? 2 : 1;
      ctx.strokeRect(x + (act ? 1 : .5), y + (act ? 1 : .5), w - (act ? 2 : 1), act ? 20 : 21);
      const lc = act ? '#8ab8ff' : '#7d8590';
      if (lab) { ctx.font = '600 10px "Segoe UI", sans-serif'; ctx.fillStyle = lc; ctx.fillText(lab[k], x + 7, y + 11.5); } else glyph(k, x + 7, y + 11, lc);
      const vx = x + 14 + lw;
      ctx.font = '12px "Segoe UI", sans-serif'; ctx.fillStyle = typed ? '#ffffff' : locked ? '#ffd166' : act ? '#e6edf3' : '#aeb6c2'; ctx.fillText(val, vx, y + 11.5);
      // etkin alanda yanıp sönen imleç: yazı varsa sonunda, yoksa değerin önünde
      if (act && blink) { ctx.fillStyle = '#4c9aff'; ctx.fillRect(typed ? vx + ctx.measureText(val.replace(/°$/, '')).width + 1 : vx - 4, y + 5, 1.5, 12); }
      if (locked) {   // asma kilit
        const lx = x + w - 15, ly = y + 7; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(lx + 4, ly + 3, 2.6, Math.PI, 0); ctx.stroke(); ctx.fillStyle = '#ffd166'; ctx.fillRect(lx, ly + 3, 8, 6);
      }
      x += w + 4;
    }
    ctx.restore();
    // imleç yanıp sönsün: sahneyi her karede değil, yarım saniyede bir yeniden çiz
    clearTimeout(this._blinkT); this._blinkT = setTimeout(() => { if (this.mode()) this.R.request(); }, 530);
  }
}

FastDXF.use({
  name: 'dinamik-giris',
  init(app) {
    const D = app.dyn = new DynInput(app);
    app.hooks.tool.push(() => D.reset());
    app.hooks.preview.push((ctx) => D.draw(ctx));
    const ov = $('ov');
    ov.addEventListener('pointerenter', () => { app.mouseIn = true; });
    ov.addEventListener('pointerleave', () => { app.mouseIn = false; app.R.request(); });
    ov.addEventListener('pointermove', () => { app.mouseIn = true; });
  }
});
