/* DXF Okuyucu — kaydetme ve dışa aktarma (DXF, SVG, PDF, PNG) */
'use strict';

const Export = {
  // Blob'u diske yaz: mümkünse "Farklı kaydet" penceresi (büyük dosyalarda akışla), değilse indirme
  async saveBlob(app, blob, name, desc, mime, ext) {
    if (window.showSaveFilePicker) {
      let h;
      try {
        h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: desc, accept: { [mime]: ['.' + ext] } }] });
      } catch (e) { if (e && e.name === 'AbortError') return false; h = null; }
      if (h) {
        if (app.openHandle && h.isSameEntry && await h.isSameEntry(app.openHandle)) {
          app.alert('Açık olan dosyanın üzerine kaydedilemez (kaydederken o dosyadan okunuyor). Lütfen farklı bir ad seçin.');
          return false;
        }
        const w = await h.createWritable();
        await w.write(blob); await w.close();
        return true;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 120000);
    return true;
  },
  baseName(app) { return (app.store.file ? app.store.file.name : 'cizim.dxf').replace(/\.dxf$/i, ''); },
  yieldUI() { return new Promise(r => setTimeout(r, 0)); },

  // ── DXF
  editState(app) {
    const S = app.store, o = S.info.origin, core = app.core;
    // göreli dönüşüm → mutlak (orijin eklenmiş) koordinat dönüşümü
    const absT = (T) => {
      if (!T || core.xfIdentity(T)) return undefined;
      if (T.length === 12) {
        // M_abs = Öteleme(o) ∘ M ∘ Öteleme(−o)
        const M = T.slice(); M[3] += o[0] - (M[0] * o[0] + M[1] * o[1]); M[7] += o[1] - (M[4] * o[0] + M[5] * o[1]); M[11] -= M[8] * o[0] + M[9] * o[1];
        return M;
      }
      const [a, b, c, d, e, f, zs, zt] = T;
      return [a, b, c, d, e + o[0] - (a * o[0] + b * o[1]), f + o[1] - (c * o[0] + d * o[1]), zs, zt];
    };
    // yeniden adlandırılmış katmanlardaki nesnelerin 8 kodu da yeni adla yazılmalı
    const renamed = (li) => { const L = S.layers[li]; return !!(L && L.origName !== undefined && L.origName !== L.name); };
    const toEd = (e, id) => {
      const r = {};
      const T = absT(e && e.T); if (T) r.T = T;
      if (e && e.aci !== undefined) r.aci = e.aci;
      if (e && e.layer !== undefined) r.layer = S.layers[e.layer].name;
      else if (id !== undefined && renamed(S.E.layer.a[id])) r.layer = S.layers[S.E.layer.a[id]].name;
      return r;
    };
    const changed = (e, id) => (e && ((e.T && !core.xfIdentity(e.T)) || e.aci !== undefined || e.layer !== undefined)) || (id !== undefined && renamed(S.E.layer.a[id]));
    return { toEd, changed, renamed };
  },
  async saveDXF(app, mode, keepIds) {
    const S = app.store, E = S.E, info = S.info;
    if (!S.file || !info) return;
    const { toEd, changed, renamed } = this.editState(app);
    const ops = [], copies = [], news = [];
    const addNew = (id) => {
      const inf = S.newInfo.get(id), e = S.edits.get(id) || {};
      if (inf.src !== undefined) copies.push({ fs: E.fs.a[inf.src], fe: E.fe.a[inf.src], ed: toEd(e, id) });
      else if (inf.def) {
        const d = JSON.parse(JSON.stringify(inf.def));
        if (d.li !== undefined && d.layer === undefined) d.layer = S.layers[d.li].name;
        news.push({ def: d, ed: toEd(e, id) });
      }
    };
    if (info.binary && (mode === 'full' ? S.edits.size > 0 : keepIds.some(id => (E.flags.a[id] & F_NEW) || changed(S.edits.get(id))))) {
      app.alert('İkili (binary) DXF dosyalarında düzenlemeler kaydedilemez. Yalnızca değiştirilmemiş nesneleri ayrı dosyaya kaydedebilirsiniz.');
      return;
    }
    if (mode === 'full') {
      for (const [id, e] of S.edits) {
        if (E.flags.a[id] & F_NEW) continue;
        if (E.flags.a[id] & F_DEL) ops.push({ fs: E.fs.a[id], fe: E.fe.a[id], kind: 'del' });
        else if (changed(e, id)) ops.push({ fs: E.fs.a[id], fe: E.fe.a[id], kind: 'patch', ed: toEd(e, id) });
      }
      // adı değişen katmanlardaki dokunulmamış nesneler
      if (S.layers.some((L, i) => renamed(i))) {
        const la = E.layer.a, fl = E.flags.a;
        for (let id = 0; id < S.nEnt; id++) if (renamed(la[id]) && !(fl[id] & (F_NEW | F_DEL)) && !S.edits.has(id)) ops.push({ fs: E.fs.a[id], fe: E.fe.a[id], kind: 'patch', ed: toEd(null, id) });
      }
      for (const [id] of S.newInfo) if (!(E.flags.a[id] & F_DEL)) addNew(id);
    } else {
      for (const id of keepIds) {
        if (E.flags.a[id] & F_DEL) continue;
        if (E.flags.a[id] & F_NEW) { addNew(id); continue; }
        const e = S.edits.get(id);
        ops.push(changed(e, id) ? { fs: E.fs.a[id], fe: E.fe.a[id], kind: 'patch', ed: toEd(e, id) } : { fs: E.fs.a[id], fe: E.fe.a[id], kind: 'keep' });
      }
    }
    const newLayers = S.layers.filter(L => L && L.isNew && !L.deleted).map(L => ({ name: L.name, aci: L.aci, locked: !!L.locked, frozen: !!L.frozen }));
    const layerMods = S.layers.filter(L => L && !L.isNew && L.mod && L.fe > L.fs).map(L => ({ fs: L.fs, fe: L.fe, name: L.name, aci: L.aci, off: !!L.off, frozen: !!L.frozen, locked: !!L.locked, del: !!L.deleted, colorChanged: !!L.colorChanged }));
    if (mode === 'full' && !ops.length && !copies.length && !news.length && !newLayers.length && !layerMods.length && !S.isNew) {
      if (!await app.confirm('Kaydedilecek değişiklik yok. Yine de dosyanın kopyası kaydedilsin mi?')) return;
    }
    const msg = {
      mode, encoding: info.encoding, eol: info.eol, version: info.version, owner: info.modelHandle,
      handseed: info.handseed, handseedHex: info.handseedHex, entStart: info.entStart, entEnd: info.entEnd, ops, copies, news,
      newLayers, layerMods, layerEnd: info.layerEnd === undefined ? -1 : info.layerEnd, layerTableHandle: info.layerTableHandle || ''
    };
    app.busy('DXF hazırlanıyor…');
    const w = spawnWorker(saveWorkerMain);
    let res;
    try {
      res = await new Promise((resolve, reject) => {
        w.onmessage = (ev) => ev.data.type === 'done' ? resolve(ev.data) : reject(new Error(ev.data.data));
        w.onerror = (ev) => reject(new Error(ev.message));
        w.postMessage({ file: S.file, msg });
      });
    } catch (e) { app.busy(null); w.terminate(); app.alert('Kaydetme hatası: ' + e.message); return; }
    w.terminate();
    app.busy('Diske yazılıyor… (' + (res.blob.size / 1048576).toFixed(1) + ' MB)');
    const name = this.baseName(app) + (mode === 'full' ? (S.isNew ? '.dxf' : '_duzenlenmis.dxf') : '_secim.dxf');
    try {
      const ok = await this.saveBlob(app, res.blob, name, 'DXF çizimi', 'application/dxf', 'dxf');
      app.busy(null);
      if (ok) { if (mode === 'full') S.dirty = false; app.toast('Kaydedildi: ' + name + ' (' + (res.blob.size / 1048576).toFixed(1) + ' MB)', 5000); }
    } catch (e) { app.busy(null); app.alert('Yazma hatası: ' + e.message); }
  },

  // ── görünür geometriyi gez (SVG/PDF için). Koordinatlar göreli (origin çıkarılmış).
  // onSeg(x1,y1,x2,y2,rgba)  onPt(x,y,rgba)
  async walk(app, region, onSeg, onPt, progress) {
    const S = app.store, vis = S.layerVis;
    const [rx0, ry0, rx1, ry1] = region;
    let count = 0;
    const tick = async () => { if (++count % 400000 === 0) { if (progress) progress(); await this.yieldUI(); } };
    for (const ch of S.chunks) {
      if (!ch) continue;
      const P = ch.pos, C = ch.col, L = ch.lay;
      for (let v = 0; v < ch.nV; v += 2) {
        const c = C[v]; if ((c >>> 24) === 0 || !vis[L[v]]) continue;
        const x1 = P[2 * v], y1 = P[2 * v + 1], x2 = P[2 * v + 2], y2 = P[2 * v + 3];
        if ((x1 < rx0 && x2 < rx0) || (x1 > rx1 && x2 > rx1) || (y1 < ry0 && y2 < ry0) || (y1 > ry1 && y2 > ry1)) continue;
        onSeg(x1, y1, x2, y2, c); await tick();
      }
      const Q = ch.ppos, PC = ch.pcol, PL = ch.play;
      for (let v = 0; v < ch.nP; v++) {
        const c = PC[v]; if ((c >>> 24) === 0 || !vis[PL[v]]) continue;
        const x = Q[2 * v], y = Q[2 * v + 1];
        if (x < rx0 || x > rx1 || y < ry0 || y > ry1) continue;
        onPt(x, y, c); await tick();
      }
    }
    for (const B of S.blocks) {
      if (!B || !B.n || !B.pos) continue;
      const f = B.f.a, cc = B.c.a;
      for (let s = 0; s < B.n; s++) {
        const o = s * 8;
        if (f[o + 7] < 0.5) continue;
        const a = f[o], b = f[o + 1], tx = f[o + 2], c = f[o + 3], d = f[o + 4], ty = f[o + 5], ilay = f[o + 6], q0 = B.fx.a[4 * s], q1 = B.fx.a[4 * s + 1];
        if (B.bb) {
          let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
          for (let k = 0; k < 4; k++) { const x = (k & 1) ? B.bb[2] : B.bb[0], y = (k & 2) ? B.bb[3] : B.bb[1]; const X = a * x + b * y + tx, Y = c * x + d * y + ty; X0 = Math.min(X0, X); X1 = Math.max(X1, X); Y0 = Math.min(Y0, Y); Y1 = Math.max(Y1, Y); }
          if (X1 < rx0 || X0 > rx1 || Y1 < ry0 || Y0 > ry1) continue;
        }
        const icol = cc[2 * s], ilcol = cc[2 * s + 1];
        const res = (col) => { const f2 = col >>> 24; return f2 === 253 ? icol : f2 === 252 ? ilcol : col; };
        const P = B.pos, C = B.col, L = B.lay;
        for (let v = 0; v < B.nV; v += 2) {
          const l = L[v] === 65535 ? ilay : L[v]; if (!vis[l]) continue;
          const col = res(C[v]); if ((col >>> 24) === 0) continue;
          const x1 = P[2 * v], y1 = P[2 * v + 1], x2 = P[2 * v + 2], y2 = P[2 * v + 3], z1 = B.z[v], z2 = B.z[v + 1];
          onSeg(a * x1 + b * y1 + q0 * z1 + tx, c * x1 + d * y1 + q1 * z1 + ty, a * x2 + b * y2 + q0 * z2 + tx, c * x2 + d * y2 + q1 * z2 + ty, col); await tick();
        }
        const Q = B.ppos;
        for (let v = 0; v < B.nP; v++) {
          const l = B.play[v] === 65535 ? ilay : B.play[v]; if (!vis[l]) continue;
          const x = Q[2 * v], y = Q[2 * v + 1];
          onPt(a * x + b * y + q0 * B.pz[v] + tx, c * x + d * y + q1 * B.pz[v] + ty, res(B.pcol[v])); await tick();
        }
      }
    }
  },
  visibleTexts(app, region, fn) {
    const S = app.store, X = S.TX, [rx0, ry0, rx1, ry1] = region;
    for (let i = 0; i < S.nText; i++) {
      if (X.hid.a[i] || !S.layerVis[X.lay.a[i]]) continue;
      const x = X.x.a[i], y = X.y.a[i];
      if (x < rx0 || x > rx1 || y < ry0 || y > ry1) continue;
      fn(i, x, y, X.h.a[i], X.r.a[i], X.al.a[i], X.wf.a[i], X.col.a[i], S.TS[i]);
    }
  },
  rgbOf(c, dark) {
    const a = c >>> 24;
    if (a >= 252 && a <= 254) return dark ? [255, 255, 255] : [0, 0, 0];
    return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255];
  },
  region(app, which) {
    if (which === 'view') return app.R.viewBox();
    const e = app.store.ext; return e ? e.slice() : app.R.viewBox();
  },

  // ── SVG
  async svg(app, opt) {
    const reg = this.region(app, opt.region), dark = opt.bg === 'dark';
    const [x0, y0, x1, y1] = reg, W = x1 - x0, H = y1 - y0;
    const k = 1000 / Math.max(W, H); // 1000 birimlik viewBox
    const r = (v) => Math.round(v * 100) / 100;
    const parts = [];
    let buf = '';
    const flush = () => { if (buf) { parts.push(buf); buf = ''; } };
    buf += '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + r(W * k) + ' ' + r(H * k) + '" width="' + r(W * k) + 'mm" height="' + r(H * k) + 'mm">\n';
    buf += '<rect width="100%" height="100%" fill="' + (dark ? '#1b1e23' : '#ffffff') + '"/>\n<g fill="none" stroke-linecap="round" stroke-width="0.6" vector-effect="non-scaling-stroke">\n';
    let curCol = -1, lx = NaN, ly = NaN, n = 0;
    const colHex = (c) => { const [R, G, B] = this.rgbOf(c, dark); return '#' + ((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1); };
    const openPath = (c) => { if (curCol !== -1) buf += '"/>\n'; buf += '<path stroke="' + colHex(c) + '" vector-effect="non-scaling-stroke" d="'; curCol = c; lx = NaN; };
    app.busy('SVG hazırlanıyor…');
    await this.walk(app, reg, (ax, ay, bx, by, c) => {
      if (c !== curCol || n++ > 5000) { openPath(c); n = 0; }
      const X1 = r((ax - x0) * k), Y1 = r((y1 - ay) * k), X2 = r((bx - x0) * k), Y2 = r((y1 - by) * k);
      if (X1 !== lx || Y1 !== ly) buf += 'M' + X1 + ' ' + Y1;
      buf += 'L' + X2 + ' ' + Y2; lx = X2; ly = Y2;
      if (buf.length > 1 << 20) flush();
    }, (x, y, c) => {
      if (c !== curCol) openPath(c);
      buf += 'M' + r((x - x0) * k) + ' ' + r((y1 - y) * k) + 'h0'; lx = NaN;
    }, () => app.busy('SVG hazırlanıyor… ' + (parts.length) + ' MB'));
    if (curCol !== -1) buf += '"/>\n';
    buf += '</g>\n<g font-family="Arial, sans-serif">\n';
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    this.visibleTexts(app, reg, (i, x, y, h, rot, al, wf, c, str) => {
      const X = r((x - x0) * k), Y = r((y1 - y) * k), fs = r(h * k * 1.4);
      const ha = al & 3, va = (al >> 2) & 3;
      const anchor = ha === 1 ? 'middle' : ha === 2 ? 'end' : 'start';
      const base = va === 3 ? 'hanging' : va === 2 ? 'middle' : 'alphabetic';
      const lines = str.split('\n');
      buf += '<text x="' + X + '" y="' + Y + '" font-size="' + fs + '" fill="' + colHex(c) + '" text-anchor="' + anchor + '" dominant-baseline="' + base + '"' +
        (rot ? ' transform="rotate(' + r(-rot * 180 / Math.PI) + ' ' + X + ' ' + Y + ')"' : '') + '>';
      if (lines.length === 1) buf += esc(str);
      else lines.forEach((ln, j) => { buf += '<tspan x="' + X + '" dy="' + (j ? r(fs * 1.2) : 0) + '">' + esc(ln) + '</tspan>'; });
      buf += '</text>\n';
      if (buf.length > 1 << 20) flush();
    });
    buf += '</g>\n</svg>\n'; flush();
    const blob = new Blob(parts, { type: 'image/svg+xml' });
    app.busy(null);
    const ok = await this.saveBlob(app, blob, this.baseName(app) + '.svg', 'SVG çizimi', 'image/svg+xml', 'svg');
    if (ok) app.toast('SVG kaydedildi (' + (blob.size / 1048576).toFixed(1) + ' MB)');
  },

  // ── PDF (vektörel; yazılar Helvetica)
  async pdf(app, opt) {
    const sizes = { A4: [842, 595], A3: [1191, 842], A2: [1684, 1191], A1: [2384, 1684], A0: [3370, 2384] };
    const reg = this.region(app, opt.region), dark = false;
    const [x0, y0, x1, y1] = reg, W = x1 - x0, H = y1 - y0;
    let [pw, ph] = sizes[opt.size] || sizes.A3;
    if (H > W) [pw, ph] = [ph, pw];
    const m = 20, k = Math.min((pw - 2 * m) / W, (ph - 2 * m) / H);
    const ox = m + ((pw - 2 * m) - W * k) / 2, oy = m + ((ph - 2 * m) - H * k) / 2;
    const r = (v) => Math.round(v * 100) / 100;
    const chunks = []; let buf = '0.3 w 1 J 1 j\n';
    let cur = -1;
    const flush = () => { if (buf) { chunks.push(buf); buf = ''; } };
    const setCol = (c) => { const [R, G, B] = this.rgbOf(c, dark); buf += 'S\n' + r(R / 255) + ' ' + r(G / 255) + ' ' + r(B / 255) + ' RG\n'; cur = c; };
    app.busy('PDF hazırlanıyor…');
    let lx = NaN, ly = NaN;
    await this.walk(app, reg, (ax, ay, bx, by, c) => {
      if (c !== cur) { setCol(c); lx = NaN; }
      const X1 = r(ox + (ax - x0) * k), Y1 = r(oy + (ay - y0) * k), X2 = r(ox + (bx - x0) * k), Y2 = r(oy + (by - y0) * k);
      if (X1 !== lx || Y1 !== ly) buf += X1 + ' ' + Y1 + ' m ';
      buf += X2 + ' ' + Y2 + ' l\n'; lx = X2; ly = Y2;
      if (buf.length > 1 << 20) flush();
    }, (x, y, c) => {
      if (c !== cur) { setCol(c); }
      const X = r(ox + (x - x0) * k), Y = r(oy + (y - y0) * k);
      buf += X + ' ' + Y + ' m ' + X + ' ' + Y + ' l\n'; lx = NaN;
    });
    buf += 'S\n';
    const fold = { 'ğ': 'g', 'Ğ': 'G', 'ş': 's', 'Ş': 'S', 'ı': 'i', 'İ': 'I', 'Ø': 'Ø', '°': '°', '±': '±' };
    const pdfStr = (s) => {
      let o = '';
      for (const ch of s) {
        let c = fold[ch] !== undefined ? fold[ch] : ch;
        const code = c.charCodeAt(0);
        if (c === '(' || c === ')' || c === '\\') o += '\\' + c;
        else if (code < 32) o += ' ';
        else if (code < 128) o += c;
        else if (code < 256) o += '\\' + code.toString(8).padStart(3, '0');
        else o += '?';
      }
      return o;
    };
    this.visibleTexts(app, reg, (i, x, y, h, rot, al, wf, c, str) => {
      const [R, G, B] = this.rgbOf(c, dark);
      const fs = h * k * 1.4; if (fs < 0.5) return;
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const lines = str.split('\n'), ha = al & 3, va = (al >> 2) & 3;
      lines.forEach((ln, j) => {
        const wApprox = ln.length * fs * 0.5 * (wf || 1);
        let dx = ha === 1 ? -wApprox / 2 : ha === 2 ? -wApprox : 0;
        let dy = va === 3 ? -h * k : va === 2 ? -h * k / 2 : 0;
        dy -= j * h * k * 1.66;
        const X = ox + (x - x0) * k + dx * cs - dy * sn, Y = oy + (y - y0) * k + dx * sn + dy * cs;
        buf += 'BT ' + r(R / 255) + ' ' + r(G / 255) + ' ' + r(B / 255) + ' rg /F1 ' + r(fs) + ' Tf ' + r(cs * (wf || 1)) + ' ' + r(sn * (wf || 1)) + ' ' + r(-sn) + ' ' + r(cs) + ' ' + r(X) + ' ' + r(Y) + ' Tm (' + pdfStr(ln) + ') Tj ET\n';
      });
      if (buf.length > 1 << 20) flush();
    });
    flush();
    // sıkıştır
    const raw = new Blob(chunks);
    let content;
    try { content = await new Response(raw.stream().pipeThrough(new CompressionStream('deflate'))).blob(); } catch (e) { content = null; }
    const filter = content ? '/Filter /FlateDecode ' : '';
    if (!content) content = raw;
    const enc = new TextEncoder();
    const objs = [];
    const parts = []; let pos = 0;
    const add = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += b.size !== undefined ? b.size : b.length; };
    add('%PDF-1.4\n%âãÏÓ\n');
    const obj = (n, body) => { objs[n] = pos; add(n + ' 0 obj\n' + body + '\nendobj\n'); };
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
    objs[4] = pos; add('4 0 obj\n<< ' + filter + '/Length ' + content.size + ' >>\nstream\n'); add(content); add('\nendstream\nendobj\n');
    obj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const xref = pos;
    let x = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) x += String(objs[i]).padStart(10, '0') + ' 00000 n \n';
    add(x + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    const blob = new Blob(parts, { type: 'application/pdf' });
    app.busy(null);
    const ok = await this.saveBlob(app, blob, this.baseName(app) + '.pdf', 'PDF belgesi', 'application/pdf', 'pdf');
    if (ok) app.toast('PDF kaydedildi (' + (blob.size / 1048576).toFixed(1) + ' MB)');
  },

  // ── PNG (ekran görünümü, ölçekli)
  async png(app, opt) {
    const R = app.R, gl = R.gl;
    const max = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), 16384);
    let f = opt.factor || 2;
    let Wp = Math.round(R.W * f), Hp = Math.round(R.H * f);
    const lim = Math.min(max / Wp, max / Hp, Math.sqrt(1.5e8 / (Wp * Hp)));
    if (lim < 1) { Wp = Math.floor(Wp * lim); Hp = Math.floor(Hp * lim); f = Wp / R.W; }
    app.busy('PNG hazırlanıyor… (' + Wp + '×' + Hp + ')');
    await this.yieldUI();
    const wasDark = R.dark;
    if (opt.bg === 'white' && wasDark) R.setTheme(false);
    if (opt.bg === 'dark' && !wasDark) R.setTheme(true);
    const cam = R.cam(Wp, Hp, f);
    const px = R.renderToPixels(Wp, Hp, cam);
    const cv = document.createElement('canvas'); cv.width = Wp; cv.height = Hp;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(Wp, Hp);
    for (let y = 0; y < Hp; y++) img.data.set(px.subarray((Hp - 1 - y) * Wp * 4, (Hp - y) * Wp * 4), y * Wp * 4);
    ctx.putImageData(img, 0, 0);
    const savedXf = R.xf; R.xf = [1, 0, 0, 1, 0, 0, 1, 0]; R.dprT = 1;
    R.drawTexts(ctx, cam, 300000, false);
    R.dprT = undefined; R.xf = savedXf;
    if (R.dark !== wasDark) R.setTheme(wasDark);
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    app.busy(null);
    if (!blob) { app.alert('PNG oluşturulamadı (görüntü çok büyük olabilir).'); return; }
    const ok = await this.saveBlob(app, blob, this.baseName(app) + '.png', 'PNG resmi', 'image/png', 'png');
    if (ok) app.toast('PNG kaydedildi (' + Wp + '×' + Hp + ')');
  }
};
