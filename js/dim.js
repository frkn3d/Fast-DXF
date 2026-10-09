/* Fast DXF — ölçülendirme araçları
 *  DLI doğrusal (yatay/düşey otomatik; Y/D ile kilit) · DAL hizalı · DRA yarıçap · DDI çap · DAN açı · DIMSTYLE ayarlar
 *  Ölçüler gerçek DIMENSION varlığı olarak kaydedilir (CAD programlarında düzenlenebilir); geometri js/dim-core.js'ten gelir. */
'use strict';

class DimTools {
  constructor(app) { this.app = app; this.R = app.R; this.D = DXFDimCore(); }
  // Geçerli ölçü stili. kind: ölçü türü (açıda birim yazılmaz) · h0: verilirse bu yazı yüksekliği
  // Ofsetler mutlak çizim birimidir; 0 → yazı yüksekliğine göre ISO-25 oranı
  style(kind, h0) {
    const st = this.app.settings;
    let h = h0 > 0 ? h0 : st.dimH > 0 ? st.dimH : 0;
    if (!h) { const v = 14 / this.R.scale, p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; h = (m < 1.5 ? 1 : m < 2.2 ? 2 : m < 3 ? 2.5 : m < 7 ? 5 : 10) * p; }
    const r = (k, def) => st[k] > 0 ? st[k] : def, tick = st.dimTick === true, asz = r('dimAsz', h);
    const o = { h, dec: st.dimDec !== undefined ? st.dimDec : 2, sep: st.dimSep || ',', asz, exo: r('dimExo', h * 0.25), exe: r('dimExe', h * 0.5), gap: r('dimGap', h * 0.25),
      // eğik çizgi (inşaat): iz düşümleri ok boyu kadar; ölçü çizgisi uzatma çizgilerini aşar
      tsz: tick ? asz : 0, dle: tick ? r('dimDle', asz * 0.5) : 0,
      clrd: st.dimClrD | 0, clre: st.dimClrE | 0, clrt: st.dimClrT | 0 };
    // birim soneki (ör. "12,50 m"): ölçü metni "<> m" — <> ölçülen değerin yeri
    const u = this.unitSfx();
    o.text = kind !== 'angular' && st.dimUnit !== false && u ? '<>' + u : '';
    return o;
  }
  unitSfx() { const i = this.app.store.info; return i ? (UNIT_SFX[i.units] || '') : ''; }
  // önizleme rengi: 0 (bloğa göre) → araç mavisi, 256 → aktif katman rengi
  css(aci) {
    const app = this.app, S = app.store;
    if (!aci) return '#4c9aff';
    if (aci === 256) { const L = S.layers[app.curLayer]; return L ? this.R.colorCss(L.rgba) : '#4c9aff'; }
    return this.R.colorCss(app.core.ACI[aci]);
  }
  // programda çizilmiş (yeni) tüm ölçüleri geçerli ayarlarla yeniden üret; dönüş: güncellenen sayı
  async restyleAll() {
    const app = this.app, S = app.store, E = S.E, TN = app.core.TYPE_NAMES, ids = [], defs = [];
    for (let id = 0; id < S.nEnt; id++) {
      if ((E.flags.a[id] & F_DEL) || !(E.flags.a[id] & F_NEW) || TN[E.type.a[id]] !== 'DIMENSION') continue;
      const d = await app.getDef(id); if (!d || !d.kind) continue;
      // yazı yüksekliği otomatikse ölçünün kendi yüksekliği korunur
      const s2 = this.style(d.kind, app.settings.dimH > 0 ? 0 : d.h);
      delete d.block;
      ids.push(id); defs.push(Object.assign(d, s2));
    }
    if (!ids.length) return 0;
    const nids = app.editor.replace(ids, defs, ids.length + ' ölçünün stili güncellendi');
    if (S.selList.length) { S.clearSel(); app.selChanged(); }
    return nids.length;
  }
  // göreli tanım (önizleme) → mutlak tanım (kayıt)
  absDef(d) {
    const app = this.app, o = app.store.info.origin, out = Object.assign({}, d);
    for (const [kx, ky] of [['x1', 'y1'], ['x2', 'y2'], ['cx', 'cy'], ['lx', 'ly']]) if (out[kx] !== undefined) { out[kx] += o[0]; out[ky] += o[1]; }
    return out;
  }
  create(d) {
    const app = this.app; if (!app.ready()) return;
    const def = app.newDef('DIMENSION', Object.assign(this.absDef(d), this.style(d.kind)));
    app.editor.create(def);
  }
  // önizleme (göreli koordinat)
  draw(ctx, d) {
    const R = this.R, st = Object.assign({}, this.style(d.kind), d), G = this.D.geom(st);
    const cd = this.css(st.clrd), ce = this.css(st.clre), ct = this.css(st.clrt);
    ctx.save(); ctx.lineWidth = 1;
    for (const role of ['e', 'd']) {
      ctx.strokeStyle = role === 'e' ? ce : cd; ctx.beginPath();
      for (const q of G.segs) { if (q[4] !== role) continue; const a = R.w2s(q[0], q[1]), b = R.w2s(q[2], q[3]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
    }
    ctx.fillStyle = cd;
    for (const q of G.tris) { const a = R.w2s(q[0], q[1]), b = R.w2s(q[2], q[3]), c = R.w2s(q[4], q[5]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fill(); }
    for (const t of G.texts) {
      const s = R.w2s(t.x, t.y), px = Math.max(9, t.h * R.scale * 1.35);
      ctx.save(); ctx.fillStyle = ct; ctx.translate(s[0], s[1]); ctx.rotate(-t.rot * Math.PI / 180);
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
    // ölçü ayarları (her yeni ölçüye ölçü stili geçersiz kılması olarak yazılır)
    const COLORS = [[0, 'Bloğa göre (ölçünün rengi)'], [256, 'Katmana göre'], [1, 'Kırmızı'], [2, 'Sarı'], [3, 'Yeşil'], [4, 'Camgöbeği'], [5, 'Mavi'], [6, 'Eflatun'],
      [7, 'Beyaz / siyah'], [8, 'Koyu gri'], [9, 'Açık gri'], [30, 'Turuncu'], [40, 'Altın'], [150, 'Gök mavisi'], [210, 'Pembe'], [250, 'Antrasit']];
    const colorSel = (id, v) => {
      const opts = COLORS.some(c => c[0] === v) ? COLORS : COLORS.concat([[v, 'ACI ' + v]]);
      return '<div class="dclr"><i id="' + id + 'S"></i><select id="' + id + '">' + opts.map(([k, l]) => '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>';
    };
    const styleDialog = () => {
      const st = app.settings, u = T.unitSfx().trim();
      const nIn = (id, k, lb) => '<div><label>' + lb + '</label><input type="text" id="' + id + '" value="' + (st[k] > 0 ? st[k] : 0) + '"></div>';
      app.modal('<h2>Ölçü ayarları</h2><div class="dgrid">' +
        '<h4>Yazı</h4>' +
        '<div><label>Yazı yüksekliği (0: görünüme göre)</label><input type="text" id="dH" value="' + (st.dimH || 0) + '"></div>' +
        '<div><label>Ondalık basamak</label><input type="text" id="dDec" value="' + (st.dimDec !== undefined ? st.dimDec : 2) + '"></div>' +
        '<div><label>Ondalık ayırıcı</label><select id="dSep"><option value=","' + ((st.dimSep || ',') === ',' ? ' selected' : '') + '>Virgül (12,50)</option><option value="."' + (st.dimSep === '.' ? ' selected' : '') + '>Nokta (12.50)</option></select></div>' +
        '<div><label>Birim</label><select id="dUnit"><option value="1"' + (st.dimUnit !== false ? ' selected' : '') + '>Göster' + (u ? ' (12,50 ' + esc(u) + ')' : ' (çizim birimsiz)') + '</option><option value="0"' + (st.dimUnit === false ? ' selected' : '') + '>Gösterme (12,50)</option></select></div>' +
        '<h4>Uçlar ve ofsetler <small>(çizim biriminde; 0: yazı yüksekliğine göre otomatik)</small></h4>' +
        '<div><label>Uç tipi</label><select id="dTick"><option value="0"' + (st.dimTick ? '' : ' selected') + '>Ok (dolu, kapalı)</option><option value="1"' + (st.dimTick ? ' selected' : '') + '>Eğik çizgi (inşaat / mimari)</option></select></div>' +
        nIn('dAsz', 'dimAsz', 'Ok / eğik çizgi boyu') +
        nIn('dExo', 'dimExo', 'Uzatma çizgisi ofseti (nesneden boşluk)') +
        nIn('dExe', 'dimExe', 'Uzatma çizgisi taşması (ölçü çizgisinin ötesi)') +
        nIn('dGap', 'dimGap', 'Yazı ofseti (ölçü çizgisinden uzaklık)') +
        nIn('dDle', 'dimDle', 'Ölçü çizgisi taşması (eğik çizgide)') +
        '<h4>Renkler</h4>' +
        '<div><label>Ölçü çizgisi ve ok rengi</label>' + colorSel('dCD', st.dimClrD | 0) + '</div>' +
        '<div><label>Uzatma çizgisi rengi</label>' + colorSel('dCE', st.dimClrE | 0) + '</div>' +
        '<div><label>Yazı rengi</label>' + colorSel('dCT', st.dimClrT | 0) + '</div>' +
        '<div><label>Önizleme</label><canvas id="dPrev" width="220" height="64" class="dprev"></canvas></div>' +
        '</div><label class="chkrow"><input type="checkbox" id="dAll"> Bu programda çizilmiş tüm ölçülere de uygula</label>' +
        '<div style="color:var(--muted);font-size:12px;margin-top:6px;max-width:520px">Değerler her ölçüye ölçü stili geçersiz kılması (DIMASZ, DIMEXO, DIMEXE, DIMGAP, DIMDLE, DIMTSZ, DIMCLRD/E/T) olarak kaydedilir; birim ölçü metnine eklenir.</div>' +
        '<div class="btns"><button class="btn" id="mNo">Vazgeç</button><button class="btn pri" id="mOk">Kaydet</button></div>', d => {
        const q = (id) => d.querySelector('#' + id), pos = (id) => { const v = num(q(id).value); return v > 0 ? v : 0; };
        const read = () => ({ h: num(q('dH').value), dec: Math.max(0, Math.min(8, Math.round(num(q('dDec').value)))), sep: q('dSep').value, tick: q('dTick').value === '1', unit: q('dUnit').value === '1',
          asz: pos('dAsz'), exo: pos('dExo'), exe: pos('dExe'), gap: pos('dGap'), dle: pos('dDle'), cd: +q('dCD').value, ce: +q('dCE').value, ct: +q('dCT').value });
        const prev = () => {
          const v = read();
          for (const [id, k] of [['dCD', v.cd], ['dCE', v.ce], ['dCT', v.ct]]) q(id + 'S').style.background = T.css(k);
          // önizleme: yazı 9 px; ofsetler yazı yüksekliğine oranla ölçeklenir
          const H = v.h > 0 ? v.h : 2.5, k = 9 / H, sc = (x, def) => x > 0 ? x * k : def;
          const asz = sc(v.asz, 9), c = q('dPrev'), g = c.getContext('2d');
          const G = T.D.geom({ kind: 'linear', x1: 30, y1: 6, x2: 190, y2: 6, lx: 110, ly: 34, rot: 0, h: 9, dec: isFinite(v.dec) ? v.dec : 2, sep: v.sep, asz, exo: sc(v.exo, 2.25), exe: sc(v.exe, 4.5), gap: sc(v.gap, 2.25),
            tsz: v.tick ? asz : 0, dle: v.tick ? sc(v.dle, asz * 0.5) : 0, text: v.unit && u ? '<> ' + u : '' });
          g.clearRect(0, 0, c.width, c.height); g.lineWidth = 1.2;
          const Y = (y) => c.height - y;
          for (const role of ['e', 'd']) { g.strokeStyle = T.css(role === 'e' ? v.ce : v.cd); g.beginPath(); for (const s2 of G.segs) if (s2[4] === role) { g.moveTo(s2[0], Y(s2[1])); g.lineTo(s2[2], Y(s2[3])); } g.stroke(); }
          g.fillStyle = T.css(v.cd); for (const t3 of G.tris) { g.beginPath(); g.moveTo(t3[0], Y(t3[1])); g.lineTo(t3[2], Y(t3[3])); g.lineTo(t3[4], Y(t3[5])); g.fill(); }
          g.fillStyle = T.css(v.ct); g.font = '12px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          for (const t of G.texts) g.fillText(t.str.replace(/%%c/gi, 'Ø').replace(/%%d/gi, '°'), t.x, Y(t.y));
        };
        d.querySelectorAll('input,select').forEach(el => { el.oninput = prev; el.onchange = prev; });
        prev();
        q('mOk').onclick = async () => {
          const v = read(), all = q('dAll').checked;
          app.closeModal();
          Object.assign(app.settings, { dimH: v.h > 0 ? v.h : 0, dimDec: isFinite(v.dec) ? v.dec : 2, dimSep: v.sep, dimTick: v.tick, dimUnit: v.unit,
            dimAsz: v.asz, dimExo: v.exo, dimExe: v.exe, dimGap: v.gap, dimDle: v.dle, dimClrD: v.cd, dimClrE: v.ce, dimClrT: v.ct });
          app.setSetting('dimH', app.settings.dimH);
          if (all) { const n = await T.restyleAll(); app.toast('Ölçü ayarları kaydedildi; ' + n + ' ölçü güncellendi'); }
          else app.toast('Ölçü ayarları kaydedildi (yeni ölçülerde geçerli)');
        };
        q('mNo').onclick = () => app.closeModal();
      });
    };
    app.addCommand(['dimstyle', 'd', 'ölçüayar', 'olcuayar'], 'dimstyle', 'Ölçü ayarları', 'Ölçülendir', styleDialog);
    // şerit: Ölçüm grubuna "Ölçü" bölünmüş menüsü
    const sprite = document.querySelector('svg symbol') && document.querySelector('svg symbol').parentNode;
    if (sprite) sprite.insertAdjacentHTML('beforeend',
      '<symbol id="i-dim" viewBox="0 0 24 24"><path d="M4 7v10M20 7v10M4 12h16"/><path d="M4 12l3-2v4zM20 12l-3-2v4z" fill="currentColor"/></symbol>' +
      '<symbol id="i-dimal" viewBox="0 0 24 24"><g transform="rotate(-32 12 12)"><path d="M4 8v8M20 8v8M4 12h16"/><path d="M4 12l3-2v4zM20 12l-3-2v4z" fill="currentColor"/></g></symbol>' +
      '<symbol id="i-dimang" viewBox="0 0 24 24"><path d="M4 20L20 20M4 20L15 6"/><path d="M12 20a8 8 0 00-2.6-5.9"/></symbol>' +
      '<symbol id="i-dimrad" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><g transform="rotate(-45 12 12)"><path d="M12 12h7"/><path d="M20 12l-3-2v4z" fill="currentColor"/></g><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/></symbol>' +
      '<symbol id="i-dimdia" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><g transform="rotate(-45 12 12)"><path d="M5 12h14"/><path d="M4 12l3-2v4zM20 12l-3-2v4z" fill="currentColor"/></g></symbol>');
    const mbtn = document.getElementById('measStack');
    if (mbtn) mbtn.insertAdjacentHTML('beforebegin',
      '<div class="split dd" id="ddDim"><button class="big" data-tool="dimlinear" title="Doğrusal ölçü (DLI)"><svg class="i"><use href="#i-dim"/></svg><span>Ölçü</span></button>' +
      '<button class="arr dd-btn" title="Tüm ölçü araçları">▾</button><div class="dd-menu">' +
      '<div class="mhead">Ölçülendir</div>' +
      '<button class="mi" data-tool="dimlinear"><svg class="i"><use href="#i-dim"/></svg><span class="lbl">Doğrusal (yatay/düşey)</span><span class="sc">DLI</span></button>' +
      '<button class="mi" data-tool="dimaligned"><svg class="i"><use href="#i-dimal"/></svg><span class="lbl">Hizalı</span><span class="sc">DAL</span></button>' +
      '<button class="mi" data-tool="dimangular"><svg class="i"><use href="#i-dimang"/></svg><span class="lbl">Açı</span><span class="sc">DAN</span></button>' +
      '<button class="mi" data-tool="dimradius"><svg class="i"><use href="#i-dimrad"/></svg><span class="lbl">Yarıçap</span><span class="sc">DRA</span></button>' +
      '<button class="mi" data-tool="dimdiameter"><svg class="i"><use href="#i-dimdia"/></svg><span class="lbl">Çap</span><span class="sc">DDI</span></button>' +
      '<div class="mhead">Ayarlar</div><button class="mi" data-cmd="dimstyle"><svg class="i"><use href="#i-gear"/></svg><span class="lbl">Ölçü ayarları…</span><span class="sc">D</span></button>' +
      '</div></div>');
    // bölünmüş düğme son kullanılan ölçü aracını gösterir (çizim menüsü gibi)
    const DIM_UI = { dimlinear: ['dim', 'Ölçü', 'Doğrusal ölçü (DLI)'], dimaligned: ['dimal', 'Hizalı', 'Hizalı ölçü (DAL)'], dimangular: ['dimang', 'Açı', 'Açı ölçüsü (DAN)'],
      dimradius: ['dimrad', 'Yarıçap', 'Yarıçap ölçüsü (DRA)'], dimdiameter: ['dimdia', 'Çap', 'Çap ölçüsü (DDI)'] };
    app.hooks.tool.push((name) => {
      const u = DIM_UI[name], mb = document.querySelector('#ddDim > .big'); if (!u || !mb) return;
      mb.dataset.tool = name; mb.title = u[2];
      mb.innerHTML = '<svg class="i"><use href="#i-' + u[0] + '"/></svg><span>' + u[1] + '</span>';
    });
  }
});
