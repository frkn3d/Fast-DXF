/* Fast DXF — ölçülendirme araçları (AutoCAD gibi)
 *  DLI doğrusal (yatay/düşey otomatik; Y/D ile kilit) · DAL hizalı · DRA yarıçap · DDI çap · DAN açı · DIMSTYLE ayarlar
 *  Ölçüler gerçek DIMENSION varlığı olarak kaydedilir (AutoCAD'de düzenlenebilir); geometri js/dim-core.js'ten gelir. */
'use strict';

class DimTools {
  constructor(app) { this.app = app; this.R = app.R; this.D = DXFDimCore(); }
  style() {
    const st = this.app.settings;
    let h = st.dimH > 0 ? st.dimH : 0;
    if (!h) { const v = 14 / this.R.scale, p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; h = (m < 1.5 ? 1 : m < 2.2 ? 2 : m < 3 ? 2.5 : m < 7 ? 5 : 10) * p; }
    return { h, dec: st.dimDec !== undefined ? st.dimDec : 2, sep: st.dimSep || ',' };
  }
  // göreli tanım (önizleme) → mutlak tanım (kayıt)
  absDef(d) {
    const app = this.app, o = app.store.info.origin, out = Object.assign({}, d);
    for (const [kx, ky] of [['x1', 'y1'], ['x2', 'y2'], ['cx', 'cy'], ['lx', 'ly']]) if (out[kx] !== undefined) { out[kx] += o[0]; out[ky] += o[1]; }
    return out;
  }
  create(d) {
    const app = this.app; if (!app.ready()) return;
    const def = app.newDef('DIMENSION', Object.assign(this.absDef(d), this.style()));
    app.editor.create(def);
  }
  // önizleme (göreli koordinat)
  draw(ctx, d) {
    const R = this.R, G = this.D.geom(Object.assign({}, d, this.style()));
    ctx.save(); ctx.strokeStyle = '#4c9aff'; ctx.fillStyle = '#4c9aff'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const q of G.segs) { const a = R.w2s(q[0], q[1]), b = R.w2s(q[2], q[3]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    for (const q of G.tris) { const a = R.w2s(q[0], q[1]), b = R.w2s(q[2], q[3]), c = R.w2s(q[4], q[5]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fill(); }
    for (const t of G.texts) {
      const s = R.w2s(t.x, t.y), px = Math.max(9, t.h * R.scale * 1.35);
      ctx.save(); ctx.translate(s[0], s[1]); ctx.rotate(-t.rot * Math.PI / 180);
      ctx.font = px + 'px Arial, "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.str.replace(/%%c/gi, 'Ø').replace(/%%d/gi, '°'), 0, 0); ctx.restore();
    }
    ctx.restore();
  }
  // tıklanan noktadaki varlığın tanımı ve en yakın ilkel (çizgi/yay) — göreli koordinat döner
  async pickPrim(p, want) {
    const app = this.app, S = app.store, id = S.pick(p[0], p[1], 8 / this.R.scale); if (id < 0) return null;
    const def = await app.getDef(id); if (!def) return null;
    const G = Geom.prims(def); if (!G) return null;
    const o = S.info.origin, x = p[0] + o[0], y = p[1] + o[1];
    let best = null, bd = Infinity;
    for (const q of G.P) {
      if (want && q.k !== want) continue;
      let d;
      if (q.k === 'L') { const dx = q.x2 - q.x1, dy = q.y2 - q.y1, l2 = dx * dx + dy * dy; let t = l2 ? ((x - q.x1) * dx + (y - q.y1) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); d = Math.hypot(x - q.x1 - t * dx, y - q.y1 - t * dy); }
      else d = Math.abs(Math.hypot(x - q.cx, y - q.cy) - q.r);
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) return null;
    const r = Object.assign({}, best);
    if (r.k === 'L') { r.x1 -= o[0]; r.y1 -= o[1]; r.x2 -= o[0]; r.y2 -= o[1]; } else { r.cx -= o[0]; r.cy -= o[1]; }
    r.z = G.z || 0; r.click = p;
    return r;
  }
}

FastDXF.use({
  name: 'olculendirme',
  init(app) {
    const T = app.dims = new DimTools(app), S = app.store;
    const lin = (kind) => ({
      wantsPoints: true, P: [], lock: null, obj: false,
      prompt() {
        if (this.obj && !this.P.length) return 'Ölçülecek çizgiyi / polyline kenarını seçin';
        return [kind === 'linear' ? 'Doğrusal ölçü: 1. nokta — Enter: nesne seç' : 'Hizalı ölçü: 1. nokta — Enter: nesne seç', '2. nokta',
          'Ölçü çizgisi konumu' + (kind === 'linear' ? ' — Y: yatay, D: düşey kilidi' : '')][this.P.length];
      },
      start() { this.P = []; this.lock = null; this.obj = false; },
      def(L) {
        const [a, b] = this.P, d = { kind, x1: a[0], y1: a[1], x2: b[0], y2: b[1], lx: L[0], ly: L[1], z: a[2] || 0 };
        if (kind === 'linear') {
          let rot = this.lock;
          if (rot === null) { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ex = Math.abs(L[0] - mx) - Math.abs(b[0] - a[0]) / 2, ey = Math.abs(L[1] - my) - Math.abs(b[1] - a[1]) / 2; rot = ey >= ex ? 0 : 90; }
          d.rot = rot;
        }
        return d;
      },
      async click(p) {
        if (this.obj && !this.P.length) {
          const q = await T.pickPrim(p, 'L'); if (!q) { app.toast('Çizgi bulunamadı.'); return; }
          this.P = [[q.x1, q.y1, q.z], [q.x2, q.y2, q.z]]; this.obj = false; return;
        }
        if (this.P.length < 2) { this.P.push(p); return; }
        T.create(this.def(p)); this.P = []; this.lock = null; app.done1();
      },
      enter() { if (!this.P.length) { this.obj = true; app.updatePrompt(); return true; } return false; },
      input(s) {
        const v = s.trim().toLowerCase();
        if (kind === 'linear' && this.P.length === 2 && /^(y|h|yatay)$/.test(v)) { this.lock = 0; return true; }
        if (kind === 'linear' && this.P.length === 2 && /^(d|v|düşey|dusey)$/.test(v)) { this.lock = 90; return true; }
        const p = app.parsePoint(s, this.P[this.P.length - 1]); if (!p) return false; this.click(p); return true;
      },
      undoPt() { this.P.pop(); },
      preview(ctx) {
        if (this.P.length === 1) app.rubber(ctx, this.P[0], app.point(this.P[0]));
        if (this.P.length === 2) T.draw(ctx, this.def(app.point()));
      }
    });
    const rad = (kind) => ({
      wantsPoints: true, C: null,
      prompt() { return this.C ? 'Ölçü konumu (yön)' : (kind === 'radius' ? 'Yarıçap ölçüsü' : 'Çap ölçüsü') + ': daire ya da yay seçin'; },
      start() { this.C = null; },
      def(L) {
        const c = this.C, dx = L[0] - c.cx, dy = L[1] - c.cy, l = Math.hypot(dx, dy) || 1;
        return { kind, cx: c.cx, cy: c.cy, x2: c.cx + dx / l * c.r, y2: c.cy + dy / l * c.r, z: c.z };
      },
      async click(p) {
        if (!this.C) { const q = await T.pickPrim(p, 'A'); if (!q) { app.toast('Daire ya da yay bulunamadı.'); return; } this.C = q; app.updatePrompt(); return; }
        T.create(this.def(p)); this.C = null; app.done1();
      },
      preview(ctx) { if (this.C) T.draw(ctx, this.def(app.point())); }
    });
    const ang = {
      wantsPoints: true, L1: null, L2: null, V: null, pts: [], three: false,
      prompt() {
        if (this.three) return ['Açı ölçüsü: tepe noktası', '1. kol üzerindeki nokta', '2. kol üzerindeki nokta', 'Yay konumu'][this.pts.length];
        return !this.L1 ? 'Açı ölçüsü: 1. çizgiyi seçin — Enter: 3 nokta ile' : !this.L2 ? '2. çizgiyi seçin' : 'Yay konumu';
      },
      start() { this.L1 = this.L2 = this.V = null; this.pts = []; this.three = false; },
      // iki çizginin kesişimi (tepe) ve tıklanan taraflardaki kol noktaları
      fromLines() {
        const a = this.L1, b = this.L2;
        const d1 = [a.x2 - a.x1, a.y2 - a.y1], d2 = [b.x2 - b.x1, b.y2 - b.y1], den = d1[0] * d2[1] - d1[1] * d2[0];
        if (Math.abs(den) < 1e-12) return null;
        const t = ((b.x1 - a.x1) * d2[1] - (b.y1 - a.y1) * d2[0]) / den, V = [a.x1 + d1[0] * t, a.y1 + d1[1] * t];
        const side = (L, d) => { const l = Math.hypot(d[0], d[1]), u = [d[0] / l, d[1] / l], s = (L.click[0] - V[0]) * u[0] + (L.click[1] - V[1]) * u[1]; return [V[0] + u[0] * (s >= 0 ? 1 : -1) * Math.max(Math.abs(s), 1e-9), V[1] + u[1] * (s >= 0 ? 1 : -1) * Math.max(Math.abs(s), 1e-9)]; };
        return { V, P1: side(a, d1), P2: side(b, d2) };
      },
      def(L) {
        let V, P1, P2;
        if (this.three) [V, P1, P2] = this.pts; else { const f = this.fromLines(); if (!f) return null; ({ V, P1, P2 } = f); }
        return { kind: 'angular', cx: V[0], cy: V[1], x1: P1[0], y1: P1[1], x2: P2[0], y2: P2[1], lx: L[0], ly: L[1], z: (this.L1 && this.L1.z) || (V[2] || 0) };
      },
      async click(p) {
        if (this.three) { this.pts.push(p); if (this.pts.length < 4) return; const d = this.def(p); this.pts.pop(); if (d) T.create(d); this.start(); app.done1(); return; }
        if (!this.L1) { const q = await T.pickPrim(p, 'L'); if (!q) { app.toast('Çizgi bulunamadı.'); return; } this.L1 = q; app.updatePrompt(); return; }
        if (!this.L2) { const q = await T.pickPrim(p, 'L'); if (!q) { app.toast('Çizgi bulunamadı.'); return; } this.L2 = q; if (!this.fromLines()) { app.toast('Çizgiler paralel; açı ölçülemez.'); this.L2 = null; } app.updatePrompt(); return; }
        const d = this.def(p); if (d) T.create(d); this.start(); app.done1();
      },
      enter() { if (!this.L1 && !this.three) { this.three = true; app.updatePrompt(); return true; } return false; },
      input(s) { const p = app.parsePoint(s, null); if (!p) return false; this.click(p); return true; },
      preview(ctx) {
        if (this.three) { if (this.pts.length >= 1 && this.pts.length < 3) app.rubber(ctx, this.pts[0], app.point(this.pts[0])); if (this.pts.length === 3) { const d = this.def(app.point()); if (d) T.draw(ctx, d); } return; }
        if (this.L1 && this.L2) { const d = this.def(app.point()); if (d) T.draw(ctx, d); }
      }
    };
    app.addTool('dimlinear', lin('linear'), { plan: true });
    app.addTool('dimaligned', lin('aligned'), { plan: true });
    app.addTool('dimradius', rad('radius'), { plan: true });
    app.addTool('dimdiameter', rad('diameter'), { plan: true });
    app.addTool('dimangular', ang, { plan: true });
    app.addCommand(['dli', 'dimlinear', 'ölçü', 'olcu'], 'dimlinear', 'Doğrusal ölçü', 'Ölçülendir');
    app.addCommand(['dal', 'dimaligned'], 'dimaligned', 'Hizalı ölçü', 'Ölçülendir');
    app.addCommand(['dra', 'dimradius'], 'dimradius', 'Yarıçap ölçüsü', 'Ölçülendir');
    app.addCommand(['ddi', 'dimdiameter'], 'dimdiameter', 'Çap ölçüsü', 'Ölçülendir');
    app.addCommand(['dan', 'dimangular'], 'dimangular', 'Açı ölçüsü', 'Ölçülendir');
    // ölçü ayarları
    const styleDialog = () => {
      const st = app.settings;
      app.modal('<h2>Ölçü ayarları</h2><label>Yazı yüksekliği (0: görünüme göre otomatik)</label><input type="text" id="dH" value="' + (st.dimH || 0) + '">' +
        '<label>Ondalık basamak</label><input type="text" id="dDec" value="' + (st.dimDec !== undefined ? st.dimDec : 2) + '">' +
        '<label>Ondalık ayırıcı</label><select id="dSep"><option value=","' + ((st.dimSep || ',') === ',' ? ' selected' : '') + '>Virgül (12,50)</option><option value="."' + (st.dimSep === '.' ? ' selected' : '') + '>Nokta (12.50)</option></select>' +
        '<div style="color:var(--muted);font-size:12px;margin-top:8px">Ok boyu = yazı yüksekliği; uzatma çizgisi aralığı ve taşması ISO-25 oranlarında. Değerler her ölçüye AutoCAD stil geçersiz kılması olarak yazılır.</div>' +
        '<div class="btns"><button class="btn" id="mNo">Vazgeç</button><button class="btn pri" id="mOk">Kaydet</button></div>', d => {
        d.querySelector('#mOk').onclick = () => {
          const h = num(d.querySelector('#dH').value), dec = Math.max(0, Math.min(8, Math.round(num(d.querySelector('#dDec').value))));
          app.closeModal();
          app.setSetting('dimH', h > 0 ? h : 0); app.setSetting('dimDec', isFinite(dec) ? dec : 2); app.setSetting('dimSep', d.querySelector('#dSep').value);
          app.toast('Ölçü ayarları kaydedildi');
        };
        d.querySelector('#mNo').onclick = () => app.closeModal();
      });
    };
    app.addCommand(['dimstyle', 'd', 'ölçüayar', 'olcuayar'], 'dimstyle', 'Ölçü ayarları', 'Ölçülendir', styleDialog);
    // şerit: Ölçüm grubuna "Ölçü" bölünmüş menüsü
    const sprite = document.querySelector('svg symbol') && document.querySelector('svg symbol').parentNode;
    if (sprite) sprite.insertAdjacentHTML('beforeend',
      '<symbol id="i-dim" viewBox="0 0 24 24"><path d="M4 7v10M20 7v10M4 12h16"/><path d="M4 12l3-2v4zM20 12l-3-2v4z" fill="currentColor"/></symbol>' +
      '<symbol id="i-dimang" viewBox="0 0 24 24"><path d="M4 20L20 20M4 20L15 6"/><path d="M12 20a8 8 0 00-2.6-5.9"/></symbol>' +
      '<symbol id="i-dimrad" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 12l5.6-5.6"/></symbol>');
    const mbtn = document.getElementById('measStack');
    if (mbtn) mbtn.insertAdjacentHTML('beforebegin',
      '<div class="split dd" id="ddDim"><button class="big" data-tool="dimlinear" title="Doğrusal ölçü (DLI)"><svg class="i"><use href="#i-dim"/></svg><span>Ölçü</span></button>' +
      '<button class="arr dd-btn" title="Tüm ölçü araçları">▾</button><div class="dd-menu">' +
      '<div class="mhead">Ölçülendir</div>' +
      '<button class="mi" data-tool="dimlinear"><svg class="i"><use href="#i-dim"/></svg><span class="lbl">Doğrusal (yatay/düşey)</span><span class="sc">DLI</span></button>' +
      '<button class="mi" data-tool="dimaligned"><svg class="i"><use href="#i-dim"/></svg><span class="lbl">Hizalı</span><span class="sc">DAL</span></button>' +
      '<button class="mi" data-tool="dimangular"><svg class="i"><use href="#i-dimang"/></svg><span class="lbl">Açı</span><span class="sc">DAN</span></button>' +
      '<button class="mi" data-tool="dimradius"><svg class="i"><use href="#i-dimrad"/></svg><span class="lbl">Yarıçap</span><span class="sc">DRA</span></button>' +
      '<button class="mi" data-tool="dimdiameter"><svg class="i"><use href="#i-dimrad"/></svg><span class="lbl">Çap</span><span class="sc">DDI</span></button>' +
      '<div class="mhead">Ayarlar</div><button class="mi" data-cmd="dimstyle"><svg class="i"><use href="#i-gear"/></svg><span class="lbl">Ölçü ayarları…</span><span class="sc">D</span></button>' +
      '</div></div>');
  }
});
