/* Fast DXF — nokta tutamaçları (grip düzenleme)
 *  Seçili nesnelerin (en çok 100) uç, köşe, orta, merkez, çeyrek ve ölçü tanım noktalarında mavi kareler.
 *  Kareye tıklayın (kırmızı olur) → yeni yere tıklayın; ya da basılı tutup sürükleyin. Yakalama, hizalama ve
 *  dinamik giriş (uzunluk / açı, Tab ile kilit) bu sırada da çalışır. Esc / sağ tık: vazgeç.
 *  · Uç / köşe / kontrol noktası / çeyrek / ölçü noktası: o noktayı taşır (çizgiyi uzatır, polyline köşesini kaydırır, yarıçapı değiştirir)
 *  · Orta nokta (polyline kenarı): kenarı iki köşesiyle birlikte öteler · çizginin ortası, merkez, ekleme noktası: nesneyi taşır */
'use strict';

class Grips {
  constructor(app) { this.app = app; this.R = app.R; this.S = app.store; this.list = []; this.key = ''; this.hot = null; this.hov = null; this.gen = 0; }
  // noktalar yalnız nokta düzenleme kipinde (ya da ayarlarda "hemen göster" açıksa)
  enabled() { return !!this.app.pointMode || this.app.settings.gripsAlways === true; }
  def(id) {
    const app = this.app, c = app.defCache;
    if (c.has(id)) return Promise.resolve(c.get(id));
    return app.getDef(id).then(d => { c.set(id, d || null); return d; }).catch(() => null);
  }
  // seçim / düzenleme değişince tutamaçları yeniden hesapla
  refresh() {
    const app = this.app, S = this.S, ids = S.selList;
    if (!this.enabled() || !ids.length || ids.length > 100 || !S.done) { this.list = []; this.key = ''; this.R.request(); return; }
    const key = ids.join(',') + '|' + app.editor.undoStack.length + '|' + app.editor.redoStack.length;
    if (key === this.key) return;
    this.key = key; const gen = ++this.gen;
    Promise.all(ids.map(id => this.def(id))).then(defs => {
      if (gen !== this.gen) return;
      const out = [];
      ids.forEach((id, i) => { const d = defs[i]; if (d && !d.tilted) for (const g of this.of(id, d)) { g.p = this.app.rel(g.a[0], g.a[1]); g.p.push(g.a[2] || 0); out.push(g); } });
      this.list = out; this.R.request();
    });
  }
  // Tanımdan tutamaçlar: { id, a: mutlak nokta, kind: 'pt' | 'move', set(def, q) → yeni tanım (q mutlak [x,y,z]) }
  of(id, d) {
    const G = [], cp = (o) => JSON.parse(JSON.stringify(o));
    const mv = (x, y, z) => G.push({ id, a: [x, y, z || 0], kind: 'move' });
    const pt = (x, y, z, set) => G.push({ id, a: [x, y, z || 0], kind: 'pt', set });
    const ang = (cx, cy, q) => { let a = Math.atan2(q[1] - cy, q[0] - cx) * 180 / Math.PI; if (a < 0) a += 360; return a; };
    switch (d.type) {
      case 'LINE':
        pt(d.x1, d.y1, d.z1, (o, q) => Object.assign(cp(o), { x1: q[0], y1: q[1], z1: q[2] }));
        pt(d.x2, d.y2, d.z2, (o, q) => Object.assign(cp(o), { x2: q[0], y2: q[1], z2: q[2] }));
        mv((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2, ((d.z1 || 0) + (d.z2 || 0)) / 2);
        break;
      case 'LWPOLYLINE': {
        const n = d.xs.length, z = d.elev || 0, bs = d.bs || [];
        for (let i = 0; i < n; i++) pt(d.xs[i], d.ys[i], z, (o, q) => { const r = cp(o); r.xs[i] = q[0]; r.ys[i] = q[1]; return r; });
        const segs = d.closed ? n : n - 1;
        for (let i = 0; i < segs; i++) {
          if (Math.abs(bs[i] || 0) > 1e-12) continue;
          const j = (i + 1) % n, mx = (d.xs[i] + d.xs[j]) / 2, my = (d.ys[i] + d.ys[j]) / 2;
          pt(mx, my, z, (o, q) => { const r = cp(o), dx = q[0] - mx, dy = q[1] - my; r.xs[i] += dx; r.ys[i] += dy; r.xs[j] += dx; r.ys[j] += dy; return r; });
          G[G.length - 1].mid = true;
        }
        break;
      }
      case 'CIRCLE':
        mv(d.cx, d.cy, d.cz);
        for (let k = 0; k < 4; k++) pt(d.cx + d.r * Math.cos(k * Math.PI / 2), d.cy + d.r * Math.sin(k * Math.PI / 2), d.cz, (o, q) => Object.assign(cp(o), { r: Math.max(1e-9, Math.hypot(q[0] - o.cx, q[1] - o.cy)) }));
        break;
      case 'ARC': {
        const P = (a) => [d.cx + d.r * Math.cos(a * Math.PI / 180), d.cy + d.r * Math.sin(a * Math.PI / 180)];
        let sw = ((d.a1 - d.a0) % 360 + 360) % 360; if (sw < 1e-9) sw = 360;
        const s0 = P(d.a0), s1 = P(d.a1), m = P(d.a0 + sw / 2);
        mv(d.cx, d.cy, d.cz);
        pt(s0[0], s0[1], d.cz, (o, q) => Object.assign(cp(o), { a0: ang(o.cx, o.cy, q) }));
        pt(s1[0], s1[1], d.cz, (o, q) => Object.assign(cp(o), { a1: ang(o.cx, o.cy, q) }));
        pt(m[0], m[1], d.cz, (o, q) => Object.assign(cp(o), { r: Math.max(1e-9, Math.hypot(q[0] - o.cx, q[1] - o.cy)) }));
        break;
      }
      case 'ELLIPSE': {
        const L = Math.hypot(d.mx, d.my), mn = L * d.ratio, ux = d.mx / L, uy = d.my / L;
        mv(d.cx, d.cy, d.cz);
        for (const s of [1, -1]) pt(d.cx + s * d.mx, d.cy + s * d.my, d.cz, (o, q) => {
          const vx = (q[0] - o.cx) * s, vy = (q[1] - o.cy) * s, l = Math.hypot(vx, vy); if (l < 1e-12) return null;
          return Object.assign(cp(o), { mx: vx, my: vy, ratio: Math.min(1, mn / l) });
        });
        for (const s of [1, -1]) pt(d.cx - s * uy * mn, d.cy + s * ux * mn, d.cz, (o, q) => {
          const r = Math.abs((q[0] - o.cx) * -uy + (q[1] - o.cy) * ux) / L; return r > 1e-9 && r <= 1 ? Object.assign(cp(o), { ratio: r }) : null;
        });
        break;
      }
      case 'SPLINE':
        if (d.fit && d.fit.xs.length >= 2) {   // uydurma noktaları: eğri yeniden noktalardan geçirilir
          const F = d.fit;
          for (let i = 0; i < F.xs.length; i++) pt(F.xs[i], F.ys[i], F.zs && F.zs[i], (o, q) => {
            const fx = o.fit.xs.slice(), fy = o.fit.ys.slice(), fz = (o.fit.zs || fx.map(() => 0)).slice();
            fx[i] = q[0]; fy[i] = q[1]; if (q[2] !== undefined) fz[i] = q[2];
            const sp = app.core.interpSpline(fx, fy, fz); return sp ? Object.assign(cp(o), sp) : null;
          });
        } else
          for (let i = 0; i < d.xs.length; i++) pt(d.xs[i], d.ys[i], d.zs && d.zs[i], (o, q) => { const r = cp(o); r.xs[i] = q[0]; r.ys[i] = q[1]; if (r.zs) r.zs[i] = q[2]; return r; });
        break;
      case 'POINT': case 'TEXT': case 'MTEXT': case 'INSERT':
        if (d.x !== undefined) mv(d.x, d.y, d.z);
        break;
      case 'DIMENSION': {
        // stili dosyanın ölçü stilinden gelen (geçersiz kılması olmayan) ölçüler yeniden üretilirse görünümü değişebilir: yalnız bu programın ölçüleri
        if (!d.kind || !(d.h > 0)) break;
        const z = d.z || 0, k = d.kind;
        const set = (fx, fy) => (o, q) => { const r = cp(o); r[fx] = q[0]; r[fy] = q[1]; delete r.block; return r; };
        if (k === 'linear' || k === 'aligned' || k === 'angular') { pt(d.x1, d.y1, z, set('x1', 'y1')); pt(d.x2, d.y2, z, set('x2', 'y2')); pt(d.lx, d.ly, z, set('lx', 'ly')); }
        if (k === 'angular') pt(d.cx, d.cy, z, set('cx', 'cy'));
        if (k === 'radius' || k === 'diameter') {
          pt(d.x2, d.y2, z, (o, q) => { const r = cp(o), R = Math.hypot(o.x2 - o.cx, o.y2 - o.cy), a = Math.atan2(q[1] - o.cy, q[0] - o.cx); r.x2 = o.cx + R * Math.cos(a); r.y2 = o.cy + R * Math.sin(a); delete r.block; return r; });
          mv(d.cx, d.cy, z);
        }
        break;
      }
    }
    return G;
  }
  near(e) {
    if (!this.list.length) return null;
    const R = this.R; let best = null, bd = 6.5;   // çizilen kare (±5 px) + 1,5 px pay
    // döndür / ölçek kipinde gizmonun merkezi (orantılı ölçek, ekran halkası) gizmoya kalır
    const gz = this.app.gizmo; let O = null;
    if (gz.active && gz.mode !== 'move') { const f = gz.frame(gz.origin()); if (f) O = f.O; }
    for (const g of this.list) {
      const s = R.w2s(g.p[0], g.p[1], g.p[2]);
      if (O && Math.hypot(s[0] - O[0], s[1] - O[1]) < 10) continue;
      const d = Math.max(Math.abs(s[0] - e.offsetX), Math.abs(s[1] - e.offsetY)); if (d < bd) { bd = d; best = g; } }
    return best;
  }
  hover(e) {
    if (!this.enabled()) return false;
    const g = this.near(e);
    if (g !== this.hov) { this.hov = g; $('ov').style.cursor = g ? 'pointer' : 'crosshair'; this.R.request(); }
    return !!g;
  }
  down(e) {
    if (!this.enabled() || e.shiftKey) return false;
    const g = this.near(e); if (!g) return false;
    const app = this.app;
    this.hot = g; this.downAt = [e.offsetX, e.offsetY];
    const T = app.tools.grip; T.g = g; T.base = g.p.slice();
    app.gizmo.hover = null;
    app.setTool('grip');
    return true;
  }
  // tutamaç sonucu (mutlak hedef q) → yeni tanım ya da taşıma
  result(g, q) {
    const d = this.app.defCache.get(g.id); if (!d) return null;
    if (g.kind === 'move') return { move: [q[0] - g.a[0], q[1] - g.a[1], (q[2] || 0) - (g.a[2] || 0)], def: d };
    const nd = g.set(d, q); return nd ? { def: nd } : null;
  }
  commit(q) {
    const app = this.app, g = this.hot, S = this.S; if (!g) return;
    const r = this.result(g, q);
    this.hot = null;
    if (!r) { app.toast('Bu tutamaç bu konuma taşınamaz.'); app.setTool('select'); return; }
    let ids;
    if (r.move) { if (r.move[0] || r.move[1] || r.move[2]) app.editor.move([g.id], r.move[0], r.move[1], r.move[2]); ids = [g.id]; }
    else {
      const nd = r.def; if (nd.li === undefined && nd.layer) { const li = S.layers.findIndex(L => L.name === nd.layer); if (li >= 0) nd.li = li; }
      ids = app.editor.replace([g.id], [nd], 'Tutamaçla düzenlendi (' + nd.type + ')');
      if (!ids.length) { app.toast('Nesne güncellenemedi.'); app.setTool('select'); return; }
    }
    const keep = S.selList.filter(i => i !== g.id).concat(ids);
    app.setTool('select'); S.setSel(keep, 'set'); app.selChanged();
  }
  // önizleme: değişmiş nesne
  preview(ctx, q) {
    const app = this.app, g = this.hot; if (!g) return;
    const r = this.result(g, q); if (!r) return;
    let d = r.def;
    if (r.move) d = this.shift(d, r.move);
    if (d) this.drawDef(ctx, d, 'rgba(255,209,102,.95)');
  }
  shift(d, m) {
    const o = JSON.parse(JSON.stringify(d)), add = (kx, ky) => { if (o[kx] !== undefined) { o[kx] += m[0]; o[ky] += m[1]; } };
    for (const [a, b] of [['x1', 'y1'], ['x2', 'y2'], ['cx', 'cy'], ['x', 'y'], ['lx', 'ly']]) add(a, b);
    if (o.xs) { o.xs = o.xs.map(v => v + m[0]); o.ys = o.ys.map(v => v + m[1]); }
    return o;
  }
  // mutlak tanımı çiz (tutamaç önizlemesi)
  drawDef(ctx, d, color) {
    const app = this.app, R = this.R, o = app.store.info.origin;
    if (Geom.prims(d)) { app.drawDef(ctx, d, color); return; }
    const z = d.z || d.cz || 0, S = (x, y) => R.w2s(x - o[0], y - o[1], z);
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    if (d.type === 'ELLIPSE') {
      const nx = -d.my * d.ratio, ny = d.mx * d.ratio;
      for (let i = 0; i <= 72; i++) { const a = d.t0 + (d.t1 - d.t0) * i / 72, s = S(d.cx + d.mx * Math.cos(a) + nx * Math.sin(a), d.cy + d.my * Math.cos(a) + ny * Math.sin(a)); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }
    } else if (d.type === 'SPLINE') {
      const n = d.xs.length, deg = Math.min(d.deg || 3, n - 1), kn = d.kn && d.kn.length === n + deg + 1 ? d.kn : app.core.uniformKnots(n, deg);
      const out = []; if (app.core.evalSpline(deg, d.xs, d.ys, null, kn, Math.max(64, n * 24), out)) for (let i = 0; i < out.length; i += 2) { const s = S(out[i], out[i + 1]); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }
    } else if (d.type === 'DIMENSION' && app.dims) {
      ctx.restore(); const rd = Object.assign({}, d); for (const [kx, ky] of [['x1', 'y1'], ['x2', 'y2'], ['cx', 'cy'], ['lx', 'ly']]) if (rd[kx] !== undefined) { rd[kx] -= o[0]; rd[ky] -= o[1]; }
      app.dims.draw(ctx, rd); return;
    } else if (d.x !== undefined) {
      const s = S(d.x, d.y); ctx.moveTo(s[0] - 8, s[1]); ctx.lineTo(s[0] + 8, s[1]); ctx.moveTo(s[0], s[1] - 8); ctx.lineTo(s[0], s[1] + 8);
    }
    ctx.stroke(); ctx.restore();
  }
  draw(ctx) {
    const app = this.app, R = this.R;
    if (!this.enabled() || !this.list.length) return;
    const inSel = app.toolName === 'select', inGrip = app.toolName === 'grip';
    if (!inSel && !inGrip) return;
    ctx.save();
    for (const g of this.list) {
      const s = R.w2s(g.p[0], g.p[1], g.p[2]); if (!isFinite(s[0])) continue;
      const hot = g === this.hot, hv = g === this.hov && inSel, r = hot || hv ? 6 : 5;
      ctx.fillStyle = hot ? '#e5534b' : hv ? '#ff9d5c' : g.kind === 'move' ? '#3b82f6' : '#2f7cf6';
      ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 1;
      ctx.fillRect(Math.round(s[0]) - r, Math.round(s[1]) - r, 2 * r, 2 * r); ctx.strokeRect(Math.round(s[0]) - r + .5, Math.round(s[1]) - r + .5, 2 * r - 1, 2 * r - 1);
      if (g.kind === 'move' || g.mid) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(Math.round(s[0]) - 1, Math.round(s[1]) - 1, 2, 2); }
    }
    ctx.restore();
  }
}

FastDXF.use({
  name: 'tutamaclar',
  init(app) {
    const G = app.grips = new Grips(app);
    app.tools.grip = {
      wantsPoints: true, base: null, g: null,
      prompt() { return this.g && this.g.kind === 'move' ? 'Taşı: yeni konum (tıklayın, ya da uzunluk/açı yazın) — Esc: vazgeç' : 'Tutamaç: yeni konum (tıklayın, ya da uzunluk/açı yazın; Tab: kilitle) — Esc: vazgeç'; },
      start() { if (!this.g) return false; },
      click(p) { G.commit(app.absP(p).concat([p[2] !== undefined ? p[2] : (this.base[2] || 0)])); },
      up(e) { if (G.hot && G.downAt && Math.hypot(e.offsetX - G.downAt[0], e.offsetY - G.downAt[1]) > 5) this.click(app.point(this.base)); },
      input(s) { const p = app.parsePoint(s, this.base); if (!p) return false; this.click(p); return true; },
      cancel() { G.hot = null; this.g = null; },
      preview(ctx) {
        if (!G.hot) return; const p = app.point(this.base);
        app.rubber(ctx, this.base, p); G.preview(ctx, app.absP(p).concat([p[2] !== undefined ? p[2] : (this.base[2] || 0)]));
      }
    };
    app.hooks.preview.push((ctx) => G.draw(ctx));
    // nesneye çift tık (yazı değilse): onu seç ve nokta kipine geç
    const sel = app.tools.select, prevDbl = sel.dbl;
    sel.dbl = function () {
      const S = app.store, id = S.grid && app.R.is2D ? S.pick(app.mouse.wx, app.mouse.wy, 6 / app.R.scale) : -1;
      const t = id >= 0 ? app.core.TYPE_NAMES[S.E.type.a[id]] : '';
      if (id >= 0 && t !== 'TEXT' && t !== 'MTEXT') { if (!S.sel[id]) { S.setSel([id], 'set'); app.selChanged(); } app.setPointMode(true); return; }
      if (prevDbl) prevDbl.call(sel);
    };
    app.addCommand(['nokta', 'noktalar', 'points', 'grip'], 'pointmode', 'Nokta düzenleme kipi (seçili nesnenin noktalarını taşı)', 'Değiştir', () => app.setPointMode(!app.pointMode));
    // simge
    const sp = document.querySelector('svg symbol'); if (sp) sp.parentNode.insertAdjacentHTML('beforeend', '<symbol id="i-pts" viewBox="0 0 24 24"><path d="M5 18L19 6"/><rect x="2.5" y="15.5" width="5" height="5" fill="currentColor"/><rect x="16.5" y="3.5" width="5" height="5" fill="currentColor"/><rect x="9.5" y="9.5" width="5" height="5"/></symbol>');
    app.hooks.tool.push((name) => { if (name === 'select') { G.key = ''; G.refresh(); } });
    // seçim ya da düzenleme değişince
    const sc = app.selChanged.bind(app), oe = app.onEdited.bind(app);
    app.selChanged = function () { sc(); G.refresh(); };
    app.onEdited = function () { oe(); G.key = ''; G.refresh(); };
  }
});
