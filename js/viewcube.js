/* DXF Okuyucu — görünüm küpü
 * Yüz / kenar / köşe tıklaması: o yönden bak (26 yön) · küpü sürükle: yörünge · halka: Z etrafında döndür · ev: varsayılan 3B görünüm */
'use strict';

class ViewCubeW {
  constructor(app, host) {
    this.app = app; this.R = app.R;
    const box = document.createElement('div');
    box.id = 'vcube';
    box.innerHTML = '<button class="vc-home" title="Ev görünümü (GB izometrik, tümünü sığdır)"><svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10"/></svg></button>' +
      '<canvas></canvas><button class="vc-proj" title="Paralel / perspektif izdüşüm"></button>';
    host.appendChild(box);
    this.box = box; this.cv = box.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
    this.size = 128; this.hover = null; this.drag = null;
    this.projBtn = box.querySelector('.vc-proj');
    box.querySelector('.vc-home').onclick = () => app.homeView();
    this.projBtn.onclick = () => app.togglePersp();
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.drag = { x: e.offsetX, y: e.offsetY, moved: false, ring: this.onRing(e.offsetX, e.offsetY) && !this.hit(e.offsetX, e.offsetY) };
    });
    cv.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (d) {
        const dx = e.offsetX - d.x, dy = e.offsetY - d.y;
        if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) { d.moved = true; app.beginOrbit(); }
        if (d.moved) { app.orbitBy(dx, d.ring ? 0 : dy); d.x = e.offsetX; d.y = e.offsetY; }
        return;
      }
      const h = this.hit(e.offsetX, e.offsetY);
      const key = h ? h.key : (this.onRing(e.offsetX, e.offsetY) ? 'ring' : null);
      if (key !== (this.hover && this.hover.key)) { this.hover = h || (key ? { key } : null); this.draw(); }
      cv.style.cursor = h ? 'pointer' : key ? 'ew-resize' : 'grab';
    });
    cv.addEventListener('pointerup', (e) => {
      const d = this.drag; this.drag = null;
      if (!d) return;
      if (d.moved) { app.endOrbit(); return; }
      const h = this.hit(e.offsetX, e.offsetY);
      if (h) app.setView(h.az, h.el);
      else if (d.ring) { // halkadaki harfe tıklama: o yönden bak (kot açısı korunur)
        const L = this.ringLabelAt(e.offsetX, e.offsetY);
        if (L) app.setView(L.az, this.R.is2D ? 30 : Math.max(-60, Math.min(60, this.R.el)));
      }
    });
    cv.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.draw(); } });
    cv.addEventListener('dblclick', (e) => e.stopPropagation());
    cv.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    this.resize();
  }
  resize() {
    const dpr = window.devicePixelRatio || 1, s = this.size;
    this.cv.width = s * dpr; this.cv.height = s * dpr; this.cv.style.width = s + 'px'; this.cv.style.height = s + 'px';
    this.dpr = dpr; this.draw();
  }
  // Küp yüzleri: n normal, s/t yüz düzlemindeki eksenler (etiket okunma yönü)
  static FACES = [
    { n: [0, 0, 1], s: [1, 0, 0], t: [0, 1, 0], name: 'ÜST' },
    { n: [0, 0, -1], s: [1, 0, 0], t: [0, -1, 0], name: 'ALT' },
    { n: [0, -1, 0], s: [1, 0, 0], t: [0, 0, 1], name: 'ÖN' },
    { n: [0, 1, 0], s: [-1, 0, 0], t: [0, 0, 1], name: 'ARKA' },
    { n: [1, 0, 0], s: [0, 1, 0], t: [0, 0, 1], name: 'SAĞ' },
    { n: [-1, 0, 0], s: [0, -1, 0], t: [0, 0, 1], name: 'SOL' }
  ];
  geom() {
    const { r, u, f } = this.R.basis();
    const S = this.size * 0.2, cx = this.size / 2, cy = this.size / 2 + 4;
    const P = (v) => [cx + (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) * S, cy - (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) * S];
    return { r, u, f, S, cx, cy, P };
  }
  // Ekran noktasının küp yüzündeki bölgesi → bakış yönü
  hit(x, y) {
    const g = this.geom();
    for (let k = 0; k < 6; k++) {
      const F = ViewCubeW.FACES[k];
      if (-(F.n[0] * g.f[0] + F.n[1] * g.f[1] + F.n[2] * g.f[2]) < 0.02) continue;
      const o = g.P(F.n), ps = g.P([F.n[0] + F.s[0], F.n[1] + F.s[1], F.n[2] + F.s[2]]), pt = g.P([F.n[0] + F.t[0], F.n[1] + F.t[1], F.n[2] + F.t[2]]);
      const ax = ps[0] - o[0], ay = ps[1] - o[1], bx = pt[0] - o[0], by = pt[1] - o[1];
      const det = ax * by - ay * bx; if (Math.abs(det) < 1e-6) continue;
      const qx = x - o[0], qy = y - o[1];
      const a = (qx * by - qy * bx) / det, b = (ax * qy - ay * qx) / det;
      if (Math.abs(a) > 1 || Math.abs(b) > 1) continue;
      const i = a < -0.6 ? -1 : a > 0.6 ? 1 : 0, j = b < -0.6 ? -1 : b > 0.6 ? 1 : 0;
      const d = [F.n[0] + F.s[0] * i + F.t[0] * j, F.n[1] + F.s[1] * i + F.t[1] * j, F.n[2] + F.s[2] * i + F.t[2] * j];
      const len = Math.hypot(d[0], d[1], d[2]);
      const el = Math.asin(d[2] / len) / DEG;
      let az = Math.hypot(d[0], d[1]) < 1e-9 ? -90 : Math.atan2(d[1], d[0]) / DEG;
      return { key: k + ':' + i + ':' + j, face: k, i, j, az: Math.round(az * 1000) / 1000, el: Math.abs(el) > 89.99 ? Math.sign(el) * 90 : el };
    }
    return null;
  }
  ringPts() {
    const g = this.geom(), R = 1.95, out = [];
    for (let k = 0; k <= 48; k++) { const a = k / 48 * 2 * Math.PI; out.push(g.P([R * Math.cos(a), R * Math.sin(a), -1])); }
    return out;
  }
  onRing(x, y) {
    const pts = this.ringPts();
    for (let k = 1; k < pts.length; k++) if (segDist(x, y, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]) < 9) return true;
    return !!this.ringLabelAt(x, y);
  }
  ringLabels() {
    const g = this.geom(), R = 1.95;
    return [['K', 90], ['D', 0], ['G', -90], ['B', 180]].map(([t, a]) => ({ t, az: a, p: g.P([R * Math.cos(a * DEG), R * Math.sin(a * DEG), -1]) }));
  }
  ringLabelAt(x, y) { return this.ringLabels().find(L => Math.hypot(L.p[0] - x, L.p[1] - y) < 10) || null; }
  draw() {
    const c = this.ctx, d = this.dpr, s = this.size, g = this.geom(), dark = this.R.dark;
    c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, s, s);
    const fg = dark ? '#d9dde4' : '#30343b', faceC = dark ? 'rgba(70,78,92,0.92)' : 'rgba(232,236,242,0.95)', edgeC = dark ? '#8b93a1' : '#7a828f';
    const acc = '#4c9aff', hov = this.hover;
    // pusula halkası (çizimin altında, Z = -1)
    const ring = this.ringPts();
    c.beginPath(); ring.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.strokeStyle = hov && hov.key === 'ring' ? acc : edgeC; c.lineWidth = hov && hov.key === 'ring' ? 3 : 2; c.globalAlpha = 0.8; c.stroke(); c.globalAlpha = 1; c.lineWidth = 1;
    // yüzler (arkadan öne)
    const faces = ViewCubeW.FACES.map((F, k) => ({ F, k, vis: -(F.n[0] * g.f[0] + F.n[1] * g.f[1] + F.n[2] * g.f[2]) })).filter(o => o.vis > 0.02).sort((a, b) => a.vis - b.vis);
    const cuts = [-1, -0.6, 0.6, 1];
    for (const { F, k } of faces) {
      const pt = (a, b) => g.P([F.n[0] + F.s[0] * a + F.t[0] * b, F.n[1] + F.s[1] * a + F.t[1] * b, F.n[2] + F.s[2] * a + F.t[2] * b]);
      const quad = (a0, b0, a1, b1) => { const q = [pt(a0, b0), pt(a1, b0), pt(a1, b1), pt(a0, b1)]; c.beginPath(); c.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) c.lineTo(q[i][0], q[i][1]); c.closePath(); };
      quad(-1, -1, 1, 1); c.fillStyle = faceC; c.fill(); c.strokeStyle = edgeC; c.stroke();
      if (hov && hov.face === k) {
        const ii = hov.i + 1, jj = hov.j + 1;
        quad(cuts[ii], cuts[jj], cuts[ii + 1], cuts[jj + 1]); c.fillStyle = 'rgba(76,154,255,0.55)'; c.fill();
      }
      // etiket: yüz düzlemine yapıştırılmış
      const o = pt(0, 0), ps = pt(1, 0), pq = pt(0, 1);
      c.save();
      c.setTransform((ps[0] - o[0]) / 22 * d, (ps[1] - o[1]) / 22 * d, -(pq[0] - o[0]) / 22 * d, -(pq[1] - o[1]) / 22 * d, o[0] * d, o[1] * d);
      c.fillStyle = fg; c.font = 'bold 11px "Segoe UI", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(F.name, 0, 0.5);
      c.restore();
    }
    // halka harfleri
    c.font = 'bold 11px "Segoe UI", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const L of this.ringLabels()) {
      c.fillStyle = dark ? 'rgba(21,23,27,.85)' : 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(L.p[0], L.p[1], 7.5, 0, 2 * Math.PI); c.fill();
      c.fillStyle = L.t === 'K' ? '#e5534b' : fg; c.fillText(L.t, L.p[0], L.p[1] + 0.5);
    }
    this.projBtn.textContent = this.R.persp ? 'Perspektif' : 'Paralel';
    this.box.classList.toggle('flat', this.R.is2D);
  }
}
