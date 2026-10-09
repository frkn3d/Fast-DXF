/* DXF Okuyucu — düzenleme komutları (geri al / yinele)
 * Konumsal değişiklikler her varlık için tek bir birleşik dönüşüm (T) olarak tutulur; kaydederken ham DXF metnine uygulanır.
 * Yeni nesneler (çizim, budama sonuçları…) DXF metni olarak üretilip ayrıştırıcıdan geçirilir: ekrandaki = kaydedilen. */
'use strict';

const NO_MOVE_TYPES = new Set([12, 20]); // DIMENSION, ACAD_TABLE: blok tabanlı, CAD programında eski yerinde kalır
const T_ID = [1, 0, 0, 1, 0, 0, 1, 0];

class Editor {
  constructor(app) { this.app = app; this.S = app.store; this.R = app.R; this.core = app.core; this.undoStack = []; this.redoStack = []; this.hidCol = new Map(); }
  reset() { this.undoStack = []; this.redoStack = []; this.hidCol = new Map(); }
  exec(cmd) { cmd.do(); this.undoStack.push(cmd); this.redoStack = []; this.after(); }
  undo() { const c = this.undoStack.pop(); if (!c) return; c.undo(); this.redoStack.push(c); this.after(); this.app.toast('Geri alındı: ' + c.label); }
  redo() { const c = this.redoStack.pop(); if (!c) return; c.do(); this.undoStack.push(c); this.after(); this.app.toast('Yinelendi: ' + c.label); }
  after() { this.S.dirty = true; this.R.hl.dirty = true; this.R.request(); this.app.onEdited(); }

  // ── alt düzey yardımcılar
  mark(ch, key, a, b) {
    if (!ch.dirty) ch.dirty = {};
    const r = ch.dirty[key];
    ch.dirty[key] = r ? [Math.min(r[0], a), Math.max(r[1], b)] : [a, b];
  }
  ed(id) { let e = this.S.edits.get(id); if (!e) { e = {}; this.S.edits.set(id, e); } return e; }

  // Varlıklara dönüşüm uygula (göreli koordinat). T: 8 sayılı düzlem dönüşümü ya da 12 sayılı 3×4 (3B afin).
  // Düzlemsel benzerlikte yazı açıları kesin (aynalamada okunurluk kuralı); genel 3B'de yazılar yaklaşık (konum kesin).
  applyXform(ids, T) {
    const S = this.S, E = S.E, X = S.TX, core = this.core;
    const M = core.toM(T), [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11] = M;
    const planar = core.mPlanar(M), psim = planar && core.sim2(m0, m1, m4, m5);
    const xm = psim ? core.xfMake(core.mTo8(M)) : null, thDeg = xm ? xm.th * 180 / Math.PI : 0;
    const det2 = m0 * m5 - m1 * m4;
    const P3 = (P, Z, i) => {
      const x = P[2 * i], y = P[2 * i + 1], z = Z[i];
      P[2 * i] = m0 * x + m1 * y + m2 * z + m3; P[2 * i + 1] = m4 * x + m5 * y + m6 * z + m7; Z[i] = m8 * x + m9 * y + m10 * z + m11;
    };
    for (const id of ids) {
      const ch = S.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id];
      if (ch && vc) {
        const pts = (E.flags.a[id] & F_POINTS) !== 0, P = pts ? ch.ppos : ch.pos, Z = pts ? ch.pz : ch.z;
        for (let v = vs; v < vs + vc; v++) P3(P, Z, v);
        this.mark(ch, pts ? 'ppos' : 'pos', vs, vs + vc); this.mark(ch, pts ? 'pz' : 'z', vs, vs + vc);
      }
      const rs = E.rs.a[id], rc = E.rc.a[id];
      if (ch && rc) {
        for (let v = rs; v < rs + rc; v++) P3(ch.tpos, ch.tz, v);
        this.mark(ch, 'tpos', rs, rs + rc); this.mark(ch, 'tz', rs, rs + rc);
      }
      const is = E.is.a[id], ic = E.ic.a[id];
      for (let k = is; k < is + ic; k++) {
        const B = S.blocks[S.IN.blk.a[k]], sl = S.IN.slot.a[k], I = S.instM(B, sl), R = core.mMul(M, I);
        if (planar && m10 === 0) R[10] = I[10];   // kot atamada blok iç Z ölçeği korunur (DXF yamasıyla aynı)
        S.setInstM(B, sl, R);
      }
      const ts = E.ts.a[id], tc = E.tc.a[id];
      for (let t = ts; t < ts + tc; t++) {
        const x = X.x.a[t], y = X.y.a[t], z = X.z.a[t], rr = X.r.a[t];
        X.x.a[t] = m0 * x + m1 * y + m2 * z + m3; X.y.a[t] = m4 * x + m5 * y + m6 * z + m7; X.z.a[t] = m8 * x + m9 * y + m10 * z + m11;
        const deg = rr * 180 / Math.PI;
        let nd;
        if (psim) {
          X.h.a[t] *= xm.sc;
          if (!xm.mir) nd = deg + thDeg;
          else if (X.al.a[t] & 64) { nd = core.xfAng(xm, deg); if (Math.cos(nd * Math.PI / 180) < -1e-9) nd += 180; }
          else nd = core.xfTextAng(xm, deg);
        } else {
          const c = Math.cos(rr), sn = Math.sin(rr);
          const dx = m0 * c + m1 * sn, dy = m4 * c + m5 * sn;
          X.h.a[t] *= Math.hypot(-m0 * sn + m1 * c, -m4 * sn + m5 * c, -m8 * sn + m9 * c) || 1;
          nd = (Math.hypot(dx, dy) > 1e-12 ? Math.atan2(dy, dx) : rr) * 180 / Math.PI;
          if (det2 < 0) { const d0 = Math.abs(((nd - deg) % 360 + 540) % 360 - 180); if (d0 > 90) nd += 180; }
        }
        X.r.a[t] = nd * Math.PI / 180;
      }
      S.recomputeBBox(id);
      E.flags.a[id] |= F_DYN; S.dyn.add(id);
      const ed = this.ed(id); ed.T = core.xfCompose(T, ed.T || T_ID);
    }
  }
  // Dönüşüm aynalama mı (düzlemde, determinant < 0) — eski yol taramaları aynalayamaz
  isMirror(T) { const M = this.core.toM(T); return this.core.mPlanar(M) && M[0] * M[5] - M[1] * M[4] < 0; }
  setDeleted(ids, del) {
    const S = this.S, E = S.E;
    for (const id of ids) {
      // gizlerken köşe renkleri tek renk değilse (ör. renkli ölçü parçaları) saklanır, geri getirirken aynen yazılır
      const hidden = (E.flags.a[id] & F_DEL) !== 0;
      if (del && !hidden) { const c = this.colors(id); if (c) this.hidCol.set(id, c); this.paint(id, 0); }
      else if (!del && hidden) { const c = this.hidCol.get(id); if (c) { this.restoreColors(id, c); this.hidCol.delete(id); } else this.paint(id, E.color.a[id]); }
      const is = E.is.a[id], ic = E.ic.a[id];
      for (let k = is; k < is + ic; k++) { const B = S.blocks[S.IN.blk.a[k]]; B.f.a[S.IN.slot.a[k] * 8 + 7] = del ? 0 : 1; B.instDirty = true; }
      const ts = E.ts.a[id], tc = E.tc.a[id];
      for (let t = ts; t < ts + tc; t++) S.TX.hid.a[t] = del ? 1 : 0;
      const was = (E.flags.a[id] & F_DEL) !== 0;
      if (del) E.flags.a[id] |= F_DEL; else E.flags.a[id] &= ~F_DEL;
      const L = S.layers[E.layer.a[id]]; if (L && was !== del) L.count += del ? -1 : 1;
      if (!(E.flags.a[id] & F_NEW)) { const e = this.ed(id); e.del = del; }
    }
  }
  // Varlığın köşe renkleri tek renk değilse kopyası (değilse null)
  colors(id) {
    const S = this.S, E = S.E, ch = S.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id], rs = E.rs.a[id], rc = E.rc.a[id];
    if (!ch) return null;
    const pts = (E.flags.a[id] & F_POINTS) !== 0, C = pts ? ch.pcol : ch.col, c0 = E.color.a[id];
    let mixed = false;
    for (let v = vs; v < vs + vc && !mixed; v++) if (C[v] !== c0) mixed = true;
    for (let v = rs; v < rs + rc && !mixed; v++) if (ch.tcol[v] !== c0) mixed = true;
    return mixed ? { c: C.slice(vs, vs + vc), t: rc ? ch.tcol.slice(rs, rs + rc) : null } : null;
  }
  restoreColors(id, k) {
    const S = this.S, E = S.E, ch = S.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id], rs = E.rs.a[id], rc = E.rc.a[id];
    if (!ch) return;
    const pts = (E.flags.a[id] & F_POINTS) !== 0, C = pts ? ch.pcol : ch.col;
    if (vc && k.c.length === vc) { C.set(k.c, vs); this.mark(ch, pts ? 'pcol' : 'col', vs, vs + vc); }
    if (rc && k.t && k.t.length === rc) { ch.tcol.set(k.t, rs); this.mark(ch, 'tcol', rs, rs + rc); }
  }
  // Varlığın kendi köşe/örnek/yazı renklerini yaz (0 = gizli)
  paint(id, rgba) {
    const S = this.S, E = S.E;
    const ch = S.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id];
    if (ch && vc) {
      const pts = (E.flags.a[id] & F_POINTS) !== 0, C = pts ? ch.pcol : ch.col;
      C.fill(rgba, vs, vs + vc);
      this.mark(ch, pts ? 'pcol' : 'col', vs, vs + vc);
    }
    const rs = E.rs.a[id], rc = E.rc.a[id];
    if (ch && rc) { ch.tcol.fill(rgba, rs, rs + rc); this.mark(ch, 'tcol', rs, rs + rc); }
  }
  applyColor(id, rgba) {
    const S = this.S, E = S.E;
    E.color.a[id] = rgba;
    if (!(E.flags.a[id] & F_DEL)) this.paint(id, rgba);
    const is = E.is.a[id], ic = E.ic.a[id];
    for (let k = is; k < is + ic; k++) { const B = S.blocks[S.IN.blk.a[k]]; B.c.a[S.IN.slot.a[k] * 2] = rgba; B.instDirty = true; }
    const ts = E.ts.a[id], tc = E.tc.a[id];
    for (let t = ts; t < ts + tc; t++) S.TX.col.a[t] = rgba;
  }
  applyLayer(id, li) {
    const S = this.S, E = S.E;
    const old = E.layer.a[id];
    E.layer.a[id] = li;
    const ch = S.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id];
    if (ch && vc) {
      const pts = (E.flags.a[id] & F_POINTS) !== 0, L = pts ? ch.play : ch.lay;
      L.fill(li, vs, vs + vc); this.mark(ch, pts ? 'play' : 'lay', vs, vs + vc);
    }
    const rs = E.rs.a[id], rc = E.rc.a[id];
    if (ch && rc) { ch.tlay.fill(li, rs, rs + rc); this.mark(ch, 'tlay', rs, rs + rc); }
    const is = E.is.a[id], ic = E.ic.a[id];
    const lrgba = S.layers[li].rgba;
    for (let k = is; k < is + ic; k++) { const B = S.blocks[S.IN.blk.a[k]], o = S.IN.slot.a[k]; B.f.a[o * 8 + 6] = li; B.c.a[o * 2 + 1] = lrgba; B.instDirty = true; }
    const ts = E.ts.a[id], tc = E.tc.a[id];
    for (let t = ts; t < ts + tc; t++) S.TX.lay.a[t] = li;
    if (!(E.flags.a[id] & F_DEL)) { if (S.layers[old]) S.layers[old].count--; if (S.layers[li]) S.layers[li].count++; }
  }

  // ── dönüşüm komutları
  // kind: 'move' | 'rotate' | 'scale' | 'mirror' | 'z'
  transformable(ids, kind) {
    const E = this.S.E, TN = this.core.TYPE_NAMES;
    const bad = new Set(ids.filter(id => (NO_MOVE_TYPES.has(E.type.a[id]) && !(E.flags.a[id] & F_NEW)) || (kind === 'mirror' && TN[E.type.a[id]] === 'HATCH')));
    if (bad.size) this.app.toast(bad.size + ' nesne bu işlemde değiştirilemez (ölçü/tablo' + (kind === 'mirror' ? ', aynalamada tarama' : '') + '); seçimden çıkarıldı.', 5000);
    return ids.filter(id => !bad.has(id));
  }
  // T göreli koordinatta (orijin çıkarılmış)
  xform(ids, T, kind, label) {
    if (kind !== 'mirror' && this.isMirror(T)) kind = 'mirror';
    ids = this.transformable(ids, kind || 'move'); if (!ids.length || this.core.xfIdentity(T)) return false;
    const S = this.S, X = S.TX, E = S.E;
    const oldT = ids.map(id => { const e = S.edits.get(id); return e && e.T ? e.T.slice() : undefined; });
    // geri almada kesin dönüş için yazı açısı ve yüksekliklerinin yedeği
    const tr = []; for (const id of ids) for (let t = E.ts.a[id]; t < E.ts.a[id] + E.tc.a[id]; t++) tr.push(t, X.r.a[t], X.h.a[t]);
    const inv = this.core.xfInverse(T);
    this.exec({
      label: label || (ids.length + ' nesne dönüştürüldü'),
      do: () => this.applyXform(ids, T),
      undo: () => {
        this.applyXform(ids, inv);
        ids.forEach((id, i) => { const e = this.ed(id); if (oldT[i]) e.T = oldT[i]; else delete e.T; });
        for (let k = 0; k < tr.length; k += 3) { X.r.a[tr[k]] = tr[k + 1]; X.h.a[tr[k]] = tr[k + 2]; }
        for (const id of ids) S.recomputeBBox(id);
      }
    });
    return true;
  }
  // Kot ata (düzleştir): tüm Z değerleri = z. Geri alma için Z değerlerinin yedeği tutulur (ters dönüşüm yok).
  flatten(ids, z) {
    ids = this.transformable(ids, 'move'); if (!ids.length) return false;
    const S = this.S, E = S.E, X = S.TX;
    const snap = ids.map(id => {
      const ch = S.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id], pts = (E.flags.a[id] & F_POINTS) !== 0, rs = E.rs.a[id], rc = E.rc.a[id];
      const o = { T: S.edits.get(id) && S.edits.get(id).T ? S.edits.get(id).T.slice() : undefined, zr: [E.zr.a[2 * id], E.zr.a[2 * id + 1]] };
      if (ch && vc) o.z = (pts ? ch.pz : ch.z).slice(vs, vs + vc);
      if (ch && rc) o.tz = ch.tz.slice(rs, rs + rc);
      o.im = []; for (let k = E.is.a[id]; k < E.is.a[id] + E.ic.a[id]; k++) o.im.push(S.instM(S.blocks[S.IN.blk.a[k]], S.IN.slot.a[k]));
      o.txz = []; for (let t = E.ts.a[id]; t < E.ts.a[id] + E.tc.a[id]; t++) o.txz.push(X.z.a[t]);
      return o;
    });
    const T = [1, 0, 0, 1, 0, 0, 0, z];
    this.exec({
      label: ids.length + ' nesneye kot atandı (Z = ' + z + ')',
      do: () => this.applyXform(ids, T),
      undo: () => ids.forEach((id, i) => {
        const o = snap[i], ch = S.chunks[E.chunk.a[id]], vs = E.vs.a[id], pts = (E.flags.a[id] & F_POINTS) !== 0, rs = E.rs.a[id];
        if (o.z) { (pts ? ch.pz : ch.z).set(o.z, vs); this.mark(ch, pts ? 'pz' : 'z', vs, vs + o.z.length); }
        if (o.tz) { ch.tz.set(o.tz, rs); this.mark(ch, 'tz', rs, rs + o.tz.length); }
        let j = 0; for (let k = E.is.a[id]; k < E.is.a[id] + E.ic.a[id]; k++) S.setInstM(S.blocks[S.IN.blk.a[k]], S.IN.slot.a[k], o.im[j++]);
        j = 0; for (let t = E.ts.a[id]; t < E.ts.a[id] + E.tc.a[id]; t++) X.z.a[t] = o.txz[j++];
        E.zr.a[2 * id] = o.zr[0]; E.zr.a[2 * id + 1] = o.zr[1];
        const e = this.ed(id); if (o.T) e.T = o.T; else delete e.T;
      })
    });
    return true;
  }
  move(ids, dx, dy, dz) { return this.xform(ids, [1, 0, 0, 1, dx, dy, 1, dz || 0], 'move', ids.length + ' nesne taşındı'); }
  // Taban noktası etrafında Z ekseninde döndürme dönüşümü (derece)
  rotT(bx, by, deg) { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, -s, s, c, bx - c * bx + s * by, by - s * bx - c * by, 1, 0]; }
  rotate(ids, bx, by, deg) { return this.xform(ids, this.rotT(bx, by, deg), 'rotate', ids.length + ' nesne ' + (+deg.toFixed(4)) + '° döndürüldü'); }
  // Taban noktasına göre ölçekleme (k: XY, kz: Z; bz: Z tabanı)
  scaleT(bx, by, bz, k, kz) { if (kz === undefined) kz = k; return [k, 0, 0, k, bx - k * bx, by - k * by, kz, bz - kz * bz]; }
  scale(ids, bx, by, bz, k, kz) {
    if (kz === undefined) kz = k;
    return this.xform(ids, this.scaleT(bx, by, bz, k, kz), 'scale', ids.length + ' nesne ölçeklendi (' + (+k.toFixed(6)) + (kz !== k ? ', Z ' + (+kz.toFixed(6)) : '') + ')');
  }
  // P1–P2 doğrusuna göre aynalama dönüşümü
  mirrorT(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    const a = (dx * dx - dy * dy) / l2, b = 2 * dx * dy / l2;   // yansıma matrisi [[a,b],[b,-a]]
    return [a, b, b, -a, x1 - a * x1 - b * y1, y1 - b * x1 + a * y1, 1, 0];
  }
  remove(ids) {
    if (!ids.length) return;
    ids = ids.slice();
    this.exec({ label: ids.length + ' nesne silindi', do: () => { this.setDeleted(ids, true); this.S.clearSel(); }, undo: () => this.setDeleted(ids, false) });
  }
  color(ids, aci) {
    if (!ids.length) return;
    const S = this.S, E = S.E;
    const old = ids.map(id => ({ c: E.color.a[id], f: E.flags.a[id] & F_BYLAYER, a: E.aci.a[id], e: S.edits.has(id) ? S.edits.get(id).aci : undefined }));
    this.exec({
      label: ids.length + ' nesnenin rengi değişti',
      do: () => ids.forEach(id => {
        const rgba = aci === 256 ? S.layers[E.layer.a[id]].rgba : this.core.aciToRgba(aci);
        this.applyColor(id, rgba); E.aci.a[id] = aci;
        if (aci === 256) E.flags.a[id] |= F_BYLAYER; else E.flags.a[id] &= ~F_BYLAYER;
        this.ed(id).aci = aci;
      }),
      undo: () => ids.forEach((id, i) => {
        const o = old[i]; this.applyColor(id, o.c); E.aci.a[id] = o.a;
        E.flags.a[id] = (E.flags.a[id] & ~F_BYLAYER) | o.f; this.ed(id).aci = o.e;
      })
    });
  }
  layer(ids, li) {
    if (!ids.length) return;
    const S = this.S, E = S.E;
    const old = ids.map(id => ({ l: E.layer.a[id], c: E.color.a[id], e: S.edits.has(id) ? S.edits.get(id).layer : undefined }));
    this.exec({
      label: ids.length + ' nesne "' + S.layers[li].name + '" katmanına taşındı',
      do: () => ids.forEach(id => {
        this.applyLayer(id, li);
        if (E.flags.a[id] & F_BYLAYER) this.applyColor(id, S.layers[li].rgba);
        this.ed(id).layer = li;
      }),
      undo: () => ids.forEach((id, i) => { const o = old[i]; this.applyLayer(id, o.l); this.applyColor(id, o.c); this.ed(id).layer = o.e; })
    });
  }

  // ── katman komutları (geri alınabilir). Katman özellikleri kaydedilirken LAYER tablosu yerinde güncellenir.
  // Katman rengini uygula: ByLayer nesneler, blok örnekleri ve blok içindeki o katmandaki çizgiler yeniden boyanır.
  setLayerColor(li, aci, rgba) {
    const S = this.S, E = S.E, L = S.layers[li], prev = L.rgba;
    L.aci = aci; L.rgba = rgba;
    const fl = E.flags.a, la = E.layer.a;
    for (let id = 0; id < S.nEnt; id++) if (la[id] === li && (fl[id] & F_BYLAYER)) this.applyColor(id, rgba);
    // blok örnekleri: örnek katman rengi (blok içindeki 0 katmanı çizgileri bunu alır)
    for (const B of S.blocks) {
      if (!B) continue;
      for (let sl = 0; sl < B.n; sl++) if (B.f.a[sl * 8 + 6] === li) { B.c.a[sl * 2 + 1] = rgba; B.instDirty = true; }
      // blok tanımında bu katmandaki ByLayer çizgiler (önceki renkle pişirilmiş)
      let ch = false;
      const re = (C, Lr, n) => { if (!C) return; for (let v = 0; v < n; v++) if (Lr[v] === li && C[v] === prev) { C[v] = rgba; ch = true; } };
      re(B.col, B.lay, B.nV); re(B.pcol, B.play, B.nP); re(B.tcol, B.tlay, B.nT);
      if (ch) B.geomDirty = true;
    }
    // bloklardan açılan yazılar
    const X = S.TX, TN = this.core.TYPE_NAMES;
    for (let t = 0; t < S.nText; t++) if (X.lay.a[t] === li && X.col.a[t] === prev && TN[E.type.a[X.ent.a[t]]] === 'INSERT') X.col.a[t] = rgba;
    this.R.hl.dirty = true;
  }
  layerProps(li, props, label) {
    const S = this.S, L = S.layers[li];
    const keys = Object.keys(props), old = {}; for (const k of keys) old[k] = L[k];
    const oldMod = { mod: L.mod, colorChanged: L.colorChanged };
    const apply = (P) => {
      if (P.aci !== undefined && P.aci !== L.aci) this.setLayerColor(li, P.aci, this.core.aciToRgba(P.aci));
      for (const k of keys) if (k !== 'aci' && k !== 'rgba') L[k] = P[k];
    };
    this.exec({
      label: label || ('"' + L.name + '" katmanı değişti'),
      do: () => { apply(props); L.mod = true; if (props.aci !== undefined) L.colorChanged = true; this.R.updateLayers(); },
      undo: () => { apply(old); L.mod = oldMod.mod; L.colorChanged = oldMod.colorChanged; this.R.updateLayers(); }
    });
  }
  layerColor(li, aci) { this.layerProps(li, { aci }, '"' + this.S.layers[li].name + '" katman rengi: ACI ' + aci); }
  layerRename(li, name) { this.layerProps(li, { name }, 'Katman yeniden adlandırıldı: "' + this.S.layers[li].name + '" → "' + name + '"'); }
  layerLock(li, locked) {
    const S = this.S;
    if (locked) { const keep = S.selList.filter(id => S.E.layer.a[id] !== li); if (keep.length !== S.selList.length) { S.setSel(keep, 'set'); this.app.selChanged(); } }
    this.layerProps(li, { locked }, '"' + S.layers[li].name + '" katmanı ' + (locked ? 'kilitlendi' : 'kilidi açıldı'));
  }
  layerDelete(li) { this.layerProps(li, { deleted: true }, '"' + this.S.layers[li].name + '" katmanı silindi'); }

  // ── yeni nesneler
  editChunk() {
    const S = this.S;
    if (S.editChunk >= 0) return S.chunks[S.editChunk];
    const cap = 1 << 16;
    const ch = { idx: S.chunks.length, pos: new Float32Array(cap * 2), col: new Uint32Array(cap), lay: new Uint16Array(cap), z: new Float32Array(cap),
      ppos: new Float32Array(1024), pcol: new Uint32Array(512), play: new Uint16Array(512), pz: new Float32Array(512),
      tpos: new Float32Array(1024), tcol: new Uint32Array(512), tlay: new Uint16Array(512), tz: new Float32Array(512),
      nV: 0, nP: 0, nT: 0, cap, pcap: 512, tcap: 512, gl: null, dirty: null, editable: true };
    S.chunks.push(ch); S.editChunk = ch.idx;
    return ch;
  }
  growChunk(ch, needV, needP, needT) {
    const grow = (n, need, capKey, keys) => {
      if (n + need <= ch[capKey]) return;
      let c = ch[capKey]; while (n + need > c) c *= 2;
      for (const [k, T, comp] of keys) { const a = new T(c * comp); a.set(ch[k]); ch[k] = a; }
      ch[capKey] = c; ch.realloc = true;
    };
    grow(ch.nV, needV, 'cap', [['pos', Float32Array, 2], ['col', Uint32Array, 1], ['lay', Uint16Array, 1], ['z', Float32Array, 1]]);
    grow(ch.nP, needP, 'pcap', [['ppos', Float32Array, 2], ['pcol', Uint32Array, 1], ['play', Uint16Array, 1], ['pz', Float32Array, 1]]);
    grow(ch.nT, needT || 0, 'tcap', [['tpos', Float32Array, 2], ['tcol', Uint32Array, 1], ['tlay', Uint16Array, 1], ['tz', Float32Array, 1]]);
  }
  newEntity(rec) {
    const S = this.S, E = S.E, id = S.nEnt++;
    E.type.push(rec.type); E.flags.push(rec.flags | F_NEW | F_DYN); E.layer.push(rec.layer); E.color.push(rec.color); E.aci.push(rec.aci);
    E.bb.push(rec.bb[0]); E.bb.push(rec.bb[1]); E.bb.push(rec.bb[2]); E.bb.push(rec.bb[3]);
    E.zr.push(rec.zr ? rec.zr[0] : 0); E.zr.push(rec.zr ? rec.zr[1] : 0);
    E.chunk.push(rec.chunk); E.vs.push(rec.vs); E.vc.push(rec.vc); E.is.push(rec.is); E.ic.push(rec.ic); E.ts.push(rec.ts); E.tc.push(rec.tc);
    E.rs.push(rec.rs || 0); E.rc.push(rec.rc || 0);
    E.fs.push(-1); E.fe.push(-1);
    S.dyn.add(id); S.ensureSel();
    const L = S.layers[rec.layer]; if (L) L.count++;
    return id;
  }
  // Tanımları (mutlak WCS) DXF metnine çevirip ayrıştırıcıdan geçir → düzenleme parçasına ekle. Dönüş: her tanım için id (ya da -1)
  createDefs(defs) {
    const S = this.S, core = this.core, info = S.info;
    const enc = core.makeEncoder(info.encoding || 'utf-8');
    const ctx = { eol: '\n', version: 'AC1015', owner: '', alloc: () => '1' };
    const pieces = [enc('  0\nSECTION\n  2\nENTITIES\n')], starts = [];
    let off = pieces[0].length;
    for (const d of defs) {
      const dd = Object.assign({}, d);
      if (dd.li !== undefined && dd.layer === undefined) dd.layer = S.layers[dd.li].name;
      const b = enc(core.genEntity(dd, ctx)); starts.push(off); pieces.push(b); off += b.length;
    }
    pieces.push(enc('  0\nENDSEC\n  0\nEOF\n'));
    const bytes = new Uint8Array(pieces.reduce((s, p) => s + p.length, 0)); { let k = 0; for (const p of pieces) { bytes.set(p, k); k += p.length; } }
    const R = { ch: null, E: null, TX: null };
    core.parseStream((o, l) => bytes.subarray(o, o + l), bytes.length,
      { origin: info.origin, encoding: info.encoding, layers: S.layers.map(L => ({ name: L.name, aci: L.aci, rgba: L.rgba })) },
      (type, d) => { if (type === 'chunk') R.ch = d; else if (type === 'ents') R.E = d; else if (type === 'texts') R.TX = d; });
    const ids = defs.map(() => -1);
    if (!R.E) return ids;
    const ch = this.editChunk(), src = R.ch;
    for (let k = 0; k < R.E.type.length; k++) {
      const di = starts.indexOf(R.E.fs[k]); if (di < 0) continue;
      const pts = (R.E.flags[k] & F_POINTS) !== 0, vc = R.E.vc[k], v0 = R.E.vs[k], rc = R.E.rc[k], r0 = R.E.rs[k];
      let vs = 0, rs = ch.nT;
      if (vc && src) {
        if (pts) {
          this.growChunk(ch, 0, vc, 0); vs = ch.nP;
          ch.ppos.set(src.ppos.subarray(2 * v0, 2 * (v0 + vc)), 2 * vs); ch.pcol.set(src.pcol.subarray(v0, v0 + vc), vs); ch.play.set(src.play.subarray(v0, v0 + vc), vs); ch.pz.set(src.pz.subarray(v0, v0 + vc), vs);
          ch.nP += vc; for (const kk of ['ppos', 'pcol', 'play', 'pz']) this.mark(ch, kk, vs, vs + vc);
        } else {
          this.growChunk(ch, vc, 0, 0); vs = ch.nV;
          ch.pos.set(src.pos.subarray(2 * v0, 2 * (v0 + vc)), 2 * vs); ch.col.set(src.col.subarray(v0, v0 + vc), vs); ch.lay.set(src.lay.subarray(v0, v0 + vc), vs); ch.z.set(src.z.subarray(v0, v0 + vc), vs);
          ch.nV += vc; for (const kk of ['pos', 'col', 'lay', 'z']) this.mark(ch, kk, vs, vs + vc);
        }
      }
      if (rc && src) {
        this.growChunk(ch, 0, 0, rc); rs = ch.nT;
        ch.tpos.set(src.tpos.subarray(2 * r0, 2 * (r0 + rc)), 2 * rs); ch.tcol.set(src.tcol.subarray(r0, r0 + rc), rs); ch.tlay.set(src.tlay.subarray(r0, r0 + rc), rs); ch.tz.set(src.tz.subarray(r0, r0 + rc), rs);
        ch.nT += rc; for (const kk of ['tpos', 'tcol', 'tlay', 'tz']) this.mark(ch, kk, rs, rs + rc);
      }
      const ts = S.nText; let tc = 0;
      if (R.TX) for (let t = 0; t < R.TX.x.length; t++) {
        if (R.TX.ent[t] !== k) continue;
        this.pushText(R.TX.x[t], R.TX.y[t], R.TX.z[t], R.TX.h[t], R.TX.r[t], R.TX.al[t], R.TX.str[t], R.TX.wf[t], R.TX.col[t], R.TX.lay[t], S.nEnt); tc++;
      }
      const id = this.newEntity({ type: R.E.type[k], flags: R.E.flags[k] & (F_BYLAYER | F_POINTS), layer: R.E.layer[k], color: R.E.color[k], aci: R.E.aci[k],
        bb: Array.from(R.E.bb.subarray(4 * k, 4 * k + 4)), zr: [R.E.zr[2 * k], R.E.zr[2 * k + 1]], chunk: ch.idx, vs, vc, is: 0, ic: 0, ts, tc, rs, rc });
      const def = JSON.parse(JSON.stringify(defs[di])); if (def.li !== undefined && def.layer === undefined) def.layer = S.layers[def.li].name;
      S.newInfo.set(id, { def });
      const e = this.ed(id); e.aci = R.E.aci[k]; e.layer = R.E.layer[k];
      ids[di] = id;
    }
    return ids;
  }
  // Yeni çizilen nesne: def mutlak koordinatlıdır
  create(def) {
    const S = this.S, li = def.li !== undefined ? def.li : S.layers.findIndex(L => L.name === def.layer);
    if (li >= 0 && !S.layerVis[li]) {
      S.layerVis[li] = 1; this.R.updateLayers(); this.app.renderLayers();
      this.app.toast('"' + S.layers[li].name + '" katmanı kapalıydı, çizim için açıldı.', 4000);
    }
    const ids = this.createDefs([def]).filter(i => i >= 0);
    if (!ids.length) { this.app.toast('Nesne oluşturulamadı (geçersiz geometri).'); return -1; }
    this.exec({ label: 'Yeni ' + def.type, do: () => this.setDeleted(ids, false), undo: () => this.setDeleted(ids, true) });
    return ids[0];
  }
  // Eski nesneleri yenileriyle değiştir (budama, uzatma, kavis, birleştir, patlat…)
  replace(oldIds, defs, label) {
    const ids = defs.length ? this.createDefs(defs).filter(i => i >= 0) : [];
    this.setDeleted(ids, true);
    this.exec({
      label,
      do: () => { this.setDeleted(oldIds, true); this.setDeleted(ids, false); },
      undo: () => { this.setDeleted(ids, true); this.setDeleted(oldIds, false); }
    });
    return ids;
  }
  // Yalnız ekle (öteleme gibi; kaynak kalır)
  add(defs, label) {
    const ids = this.createDefs(defs).filter(i => i >= 0);
    this.exec({ label, do: () => this.setDeleted(ids, false), undo: () => this.setDeleted(ids, true) });
    return ids;
  }
  pushText(x, y, z, h, r, al, str, wf, col, lay, ent) {
    const S = this.S, X = S.TX;
    X.x.push(x); X.y.push(y); X.z.push(z); X.h.push(h); X.r.push(r); X.wf.push(wf); X.al.push(al); X.col.push(col); X.lay.push(lay); X.ent.push(ent); X.hid.push(0);
    S.TS.push(str); S.nText++;
  }
  // Kopyala ve T ile dönüştür (göreli). Dönüş: yeni id'ler
  copy(ids, dx, dy, T) {
    ids = this.transformable(ids, T && this.isMirror(T) ? 'mirror' : 'move'); if (!ids.length) return [];
    if (!T) T = [1, 0, 0, 1, dx || 0, dy || 0, 1, 0];
    const S = this.S, E = S.E, X = S.TX;
    const out = [];
    for (const src of ids) {
      const ch0 = S.chunks[E.chunk.a[src]], vs0 = E.vs.a[src], vc = E.vc.a[src], pts = (E.flags.a[src] & F_POINTS) !== 0;
      const ch = this.editChunk();
      let vs = 0;
      if (ch0 && vc) {
        if (pts) {
          this.growChunk(ch, 0, vc, 0); vs = ch.nP;
          ch.ppos.set(ch0.ppos.subarray(2 * vs0, 2 * (vs0 + vc)), 2 * vs); ch.pcol.set(ch0.pcol.subarray(vs0, vs0 + vc), vs); ch.play.set(ch0.play.subarray(vs0, vs0 + vc), vs); ch.pz.set(ch0.pz.subarray(vs0, vs0 + vc), vs);
          ch.nP += vc; for (const k of ['ppos', 'pcol', 'play', 'pz']) this.mark(ch, k, vs, vs + vc);
        } else {
          this.growChunk(ch, vc, 0, 0); vs = ch.nV;
          ch.pos.set(ch0.pos.subarray(2 * vs0, 2 * (vs0 + vc)), 2 * vs); ch.col.set(ch0.col.subarray(vs0, vs0 + vc), vs); ch.lay.set(ch0.lay.subarray(vs0, vs0 + vc), vs); ch.z.set(ch0.z.subarray(vs0, vs0 + vc), vs);
          ch.nV += vc; for (const k of ['pos', 'col', 'lay', 'z']) this.mark(ch, k, vs, vs + vc);
        }
      }
      const rs0 = E.rs.a[src], rc = E.rc.a[src]; let rs = ch.nT;
      if (ch0 && rc) {
        this.growChunk(ch, 0, 0, rc); rs = ch.nT;
        ch.tpos.set(ch0.tpos.subarray(2 * rs0, 2 * (rs0 + rc)), 2 * rs); ch.tcol.set(ch0.tcol.subarray(rs0, rs0 + rc), rs); ch.tlay.set(ch0.tlay.subarray(rs0, rs0 + rc), rs); ch.tz.set(ch0.tz.subarray(rs0, rs0 + rc), rs);
        ch.nT += rc; for (const k of ['tpos', 'tcol', 'tlay', 'tz']) this.mark(ch, k, rs, rs + rc);
      }
      const newId = S.nEnt;
      const is = S.nInst; let ic = 0;
      for (let k = E.is.a[src]; k < E.is.a[src] + E.ic.a[src]; k++) {
        const b = S.IN.blk.a[k], B = S.blocks[b], o = S.IN.slot.a[k] * 8;
        B.f.ensure(8); B.c.ensure(2); B.fz.ensure(2); B.fx.ensure(4);
        const f = B.f.a, n = B.f.n;
        for (let j = 0; j < 8; j++) f[n + j] = f[o + j];
        B.f.n += 8;
        const xo = S.IN.slot.a[k] * 4; for (let j = 0; j < 4; j++) B.fx.a[B.fx.n + j] = B.fx.a[xo + j]; B.fx.n += 4;
        const so = S.IN.slot.a[k] * 2; B.fz.a[B.fz.n] = B.fz.a[so]; B.fz.a[B.fz.n + 1] = B.fz.a[so + 1]; B.fz.n += 2;
        B.c.a[B.c.n] = B.c.a[S.IN.slot.a[k] * 2]; B.c.a[B.c.n + 1] = B.c.a[S.IN.slot.a[k] * 2 + 1]; B.c.n += 2;
        S.IN.blk.push(b); S.IN.slot.push(B.n); S.IN.ent.push(newId); B.n++; B.instDirty = true; S.nInst++; ic++;
      }
      const ts = S.nText; let tc = 0;
      for (let t = E.ts.a[src]; t < E.ts.a[src] + E.tc.a[src]; t++) {
        this.pushText(X.x.a[t], X.y.a[t], X.z.a[t], X.h.a[t], X.r.a[t], X.al.a[t], S.TS[t], X.wf.a[t], X.col.a[t], X.lay.a[t], newId); tc++;
      }
      const b = E.bb.a;
      const id = this.newEntity({
        type: E.type.a[src], flags: E.flags.a[src] & (F_BYLAYER | F_POINTS), layer: E.layer.a[src], color: E.color.a[src], aci: E.aci.a[src],
        bb: [b[4 * src], b[4 * src + 1], b[4 * src + 2], b[4 * src + 3]], zr: [E.zr.a[2 * src], E.zr.a[2 * src + 1]],
        chunk: ch.idx, vs, vc: (ch0 && vc) ? vc : 0, is, ic, ts, tc, rs, rc: (ch0 && rc) ? rc : 0
      });
      const se = S.edits.get(src) || {};
      const info = S.newInfo.get(src);
      if (info && info.def) S.newInfo.set(id, { def: info.def });
      else S.newInfo.set(id, { src: info && info.src !== undefined ? info.src : src });
      S.edits.set(id, { T: se.T ? se.T.slice() : undefined, aci: se.aci, layer: se.layer });
      out.push(id);
    }
    this.applyXform(out, T);
    this.exec({ label: out.length + ' nesne kopyalandı', do: () => this.setDeleted(out, false), undo: () => this.setDeleted(out, true) });
    return out;
  }
}
