/* Fast DXF — Özellikler paneli: tek nesne seçiliyken ölçüleri sayıyla değiştirme kartı
 *  · Daire: merkez X / Y, yarıçap, çap (biri değişince diğeri güncellenir), çevre ve alan bilgisi
 *  · Yay: merkez, yarıçap, başlangıç / bitiş açısı
 *  · Çizgi: başlangıç X / Y, uzunluk, açı (başlangıç noktası sabit kalır)
 *  · Dikdörtgen (4 köşeli, dik açılı kapalı polyline): en, boy, açı, ilk köşe X / Y
 * Değişiklik geri alınabilir (nesne yeniden oluşturulur). */
'use strict';

FastDXF.use({
  name: 'geometri-ozellikleri',
  init(app) {
    const r6 = (v) => +(+v).toFixed(6), D2R = Math.PI / 180;
    // dikdörtgen tanıma: 4 köşe, kapalı, yaysız, kenarlar dik ve karşılıklı eşit
    const rectOf = (d) => {
      if (d.type !== 'LWPOLYLINE' || d.xs.length !== 4 || !d.closed || (d.bs && d.bs.some(b => Math.abs(b) > 1e-12))) return null;
      const P = d.xs.map((x, i) => [x, d.ys[i]]), v = (a, b) => [P[b][0] - P[a][0], P[b][1] - P[a][1]];
      const u = v(0, 1), w = v(0, 3), W = Math.hypot(u[0], u[1]), H = Math.hypot(w[0], w[1]); if (!(W > 0 && H > 0)) return null;
      const c2 = v(3, 2), tol = 1e-6 * Math.max(W, H);
      if (Math.abs(u[0] * w[0] + u[1] * w[1]) > tol * Math.max(W, H) || Math.hypot(c2[0] - u[0], c2[1] - u[1]) > tol) return null;
      let ang = Math.atan2(u[1], u[0]) / D2R; if (ang < 0) ang += 360;
      const side = Math.sign(u[0] * w[1] - u[1] * w[0]) || 1;   // ikinci kenar ilk kenarın solunda (+1) ya da sağında (−1)
      return { x: P[0][0], y: P[0][1], W, H, ang, side };
    };
    const rectDef = (d, x, y, W, H, ang, side) => {
      const r = ang * D2R, ux = Math.cos(r), uy = Math.sin(r), vx = -uy * side, vy = ux * side;
      const C = [[x, y], [x + W * ux, y + W * uy], [x + W * ux + H * vx, y + W * uy + H * vy], [x + H * vx, y + H * vy]];
      return Object.assign(JSON.parse(JSON.stringify(d)), { xs: C.map(q => q[0]), ys: C.map(q => q[1]), bs: [0, 0, 0, 0] });
    };
    // kart alanları: [anahtar, etiket, değer, salt okunur?]
    const specOf = (d) => {
      if (d.type === 'CIRCLE') return { t: 'Daire', f: [['cx', 'Merkez X', d.cx], ['cy', 'Merkez Y', d.cy], ['r', 'Yarıçap', d.r], ['dia', 'Çap', 2 * d.r]],
        info: 'Çevre ' + fmtC(+(2 * Math.PI * d.r).toFixed(4)) + ' · Alan ' + fmtC(+(Math.PI * d.r * d.r).toFixed(4)),
        sync: { r: (v) => ({ dia: 2 * v }), dia: (v) => ({ r: v / 2 }) },
        make: (v) => v.r > 0 ? Object.assign(JSON.parse(JSON.stringify(d)), { cx: v.cx, cy: v.cy, r: v.r }) : null };
      if (d.type === 'ARC') return { t: 'Yay', f: [['cx', 'Merkez X', d.cx], ['cy', 'Merkez Y', d.cy], ['r', 'Yarıçap', d.r], ['a0', 'Başlangıç açısı °', d.a0], ['a1', 'Bitiş açısı °', d.a1]],
        make: (v) => v.r > 0 ? Object.assign(JSON.parse(JSON.stringify(d)), { cx: v.cx, cy: v.cy, r: v.r, a0: v.a0, a1: v.a1 }) : null };
      if (d.type === 'LINE') {
        const dx = d.x2 - d.x1, dy = d.y2 - d.y1, L = Math.hypot(dx, dy); let a = Math.atan2(dy, dx) / D2R; if (a < 0) a += 360;
        return { t: 'Çizgi', f: [['x1', 'Başlangıç X', d.x1], ['y1', 'Başlangıç Y', d.y1], ['L', 'Uzunluk', L], ['a', 'Açı °', a]],
          make: (v) => { if (!(v.L > 0)) return null; const r = v.a * D2R; return Object.assign(JSON.parse(JSON.stringify(d)), { x1: v.x1, y1: v.y1, x2: v.x1 + v.L * Math.cos(r), y2: v.y1 + v.L * Math.sin(r) }); } };
      }
      const R = rectOf(d);
      if (R) return { t: 'Dikdörtgen', f: [['W', 'En', R.W], ['H', 'Boy', R.H], ['ang', 'Açı °', R.ang], ['x', 'İlk köşe X', R.x], ['y', 'İlk köşe Y', R.y]],
        info: 'Çevre ' + fmtC(+(2 * (R.W + R.H)).toFixed(4)) + ' · Alan ' + fmtC(+(R.W * R.H).toFixed(4)),
        make: (v) => v.W > 0 && v.H > 0 ? rectDef(d, v.x, v.y, v.W, v.H, v.ang, R.side) : null };
      return null;
    };
    const apply = (id, d, spec, card) => {
      const v = {};
      for (const [k] of spec.f) { const x = num(card.querySelector('[data-gk="' + k + '"]').value); if (!isFinite(x)) { app.toast('Geçersiz sayı.'); return; } v[k] = x; }
      const nd = spec.make(v); if (!nd) { app.toast('Ölçüler sıfırdan büyük olmalı.'); return; }
      if (nd.li === undefined && nd.layer) { const li = app.store.layers.findIndex(L => L.name === nd.layer); if (li >= 0) nd.li = li; }
      const ids = app.editor.replace([id], [nd], spec.t + ' ölçüleri değiştirildi');
      if (ids.length) { app.store.setSel(ids, 'set'); app.selChanged(); } else app.toast('Nesne güncellenemedi.');
    };
    app.hooks.props.push((P, ids) => {
      if (ids.length !== 1) return;
      const id = ids[0], tn = app.core.TYPE_NAMES[app.store.E.type.a[id]];
      if (!['CIRCLE', 'ARC', 'LINE', 'LWPOLYLINE'].includes(tn)) return;
      const card = document.createElement('div'); card.className = 'card'; card.style.display = 'none';
      const tbl = P.querySelector('table'); if (tbl && tbl.nextSibling) P.insertBefore(card, tbl.nextSibling); else P.appendChild(card);
      app.getDef(id).then(d => {
        if (!d || !card.isConnected || app.store.selList.length !== 1 || app.store.selList[0] !== id) return;
        const spec = specOf(d); if (!spec) { card.remove(); return; }
        card.innerHTML = '<div class="ch">' + esc(spec.t) + '<span style="text-transform:none;letter-spacing:0;font-weight:400">Enter: uygula</span></div><div class="cb">' +
          spec.f.map(([k, lab, val]) => '<div class="xr"><span class="k">' + esc(lab) + '</span><div class="inp"><input data-gk="' + k + '" value="' + r6(val) + '"></div><span></span></div>').join('') +
          (spec.info ? '<div style="color:var(--muted);font-size:11px;margin:4px 0 2px">' + esc(spec.info) + '</div>' : '') +
          '<div class="actions"><button class="mini" data-gok>Uygula</button></div></div>';
        card.style.display = '';
        card.querySelector('[data-gok]').onclick = () => apply(id, d, spec, card);
        for (const inp of card.querySelectorAll('input[data-gk]')) {
          inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') apply(id, d, spec, card); };
          const sy = spec.sync && spec.sync[inp.dataset.gk];
          if (sy) inp.oninput = () => { const x = num(inp.value); if (!isFinite(x)) return; const o = sy(x); for (const k in o) card.querySelector('[data-gk="' + k + '"]').value = r6(o[k]); };
        }
      }).catch(() => card.remove());
    });
  }
});
