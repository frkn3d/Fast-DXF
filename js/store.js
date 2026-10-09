/* DXF Okuyucu — veri deposu: worker'dan gelen parçaları biriktirir, mekânsal ızgara ve seçim. */
'use strict';

class GrowM {
  constructor(T, cap) { this.T = T; this.a = new T(cap || 1024); this.n = 0; }
  ensure(k) {
    if (this.n + k > this.a.length) {
      let c = this.a.length * 2; while (c < this.n + k) c *= 2;
      const b = new this.T(c); b.set(this.a.subarray(0, this.n)); this.a = b;
    }
  }
  push(v) { if (this.n >= this.a.length) this.ensure(1); this.a[this.n++] = v; }
  append(arr) { this.ensure(arr.length); this.a.set(arr, this.n); this.n += arr.length; }
}

// Varlık bayrakları (dxf-core ile uyumlu)
const F_BYLAYER = 1, F_NEW = 2, F_DEL = 4, F_DYN = 8, F_POINTS = 16, F_NOBBOX = 32;

class Store {
  constructor(core) { this.core = core; this.clear(); }
  clear() {
    this.file = null; this.info = null; this.done = false;
    this.layers = []; this.layerVis = new Uint8Array(65536).fill(1);
    this.blocks = []; this.chunks = [];
    const G = (T, n) => new GrowM(T, n || 1 << 14);
    this.E = {
      type: G(Uint8Array), flags: G(Uint8Array), layer: G(Uint16Array), color: G(Uint32Array), aci: G(Int16Array),
      bb: G(Float32Array, 1 << 16), zr: G(Float32Array, 1 << 15), chunk: G(Uint32Array), vs: G(Uint32Array), vc: G(Uint32Array),
      is: G(Uint32Array), ic: G(Uint32Array), ts: G(Uint32Array), tc: G(Uint32Array), fs: G(Float64Array), fe: G(Float64Array),
      rs: G(Uint32Array), rc: G(Uint32Array)
    };
    this.nEnt = 0;
    this.TX = {
      x: G(Float32Array), y: G(Float32Array), z: G(Float32Array), h: G(Float32Array), r: G(Float32Array), wf: G(Float32Array), al: G(Uint8Array),
      col: G(Uint32Array), lay: G(Uint16Array), ent: G(Uint32Array), hid: G(Uint8Array)
    };
    this.TS = []; this.nText = 0;
    this.IN = { blk: G(Uint32Array), slot: G(Uint32Array), ent: G(Uint32Array) };
    this.nInst = 0;
    this.edits = new Map();     // id → {dx,dy,aci,layer,del}
    this.newInfo = new Map();   // yeni varlıklar: id → {def} | {src}
    this.grid = null; this.dyn = new Set();
    this.sel = new Uint8Array(0); this.selList = [];
    this.editChunk = -1;
    this.ext = null; this.view0 = null;
    this.zext = [0, 0]; this.zview = [0, 0]; this.has3D = false;
    this.flatBlocks = false;    // bloklarda iç Z yok sayılır (Renderer.blockFlat ile aynı)
    this.surfaces = [];         // arazi yüzeyleri (TIN): {name, pos, z, n, gl}
    this.nTri = 0;
    this.dirty = false;
  }

  // ── worker mesajları
  onLayers(list) {
    for (let i = 0; i < list.length; i++) {
      const L = list[i], old = this.layers[i];
      this.layers[i] = Object.assign(old || { count: 0 }, L);
      if (this.layers[i].origName === undefined) this.layers[i].origName = L.name;
      if (!old) this.layerVis[i] = (L.off || L.frozen) ? 0 : 1;
    }
  }
  onChunk(d) {
    this.chunks[d.idx] = {
      idx: d.idx, pos: d.pos, col: d.col, lay: d.lay, ppos: d.ppos, pcol: d.pcol, play: d.play, z: d.z, pz: d.pz,
      tpos: d.tpos, tz: d.tz, tcol: d.tcol, tlay: d.tlay,
      nV: d.pos.length >> 1, nP: d.ppos.length >> 1, nT: d.tpos.length >> 1, gl: null, dirty: null,
      cap: d.pos.length >> 1, pcap: d.ppos.length >> 1, tcap: d.tpos.length >> 1
    };
    this.nTri += d.tpos.length / 6;
  }
  onEnts(d) {
    const E = this.E;
    for (const k in d) E[k].append(d[k]);
    for (let i = 0; i < d.layer.length; i++) { const L = this.layers[d.layer[i]]; if (L) L.count = (L.count || 0) + 1; }
    this.nEnt += d.type.length;
  }
  onTexts(d) {
    const X = this.TX;
    for (const k in d) if (k !== 'str') X[k].append(d[k]);
    X.hid.ensure(d.x.length); X.hid.n += d.x.length;
    for (const s of d.str) this.TS.push(s);
    this.nText += d.x.length;
  }
  block(idx) {
    let B = this.blocks[idx];
    if (!B) {
      B = this.blocks[idx] = {
        idx, name: '', bb: null, zb: null, pos: null, col: null, lay: null, ppos: null, pcol: null, play: null, z: null, pz: null, nV: 0, nP: 0,
        tpos: null, tz: null, tcol: null, tlay: null, nT: 0,
        f: new GrowM(Float32Array, 64), fz: new GrowM(Float32Array, 16), fx: new GrowM(Float32Array, 32), c: new GrowM(Uint32Array, 16), n: 0, gl: null, instDirty: true, geomDirty: true
      };
    }
    return B;
  }
  onInst(d) {
    const n = d.blk.length, IN = this.IN;
    for (let i = 0; i < n; i++) {
      const B = this.block(d.blk[i]);
      B.f.ensure(8); B.c.ensure(2); B.fz.ensure(2); B.fx.ensure(4);
      const f = B.f.a, o = B.f.n;
      f[o] = d.m[6 * i]; f[o + 1] = d.m[6 * i + 1]; f[o + 2] = d.m[6 * i + 2];
      f[o + 3] = d.m[6 * i + 3]; f[o + 4] = d.m[6 * i + 4]; f[o + 5] = d.m[6 * i + 5];
      f[o + 6] = d.lay[i]; f[o + 7] = 1; B.f.n += 8;
      B.fz.a[B.fz.n++] = d.z[2 * i]; B.fz.a[B.fz.n++] = d.z[2 * i + 1];
      for (let j = 0; j < 4; j++) B.fx.a[B.fx.n++] = d.x ? d.x[4 * i + j] : 0;
      B.c.a[B.c.n++] = d.col[i]; B.c.a[B.c.n++] = d.lcol[i];
      IN.blk.push(d.blk[i]); IN.slot.push(B.n); IN.ent.push(d.ent[i]);
      B.n++; B.instDirty = true;
    }
    this.nInst += n;
  }
  onBlocks(list) {
    for (const o of list) {
      const B = this.block(o.idx);
      B.name = o.name; B.bb = isFinite(o.bb[0]) ? o.bb : null; B.zb = o.zb[0] <= o.zb[1] ? o.zb : null;
      B.pos = o.pos; B.col = o.col; B.lay = o.lay; B.ppos = o.ppos; B.pcol = o.pcol; B.play = o.play; B.z = o.z; B.pz = o.pz;
      B.tpos = o.tpos; B.tz = o.tz; B.tcol = o.tcol; B.tlay = o.tlay;
      B.nV = o.pos.length >> 1; B.nP = o.ppos.length >> 1; B.nT = o.tpos.length >> 1; B.geomDirty = true;
    }
  }
  onDone(info) {
    this.info = info; this.done = true;
    // blok sınır kutusu bilinmeyen INSERT'ler
    const E = this.E;
    for (let id = 0; id < this.nEnt; id++) if (E.flags.a[id] & F_NOBBOX) this.recomputeInsertBBox(id);
    this.computeExtents();
    this.grid = new SpatialGrid(this);
  }

  // ── yardımcılar
  // Blok örneğinin 3×4 dönüşümü [a b q0 tx; c d q1 ty; q2 q3 sz tz] (göreli koordinat)
  instM(B, s) {
    const f = B.f.a, o = s * 8, x = B.fx.a, q = s * 4;
    return [f[o], f[o + 1], x[q], f[o + 2], f[o + 3], f[o + 4], x[q + 1], f[o + 5], x[q + 2], x[q + 3], B.fz.a[2 * s], B.fz.a[2 * s + 1]];
  }
  setInstM(B, s, M) {
    const f = B.f.a, o = s * 8, x = B.fx.a, q = s * 4;
    f[o] = M[0]; f[o + 1] = M[1]; f[o + 2] = M[3]; f[o + 3] = M[4]; f[o + 4] = M[5]; f[o + 5] = M[7];
    x[q] = M[2]; x[q + 1] = M[6]; x[q + 2] = M[8]; x[q + 3] = M[9];
    B.fz.a[2 * s] = M[10]; B.fz.a[2 * s + 1] = M[11];
    B.instDirty = true;
  }
  bbox(id) { const b = this.E.bb.a; return [b[4 * id], b[4 * id + 1], b[4 * id + 2], b[4 * id + 3]]; }
  recomputeInsertBBox(id) {
    const E = this.E, b = E.bb.a;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const is = E.is.a[id], ic = E.ic.a[id];
    for (let k = is; k < is + ic; k++) {
      const B = this.blocks[this.IN.blk.a[k]];
      if (!B) continue;
      const s = this.IN.slot.a[k], M = this.instM(B, s);
      if (!B.bb) { z0 = Math.min(z0, M[11]); z1 = Math.max(z1, M[11]); continue; }
      const zb = B.zb || [0, 0];
      for (let c = 0; c < 8; c++) {
        const x = (c & 1) ? B.bb[2] : B.bb[0], y = (c & 2) ? B.bb[3] : B.bb[1], z = (c & 4) ? zb[1] : zb[0];
        const X = M[0] * x + M[1] * y + M[2] * z + M[3], Y = M[4] * x + M[5] * y + M[6] * z + M[7], Z = M[8] * x + M[9] * y + M[10] * z + M[11];
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z;
      }
    }
    const ts = E.ts.a[id], tc = E.tc.a[id];
    if (tc) {
      const bb = [x0, y0, x1, y1];
      for (let t = ts; t < ts + tc; t++) this.core.textBBox(this.TX.x.a[t], this.TX.y.a[t], this.TX.h.a[t], this.TX.r.a[t], this.TX.al.a[t], this.TS[t], this.TX.wf.a[t], bb);
      [x0, y0, x1, y1] = bb;
    }
    b[4 * id] = x0; b[4 * id + 1] = y0; b[4 * id + 2] = x1; b[4 * id + 3] = y1;
    if (z0 <= z1) { E.zr.a[2 * id] = z0; E.zr.a[2 * id + 1] = z1; }
    E.flags.a[id] &= ~F_NOBBOX;
  }
  // Varlığın geometrisinden kesin sınır kutusu ve kot aralığı (dönüşümlerden sonra)
  recomputeBBox(id) {
    const E = this.E, b = E.bb.a;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const add = (x, y, z) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; };
    const ch = this.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id];
    if (ch && vc) {
      const pts = (E.flags.a[id] & F_POINTS) !== 0, P = pts ? ch.ppos : ch.pos, Z = pts ? ch.pz : ch.z;
      for (let v = vs; v < vs + vc; v++) add(P[2 * v], P[2 * v + 1], Z[v]);
    }
    const rs = E.rs.a[id], rc = E.rc.a[id];
    if (ch && rc) for (let v = rs; v < rs + rc; v++) add(ch.tpos[2 * v], ch.tpos[2 * v + 1], ch.tz[v]);
    const is = E.is.a[id], ic = E.ic.a[id];
    for (let k = is; k < is + ic; k++) {
      const B = this.blocks[this.IN.blk.a[k]]; if (!B) continue;
      const M = this.instM(B, this.IN.slot.a[k]);
      if (!B.bb) { add(M[3], M[7], M[11]); continue; }
      for (let c = 0; c < 8; c++) {
        const x = (c & 1) ? B.bb[2] : B.bb[0], y = (c & 2) ? B.bb[3] : B.bb[1], z = B.zb ? ((c & 4) ? B.zb[1] : B.zb[0]) : 0;
        add(M[0] * x + M[1] * y + M[2] * z + M[3], M[4] * x + M[5] * y + M[6] * z + M[7], M[8] * x + M[9] * y + M[10] * z + M[11]);
      }
    }
    const ts = E.ts.a[id], tc = E.tc.a[id];
    if (tc) {
      const bb = [x0, y0, x1, y1];
      for (let t = ts; t < ts + tc; t++) {
        this.core.textBBox(this.TX.x.a[t], this.TX.y.a[t], this.TX.h.a[t], this.TX.r.a[t], this.TX.al.a[t], this.TS[t], this.TX.wf.a[t], bb);
        const z = this.TX.z.a[t]; if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      [x0, y0, x1, y1] = bb;
    }
    if (!(x0 <= x1)) return;
    b[4 * id] = x0; b[4 * id + 1] = y0; b[4 * id + 2] = x1; b[4 * id + 3] = y1;
    if (z0 <= z1) { E.zr.a[2 * id] = z0; E.zr.a[2 * id + 1] = z1; }
  }
  computeExtents() {
    const n = this.nEnt, b = this.E.bb.a, fl = this.E.flags.a, zr = this.E.zr.a;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cnt = 0, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      if (fl[i] & F_DEL) continue;
      const a = b[4 * i]; if (!(a <= b[4 * i + 2])) continue;
      if (a < x0) x0 = a; if (b[4 * i + 1] < y0) y0 = b[4 * i + 1];
      if (b[4 * i + 2] > x1) x1 = b[4 * i + 2]; if (b[4 * i + 3] > y1) y1 = b[4 * i + 3];
      if (zr[2 * i] < z0) z0 = zr[2 * i]; if (zr[2 * i + 1] > z1) z1 = zr[2 * i + 1];
      cnt++;
    }
    if (!cnt) { this.ext = [-50, -50, 50, 50]; this.view0 = this.ext; this.zext = [0, 0]; this.zview = [0, 0]; this.has3D = false; return; }
    this.ext = [x0, y0, x1, y1];
    this.zext = [z0, z1];
    this.has3D = z1 > z0 || z0 !== 0;
    this.zview = this.zRange(null);
    // Aykırı nesneleri dışlayan "yoğun" görünüm: merkezlerin %0.5–%99.5 dilimi
    const step = Math.max(1, Math.floor(n / 200000));
    const xs = [], ys = [];
    for (let i = 0; i < n; i += step) {
      if (fl[i] & F_DEL) continue;
      const a = b[4 * i]; if (!(a <= b[4 * i + 2])) continue;
      xs.push((a + b[4 * i + 2]) / 2); ys.push((b[4 * i + 1] + b[4 * i + 3]) / 2);
    }
    if (xs.length < 50) { this.view0 = this.ext; return; }
    const fx = Float64Array.from(xs).sort(), fy = Float64Array.from(ys).sort();
    const q = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))];
    let vx0 = q(fx, 0.005), vx1 = q(fx, 0.995), vy0 = q(fy, 0.005), vy1 = q(fy, 0.995);
    const w = Math.max(vx1 - vx0, 1e-6), h = Math.max(vy1 - vy0, 1e-6);
    vx0 -= w * 0.05; vx1 += w * 0.05; vy0 -= h * 0.05; vy1 += h * 0.05;
    const full = (x1 - x0) * (y1 - y0), dense = (vx1 - vx0) * (vy1 - vy0);
    this.view0 = dense < full * 0.25 ? [vx0, vy0, vx1, vy1] : this.ext;
  }
  // İç kotu hatalı görünen bloklar (ör. sembol çizgilerinin bir ucu Z=0, diğeri arazi kotu)
  suspiciousBlocks() {
    let n = 0, refs = 0;
    for (const B of this.blocks) {
      if (!B || !B.zb || !B.bb || !B.n) continue;
      const span = B.zb[1] - B.zb[0], size = Math.max(B.bb[2] - B.bb[0], B.bb[3] - B.bb[1], 1e-9);
      if (span > 50 && span > 20 * size) { n++; refs += B.n; }
    }
    return { blocks: n, refs };
  }
  // Bir bölgedeki (null: tümü) nesnelerin aykırı değerlerden arınmış kot aralığı
  zRange(box) {
    const E = this.E, fl = E.flags.a, zr = E.zr.a, b = E.bb.a;
    const lo = [], hi = [];
    const take = (i) => {
      if (fl[i] & F_DEL || !this.layerVis[E.layer.a[i]]) return;
      lo.push(zr[2 * i]); hi.push(zr[2 * i + 1]);
    };
    if (box && this.grid) {
      let budget = 300000;
      this.grid.query(box[0], box[1], box[2], box[3], (i) => {
        if (budget <= 0) return;
        if (b[4 * i + 2] < box[0] || b[4 * i] > box[2] || b[4 * i + 3] < box[1] || b[4 * i + 1] > box[3]) return;
        budget--; take(i);
      });
    } else {
      const step = Math.max(1, Math.floor(this.nEnt / 200000));
      for (let i = 0; i < this.nEnt; i += step) take(i);
    }
    if (!lo.length) return this.zview || [0, 0];
    const L = Float64Array.from(lo).sort(), H = Float64Array.from(hi).sort();
    const q = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))];
    if (L.length < 50) return [L[0], H[H.length - 1]];
    return [q(L, 0.01), q(H, 0.99)];
  }

  // ── seçim
  ensureSel() { if (this.sel.length < this.nEnt) { const s = new Uint8Array(Math.max(this.nEnt * 1.25 | 0, 1024)); s.set(this.sel); this.sel = s; } }
  clearSel() { for (const id of this.selList) this.sel[id] = 0; this.selList = []; }
  setSel(ids, mode) { // mode: 'set' | 'add' | 'toggle' | 'remove'
    this.ensureSel();
    if (mode === 'set') this.clearSel();
    const fl = this.E.flags.a;
    for (const id of ids) {
      if (fl[id] & F_DEL) continue;
      if (!this.layerVis[this.E.layer.a[id]]) continue;
      if (mode !== 'remove' && this.layerLocked(this.E.layer.a[id])) continue;
      if (mode === 'remove' || (mode === 'toggle' && this.sel[id])) { this.sel[id] = 0; }
      else if (!this.sel[id]) { this.sel[id] = 1; this.selList.push(id); }
    }
    if (mode === 'remove' || mode === 'toggle') this.selList = this.selList.filter(id => this.sel[id]);
  }

  layerLocked(li) { const L = this.layers[li]; return !!(L && L.locked); }
  // Ekrandaki bir noktaya en yakın varlık (tol: dünya birimi)
  pick(x, y, tol) {
    let best = -1, bd = tol;
    const E = this.E, b = E.bb.a, fl = E.flags.a;
    this.grid.query(x - tol, y - tol, x + tol, y + tol, (id) => {
      if (fl[id] & F_DEL) return;
      if (!this.layerVis[E.layer.a[id]] || this.layerLocked(E.layer.a[id])) return;
      if (x < b[4 * id] - tol || x > b[4 * id + 2] + tol || y < b[4 * id + 1] - tol || y > b[4 * id + 3] + tol) return;
      const d = this.distTo(id, x, y, bd);
      if (d < bd) { bd = d; best = id; }
    });
    return best;
  }
  distTo(id, x, y, lim) {
    const E = this.E;
    let best = Infinity;
    const ch = this.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id];
    if (vc && ch) {
      if (E.flags.a[id] & F_POINTS) {
        const P = ch.ppos;
        for (let v = vs; v < vs + vc; v++) { const d = Math.hypot(P[2 * v] - x, P[2 * v + 1] - y); if (d < best) best = d; }
      } else {
        const P = ch.pos;
        for (let v = vs; v < vs + vc; v += 2) { const d = segDist(x, y, P[2 * v], P[2 * v + 1], P[2 * v + 2], P[2 * v + 3]); if (d < best) best = d; }
      }
    }
    const is = E.is.a[id], ic = E.ic.a[id];
    for (let k = is; k < is + ic && best > lim * 0.01; k++) {
      const B = this.blocks[this.IN.blk.a[k]]; if (!B || !B.pos) continue;
      const f = B.f.a, o = this.IN.slot.a[k] * 8, M = this.instM(B, this.IN.slot.a[k]);
      if (M[2] || M[6]) {
        // eğik (3B dönmüş) örnek: köşeleri dünyaya çevirip ölç
        const P = B.pos, Z = B.z, X = (v) => M[0] * P[2 * v] + M[1] * P[2 * v + 1] + M[2] * Z[v] + M[3], Y = (v) => M[4] * P[2 * v] + M[5] * P[2 * v + 1] + M[6] * Z[v] + M[7];
        for (let v = 0; v < B.nV; v += 2) { const dd = segDist(x, y, X(v), Y(v), X(v + 1), Y(v + 1)); if (dd < best) best = dd; }
        continue;
      }
      // noktayı blok yerel koordinatına çevir
      const a = f[o], bb = f[o + 1], tx = f[o + 2], c = f[o + 3], d = f[o + 4], ty = f[o + 5];
      const det = a * d - bb * c; if (Math.abs(det) < 1e-30) continue;
      const lx = (d * (x - tx) - bb * (y - ty)) / det, ly = (-c * (x - tx) + a * (y - ty)) / det;
      const sc = Math.sqrt(Math.abs(det));
      const P = B.pos;
      for (let v = 0; v < B.nV; v += 2) { const dd = segDist(lx, ly, P[2 * v], P[2 * v + 1], P[2 * v + 2], P[2 * v + 3]) * sc; if (dd < best) best = dd; }
      const Q = B.ppos;
      for (let v = 0; v < B.nP; v++) { const dd = Math.hypot(Q[2 * v] - lx, Q[2 * v + 1] - ly) * sc; if (dd < best) best = dd; }
    }
    const ts = E.ts.a[id], tc = E.tc.a[id];
    for (let t = ts; t < ts + tc; t++) {
      const bb = [Infinity, Infinity, -Infinity, -Infinity];
      this.core.textBBox(this.TX.x.a[t], this.TX.y.a[t], this.TX.h.a[t], this.TX.r.a[t], this.TX.al.a[t], this.TS[t], this.TX.wf.a[t], bb);
      if (x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3]) best = 0;
    }
    return best;
  }
  // Pencere (window=true: tamamen içinde) veya kesişen (crossing) seçim
  boxSelect(x0, y0, x1, y1, window) {
    const out = [], E = this.E, b = E.bb.a, fl = E.flags.a;
    this.grid.query(x0, y0, x1, y1, (id) => {
      if (fl[id] & F_DEL) return;
      if (!this.layerVis[E.layer.a[id]] || this.layerLocked(E.layer.a[id])) return;
      const a0 = b[4 * id], a1 = b[4 * id + 1], a2 = b[4 * id + 2], a3 = b[4 * id + 3];
      if (window) { if (a0 >= x0 && a2 <= x1 && a1 >= y0 && a3 <= y1) out.push(id); }
      else if (a2 >= x0 && a0 <= x1 && a3 >= y0 && a1 <= y1) {
        if ((a0 >= x0 && a2 <= x1 && a1 >= y0 && a3 <= y1) || this.crosses(id, x0, y0, x1, y1)) out.push(id);
      }
    });
    return out;
  }
  crosses(id, x0, y0, x1, y1) {
    const E = this.E, ch = this.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id];
    if (E.ic.a[id] || E.tc.a[id]) return true; // blok/yazı: kutu kesişimi yeterli
    if (!ch || !vc) return true;
    if (E.flags.a[id] & F_POINTS) {
      const P = ch.ppos;
      for (let v = vs; v < vs + vc; v++) { const x = P[2 * v], y = P[2 * v + 1]; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true; }
      return false;
    }
    const P = ch.pos;
    for (let v = vs; v < vs + vc; v += 2) if (segRect(P[2 * v], P[2 * v + 1], P[2 * v + 2], P[2 * v + 3], x0, y0, x1, y1)) return true;
    return false;
  }

  // ── 3B görünümde ekran uzayında seçim. cam: Renderer.cam() (project → [sx, sy] ya da null)
  // Varlığın sınır kutusunun (x,y,z) ekrandaki dikdörtgeni; kamera arkasında köşe varsa null
  screenRect(id, cam, out) {
    const b = this.E.bb.a, zr = this.E.zr.a;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const p = cam.tmp;
    for (let c = 0; c < 8; c++) {
      if (!cam.project(b[4 * id + ((c & 1) ? 2 : 0)], b[4 * id + ((c & 2) ? 3 : 1)], zr[2 * id + ((c & 4) ? 1 : 0)], p)) return null;
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    out[0] = x0; out[1] = y0; out[2] = x1; out[3] = y1;
    return out;
  }
  // Varlığın ekrandaki her çizgi parçası / noktası için cb(x1,y1,x2,y2) (nokta: x1==x2). false dönerse durur.
  eachScreenSeg(id, cam, cb) {
    const E = this.E, p = [0, 0], q = [0, 0];
    const ch = this.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id];
    if (ch && vc) {
      if (E.flags.a[id] & F_POINTS) {
        const P = ch.ppos, Z = ch.pz;
        for (let v = vs; v < vs + vc; v++) if (cam.project(P[2 * v], P[2 * v + 1], Z[v], p) && cb(p[0], p[1], p[0], p[1]) === false) return;
      } else {
        const P = ch.pos, Z = ch.z;
        for (let v = vs; v < vs + vc; v += 2) {
          if (cam.project(P[2 * v], P[2 * v + 1], Z[v], p) && cam.project(P[2 * v + 2], P[2 * v + 3], Z[v + 1], q) && cb(p[0], p[1], q[0], q[1]) === false) return;
        }
      }
    }
    const is = E.is.a[id], ic = E.ic.a[id];
    for (let k = is; k < is + ic; k++) {
      const B = this.blocks[this.IN.blk.a[k]]; if (!B || !B.pos) continue;
      const M = this.instM(B, this.IN.slot.a[k]), fl = this.flatBlocks;
      const tr = (lx, ly, lz, out) => cam.project(M[0] * lx + M[1] * ly + M[2] * lz + M[3], M[4] * lx + M[5] * ly + M[6] * lz + M[7], fl ? M[11] : M[8] * lx + M[9] * ly + M[10] * lz + M[11], out);
      const P = B.pos, Z = B.z, lim = Math.min(B.nV, 40000);
      for (let v = 0; v < lim; v += 2) if (tr(P[2 * v], P[2 * v + 1], Z[v], p) && tr(P[2 * v + 2], P[2 * v + 3], Z[v + 1], q) && cb(p[0], p[1], q[0], q[1]) === false) return;
      const Q = B.ppos, QZ = B.pz;
      for (let v = 0; v < Math.min(B.nP, 20000); v++) if (tr(Q[2 * v], Q[2 * v + 1], QZ[v], p) && cb(p[0], p[1], p[0], p[1]) === false) return;
    }
    const ts = E.ts.a[id], tc = E.tc.a[id], X = this.TX;
    for (let t = ts; t < ts + tc; t++) {
      // yazı: taban çizgisini parça gibi ele al
      const h = X.h.a[t], r = X.r.a[t], L = h * 0.62 * Math.max(1, this.TS[t].length) * (X.wf.a[t] || 1);
      if (cam.project(X.x.a[t], X.y.a[t], X.z.a[t], p) && cam.project(X.x.a[t] + L * Math.cos(r), X.y.a[t] + L * Math.sin(r), X.z.a[t], q) && cb(p[0], p[1], q[0], q[1]) === false) return;
    }
  }
  pickScreen(sx, sy, tol, cam) {
    const E = this.E, fl = E.flags.a, n = this.nEnt, r = [0, 0, 0, 0];
    let best = -1, bd = tol;
    for (let id = 0; id < n; id++) {
      if (fl[id] & F_DEL || !this.layerVis[E.layer.a[id]] || this.layerLocked(E.layer.a[id])) continue;
      const R = this.screenRect(id, cam, r);
      if (R && (sx < R[0] - bd || sx > R[2] + bd || sy < R[1] - bd || sy > R[3] + bd)) continue;
      this.eachScreenSeg(id, cam, (x1, y1, x2, y2) => {
        const d = segDist(sx, sy, x1, y1, x2, y2);
        if (d < bd) { bd = d; best = id; if (d < 0.5) return false; }
      });
    }
    return best;
  }
  boxSelectScreen(x0, y0, x1, y1, window, cam) {
    const E = this.E, fl = E.flags.a, n = this.nEnt, r = [0, 0, 0, 0], out = [];
    for (let id = 0; id < n; id++) {
      if (fl[id] & F_DEL || !this.layerVis[E.layer.a[id]] || this.layerLocked(E.layer.a[id])) continue;
      const R = this.screenRect(id, cam, r);
      if (!R) continue;
      if (R[2] < x0 || R[0] > x1 || R[3] < y0 || R[1] > y1) continue;
      const inside = R[0] >= x0 && R[2] <= x1 && R[1] >= y0 && R[3] <= y1;
      if (inside) { out.push(id); continue; }
      if (window) continue;
      let hit = false;
      this.eachScreenSeg(id, cam, (a, b, c, d) => { if (segRect(a, b, c, d, x0, y0, x1, y1)) { hit = true; return false; } });
      if (hit) out.push(id);
    }
    return out;
  }

  // ── Nesne yakalama (AutoCAD OSNAP). modes: {end, mid, cen, quad, int, perp, near, node, ins}; base: perp için önceki nokta
  // Dönüş: {p:[x,y,z], kind} ya da null. Öncelik: uç/düğüm/ekleme > kesişim > orta/merkez/çeyrek > dik > yakın
  // extra (isteğe bağlı): { armed: Map(id → merkez) — üzerinde beklenmiş daire/yay/elipsler (merkez yalnız bunlarda önerilir, AutoCAD gibi),
  //   curves: [] — çıktı: imlecin üzerinde durduğu eğriler {id, c:[x,y,z]}, toolPts: [[x,y,z]] — çizilmekte olan nesnenin noktaları }
  snap(x, y, tol, modes, base, extra) {
    modes = modes || { end: true };
    const armed = extra && extra.armed, curves = extra && extra.curves;
    const E = this.E, b = E.bb.a, fl = E.flags.a, TN = this.core.TYPE_NAMES;
    const PRI = { end: 0, node: 0, ins: 0, int: 1, mid: 2, cen: 2, quad: 2, perp: 3, near: 4 };
    let best = null, bp = 9, bd = Infinity, cur = -1;
    const offer = (px, py, pz, kind, dist, id2) => {
      if (!modes[kind]) return;
      const d = dist !== undefined ? dist : Math.hypot(px - x, py - y);
      if (d > tol) return;
      const pr = PRI[kind];
      if (pr < bp || (pr === bp && d < bd)) { bp = pr; bd = d; best = { p: [px, py, pz], kind, id: cur, id2 }; }
    };
    const segs = [];   // kesişim ve dik için düz parçalar
    const near = (x1, y1, z1, x2, y2, z2) => {
      const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      return [x1 + t * dx, y1 + t * dy, z1 + t * (z2 - z1)];
    };
    const seg = (x1, y1, z1, x2, y2, z2, straight) => {
      if (modes.near) { const q = near(x1, y1, z1, x2, y2, z2); offer(q[0], q[1], q[2], 'near'); }
      if (straight && (modes.int || modes.perp)) {
        const sx0 = Math.min(x1, x2), sx1 = Math.max(x1, x2), sy0 = Math.min(y1, y2), sy1 = Math.max(y1, y2);
        if (sx1 >= x - tol && sx0 <= x + tol && sy1 >= y - tol && sy0 <= y + tol && segs.length < 4000) segs.push([x1, y1, z1, x2, y2, z2, cur]);
      }
      if (straight && modes.mid) offer((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, 'mid');
    };
    // bir köşe dizisindeki eğri (yay parçası) iç köşeleri: eşit uzunluklu ve küçük dönüşlü
    const arcInner = (P, Z, s, e, v) => {
      if (v <= s || v >= e) return false;
      const ax = P[2 * v] - P[2 * v - 2], ay = P[2 * v + 1] - P[2 * v - 1], bx = P[2 * v + 2] - P[2 * v], by = P[2 * v + 3] - P[2 * v + 1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by); if (!la || !lb) return false;
      const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
      return turn < 0.13 && turn > 1e-6 && Math.abs(la - lb) < 0.02 * Math.max(la, lb);
    };
    const circum = (ax, ay, bx, by, cx, cy) => {
      const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)); if (Math.abs(d) < 1e-18) return null;
      const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
      const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d, uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
      return [ux, uy, Math.hypot(ax - ux, ay - uy)];
    };
    let budget = 3000;
    const big = tol * 1.0001;
    this.grid.query(x - tol, y - tol, x + tol, y + tol, (id) => {
      if (budget <= 0 || (fl[id] & F_DEL) || !this.layerVis[E.layer.a[id]]) return;
      // merkez yakalama için daire kutusunun içinde de olabilir: kutu + tol
      if (x < b[4 * id] - big || x > b[4 * id + 2] + big || y < b[4 * id + 1] - big || y > b[4 * id + 3] + big) return;
      budget--; cur = id;
      const type = TN[E.type.a[id]];
      const ch = this.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id];
      if (ch && vc) {
        if (fl[id] & F_POINTS) { const P = ch.ppos, Z = ch.pz; for (let v = vs; v < vs + vc; v++) offer(P[2 * v], P[2 * v + 1], Z[v], 'node'); }
        else {
          const P = ch.pos, Z = ch.z, e = vs + vc - 1;
          const curve = type === 'CIRCLE' || type === 'ARC' || type === 'ELLIPSE' || type === 'SPLINE';
          // eğrilerde: uçlar (kapalı değilse), merkez, çeyrekler; ekrandaki parçaların köşeleri yakalanmaz
          if (curve) {
            const closed = Math.hypot(P[2 * e] - P[2 * vs], P[2 * e + 1] - P[2 * vs + 1]) < 1e-9;
            if (!closed) { offer(P[2 * vs], P[2 * vs + 1], Z[vs], 'end'); offer(P[2 * e], P[2 * e + 1], Z[e], 'end'); }
            let dmin = Infinity;
            for (let v = vs; v < vs + vc; v += 2) { const q = near(P[2 * v], P[2 * v + 1], Z[v], P[2 * v + 2], P[2 * v + 3], Z[v + 1]); dmin = Math.min(dmin, Math.hypot(q[0] - x, q[1] - y)); seg(P[2 * v], P[2 * v + 1], Z[v], P[2 * v + 2], P[2 * v + 3], Z[v + 1], false); }
            if (type === 'CIRCLE' || type === 'ARC') {
              const m = vs + 2 * Math.floor(vc / 4), c = circum(P[2 * vs], P[2 * vs + 1], P[2 * m], P[2 * m + 1], P[2 * e], P[2 * e + 1]) || (vc > 6 ? circum(P[2 * vs], P[2 * vs + 1], P[2 * (vs + 2)], P[2 * (vs + 2) + 1], P[2 * m], P[2 * m + 1]) : null);
              if (c) {
                const z = Z[vs];
                // merkez yalnız üzerinde beklenmiş (armed) eğride: imleç çemberin üzerindeyken ya da merkezin yakınındayken
                if (dmin <= tol && curves) curves.push({ id, c: [c[0], c[1], z], d: dmin });
                if (!armed || armed.has(id)) { if (dmin <= tol) offer(c[0], c[1], z, 'cen', Math.min(tol, dmin + tol * 0.6)); else offer(c[0], c[1], z, 'cen'); }
                if (modes.quad) for (let k = 0; k < 4; k++) {
                  const a = k * Math.PI / 2, qx = c[0] + c[2] * Math.cos(a), qy = c[1] + c[2] * Math.sin(a);
                  // yay üzerinde mi: en yakın tessel parçaya uzaklık
                  let on = Infinity; for (let v = vs; v < vs + vc; v += 2) { const q = near(P[2 * v], P[2 * v + 1], 0, P[2 * v + 2], P[2 * v + 3], 0); on = Math.min(on, Math.hypot(q[0] - qx, q[1] - qy)); }
                  if (on < c[2] * 0.01 + 1e-9) offer(qx, qy, z, 'quad');
                }
                if (type === 'ARC') { const mv = vs + 2 * Math.floor(vc / 4); offer(P[2 * mv], P[2 * mv + 1], Z[mv], 'mid'); }
              }
            } else if (type === 'ELLIPSE') {
              let cx = 0, cy = 0; for (let v = vs; v < vs + vc; v += 2) { cx += P[2 * v]; cy += P[2 * v + 1]; }
              const n = vc / 2;
              if (dmin <= tol && curves) curves.push({ id, c: [cx / n, cy / n, Z[vs]], d: dmin });
              if (!armed || armed.has(id)) { if (dmin <= tol) offer(cx / n, cy / n, Z[vs], 'cen', Math.min(tol, dmin + tol * 0.6)); else offer(cx / n, cy / n, Z[vs], 'cen'); }
            }
          } else {
            // çizgi / polyline / yüz kenarları
            for (let v = vs; v < vs + vc; v += 2) {
              const x1 = P[2 * v], y1 = P[2 * v + 1], x2 = P[2 * v + 2], y2 = P[2 * v + 3];
              const a1 = arcInner(P, Z, vs, e, v), a2 = arcInner(P, Z, vs, e, v + 1);
              if (!a1) offer(x1, y1, Z[v], 'end');
              if (!a2) offer(x2, y2, Z[v + 1], 'end');
              seg(x1, y1, Z[v], x2, y2, Z[v + 1], !(a1 || a2));   // yay parçaları düz kabul edilmez
            }
          }
        }
      }
      const is = E.is.a[id], ic = E.ic.a[id];
      for (let k = is; k < is + ic; k++) {
        const B = this.blocks[this.IN.blk.a[k]]; if (!B) continue;
        const M = this.instM(B, this.IN.slot.a[k]), fl = this.flatBlocks;
        offer(M[3], M[7], M[11], 'ins');
        if (B.pos && B.nV < 20000) {
          const P = B.pos, Z = B.z;
          const X = (v) => M[0] * P[2 * v] + M[1] * P[2 * v + 1] + M[2] * Z[v] + M[3], Y = (v) => M[4] * P[2 * v] + M[5] * P[2 * v + 1] + M[6] * Z[v] + M[7];
          const ZZ = (v) => fl ? M[11] : M[8] * P[2 * v] + M[9] * P[2 * v + 1] + M[10] * Z[v] + M[11];
          for (let v = 0; v < B.nV; v += 2) { const z1 = ZZ(v), z2 = ZZ(v + 1); offer(X(v), Y(v), z1, 'end'); offer(X(v + 1), Y(v + 1), z2, 'end'); seg(X(v), Y(v), z1, X(v + 1), Y(v + 1), z2, true); }
        }
      }
      const ts = E.ts.a[id], tc = E.tc.a[id];
      for (let t = ts; t < ts + tc; t++) offer(this.TX.x.a[t], this.TX.y.a[t], this.TX.z.a[t], 'ins');
    });
    // çizilmekte olan nesnenin noktaları (ör. polyline'ın ilk noktası) ve aralarındaki orta noktalar
    if (extra && extra.toolPts) {
      cur = -1; const T = extra.toolPts;
      for (let i = 0; i < T.length; i++) {
        const q = T[i]; offer(q[0], q[1], q[2] || 0, 'end');
        if (i + 1 < T.length) { const r = T[i + 1]; offer((q[0] + r[0]) / 2, (q[1] + r[1]) / 2, ((q[2] || 0) + (r[2] || 0)) / 2, 'mid'); }
      }
    }
    // kesişimler (imlece yakın düz parçalar arasında)
    if (modes.int && segs.length > 1) {
      const n = Math.min(segs.length, 400);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const A = segs[i], B2 = segs[j];
        const rx = A[3] - A[0], ry = A[4] - A[1], sx = B2[3] - B2[0], sy = B2[4] - B2[1], den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-18) continue;
        const qx = B2[0] - A[0], qy = B2[1] - A[1], t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
        if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
        if ((t < 1e-9 || t > 1 - 1e-9) && (u < 1e-9 || u > 1 - 1e-9)) continue; // ortak uç: uç nokta yakalaması
        cur = A[6]; offer(A[0] + rx * t, A[1] + ry * t, A[2] + (A[5] - A[2]) * t, 'int', undefined, B2[6]);
      }
    }
    // dik: önceki noktadan parçaya inen dikmenin ayağı
    if (modes.perp && base) {
      for (const A of segs) {
        const dx = A[3] - A[0], dy = A[4] - A[1], l2 = dx * dx + dy * dy; if (!l2) continue;
        const t = ((base[0] - A[0]) * dx + (base[1] - A[1]) * dy) / l2; if (t < 0 || t > 1) continue;
        cur = A[6]; offer(A[0] + t * dx, A[1] + t * dy, A[2] + t * (A[5] - A[2]), 'perp');
      }
    }
    return best;
  }
  // ── 3B görünümde yakalama: imleç ışınının yakınındaki varlıklar (ızgara hücreleri ışın boyunca taranır)
  rayCandidates(o, d, tol) {
    const G = this.grid, out = []; if (!G) return out;
    const ext = this.ext || [-1, -1, 1, 1], zr = this.zext || [0, 0];
    const lo = [ext[0] - tol, ext[1] - tol, zr[0] - tol], hi = [ext[2] + tol, ext[3] + tol, zr[1] + tol];
    let t0 = -Infinity, t1 = Infinity, ok = true;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-15) { if (o[k] < lo[k] || o[k] > hi[k]) ok = false; continue; }
      let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k]; if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
    }
    const fl = this.E.flags.a, seen = new Set();
    const add = (id) => { if (!seen.has(id)) { seen.add(id); out.push(id); } };
    if (ok && t0 <= t1 && isFinite(t0) && isFinite(t1)) {
      const L = Math.hypot(d[0], d[1]) * (t1 - t0), n = Math.min(400, Math.max(1, Math.ceil(L / (2 * tol))));
      const half = tol + L / n / 2 + 1e-9, cs = G.cs, cells = new Set();
      for (let i = 0; i <= n; i++) {
        const t = t0 + (t1 - t0) * i / n, x = o[0] + d[0] * t, y = o[1] + d[1] * t;
        const cx0 = Math.max(0, Math.floor((x - half - G.x0) / cs) - 1), cx1 = Math.min(G.nx - 1, Math.floor((x + half - G.x0) / cs) + 1);
        const cy0 = Math.max(0, Math.floor((y - half - G.y0) / cs) - 1), cy1 = Math.min(G.ny - 1, Math.floor((y + half - G.y0) / cs) + 1);
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
          const c = cy * G.nx + cx; if (cells.has(c)) continue; cells.add(c);
          for (let k = G.off[c]; k < G.off[c + 1]; k++) { const id = G.ids[k]; if (!(fl[id] & F_DYN)) add(id); }
        }
        if (out.length > 20000) break;
      }
    }
    for (let k = 0; k < G.large.length; k++) { const id = G.large[k]; if (!(fl[id] & F_DYN)) add(id); }
    for (const id of this.dyn) add(id);
    return out;
  }
  // Ekran uzayında yakalama (3B). sx, sy, tol: piksel; cam: Renderer.cam(); ray: {o, d} dünya (göreli) ışını; extra: snap() ile aynı
  snapScreen(sx, sy, tol, modes, cam, ray, tolW, extra) {
    modes = modes || { end: true };
    const E = this.E, b = E.bb.a, fl = E.flags.a, TN = this.core.TYPE_NAMES, armed = extra && extra.armed, curves = extra && extra.curves;
    const PRI = { end: 0, node: 0, ins: 0, int: 1, mid: 2, cen: 2, quad: 2, perp: 3, near: 4 };
    let best = null, bp = 9, bd = Infinity, cur = -1;
    const P2 = [0, 0], Q2 = [0, 0], rect = [0, 0, 0, 0];
    const offer = (x, y, z, kind, dpx) => {
      if (!modes[kind]) return;
      let d = dpx;
      if (d === undefined) { if (!cam.project(x, y, z, P2)) return; d = Math.hypot(P2[0] - sx, P2[1] - sy); }
      if (d > tol) return;
      const pr = PRI[kind];
      if (pr < bp || (pr === bp && d < bd)) { bp = pr; bd = d; best = { p: [x, y, z], kind, id: cur }; }
    };
    // ekrandaki en yakın nokta → 3B parça üzerindeki karşılığı (ortografikte tam)
    const nearSeg = (x1, y1, z1, x2, y2, z2) => {
      if (!cam.project(x1, y1, z1, P2) || !cam.project(x2, y2, z2, Q2)) return null;
      const dx = Q2[0] - P2[0], dy = Q2[1] - P2[1], l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((sx - P2[0]) * dx + (sy - P2[1]) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      return { t, d: Math.hypot(P2[0] + dx * t - sx, P2[1] + dy * t - sy), p: [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t] };
    };
    const circ3 = (A, B, C) => {
      const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]], nn = n[0] * n[0] + n[1] * n[1] + n[2] * n[2];
      if (nn < 1e-24) return null;
      const a2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2], c2 = ac[0] * ac[0] + ac[1] * ac[1] + ac[2] * ac[2];
      // (|ac|² (n × ab) + |ab|² (ac × n)) / (2 |n|²)
      const nab = [n[1] * ab[2] - n[2] * ab[1], n[2] * ab[0] - n[0] * ab[2], n[0] * ab[1] - n[1] * ab[0]], acn = [ac[1] * n[2] - ac[2] * n[1], ac[2] * n[0] - ac[0] * n[2], ac[0] * n[1] - ac[1] * n[0]];
      return [A[0] + (c2 * nab[0] + a2 * acn[0]) / (2 * nn), A[1] + (c2 * nab[1] + a2 * acn[1]) / (2 * nn), A[2] + (c2 * nab[2] + a2 * acn[2]) / (2 * nn)];
    };
    const ids = this.rayCandidates(ray.o, ray.d, tolW);
    let budget = 4000;
    for (const id of ids) {
      if (budget <= 0) break;
      if ((fl[id] & F_DEL) || !this.layerVis[E.layer.a[id]]) continue;
      const R = this.screenRect(id, cam, rect);
      if (R && (sx < R[0] - tol || sx > R[2] + tol || sy < R[1] - tol || sy > R[3] + tol)) continue;
      budget--; cur = id;
      const type = TN[E.type.a[id]], ch = this.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id];
      if (ch && vc) {
        if (fl[id] & F_POINTS) { const P = ch.ppos, Z = ch.pz; for (let v = vs; v < vs + vc; v++) offer(P[2 * v], P[2 * v + 1], Z[v], 'node'); }
        else {
          const P = ch.pos, Z = ch.z, e = vs + vc - 1;
          const curve = type === 'CIRCLE' || type === 'ARC' || type === 'ELLIPSE' || type === 'SPLINE';
          let dmin = Infinity, nb = null;
          for (let v = vs; v < vs + vc; v += 2) {
            const q = nearSeg(P[2 * v], P[2 * v + 1], Z[v], P[2 * v + 2], P[2 * v + 3], Z[v + 1]); if (!q) continue;
            if (q.d < dmin) { dmin = q.d; nb = q; }
            if (!curve) {
              offer(P[2 * v], P[2 * v + 1], Z[v], 'end'); offer(P[2 * v + 2], P[2 * v + 3], Z[v + 1], 'end');
              if (vc <= 2 || type === 'LINE' || type === 'LWPOLYLINE' || type === 'POLYLINE' || type === '3DFACE' || type === 'SOLID')
                offer((P[2 * v] + P[2 * v + 2]) / 2, (P[2 * v + 1] + P[2 * v + 3]) / 2, (Z[v] + Z[v + 1]) / 2, 'mid');
            }
          }
          if (nb && modes.near) offer(nb.p[0], nb.p[1], nb.p[2], 'near', nb.d);
          if (curve) {
            const closed = Math.hypot(P[2 * e] - P[2 * vs], P[2 * e + 1] - P[2 * vs + 1]) < 1e-9 && Math.abs(Z[e] - Z[vs]) < 1e-9;
            if (!closed) { offer(P[2 * vs], P[2 * vs + 1], Z[vs], 'end'); offer(P[2 * e], P[2 * e + 1], Z[e], 'end'); }
            if (type !== 'SPLINE' && vc >= 6) {
              const m = vs + 2 * Math.floor(vc / 4), m2 = vs + 2 * Math.floor(vc / 2) - 1;
              const c = circ3([P[2 * vs], P[2 * vs + 1], Z[vs]], [P[2 * m], P[2 * m + 1], Z[m]], [P[2 * m2], P[2 * m2 + 1], Z[m2]]);
              if (c) {
                if (dmin <= tol && curves) curves.push({ id, c, d: dmin });
                if (!armed || armed.has(id)) offer(c[0], c[1], c[2], 'cen', dmin <= tol ? Math.min(tol, dmin + tol * 0.6) : undefined);
              }
            }
          }
        }
      }
      const is = E.is.a[id], ic = E.ic.a[id];
      for (let k = is; k < is + ic; k++) {
        const B = this.blocks[this.IN.blk.a[k]]; if (!B) continue;
        const M = this.instM(B, this.IN.slot.a[k]), flat = this.flatBlocks;
        offer(M[3], M[7], M[11], 'ins');
        if (B.pos && B.nV < 8000) {
          const P = B.pos, Z = B.z;
          for (let v = 0; v < B.nV; v++) {
            const lx = P[2 * v], ly = P[2 * v + 1], lz = Z[v];
            offer(M[0] * lx + M[1] * ly + M[2] * lz + M[3], M[4] * lx + M[5] * ly + M[6] * lz + M[7], flat ? M[11] : M[8] * lx + M[9] * ly + M[10] * lz + M[11], 'end');
          }
        }
      }
      const ts = E.ts.a[id], tc = E.tc.a[id];
      for (let t = ts; t < ts + tc; t++) offer(this.TX.x.a[t], this.TX.y.a[t], this.TX.z.a[t], 'ins');
    }
    if (extra && extra.toolPts) { cur = -1; for (const q of extra.toolPts) offer(q[0], q[1], q[2] || 0, 'end'); }
    return best;
  }
  // Varlığın toplam uzunluğu (çizgi parçaları, plan düzleminde)
  length(id) {
    const E = this.E, ch = this.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id];
    if (!ch || !vc || (E.flags.a[id] & F_POINTS)) return 0;
    let L = 0; const P = ch.pos;
    for (let v = vs; v < vs + vc; v += 2) L += Math.hypot(P[2 * v + 2] - P[2 * v], P[2 * v + 3] - P[2 * v + 1]);
    return L;
  }
  // Kapalı bir çizgi zinciri ise plan alanı (değilse null)
  area(id) {
    const E = this.E, ch = this.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id];
    const t = E.type.a[id];
    if (!ch || vc < 6 || (E.flags.a[id] & F_POINTS)) return null;
    if (t !== 3 && t !== 5 && t !== 6 && t !== 7 && t !== 8) return null; // CIRCLE, ELLIPSE, LWPOLYLINE, POLYLINE, SPLINE
    const P = ch.pos, e = vs + vc - 1;
    const tol = 1e-6 * (1 + Math.abs(P[2 * vs]) + Math.abs(P[2 * vs + 1]));
    if (Math.abs(P[2 * e] - P[2 * vs]) > tol || Math.abs(P[2 * e + 1] - P[2 * vs + 1]) > tol) return null;
    for (let v = vs + 1; v < e; v += 2) if (Math.abs(P[2 * v] - P[2 * v + 2]) > tol || Math.abs(P[2 * v + 1] - P[2 * v + 3]) > tol) return null; // zincir değil
    let A = 0;
    for (let v = vs; v < vs + vc; v += 2) A += P[2 * v] * P[2 * v + 3] - P[2 * v + 2] * P[2 * v + 1];
    return Math.abs(A) / 2;
  }
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function segRect(x1, y1, x2, y2, rx0, ry0, rx1, ry1) {
  // Liang–Barsky
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - rx0, rx1 - x1, y1 - ry0, ry1 - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else { const r = q[i] / p[i]; if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
  }
  return true;
}

// Düzgün ızgara: küçük varlıklar merkez hücresine, büyükler ayrı listeye; taşınan/yeni varlıklar 'dyn' kümesinde
class SpatialGrid {
  constructor(store) {
    this.s = store;
    const n = store.nEnt, b = store.E.bb.a, fl = store.E.flags.a;
    const ext = store.ext;
    const w = Math.max(ext[2] - ext[0], 1e-9), h = Math.max(ext[3] - ext[1], 1e-9);
    const target = Math.max(16, Math.min(2048, Math.ceil(Math.sqrt(n) * 1.5)));
    let cs = Math.max(w, h) / target;
    // aykırı uzak nesneler varsa yoğun görünüme göre hücre boyutu seç
    const v = store.view0; if (v) cs = Math.min(cs, Math.max(v[2] - v[0], v[3] - v[1]) / target);
    let nx = Math.ceil(w / cs) + 1, ny = Math.ceil(h / cs) + 1;
    while (nx * ny > 8e6) { cs *= 1.5; nx = Math.ceil(w / cs) + 1; ny = Math.ceil(h / cs) + 1; }
    this.x0 = ext[0]; this.y0 = ext[1]; this.cs = cs; this.nx = nx; this.ny = ny;
    const cell = new Int32Array(n).fill(-1);
    const cnt = new Uint32Array(nx * ny + 1);
    const large = [];
    for (let i = 0; i < n; i++) {
      if (fl[i] & F_DEL) continue;
      const a0 = b[4 * i], a1 = b[4 * i + 1], a2 = b[4 * i + 2], a3 = b[4 * i + 3];
      if (!(a0 <= a2)) continue;
      if (a2 - a0 > cs || a3 - a1 > cs) { large.push(i); continue; }
      const cx = Math.min(nx - 1, Math.floor(((a0 + a2) / 2 - this.x0) / cs)), cy = Math.min(ny - 1, Math.floor(((a1 + a3) / 2 - this.y0) / cs));
      const c = cy * nx + cx; cell[i] = c; cnt[c + 1]++;
    }
    for (let c = 0; c < nx * ny; c++) cnt[c + 1] += cnt[c];
    const ids = new Uint32Array(cnt[nx * ny]);
    const pos = cnt.slice(0, nx * ny);
    for (let i = 0; i < n; i++) { const c = cell[i]; if (c >= 0) ids[pos[c]++] = i; }
    this.off = cnt; this.ids = ids; this.large = Uint32Array.from(large);
  }
  query(x0, y0, x1, y1, cb) {
    const fl = this.s.E.flags.a, cs = this.cs;
    let cx0 = Math.floor((x0 - this.x0) / cs) - 1, cx1 = Math.floor((x1 - this.x0) / cs) + 1;
    let cy0 = Math.floor((y0 - this.y0) / cs) - 1, cy1 = Math.floor((y1 - this.y0) / cs) + 1;
    cx0 = Math.max(0, cx0); cy0 = Math.max(0, cy0); cx1 = Math.min(this.nx - 1, cx1); cy1 = Math.min(this.ny - 1, cy1);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cy * this.nx + cx;
        for (let k = this.off[c]; k < this.off[c + 1]; k++) { const id = this.ids[k]; if (!(fl[id] & F_DYN)) cb(id); }
      }
    }
    for (let k = 0; k < this.large.length; k++) { const id = this.large[k]; if (!(fl[id] & F_DYN)) cb(id); }
    for (const id of this.s.dyn) cb(id);
  }
}
