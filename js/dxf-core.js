/*
 * DXF Okuyucu — çekirdek
 * Ayrıştırıcı (ASCII + ikili DXF), geometri üretimi ve kaydetme (yama) motoru.
 *
 * Bu dosya hem ana sayfada hem de Web Worker içinde çalışır: DXFCore fonksiyonu
 * metin olarak worker'a kopyalanır (file:// altında ayrı worker dosyası yüklenemediği için).
 * Bu yüzden içindeki her şey kendi kendine yeterli olmalı.
 */
function DXFCore() {
  'use strict';

  // ───────────────────────── Renkler ─────────────────────────
  // Renkler Uint32 olarak paketlenir: r | g<<8 | b<<16 | a<<24 (Uint8 görünümünde r,g,b,a).
  // Alfa baytı bayrak taşır:
  const A_NORMAL = 255, A_FG = 254, A_BYBLOCK = 253, A_LAYERCOL = 252, A_HIDDEN = 0;
  function rgba(r, g, b, a) { return ((r & 255) | ((g & 255) << 8) | ((b & 255) << 16) | ((a & 255) << 24)) >>> 0; }
  const FG = rgba(255, 255, 255, A_FG);          // ACI 7: arka plana göre beyaz/siyah
  const C_BYBLOCK = rgba(255, 255, 255, A_BYBLOCK);
  const C_LAYERCOL = rgba(255, 255, 255, A_LAYERCOL);

  function hsv(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  const ACI = (function () {
    const t = new Uint32Array(256);
    const base = [[0, 0, 0], [255, 0, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255],
      [255, 255, 255], [128, 128, 128], [192, 192, 192]];
    for (let i = 0; i < 10; i++) t[i] = rgba(base[i][0], base[i][1], base[i][2], 255);
    const f = [1, 0.65, 0.5, 0.3, 0.15];
    for (let i = 10; i < 250; i++) {
      const k = i - 10, h = Math.floor(k / 10) * 15, v = k % 10;
      const c = hsv(h, (v & 1) ? 0.5 : 1, f[v >> 1]);
      t[i] = rgba(c[0], c[1], c[2], 255);
    }
    const g = [51, 91, 132, 173, 214, 255];
    for (let i = 0; i < 6; i++) t[250 + i] = rgba(g[i], g[i], g[i], 255);
    return t;
  })();
  function aciToRgba(aci) { aci = Math.abs(aci | 0); if (aci === 7) return FG; if (aci < 1 || aci > 255) return FG; return ACI[aci]; }
  function trueToRgba(tc) { return rgba((tc >> 16) & 255, (tc >> 8) & 255, tc & 255, 255); }

  // ───────────────────────── Kod sayfaları ─────────────────────────
  function codepageLabel(cp, version) {
    if (version && version >= 'AC1021') return 'utf-8';
    cp = String(cp || '').toUpperCase();
    if (cp.indexOf('UTF') >= 0) return 'utf-8';
    const m = cp.match(/(\d{3,4})/);
    if (!m) return 'windows-1252';
    const n = m[1];
    if (cp.indexOf('DOS') === 0) {
      if (n === '857') return 'windows-1254';
      if (n === '866') return 'ibm866';
      return 'windows-1252';
    }
    const asia = { '874': 'windows-874', '932': 'shift_jis', '936': 'gbk', '949': 'euc-kr', '950': 'big5' };
    if (asia[n]) return asia[n];
    return 'windows-' + n;
  }
  function makeEncoder(label) {
    if (label === 'utf-8') { const te = new TextEncoder(); return s => te.encode(s); }
    let dec; try { dec = new TextDecoder(label); } catch (e) { dec = new TextDecoder('windows-1252'); }
    const map = new Map();
    for (let b = 128; b < 256; b++) { const ch = dec.decode(new Uint8Array([b])); if (!map.has(ch)) map.set(ch, b); }
    return function (s) {
      const out = new Uint8Array(s.length); let k = 0;
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 128) out[k++] = c;
        else { const b = map.get(s[i]); out[k++] = b === undefined ? 63 : b; }
      }
      return out.subarray(0, k);
    };
  }

  // DXF metinlerindeki kaçış dizileri: \U+XXXX, %%c %%d %%p
  function decodeDxfString(s) {
    if (s.indexOf('\\U+') >= 0 || s.indexOf('\\u+') >= 0)
      s = s.replace(/\\[Uu]\+([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    if (s.indexOf('%%') >= 0)
      s = s.replace(/%%([cCdDpP%]|[uUoOkK]|\d{3})/g, (m, c) => {
        const l = c.toLowerCase();
        if (l === 'c') return 'Ø'; if (l === 'd') return '°'; if (l === 'p') return '±'; if (l === '%') return '%';
        if (/\d{3}/.test(c)) return String.fromCharCode(parseInt(c, 10));
        return '';
      });
    return s;
  }
  function cleanMText(s) {
    s = decodeDxfString(s);
    s = s.replace(/\\\\/g, '\u0001').replace(/\\\{/g, '\u0002').replace(/\\\}/g, '\u0003');
    s = s.replace(/\\P/g, '\n').replace(/\\~/g, ' ');
    s = s.replace(/\\S([^;]*?)[\^\/#]([^;]*?);/g, '$1/$2');
    s = s.replace(/\\[ACFHQTWfhqtwpacP][^;\\]*;/g, '');
    s = s.replace(/\\[LlOoKkNnXx]/g, '');
    s = s.replace(/[{}]/g, '');
    s = s.replace(/\u0001/g, '\\').replace(/\u0002/g, '{').replace(/\u0003/g, '}');
    return s;
  }

  // ───────────────────────── Sayı okuma ─────────────────────────
  const P10 = (function () { const t = new Float64Array(310); let v = 1; for (let i = 0; i < 310; i++) { t[i] = v; v *= 10; } t[22] = 1e22; return t; })();
  function fastFloat(b, s, e) {
    while (s < e && (b[s] === 32 || b[s] === 9)) s++;
    let neg = false;
    if (b[s] === 45) { neg = true; s++; } else if (b[s] === 43) s++;
    let m = 0, digits = 0, exp = 0, any = false, c;
    while (s < e && (c = b[s] - 48) >= 0 && c <= 9) {
      any = true;
      if (digits < 17) { if (m !== 0 || c !== 0) { m = m * 10 + c; digits++; } } else exp++;
      s++;
    }
    if (s < e && b[s] === 46) {
      s++;
      while (s < e && (c = b[s] - 48) >= 0 && c <= 9) {
        any = true;
        if (digits < 17) { m = m * 10 + c; if (m !== 0) digits++; exp--; }
        s++;
      }
    }
    if (s < e && (b[s] === 101 || b[s] === 69)) {
      s++; let en = false, ev = 0;
      if (b[s] === 45) { en = true; s++; } else if (b[s] === 43) s++;
      while (s < e && (c = b[s] - 48) >= 0 && c <= 9) { ev = ev * 10 + c; s++; }
      exp += en ? -ev : ev;
    }
    if (!any) {
      // "1.#INF", "nan" vb. — yavaş yola düş
      let str = ''; for (let i = s; i < e; i++) str += String.fromCharCode(b[i]);
      const v = parseFloat(str); return isFinite(v) ? (neg ? -v : v) : 0;
    }
    let v;
    if (exp === 0) v = m;
    else if (exp > 0) v = exp < 309 ? m * P10[exp] : Infinity;
    else v = -exp < 309 ? m / P10[-exp] : 0;
    return neg ? -v : v;
  }

  // ───────────────────────── Belirteçleyiciler ─────────────────────────
  // ASCII DXF: "kod\nDeğer\n" çiftleri. Parça parça beslenir; satır yarıda kalırsa kalan kısım saklanır.
  class TextTok {
    constructor() {
      this.left = null; this.leftAbs = 0; this.buf = null; this.base = 0; this.vs = 0; this.ve = 0;
      this.handler = null; this.stop = false; this.setDecoder('windows-1252');
    }
    setDecoder(label) {
      try { this.dec = new TextDecoder(label); } catch (e) { this.dec = new TextDecoder('windows-1252'); label = 'windows-1252'; }
      this.decLabel = label;
    }
    feed(chunk, absStart, last) {
      let buf = chunk, base = absStart;
      if (this.left) {
        const l = this.left;
        buf = new Uint8Array(l.length + chunk.length); buf.set(l, 0); buf.set(chunk, l.length);
        base = this.leftAbs; this.left = null;
      }
      this.buf = buf; this.base = base;
      const n = buf.length, H = this.handler;
      let p = 0;
      while (p < n && !this.stop) {
        let q = p, code = 0, neg = false, any = false, c;
        while (q < n && ((c = buf[q]) === 32 || c === 9)) q++;
        if (q < n && buf[q] === 45) { neg = true; q++; }
        while (q < n && (c = buf[q] - 48) >= 0 && c <= 9) { code = code * 10 + c; q++; any = true; }
        while (q < n && buf[q] !== 10) q++;
        if (q >= n) { if (last && !any) { p = n; } break; }
        const vs = q + 1; let e = vs;
        while (e < n && buf[e] !== 10) e++;
        if (e >= n && !last) break;
        let ve = e; if (ve > vs && buf[ve - 1] === 13) ve--;
        if (!any) {
          // boş satır: dosya sonundaki boşluklara izin ver
          let blank = true; for (let i = p; i < q; i++) { const ch = buf[i]; if (ch !== 32 && ch !== 9 && ch !== 13) { blank = false; break; } }
          if (blank) { p = q + 1; continue; }
          throw new Error('Geçersiz DXF: ' + (base + p) + '. baytta grup kodu bekleniyordu.');
        }
        this.vs = vs; this.ve = ve;
        H.pair(neg ? -code : code, base + p);
        p = e + 1;
      }
      if (p < n && !this.stop) { this.left = buf.slice(p); this.leftAbs = base + p; }
    }
    num() { return fastFloat(this.buf, this.vs, this.ve); }
    str() {
      const b = this.buf, s = this.vs, e = this.ve, len = e - s;
      if (len <= 0) return '';
      if (len < 64) {
        let ascii = true;
        for (let i = s; i < e; i++) if (b[i] > 127) { ascii = false; break; }
        if (ascii) return String.fromCharCode.apply(null, b.subarray(s, e));
      }
      return this.dec.decode(b.subarray(s, e));
    }
    vabs() { return [this.base + this.vs, this.base + this.ve]; }
  }

  // İkili DXF ("AutoCAD Binary DXF\r\n\x1a\0" ile başlar)
  const BIN_SENTINEL = 'AutoCAD Binary DXF\r\n\u001a\u0000';
  function isBinaryDxf(u8) {
    if (u8.length < 22) return false;
    for (let i = 0; i < 22; i++) if (u8[i] !== BIN_SENTINEL.charCodeAt(i)) return false;
    return true;
  }
  function binType(c) { // 0 str, 1 double, 2 int16, 3 int32, 4 int64, 5 bool, 6 binary
    if (c >= 0 && c <= 9) return 0;
    if (c >= 10 && c <= 59) return 1;
    if (c >= 60 && c <= 79) return 2;
    if (c >= 90 && c <= 99) return 3;
    if (c === 100 || c === 102 || c === 105) return 0;
    if (c >= 110 && c <= 149) return 1;
    if (c >= 160 && c <= 169) return 4;
    if (c >= 170 && c <= 179) return 2;
    if (c >= 210 && c <= 239) return 1;
    if (c >= 270 && c <= 289) return 2;
    if (c >= 290 && c <= 299) return 5;
    if (c >= 300 && c <= 309) return 0;
    if (c >= 310 && c <= 319) return 6;
    if (c >= 320 && c <= 369) return 0;
    if (c >= 370 && c <= 389) return 2;
    if (c >= 390 && c <= 399) return 0;
    if (c >= 400 && c <= 409) return 2;
    if (c >= 410 && c <= 419) return 0;
    if (c >= 420 && c <= 429) return 3;
    if (c >= 430 && c <= 439) return 0;
    if (c >= 440 && c <= 459) return 3;
    if (c >= 460 && c <= 469) return 1;
    if (c >= 470 && c <= 481) return 0;
    if (c === 999) return 0;
    if (c >= 1000 && c <= 1003) return 0;
    if (c === 1004) return 6;
    if (c >= 1005 && c <= 1009) return 0;
    if (c >= 1010 && c <= 1059) return 1;
    if (c >= 1060 && c <= 1070) return 2;
    if (c === 1071) return 3;
    return 0;
  }
  class BinTok {
    constructor() {
      this.left = null; this.leftAbs = 0; this.buf = null; this.base = 0; this.handler = null; this.stop = false;
      this.wide = true; this.first = true; this.cur = 0; this.vs = 0; this.ve = 0; this.isStr = false;
      this.setDecoder('windows-1252');
    }
    setDecoder(label) { try { this.dec = new TextDecoder(label); } catch (e) { this.dec = new TextDecoder('windows-1252'); } this.decLabel = label; }
    feed(chunk, absStart, last) {
      let buf = chunk, base = absStart;
      if (this.left) { const l = this.left; buf = new Uint8Array(l.length + chunk.length); buf.set(l, 0); buf.set(chunk, l.length); base = this.leftAbs; this.left = null; }
      let p = 0;
      if (this.first) { p = 22; this.first = false; this.wide = !(buf[23] === 0x53 && buf[22] === 0); } // R12: 1 baytlık kod
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      this.buf = buf; this.base = base;
      const n = buf.length, H = this.handler;
      const SAFE = 70000;
      while (p < n && !this.stop) {
        if (!last && n - p < SAFE) break;
        const start = p;
        let code;
        if (this.wide) { if (p + 2 > n) break; code = dv.getInt16(p, true); p += 2; }
        else { code = buf[p++]; if (code === 255) { if (p + 2 > n) break; code = dv.getInt16(p, true); p += 2; } }
        const t = binType(code);
        this.isStr = false;
        if (t === 0) { let e = p; while (e < n && buf[e] !== 0) e++; if (e >= n) { p = start; break; } this.vs = p; this.ve = e; this.isStr = true; p = e + 1; }
        else if (t === 1) { if (p + 8 > n) { p = start; break; } this.cur = dv.getFloat64(p, true); p += 8; }
        else if (t === 2) { if (p + 2 > n) { p = start; break; } this.cur = dv.getInt16(p, true); p += 2; }
        else if (t === 3) { if (p + 4 > n) { p = start; break; } this.cur = dv.getInt32(p, true); p += 4; }
        else if (t === 4) { if (p + 8 > n) { p = start; break; } this.cur = Number(dv.getBigInt64(p, true)); p += 8; }
        else if (t === 5) { if (p + 1 > n) { p = start; break; } this.cur = buf[p]; p += 1; }
        else { if (p + 1 > n) { p = start; break; } const len = buf[p]; if (p + 1 + len > n) { p = start; break; } this.cur = 0; p += 1 + len; }
        H.pair(code, base + start);
      }
      if (p < n && !this.stop) { this.left = buf.slice(p); this.leftAbs = base + p; }
    }
    num() {
      if (!this.isStr) return this.cur;
      let s = ''; for (let i = this.vs; i < this.ve; i++) s += String.fromCharCode(this.buf[i]);
      const v = parseFloat(s); return isFinite(v) ? v : 0;
    }
    str() {
      if (!this.isStr) return String(this.cur);
      const b = this.buf, s = this.vs, e = this.ve;
      let ascii = true; for (let i = s; i < e; i++) if (b[i] > 127) { ascii = false; break; }
      if (ascii) { let r = ''; for (let i = s; i < e; i++) r += String.fromCharCode(b[i]); return r; }
      return this.dec.decode(b.subarray(s, e));
    }
    vabs() { return null; }
  }

  // ───────────────────────── Büyüyen diziler ─────────────────────────
  class Grow {
    constructor(T, cap) { this.T = T; this.a = new T(cap || 1024); this.n = 0; }
    ensure(k) {
      if (this.n + k > this.a.length) {
        let c = this.a.length * 2; while (c < this.n + k) c *= 2;
        const b = new this.T(c); b.set(this.a.subarray(0, this.n)); this.a = b;
      }
    }
    push(v) { if (this.n >= this.a.length) this.ensure(1); this.a[this.n++] = v; }
    take() { return this.a.slice(0, this.n); }
    reset() { this.n = 0; }
  }

  // ───────────────────────── Varlık tipleri ─────────────────────────
  const T = {
    LINE: 1, POINT: 2, CIRCLE: 3, ARC: 4, ELLIPSE: 5, LWPOLYLINE: 6, POLYLINE: 7, SPLINE: 8, TEXT: 9, MTEXT: 10,
    INSERT: 11, DIMENSION: 12, HATCH: 13, SOLID: 14, '3DFACE': 15, LEADER: 16, ATTDEF: 17, TRACE: 18, MLINE: 19,
    ACAD_TABLE: 20, ARC_DIMENSION: 12, LARGE_RADIAL_DIMENSION: 12, MESH: 21
  };
  const TYPE_NAMES = ['?', 'LINE', 'POINT', 'CIRCLE', 'ARC', 'ELLIPSE', 'LWPOLYLINE', 'POLYLINE', 'SPLINE', 'TEXT', 'MTEXT',
    'INSERT', 'DIMENSION', 'HATCH', 'SOLID', '3DFACE', 'LEADER', 'ATTDEF', 'TRACE', 'MLINE', 'ACAD_TABLE', 'MESH'];
  // Varlık bayrakları
  const F_BYLAYER = 1, F_NEW = 2, F_POINTS = 16, F_NOBBOX = 32;

  // ───────────────────────── Geometri üreticisi (Builder) ─────────────────────────
  const SOFT_CHUNK = 2000000;        // parça başına yaklaşık köşe sayısı
  const ENT_BATCH = 100000, TXT_BATCH = 50000, INST_BATCH = 50000;
  const MAX_BLOCK_VERTS = 6000000;   // tek blok (iç içe açılmış) köşe sınırı
  const MAX_BLOCK_TEXTS = 3000000;   // bloklardan açılan toplam yazı sınırı

  class Builder {
    constructor(post, opts) {
      opts = opts || {};
      this.post = post;
      this.SEG = opts.circleSegments || 64;
      this.layers = []; this.layerMap = new Map();
      this.blocks = []; this.blockMap = new Map();
      this.layer0 = this.layerIdx('0');
      this.ox = 0; this.oy = 0; this.hasOrigin = false;
      this.target = null;
      this.chunkIdx = -1; this.newChunk();
      this.entCount = 0; this.textCount = 0; this.instCount = 0;
      this.ext = [Infinity, Infinity, -Infinity, -Infinity];
      this.stats = Object.create(null); this.unsupported = Object.create(null);
      this.warnings = [];
      this.blockTextTotal = 0;
      this.cz = 0;                    // geçerli varlığın varsayılan Z değeri (kot)
      this.thick = 0;                 // geçerli varlığın kalınlığı (Z yönünde ekstrüzyon)
      // Düzenlenen/yeni nesneleri yeniden üretmek için: hazır katman listesi ve sabit orijin
      if (opts.layers) for (const L of opts.layers) { const i = this.layerIdx(L.name); Object.assign(this.layers[i], { aci: L.aci, rgba: L.rgba, fromTable: true }); }
      if (opts.origin) { this.ox = opts.origin[0]; this.oy = opts.origin[1]; this.hasOrigin = true; }
      this.resetBatches();
    }
    warn(w) { if (this.warnings.length < 50 && this.warnings.indexOf(w) < 0) this.warnings.push(w); }

    // ── katmanlar
    layerIdx(name) {
      name = name === undefined || name === null || name === '' ? '0' : name;
      const k = name.toUpperCase();
      let i = this.layerMap.get(k);
      if (i === undefined) {
        i = this.layers.length;
        this.layers.push({ name, aci: 7, rgba: FG, flags: 0, off: false, frozen: false, locked: false, fromTable: false });
        this.layerMap.set(k, i);
        this.layersDirty = true;
      }
      return i;
    }
    addLayer(name, aci, flags, tc) {
      const i = this.layerIdx(name); const L = this.layers[i];
      L.name = name; L.aci = aci; L.flags = flags; L.fromTable = true;
      L.off = aci < 0; L.frozen = (flags & 1) !== 0; L.locked = (flags & 4) !== 0;
      L.rgba = tc >= 0 ? trueToRgba(tc) : aciToRgba(aci);
      this.layersDirty = true;
    }
    postLayers() {
      this.post('layers', this.layers.map(L => ({ name: L.name, aci: L.aci, rgba: L.rgba, off: L.off, frozen: L.frozen, locked: L.locked })));
      this.layersDirty = false;
    }

    // ── bloklar
    blockIdx(name) {
      const k = String(name).toUpperCase();
      let i = this.blockMap.get(k);
      if (i === undefined) {
        i = this.blocks.length;
        this.blocks.push({
          idx: i, name, bx: 0, by: 0, bz: 0, defined: false, paper: false, flat: false, sent: false,
          pos: null, col: null, lay: null, ppos: null, pcol: null, play: null, z: null, pz: null,
          tpos: null, tz: null, tcol: null, tlay: null, texts: [], inserts: [],
          bb: [Infinity, Infinity, -Infinity, -Infinity], zb: [Infinity, -Infinity]
        });
        this.blockMap.set(k, i);
      }
      return i;
    }
    beginBlock(name, bx, by, bz) {
      const d = this.blocks[this.blockIdx(name)];
      d.name = name; d.bx = bx; d.by = by; d.bz = bz || 0; d.defined = true; d.flat = false; d.sent = false;
      d.paper = /^\*PAPER_SPACE/i.test(name);
      d.pos = new Grow(Float32Array, 64); d.col = new Grow(Uint32Array, 32); d.lay = new Grow(Uint16Array, 32);
      d.ppos = new Grow(Float32Array, 16); d.pcol = new Grow(Uint32Array, 8); d.play = new Grow(Uint16Array, 8);
      d.z = new Grow(Float32Array, 32); d.pz = new Grow(Float32Array, 8);
      d.tpos = new Grow(Float32Array, 8); d.tz = new Grow(Float32Array, 4); d.tcol = new Grow(Uint32Array, 4); d.tlay = new Grow(Uint16Array, 4);
      d.texts = []; d.inserts = []; d.bb = [Infinity, Infinity, -Infinity, -Infinity]; d.zb = [Infinity, -Infinity];
      this.target = d;
    }
    endBlock() { this.target = null; }
    get skipping() { return this.target !== null && this.target.paper; }
    flatten(d, depth) {
      if (d.flat) return;
      d.flat = true;
      if (depth > 24) { this.warn('Çok derin iç içe blok: ' + d.name); return; }
      const ins = d.inserts; d.inserts = [];
      for (const I of ins) {
        const c = this.blocks[I.bi];
        if (!c.defined || c.paper || c === d) continue;
        this.flatten(c, depth + 1);
        const nv = c.pos.n >> 1;
        if ((d.pos.n >> 1) + nv > MAX_BLOCK_VERTS) { this.warn('Blok çok büyük, bir kısmı gösterilmiyor: ' + d.name); continue; }
        d.pos.ensure(nv * 2); d.col.ensure(nv); d.lay.ensure(nv); d.z.ensure(nv);
        const P = c.pos.a, CC = c.col.a, LL = c.lay.a, ZZ = c.z.a, bb = d.bb, zb = d.zb;
        for (let v = 0; v < nv; v++) {
          const x = P[2 * v], y = P[2 * v + 1];
          const X = I.a * x + I.b * y + I.tx, Y = I.c * x + I.d * y + I.ty, Z = I.sz * ZZ[v] + I.tz;
          d.pos.a[d.pos.n++] = X; d.pos.a[d.pos.n++] = Y; d.z.a[d.z.n++] = Z;
          if (Z < zb[0]) zb[0] = Z; if (Z > zb[1]) zb[1] = Z;
          if (X < bb[0]) bb[0] = X; if (Y < bb[1]) bb[1] = Y; if (X > bb[2]) bb[2] = X; if (Y > bb[3]) bb[3] = Y;
          let col = CC[v]; const f = col >>> 24;
          if (f === A_BYBLOCK) col = I.col; else if (f === A_LAYERCOL) col = I.lcol;
          d.col.a[d.col.n++] = col;
          const l = LL[v]; d.lay.a[d.lay.n++] = l === 65535 ? I.lay : l;
        }
        const np = c.ppos.n >> 1;
        d.ppos.ensure(np * 2); d.pcol.ensure(np); d.play.ensure(np); d.pz.ensure(np);
        for (let v = 0; v < np; v++) {
          const x = c.ppos.a[2 * v], y = c.ppos.a[2 * v + 1];
          const X = I.a * x + I.b * y + I.tx, Y = I.c * x + I.d * y + I.ty, Z = I.sz * c.pz.a[v] + I.tz;
          d.ppos.a[d.ppos.n++] = X; d.ppos.a[d.ppos.n++] = Y; d.pz.a[d.pz.n++] = Z;
          if (Z < zb[0]) zb[0] = Z; if (Z > zb[1]) zb[1] = Z;
          const bb2 = d.bb; if (X < bb2[0]) bb2[0] = X; if (Y < bb2[1]) bb2[1] = Y; if (X > bb2[2]) bb2[2] = X; if (Y > bb2[3]) bb2[3] = Y;
          let col = c.pcol.a[v]; const f = col >>> 24;
          if (f === A_BYBLOCK) col = I.col; else if (f === A_LAYERCOL) col = I.lcol;
          d.pcol.a[d.pcol.n++] = col;
          const l = c.play.a[v]; d.play.a[d.play.n++] = l === 65535 ? I.lay : l;
        }
        const nt = c.tpos.n >> 1;
        if (nt) {
          d.tpos.ensure(nt * 2); d.tz.ensure(nt); d.tcol.ensure(nt); d.tlay.ensure(nt);
          for (let v = 0; v < nt; v++) {
            const x = c.tpos.a[2 * v], y = c.tpos.a[2 * v + 1];
            const X = I.a * x + I.b * y + I.tx, Y = I.c * x + I.d * y + I.ty, Z = I.sz * c.tz.a[v] + I.tz;
            d.tpos.a[d.tpos.n++] = X; d.tpos.a[d.tpos.n++] = Y; d.tz.a[d.tz.n++] = Z;
            const bb2 = d.bb; if (X < bb2[0]) bb2[0] = X; if (Y < bb2[1]) bb2[1] = Y; if (X > bb2[2]) bb2[2] = X; if (Y > bb2[3]) bb2[3] = Y;
            if (Z < d.zb[0]) d.zb[0] = Z; if (Z > d.zb[1]) d.zb[1] = Z;
            let col = c.tcol.a[v]; const f = col >>> 24;
            if (f === A_BYBLOCK) col = I.col; else if (f === A_LAYERCOL) col = I.lcol;
            d.tcol.a[d.tcol.n++] = col;
            const l = c.tlay.a[v]; d.tlay.a[d.tlay.n++] = l === 65535 ? I.lay : l;
          }
        }
        if (c.texts.length && d.texts.length < 200000) {
          const sc = Math.hypot(I.b, I.d), ang = Math.atan2(I.c, I.a);
          for (const t of c.texts) {
            let col = t.col; const f = col >>> 24;
            if (f === A_BYBLOCK) col = I.col; else if (f === A_LAYERCOL) col = I.lcol;
            d.texts.push({
              x: I.a * t.x + I.b * t.y + I.tx, y: I.c * t.x + I.d * t.y + I.ty, z: I.sz * t.z + I.tz, h: t.h * sc, rot: t.rot + ang,
              align: t.align, str: t.str, wf: t.wf, col, lay: t.lay === 65535 ? I.lay : t.lay
            });
          }
        }
      }
    }
    blocksDone() {
      for (const d of this.blocks) if (d.defined && !d.paper) this.flatten(d, 0);
      const out = [], tr = [];
      for (const d of this.blocks) {
        if (!d.defined || d.sent || d.paper) continue;
        d.sent = true;
        const o = {
          idx: d.idx, name: d.name, bb: d.bb.slice(), zb: d.zb.slice(),
          pos: d.pos.take(), col: d.col.take(), lay: d.lay.take(), ppos: d.ppos.take(), pcol: d.pcol.take(), play: d.play.take(),
          z: d.z.take(), pz: d.pz.take(), tpos: d.tpos.take(), tz: d.tz.take(), tcol: d.tcol.take(), tlay: d.tlay.take()
        };
        tr.push(o.pos.buffer, o.col.buffer, o.lay.buffer, o.ppos.buffer, o.pcol.buffer, o.play.buffer, o.z.buffer, o.pz.buffer,
          o.tpos.buffer, o.tz.buffer, o.tcol.buffer, o.tlay.buffer);
        out.push(o);
      }
      if (out.length) this.post('blocks', out, tr);
    }

    // ── model parçaları
    newChunk() {
      this.chunkIdx++;
      this.ch = {
        pos: new Grow(Float32Array, 1 << 16), col: new Grow(Uint32Array, 1 << 15), lay: new Grow(Uint16Array, 1 << 15),
        ppos: new Grow(Float32Array, 1 << 10), pcol: new Grow(Uint32Array, 1 << 9), play: new Grow(Uint16Array, 1 << 9),
        z: new Grow(Float32Array, 1 << 15), pz: new Grow(Float32Array, 1 << 9),
        tpos: new Grow(Float32Array, 1 << 8), tz: new Grow(Float32Array, 1 << 7), tcol: new Grow(Uint32Array, 1 << 7), tlay: new Grow(Uint16Array, 1 << 7)
      };
    }
    flushChunk() {
      const c = this.ch;
      if (c.pos.n === 0 && c.ppos.n === 0 && c.tpos.n === 0) return;
      const o = { idx: this.chunkIdx, pos: c.pos.take(), col: c.col.take(), lay: c.lay.take(), ppos: c.ppos.take(), pcol: c.pcol.take(), play: c.play.take(), z: c.z.take(), pz: c.pz.take(),
        tpos: c.tpos.take(), tz: c.tz.take(), tcol: c.tcol.take(), tlay: c.tlay.take() };
      this.flushEnts();
      this.post('chunk', o, [o.pos.buffer, o.col.buffer, o.lay.buffer, o.ppos.buffer, o.pcol.buffer, o.play.buffer, o.z.buffer, o.pz.buffer,
        o.tpos.buffer, o.tz.buffer, o.tcol.buffer, o.tlay.buffer]);
      this.newChunk();
    }
    resetBatches() {
      this.E = {
        type: new Grow(Uint8Array, 4096), flags: new Grow(Uint8Array, 4096), layer: new Grow(Uint16Array, 4096),
        color: new Grow(Uint32Array, 4096), aci: new Grow(Int16Array, 4096), bb: new Grow(Float32Array, 16384), zr: new Grow(Float32Array, 8192),
        chunk: new Grow(Uint32Array, 4096), vs: new Grow(Uint32Array, 4096), vc: new Grow(Uint32Array, 4096),
        is: new Grow(Uint32Array, 4096), ic: new Grow(Uint32Array, 4096), ts: new Grow(Uint32Array, 4096),
        tc: new Grow(Uint32Array, 4096), fs: new Grow(Float64Array, 4096), fe: new Grow(Float64Array, 4096),
        rs: new Grow(Uint32Array, 4096), rc: new Grow(Uint32Array, 4096)
      };
      this.TX = {
        x: new Grow(Float32Array, 4096), y: new Grow(Float32Array, 4096), z: new Grow(Float32Array, 4096), h: new Grow(Float32Array, 4096),
        r: new Grow(Float32Array, 4096), wf: new Grow(Float32Array, 4096), al: new Grow(Uint8Array, 4096),
        col: new Grow(Uint32Array, 4096), lay: new Grow(Uint16Array, 4096), ent: new Grow(Uint32Array, 4096), str: []
      };
      this.IN = {
        blk: new Grow(Uint32Array, 4096), m: new Grow(Float32Array, 6 * 4096), z: new Grow(Float32Array, 2 * 4096), col: new Grow(Uint32Array, 4096),
        lcol: new Grow(Uint32Array, 4096), lay: new Grow(Uint16Array, 4096), ent: new Grow(Uint32Array, 4096)
      };
    }
    flushEnts() {
      const E = this.E;
      if (E.type.n) {
        const o = {}; const tr = [];
        for (const k in E) { o[k] = E[k].take(); tr.push(o[k].buffer); E[k].reset(); }
        this.post('ents', o, tr);
      }
    }
    flushTexts() {
      const X = this.TX;
      if (X.x.n) {
        const o = {}; const tr = [];
        for (const k in X) { if (k === 'str') continue; o[k] = X[k].take(); tr.push(o[k].buffer); X[k].reset(); }
        o.str = X.str; X.str = [];
        this.post('texts', o, tr);
      }
    }
    flushInst() {
      const I = this.IN;
      if (I.blk.n) {
        const o = {}; const tr = [];
        for (const k in I) { o[k] = I[k].take(); tr.push(o[k].buffer); I[k].reset(); }
        this.post('inst', o, tr);
      }
    }

    setOrigin(x, y) {
      this.hasOrigin = true;
      this.ox = Math.round(x / 1000) * 1000; this.oy = Math.round(y / 1000) * 1000;
      if (!isFinite(this.ox)) this.ox = 0; if (!isFinite(this.oy)) this.oy = 0;
    }

    // ── varlık başlangıcı/bitişi
    begin(type, layerName, aci, tc) {
      const li = this.layerIdx(layerName);
      const L = this.layers[li];
      const inB = this.target !== null, isL0 = li === this.layer0;
      let col, lay, lcol;
      if (inB && isL0) { lay = 65535; lcol = C_LAYERCOL; } else { lay = li; lcol = L.rgba; }
      if (aci === undefined || aci === null) aci = 256;
      if (tc >= 0) col = trueToRgba(tc);
      else if (aci === 256) col = (inB && isL0) ? C_LAYERCOL : L.rgba;
      else if (aci === 0) col = inB ? C_BYBLOCK : FG;
      else col = aciToRgba(aci);
      this.cCol = col; this.cLay = lay; this.cLcol = lcol; this.cType = type; this.cAci = aci;
      this.cFlags = (tc < 0 && aci === 256) ? F_BYLAYER : 0;
      this.cLi = li; this.thick = 0;
      if (!inB) {
        const c = this.ch;
        this.eVs = c.pos.n >> 1; this.ePs = c.ppos.n >> 1; this.eRs = c.tpos.n >> 1; this.eTs = this.textCount; this.eIs = this.instCount;
        this.ebb = [Infinity, Infinity, -Infinity, -Infinity];
        this.ez0 = Infinity; this.ez1 = -Infinity;
        this.eNoBB = false;
      }
      this.stats[TYPE_NAMES[type] || type] = (this.stats[TYPE_NAMES[type] || type] || 0) + 1;
    }
    end(fs, fe) {
      if (this.target !== null) return -1;
      const c = this.ch;
      const nv = (c.pos.n >> 1) - this.eVs, np = (c.ppos.n >> 1) - this.ePs, nr = (c.tpos.n >> 1) - this.eRs;
      const nt = this.textCount - this.eTs, ni = this.instCount - this.eIs;
      if (nv === 0 && np === 0 && nt === 0 && ni === 0 && nr === 0) return -1;
      const E = this.E, id = this.entCount++;
      let flags = this.cFlags;
      E.type.push(this.cType); E.layer.push(this.cLi); E.color.push(this.cCol); E.aci.push(this.cAci);
      const bb = this.ebb;
      if (this.eNoBB) flags |= F_NOBBOX;
      E.bb.push(bb[0]); E.bb.push(bb[1]); E.bb.push(bb[2]); E.bb.push(bb[3]);
      if (this.ez0 <= this.ez1) { E.zr.push(this.ez0); E.zr.push(this.ez1); } else { E.zr.push(0); E.zr.push(0); }
      E.chunk.push(this.chunkIdx);
      if (nv > 0) { E.vs.push(this.eVs); E.vc.push(nv); }
      else { E.vs.push(this.ePs); E.vc.push(np); if (np > 0) flags |= F_POINTS; }
      E.flags.push(flags);
      E.is.push(this.eIs); E.ic.push(ni); E.ts.push(this.eTs); E.tc.push(nt);
      E.fs.push(fs); E.fe.push(fe); E.rs.push(this.eRs); E.rc.push(nr);
      if (isFinite(bb[0])) {
        const x = this.ext;
        if (bb[0] < x[0]) x[0] = bb[0]; if (bb[1] < x[1]) x[1] = bb[1]; if (bb[2] > x[2]) x[2] = bb[2]; if (bb[3] > x[3]) x[3] = bb[3];
      }
      if ((c.pos.n >> 1) >= SOFT_CHUNK || (c.ppos.n >> 1) >= SOFT_CHUNK || (c.tpos.n >> 1) >= SOFT_CHUNK) this.flushChunk();
      if (E.type.n >= ENT_BATCH) this.flushEnts();
      return id;
    }

    // ── geometri ilkelleri (koordinatlar mutlak WCS)
    // z1/z2 verilmezse geçerli varlığın kotu (this.cz) kullanılır.
    // Kalınlık (thick) varsa üst kenar ve iki üçgenlik duvar da üretilir.
    seg(x1, y1, x2, y2, z1, z2) {
      if (z1 === undefined) z1 = this.cz;
      if (z2 === undefined) z2 = z1;
      if (!isFinite(z1)) z1 = 0; if (!isFinite(z2)) z2 = 0;
      this.seg0(x1, y1, x2, y2, z1, z2);
      const t = this.thick;
      if (t) {
        this.seg0(x1, y1, x2, y2, z1 + t, z2 + t);
        this.tri(x1, y1, z1, x2, y2, z2, x2, y2, z2 + t);
        this.tri(x1, y1, z1, x2, y2, z2 + t, x1, y1, z1 + t);
      }
    }
    // kalınlıklı nesnelerde köşe çizgisi
    vert(x, y, z) { if (this.thick) this.seg0(x, y, x, y, z, z + this.thick); }
    seg0(x1, y1, x2, y2, z1, z2) {
      const d = this.target;
      if (d === null) {
        if (!this.hasOrigin) this.setOrigin(x1, y1);
        x1 -= this.ox; y1 -= this.oy; x2 -= this.ox; y2 -= this.oy;
        if (!(isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2))) return;
        const c = this.ch, P = c.pos;
        if (P.n + 4 > P.a.length) P.ensure(4);
        const a = P.a; let n = P.n;
        a[n] = x1; a[n + 1] = y1; a[n + 2] = x2; a[n + 3] = y2; P.n = n + 4;
        const C = c.col; if (C.n + 2 > C.a.length) C.ensure(2); C.a[C.n++] = this.cCol; C.a[C.n++] = this.cCol;
        const L = c.lay; if (L.n + 2 > L.a.length) L.ensure(2); L.a[L.n++] = this.cLay; L.a[L.n++] = this.cLay;
        const Z = c.z; if (Z.n + 2 > Z.a.length) Z.ensure(2); Z.a[Z.n++] = z1; Z.a[Z.n++] = z2;
        const b = this.ebb;
        if (x1 < b[0]) b[0] = x1; if (x1 > b[2]) b[2] = x1; if (y1 < b[1]) b[1] = y1; if (y1 > b[3]) b[3] = y1;
        if (x2 < b[0]) b[0] = x2; if (x2 > b[2]) b[2] = x2; if (y2 < b[1]) b[1] = y2; if (y2 > b[3]) b[3] = y2;
        if (z1 < this.ez0) this.ez0 = z1; if (z1 > this.ez1) this.ez1 = z1; if (z2 < this.ez0) this.ez0 = z2; if (z2 > this.ez1) this.ez1 = z2;
      } else {
        if (d.paper) return;
        x1 -= d.bx; y1 -= d.by; x2 -= d.bx; y2 -= d.by; z1 -= d.bz; z2 -= d.bz;
        if (!(isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2))) return;
        const P = d.pos; P.ensure(4); P.a[P.n++] = x1; P.a[P.n++] = y1; P.a[P.n++] = x2; P.a[P.n++] = y2;
        d.col.ensure(2); d.col.a[d.col.n++] = this.cCol; d.col.a[d.col.n++] = this.cCol;
        d.lay.ensure(2); d.lay.a[d.lay.n++] = this.cLay; d.lay.a[d.lay.n++] = this.cLay;
        d.z.ensure(2); d.z.a[d.z.n++] = z1; d.z.a[d.z.n++] = z2;
        const b = d.bb;
        if (x1 < b[0]) b[0] = x1; if (x1 > b[2]) b[2] = x1; if (y1 < b[1]) b[1] = y1; if (y1 > b[3]) b[3] = y1;
        if (x2 < b[0]) b[0] = x2; if (x2 > b[2]) b[2] = x2; if (y2 < b[1]) b[1] = y2; if (y2 > b[3]) b[3] = y2;
        const zb = d.zb; if (z1 < zb[0]) zb[0] = z1; if (z1 > zb[1]) zb[1] = z1; if (z2 < zb[0]) zb[0] = z2; if (z2 > zb[1]) zb[1] = z2;
      }
    }
    tri(x1, y1, z1, x2, y2, z2, x3, y3, z3) {
      if (!(isFinite(z1) && isFinite(z2) && isFinite(z3))) return;
      const d = this.target;
      const T = d === null ? this.ch : d;
      if (d === null) {
        if (!this.hasOrigin) this.setOrigin(x1, y1);
        x1 -= this.ox; y1 -= this.oy; x2 -= this.ox; y2 -= this.oy; x3 -= this.ox; y3 -= this.oy;
      } else {
        if (d.paper) return;
        x1 -= d.bx; y1 -= d.by; x2 -= d.bx; y2 -= d.by; x3 -= d.bx; y3 -= d.by; z1 -= d.bz; z2 -= d.bz; z3 -= d.bz;
      }
      if (!(isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2) && isFinite(x3) && isFinite(y3))) return;
      const P = T.tpos; P.ensure(6); P.a[P.n++] = x1; P.a[P.n++] = y1; P.a[P.n++] = x2; P.a[P.n++] = y2; P.a[P.n++] = x3; P.a[P.n++] = y3;
      T.tz.ensure(3); T.tz.a[T.tz.n++] = z1; T.tz.a[T.tz.n++] = z2; T.tz.a[T.tz.n++] = z3;
      T.tcol.ensure(3); T.tcol.a[T.tcol.n++] = this.cCol; T.tcol.a[T.tcol.n++] = this.cCol; T.tcol.a[T.tcol.n++] = this.cCol;
      T.tlay.ensure(3); T.tlay.a[T.tlay.n++] = this.cLay; T.tlay.a[T.tlay.n++] = this.cLay; T.tlay.a[T.tlay.n++] = this.cLay;
      const b = d === null ? this.ebb : d.bb;
      for (const [x, y] of [[x1, y1], [x2, y2], [x3, y3]]) { if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y; }
      if (d === null) { this.ez0 = Math.min(this.ez0, z1, z2, z3); this.ez1 = Math.max(this.ez1, z1, z2, z3); }
      else { d.zb[0] = Math.min(d.zb[0], z1, z2, z3); d.zb[1] = Math.max(d.zb[1], z1, z2, z3); }
    }
    // dörtgen (a,b,c,d sırasıyla çevre) → iki üçgen
    quad(P) {
      this.tri(P[0][0], P[0][1], P[0][2], P[1][0], P[1][1], P[1][2], P[2][0], P[2][1], P[2][2]);
      if (P.length > 3) this.tri(P[0][0], P[0][1], P[0][2], P[2][0], P[2][1], P[2][2], P[3][0], P[3][1], P[3][2]);
    }
    pt(x, y, z) {
      if (z === undefined) z = this.cz;
      if (!isFinite(z)) z = 0;
      const d = this.target;
      if (d === null) {
        if (!this.hasOrigin) this.setOrigin(x, y);
        x -= this.ox; y -= this.oy;
        if (!(isFinite(x) && isFinite(y))) return;
        const c = this.ch; c.ppos.ensure(2); c.ppos.a[c.ppos.n++] = x; c.ppos.a[c.ppos.n++] = y;
        c.pcol.push(this.cCol); c.play.push(this.cLay); c.pz.push(z);
        const b = this.ebb; if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y;
        if (z < this.ez0) this.ez0 = z; if (z > this.ez1) this.ez1 = z;
      } else {
        if (d.paper) return;
        x -= d.bx; y -= d.by; z -= d.bz;
        d.ppos.ensure(2); d.ppos.a[d.ppos.n++] = x; d.ppos.a[d.ppos.n++] = y; d.pcol.push(this.cCol); d.play.push(this.cLay); d.pz.push(z);
        const b = d.bb; if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y;
        const zb = d.zb; if (z < zb[0]) zb[0] = z; if (z > zb[1]) zb[1] = z;
      }
    }
    // align: yatay (0 sol,1 orta,2 sağ) + 4*dikey (0 taban,1 alt,2 orta,3 üst) ; +64 çok satırlı (MTEXT)
    text(x, y, h, rot, align, str, wf, colOv, layOv) {
      if (!str) return;
      const d = this.target;
      const col = colOv !== undefined ? colOv : this.cCol, lay = layOv !== undefined ? layOv : this.cLay;
      if (!(h > 0)) h = 1;
      let z = this.cz; if (!isFinite(z)) z = 0;
      if (d === null) {
        if (!this.hasOrigin) this.setOrigin(x, y);
        x -= this.ox; y -= this.oy;
        if (!(isFinite(x) && isFinite(y))) return;
        this.pushText(x, y, z, h, rot, align, str, wf || 1, col, lay, this.entCount);
        textBBox(x, y, h, rot, align, str, wf || 1, this.ebb);
        if (z < this.ez0) this.ez0 = z; if (z > this.ez1) this.ez1 = z;
      } else {
        if (d.paper) return;
        z -= d.bz;
        d.texts.push({ x: x - d.bx, y: y - d.by, z, h, rot, align, str, wf: wf || 1, col, lay });
        const zb = d.zb; if (z < zb[0]) zb[0] = z; if (z > zb[1]) zb[1] = z;
      }
    }
    pushText(x, y, z, h, rot, align, str, wf, col, lay, ent) {
      const X = this.TX;
      X.x.push(x); X.y.push(y); X.z.push(z); X.h.push(h); X.r.push(rot); X.wf.push(wf); X.al.push(align);
      X.col.push(col); X.lay.push(lay); X.ent.push(ent); X.str.push(str);
      this.textCount++;
      if (X.x.n >= TXT_BATCH) this.flushTexts();
    }
    // Blok referansı: dünya = M·yerel + t   (yerel koordinatlar blok taban noktasına göre)
    // Z: dünya = sz·z_yerel + tz
    inst(bi, a, b, c, d, tx, ty, sz, tz) {
      if (sz === undefined || !isFinite(sz)) sz = 1;
      if (tz === undefined || !isFinite(tz)) tz = 0;
      const D = this.target;
      if (D === null) {
        if (!this.hasOrigin) this.setOrigin(tx, ty);
        const rx = tx - this.ox, ry = ty - this.oy;
        const I = this.IN;
        I.blk.push(bi); I.m.ensure(6);
        I.m.a[I.m.n++] = a; I.m.a[I.m.n++] = b; I.m.a[I.m.n++] = rx; I.m.a[I.m.n++] = c; I.m.a[I.m.n++] = d; I.m.a[I.m.n++] = ry;
        I.z.ensure(2); I.z.a[I.z.n++] = sz; I.z.a[I.z.n++] = tz;
        I.col.push(this.cCol); I.lcol.push(this.cLcol); I.lay.push(this.cLay); I.ent.push(this.entCount);
        this.instCount++;
        const B = this.blocks[bi];
        if (B.defined && B.flat) {
          const bb = B.bb;
          if (isFinite(bb[0])) {
            const e = this.ebb;
            for (let k = 0; k < 4; k++) {
              const x = (k & 1) ? bb[2] : bb[0], y = (k & 2) ? bb[3] : bb[1];
              const X = a * x + b * y + rx, Y = c * x + d * y + ry;
              if (X < e[0]) e[0] = X; if (X > e[2]) e[2] = X; if (Y < e[1]) e[1] = Y; if (Y > e[3]) e[3] = Y;
            }
          }
          if (B.zb[0] <= B.zb[1]) {
            const za = sz * B.zb[0] + tz, zc = sz * B.zb[1] + tz;
            this.ez0 = Math.min(this.ez0, za, zc); this.ez1 = Math.max(this.ez1, za, zc);
          } else { this.ez0 = Math.min(this.ez0, tz); this.ez1 = Math.max(this.ez1, tz); }
          // bloğun yazılarını dünyaya aç
          if (B.texts.length && this.blockTextTotal < MAX_BLOCK_TEXTS) {
            const sc = Math.hypot(b, d), ang = Math.atan2(c, a);
            for (const t of B.texts) {
              let col = t.col; const f = col >>> 24;
              if (f === A_BYBLOCK) col = this.cCol; else if (f === A_LAYERCOL) col = this.cLcol;
              const X = a * t.x + b * t.y + rx, Y = c * t.x + d * t.y + ry;
              this.pushText(X, Y, sz * t.z + tz, t.h * sc, t.rot + ang, t.align, t.str, t.wf, col, t.lay === 65535 ? this.cLay : t.lay, this.entCount);
              textBBox(X, Y, t.h * sc, t.rot + ang, t.align, t.str, t.wf, this.ebb);
            }
            this.blockTextTotal += B.texts.length;
            if (this.blockTextTotal >= MAX_BLOCK_TEXTS) this.warn('Bloklardaki yazıların bir kısmı gösterilmiyor (sınır aşıldı).');
          }
        } else this.eNoBB = true;
        if (I.blk.n >= INST_BATCH) this.flushInst();
      } else {
        if (D.paper) return;
        D.inserts.push({ bi, a, b, c, d, tx: tx - D.bx, ty: ty - D.by, sz, tz: tz - D.bz, col: this.cCol, lcol: this.cLcol, lay: this.cLay });
      }
    }

    // Yardımcı eğriler
    arcSweep(cx, cy, r, a0, sweep, x1, y1, x2, y2) {
      const n = Math.max(2, Math.ceil(Math.abs(sweep) / (2 * Math.PI) * this.SEG));
      let px = x1 !== undefined ? x1 : cx + r * Math.cos(a0), py = y1 !== undefined ? y1 : cy + r * Math.sin(a0);
      for (let i = 1; i <= n; i++) {
        let x, y;
        if (i === n && x2 !== undefined) { x = x2; y = y2; }
        else { const a = a0 + sweep * i / n; x = cx + r * Math.cos(a); y = cy + r * Math.sin(a); }
        this.seg(px, py, x, y); px = x; py = y;
      }
    }
    bulgeSeg(x1, y1, x2, y2, b) {
      if (!b || Math.abs(b) < 1e-10) { this.seg(x1, y1, x2, y2); return; }
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
      if (d < 1e-12) return;
      const th = 4 * Math.atan(b);
      const off = (d / 2) / Math.tan(th / 2);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, nx = -dy / d, ny = dx / d;
      const cx = mx + nx * off, cy = my + ny * off, r = Math.abs((d / 2) / Math.sin(th / 2));
      this.arcSweep(cx, cy, r, Math.atan2(y1 - cy, x1 - cx), th, x1, y1, x2, y2);
    }
    poly(xs, ys, bs, n, closed, zs) {
      if (zs) { // 3B çoklu çizgi: her köşenin kendi Z'si, yay yok
        for (let i = 0; i + 1 < n; i++) this.seg(xs[i], ys[i], xs[i + 1], ys[i + 1], zs[i], zs[i + 1]);
        if (closed && n > 2) this.seg(xs[n - 1], ys[n - 1], xs[0], ys[0], zs[n - 1], zs[0]);
        return;
      }
      if (this.thick) for (let i = 0; i < n; i++) this.vert(xs[i], ys[i], this.cz);
      for (let i = 0; i + 1 < n; i++) this.bulgeSeg(xs[i], ys[i], xs[i + 1], ys[i + 1], bs ? bs[i] : 0);
      if (closed && n > 2) this.bulgeSeg(xs[n - 1], ys[n - 1], xs[0], ys[0], bs ? bs[n - 1] : 0);
      else if (closed && n === 2 && bs && bs[1]) this.bulgeSeg(xs[1], ys[1], xs[0], ys[0], bs[1]);
    }
  }

  // Yazı için yaklaşık sınır kutusu
  function textBBox(x, y, h, rot, align, str, wf, bb) {
    let lines = 1, maxLen = 0, cur = 0;
    for (let i = 0; i < str.length; i++) { if (str.charCodeAt(i) === 10) { lines++; if (cur > maxLen) maxLen = cur; cur = 0; } else cur++; }
    if (cur > maxLen) maxLen = cur;
    const w = h * 0.62 * maxLen * (wf || 1), H = h * (1 + 1.66 * (lines - 1));
    const ha = align & 3, va = (align >> 2) & 3, multi = (align & 64) !== 0;
    let x0 = ha === 1 ? -w / 2 : ha === 2 ? -w : 0;
    let y0;
    if (multi) y0 = va === 3 ? -H : va === 2 ? -H / 2 : 0;
    else y0 = va === 3 ? -h : va === 2 ? -h / 2 : 0;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let k = 0; k < 4; k++) {
      const lx = x0 + ((k & 1) ? w : 0), ly = y0 + ((k & 2) ? H : 0);
      const X = x + lx * c - ly * s, Y = y + lx * s + ly * c;
      if (X < bb[0]) bb[0] = X; if (X > bb[2]) bb[2] = X; if (Y < bb[1]) bb[1] = Y; if (Y > bb[3]) bb[3] = Y;
    }
  }

  // B-spline (de Boor), rasyonel destekli
  function evalSpline(deg, cx, cy, w, knots, samples, out, cz) {
    const n = cx.length;
    if (n < 2) return false;
    if (deg < 1 || knots.length !== n + deg + 1) return false;
    const t0 = knots[deg], t1 = knots[n];
    if (!(t1 > t0)) return false;
    const dx = new Float64Array(deg + 1), dy = new Float64Array(deg + 1), dw = new Float64Array(deg + 1), dz = new Float64Array(deg + 1);
    let k = deg;
    for (let s = 0; s <= samples; s++) {
      const t = s === samples ? t1 : t0 + (t1 - t0) * s / samples;
      while (k < n - 1 && t >= knots[k + 1]) k++;
      for (let j = 0; j <= deg; j++) {
        const i = k - deg + j, ww = w ? w[i] : 1;
        dx[j] = cx[i] * ww; dy[j] = cy[i] * ww; dw[j] = ww; if (cz) dz[j] = cz[i] * ww;
      }
      for (let r = 1; r <= deg; r++) {
        for (let j = deg; j >= r; j--) {
          const i = k - deg + j;
          const den = knots[i + deg - r + 1] - knots[i];
          const a = den === 0 ? 0 : (t - knots[i]) / den;
          dx[j] = (1 - a) * dx[j - 1] + a * dx[j]; dy[j] = (1 - a) * dy[j - 1] + a * dy[j]; dw[j] = (1 - a) * dw[j - 1] + a * dw[j];
          if (cz) dz[j] = (1 - a) * dz[j - 1] + a * dz[j];
        }
      }
      if (cz) out.push(dx[deg] / dw[deg], dy[deg] / dw[deg], dz[deg] / dw[deg]);
      else out.push(dx[deg] / dw[deg], dy[deg] / dw[deg]);
    }
    return true;
  }

  // ───────────────────────── Ayrıştırıcı durum makinesi ─────────────────────────
  const S_NONE = 0, S_HEADER = 1, S_TABLES = 2, S_BLOCKS = 3, S_ENT = 4, S_OTHER = 5;
  const DEG = Math.PI / 180;

  class EntAcc { // tek varlığın grup kodları
    constructor() { this.codes = new Int16Array(4096); this.vals = new Float64Array(4096); this.strs = []; this.reset('', 0); }
    reset(type, fs) {
      this.type = type; this.fs = fs; this.n = 0; this.layer = '0'; this.color = 256; this.tcolor = -1;
      this.strs.length = 0; this.name = ''; this.ps = 0; this.attf = 0; this.handle = '';
    }
    push(code, v) {
      if (this.n >= this.codes.length) {
        const c = new Int16Array(this.codes.length * 2); c.set(this.codes); this.codes = c;
        const w = new Float64Array(this.vals.length * 2); w.set(this.vals); this.vals = w;
      }
      this.codes[this.n] = code; this.vals[this.n++] = v;
    }
    get(code, def) { const C = this.codes; for (let i = 0; i < this.n; i++) if (C[i] === code) return this.vals[i]; return def; }
    has(code) { const C = this.codes; for (let i = 0; i < this.n; i++) if (C[i] === code) return true; return false; }
    all(code) { const r = []; const C = this.codes; for (let i = 0; i < this.n; i++) if (C[i] === code) r.push(this.vals[i]); return r; }
    text() { return this.strs.join(''); }
  }

  class Parser {
    constructor(B, tok) {
      this.B = B; this.tk = tok; tok.handler = this;
      this.sec = S_NONE; this.expectName = false; this.inObj = false; this.hv = '';
      this.E = new EntAcc();
      this.poly = null; this.pins = null;
      this.version = ''; this.codepage = ''; this.handseed = null; this.handseedHex = ''; this.units = 0;
      this.entStart = -1; this.entEnd = -1; this.modelHandle = ''; this.firstOwner = '';
      this.curTable = ''; this.layerTableHandle = ''; this.layerEnd = -1;
      this.eof = false;
      this.xs = []; this.ys = []; this.bs = [];
    }
    pair(code, off) {
      const tk = this.tk;
      if (code === 0) { this.zero(tk.str().trim(), off); return; }
      if (this.expectName) { if (code === 2) this.section(tk.str().trim().toUpperCase()); this.expectName = false; return; }
      if (this.sec === S_HEADER) { if (code === 9) this.hv = tk.str().trim(); else this.headerVal(code); return; }
      if (!this.inObj) return;
      const E = this.E;
      if ((code >= 10 && code <= 59) || (code >= 70 && code <= 99) || (code >= 210 && code <= 239)) { E.push(code, tk.num()); return; }
      switch (code) {
        case 8: E.layer = tk.str(); break;
        case 62: E.color = tk.num() | 0; break;
        case 420: E.tcolor = tk.num() | 0; break;
        case 1: case 3: E.strs.push(tk.str()); break;
        case 2: E.name = tk.str(); break;
        case 67: E.ps = tk.num() | 0; break;
        case 66: E.attf = tk.num() | 0; break;
        case 5: if (this.sec === S_TABLES) E.handle = tk.str().trim(); break;
        case 330: if (this.sec === S_ENT && !this.firstOwner) this.firstOwner = tk.str().trim(); break;
      }
    }
    headerVal(code) {
      const v = this.hv, tk = this.tk;
      if (v === '$ACADVER' && code === 1) this.version = tk.str().trim();
      else if (v === '$DWGCODEPAGE' && code === 3) this.codepage = tk.str().trim();
      else if (v === '$HANDSEED' && code === 5) { this.handseed = tk.vabs(); this.handseedHex = tk.str().trim(); }
      else if (v === '$INSUNITS' && code === 70) this.units = tk.num() | 0;
    }
    section(name) {
      this.sec = name === 'HEADER' ? S_HEADER : name === 'TABLES' ? S_TABLES : name === 'BLOCKS' ? S_BLOCKS : name === 'ENTITIES' ? S_ENT : S_OTHER;
      this.inObj = false;
    }
    zero(v, off) {
      this.finish(off);
      this.inObj = false;
      if (v === 'SECTION') { this.expectName = true; this.sec = S_NONE; return; }
      if (v === 'ENDSEC') {
        if (this.sec === S_HEADER) this.tk.setDecoder(codepageLabel(this.codepage, this.version));
        if (this.sec === S_ENT) { this.flushPending(off); if (this.entStart < 0) this.entStart = off; this.entEnd = off; }
        if (this.sec === S_BLOCKS) { this.flushPending(off); this.B.endBlock(); this.B.blocksDone(); }
        if (this.sec === S_TABLES) this.B.postLayers();
        this.sec = S_NONE; return;
      }
      if (v === 'EOF') { this.flushPending(off); this.eof = true; this.tk.stop = true; return; }
      if (v === 'ENDTAB' && this.sec === S_TABLES && this.curTable === 'LAYER' && this.layerEnd < 0) this.layerEnd = off;
      if (this.sec === S_ENT || this.sec === S_BLOCKS || this.sec === S_TABLES) {
        if (this.sec === S_ENT && this.entStart < 0) this.entStart = off;
        this.E.reset(v, off); this.inObj = true;
      }
    }
    finish(off) {
      if (!this.inObj) return;
      const E = this.E;
      if (this.sec === S_TABLES) {
        if (E.type === 'TABLE') { this.curTable = E.name.trim().toUpperCase(); if (this.curTable === 'LAYER') this.layerTableHandle = E.handle; }
        else if (E.type === 'LAYER') this.B.addLayer(E.name, E.color === 256 ? 7 : E.color, E.get(70, 0) | 0, E.tcolor);
        else if (E.type === 'BLOCK_RECORD' && E.name.toUpperCase() === '*MODEL_SPACE') this.modelHandle = E.handle;
        return;
      }
      if (this.sec === S_BLOCKS) {
        if (E.type === 'BLOCK') { this.flushPending(E.fs); this.B.beginBlock(E.name, E.get(10, 0), E.get(20, 0), E.get(30, 0)); return; }
        if (E.type === 'ENDBLK') { this.flushPending(E.fs); this.B.endBlock(); return; }
        if (this.B.target === null || this.B.skipping) return;
        this.entity(E, off);
        return;
      }
      if (this.sec === S_ENT) {
        if (E.ps === 1) { if (E.type !== 'VERTEX' && E.type !== 'SEQEND' && E.type !== 'ATTRIB') this.flushPending(E.fs); return; }
        this.entity(E, off);
      }
    }
    flushPending(off) {
      if (this.poly) { const p = this.poly; this.poly = null; this.emitPoly(p, off); }
      if (this.pins) { const p = this.pins; this.pins = null; this.emitInsert(p, off); }
    }
    entity(E, off) {
      const t = E.type;
      if (this.poly) {
        if (t === 'VERTEX') { this.polyVertex(E); return; }
        if (t === 'SEQEND') { const p = this.poly; this.poly = null; this.emitPoly(p, off); return; }
        const p = this.poly; this.poly = null; this.emitPoly(p, E.fs);
      }
      if (this.pins) {
        if (t === 'ATTRIB') { if (!(E.get(70, 0) & 1)) this.pins.attribs.push(this.textData(E, true)); return; }
        if (t === 'SEQEND') { const p = this.pins; this.pins = null; this.emitInsert(p, off); return; }
        const p = this.pins; this.pins = null; this.emitInsert(p, E.fs);
      }
      if (t === 'POLYLINE') {
        this.poly = { fs: E.fs, flags: E.get(70, 0) | 0, layer: E.layer, color: E.color, tcolor: E.tcolor, flip: E.get(230, 1) < 0,
          m: E.get(71, 0) | 0, n: E.get(72, 0) | 0, elev: E.get(30, 0), thick: E.get(39, 0), xs: [], ys: [], zs: [], bs: [], faces: [] };
        return;
      }
      if ((t === 'INSERT' || t === 'ACAD_TABLE') && E.attf === 1) { this.pins = this.insertData(E); return; }
      if (t === 'INSERT' || t === 'ACAD_TABLE') { this.emitInsert(this.insertData(E), off); return; }
      if (t === 'VERTEX' || t === 'SEQEND' || t === 'ATTRIB') return;
      this.emitSimple(E, off);
    }
    polyVertex(E) {
      const p = this.poly, vf = E.get(70, 0) | 0;
      if ((p.flags & 64) && (vf & 128) && !(vf & 64)) {
        p.faces.push(E.get(71, 0) | 0, E.get(72, 0) | 0, E.get(73, 0) | 0, E.get(74, 0) | 0);
      } else { p.xs.push(E.get(10, 0)); p.ys.push(E.get(20, 0)); p.zs.push(E.get(30, 0)); p.bs.push(E.get(42, 0)); }
    }
    emitPoly(p, fe) {
      const B = this.B;
      B.begin(T.POLYLINE, p.layer, p.color, p.tcolor);
      const is3d = (p.flags & (8 | 16 | 64)) !== 0;
      const xs = p.xs, ys = p.ys, zs = p.zs, n = xs.length;
      if (p.flip && !is3d) for (let i = 0; i < n; i++) xs[i] = -xs[i];
      B.cz = is3d ? 0 : (p.flip ? -p.elev : p.elev);
      if (!is3d && p.thick) B.thick = p.flip ? -p.thick : p.thick;
      if (p.flags & 64) {
        // çokyüzlü kafes: negatif indis = görünmez kenar
        const F = p.faces;
        for (let i = 0; i < F.length; i += 4) {
          const idx = [], vis = [];
          for (let k = 0; k < 4; k++) { const r = F[i + k], v = Math.abs(r); if (v > 0 && v <= n) { idx.push(v - 1); vis.push(r > 0); } }
          for (let k = 0; k < idx.length && idx.length > 1; k++) {
            const a = idx[k], b = idx[(k + 1) % idx.length];
            if (idx.length === 2 && k === 1) break;
            if (vis[k]) B.seg(xs[a], ys[a], xs[b], ys[b], zs[a], zs[b]);
          }
          for (let k = 1; k + 1 < idx.length; k++) {
            const a = idx[0], b = idx[k], c = idx[k + 1];
            B.tri(xs[a], ys[a], zs[a], xs[b], ys[b], zs[b], xs[c], ys[c], zs[c]);
          }
        }
      } else if (p.flags & 16) {
        // M×N ızgara kafes
        const M = p.m, N = p.n;
        if (M * N <= n && M > 0 && N > 0) {
          const V = (k) => [xs[k], ys[k], zs[k]];
          for (let i = 0; i < M; i++) for (let j = 0; j < N; j++) {
            const a = i * N + j;
            if (j + 1 < N) B.seg(xs[a], ys[a], xs[a + 1], ys[a + 1], zs[a], zs[a + 1]); else if (p.flags & 32) B.seg(xs[a], ys[a], xs[i * N], ys[i * N], zs[a], zs[i * N]);
            if (i + 1 < M) B.seg(xs[a], ys[a], xs[a + N], ys[a + N], zs[a], zs[a + N]); else if (p.flags & 1) B.seg(xs[a], ys[a], xs[j], ys[j], zs[a], zs[j]);
            const i2 = i + 1 < M ? i + 1 : ((p.flags & 1) ? 0 : -1), j2 = j + 1 < N ? j + 1 : ((p.flags & 32) ? 0 : -1);
            if (i2 >= 0 && j2 >= 0) B.quad([V(a), V(i * N + j2), V(i2 * N + j2), V(i2 * N + j)]);
          }
        }
      } else {
        const bs = p.bs;
        if (p.flip && !is3d) for (let i = 0; i < n; i++) bs[i] = -bs[i];
        B.poly(xs, ys, is3d ? null : bs, n, (p.flags & 1) !== 0, is3d ? zs : null);
      }
      B.end(p.fs, fe);
    }
    textData(E, isAttrib) {
      const tag = E.type === 'ATTDEF';
      let str = tag ? E.name : E.text();
      str = decodeDxfString(str);
      let x = E.get(10, 0), y = E.get(20, 0), z = E.get(30, 0), h = E.get(40, 1), rot = E.get(50, 0) * DEG, wf = E.get(41, 1);
      const hj = E.get(72, 0) | 0, vj = (isAttrib || tag) ? (E.get(74, 0) | 0) : (E.get(73, 0) | 0);
      let ha = 0, va = 0;
      if (hj === 3 || hj === 5) {
        if (E.has(11)) { const x2 = E.get(11, x), y2 = E.get(21, y); if (x2 !== x || y2 !== y) rot = Math.atan2(y2 - y, x2 - x); }
      } else if (hj === 4) { ha = 1; va = 2; if (E.has(11)) { x = E.get(11, x); y = E.get(21, y); } }
      else {
        ha = hj > 2 ? 0 : hj; va = vj;
        if ((hj !== 0 || vj !== 0) && E.has(11)) { x = E.get(11, x); y = E.get(21, y); }
      }
      if (E.get(230, 1) < 0) { x = -x; z = -z; rot = Math.PI - rot; }
      return { x, y, z, h, rot, align: ha + 4 * va, str, wf, layer: E.layer, color: E.color, tcolor: E.tcolor };
    }
    insertData(E) {
      return {
        type: E.type === 'ACAD_TABLE' ? T.ACAD_TABLE : T.INSERT, fs: E.fs, name: E.name, layer: E.layer, color: E.color, tcolor: E.tcolor,
        px: E.get(10, 0), py: E.get(20, 0), pz: E.get(30, 0), sx: E.get(41, 1), sy: E.get(42, 1), sz: E.get(43, 1), rot: E.get(50, 0) * DEG,
        cols: Math.max(1, E.get(70, 1) | 0), rows: Math.max(1, E.get(71, 1) | 0), cs: E.get(44, 0), rs: E.get(45, 0),
        flip: E.get(230, 1) < 0, attribs: []
      };
    }
    emitInsert(p, fe) {
      const B = this.B;
      B.begin(p.type, p.layer, p.color, p.tcolor);
      const bi = B.blockIdx(p.name);
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      let a = c * p.sx, b = -s * p.sy, cc = s * p.sx, d = c * p.sy;
      const cols = Math.min(p.cols, 10000), rows = Math.min(p.rows, 10000);
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        const ox = k * p.cs, oy = r * p.rs;
        let px = p.px + c * ox - s * oy, py = p.py + s * ox + c * oy;
        if (p.flip) B.inst(bi, -a, -b, cc, d, -px, py, -p.sz, -p.pz);
        else B.inst(bi, a, b, cc, d, px, py, p.sz, p.pz);
      }
      for (const t of p.attribs) {
        const li = B.layerIdx(t.layer);
        const save = [B.cCol, B.cLay];
        const L = B.layers[li], inB = B.target !== null, isL0 = li === B.layer0;
        let col;
        if (t.tcolor >= 0) col = trueToRgba(t.tcolor);
        else if (t.color === 256) col = (inB && isL0) ? C_LAYERCOL : L.rgba;
        else if (t.color === 0) col = B.cCol;
        else col = aciToRgba(t.color);
        B.cz = t.z;
        B.text(t.x, t.y, t.h, t.rot, t.align, t.str, t.wf, col, (inB && isL0) ? 65535 : li);
        B.cCol = save[0]; B.cLay = save[1];
      }
      B.end(p.fs, fe);
    }
    emitSimple(E, fe) {
      const B = this.B, t = E.type;
      const flip = E.get(230, 1) < 0;
      const fx = flip ? -1 : 1;
      B.cz = fx * E.get(30, 0);   // OCS kotu (yansımış OCS'de Z ters)
      const th = E.get(39, 0) * (E.get(230, 1) < 0 ? -1 : 1);  // kalınlık (çıkış yönünde)
      switch (t) {
        case 'LINE': {
          B.begin(T.LINE, E.layer, E.color, E.tcolor); B.thick = th;
          const x1 = E.get(10, 0), y1 = E.get(20, 0), z1 = E.get(30, 0), x2 = E.get(11, 0), y2 = E.get(21, 0), z2 = E.get(31, 0);
          B.seg(x1, y1, x2, y2, z1, z2); B.vert(x1, y1, z1); B.vert(x2, y2, z2);
          break;
        }
        case 'POINT':
          B.begin(T.POINT, E.layer, E.color, E.tcolor);
          B.pt(E.get(10, 0), E.get(20, 0), E.get(30, 0));
          break;
        case 'CIRCLE': {
          B.begin(T.CIRCLE, E.layer, E.color, E.tcolor); B.thick = th;
          const r = Math.abs(E.get(40, 0));
          if (r > 0) B.arcSweep(fx * E.get(10, 0), E.get(20, 0), r, 0, 2 * Math.PI);
          break;
        }
        case 'ARC': {
          B.begin(T.ARC, E.layer, E.color, E.tcolor); B.thick = th;
          const r = Math.abs(E.get(40, 0));
          let a0 = E.get(50, 0) * DEG, a1 = E.get(51, 360) * DEG;
          if (flip) { const t0 = Math.PI - a1, t1 = Math.PI - a0; a0 = t0; a1 = t1; }
          let sw = a1 - a0; while (sw <= 0) sw += 2 * Math.PI; while (sw > 2 * Math.PI + 1e-9) sw -= 2 * Math.PI;
          if (r > 0) B.arcSweep(fx * E.get(10, 0), E.get(20, 0), r, a0, sw);
          break;
        }
        case 'ELLIPSE': {
          B.begin(T.ELLIPSE, E.layer, E.color, E.tcolor);
          B.cz = E.get(30, 0);
          const cx = E.get(10, 0), cy = E.get(20, 0), mx = E.get(11, 1), my = E.get(21, 0), ratio = E.get(40, 1);
          let t0 = E.get(41, 0), t1 = E.get(42, 2 * Math.PI);
          let sw = t1 - t0; while (sw <= 0) sw += 2 * Math.PI; if (sw > 2 * Math.PI + 1e-9) sw = 2 * Math.PI;
          const nx = flip ? my * ratio : -my * ratio, ny = flip ? -mx * ratio : mx * ratio;
          const n = Math.max(4, Math.ceil(sw / (2 * Math.PI) * B.SEG));
          let px = cx + mx * Math.cos(t0) + nx * Math.sin(t0), py = cy + my * Math.cos(t0) + ny * Math.sin(t0);
          for (let i = 1; i <= n; i++) {
            const a = t0 + sw * i / n, x = cx + mx * Math.cos(a) + nx * Math.sin(a), y = cy + my * Math.cos(a) + ny * Math.sin(a);
            B.seg(px, py, x, y); px = x; py = y;
          }
          break;
        }
        case 'LWPOLYLINE': {
          B.begin(T.LWPOLYLINE, E.layer, E.color, E.tcolor);
          B.cz = fx * E.get(38, 0); B.thick = th;
          const xs = this.xs, ys = this.ys, bs = this.bs; xs.length = 0; ys.length = 0; bs.length = 0;
          const C = E.codes, V = E.vals; let flags = 0;
          for (let i = 0; i < E.n; i++) {
            const c = C[i];
            if (c === 10) { xs.push(fx * V[i]); bs.push(0); }
            else if (c === 20) ys.push(V[i]);
            else if (c === 42) { if (bs.length) bs[bs.length - 1] = flip ? -V[i] : V[i]; }
            else if (c === 70) flags = V[i] | 0;
          }
          const n = Math.min(xs.length, ys.length);
          B.poly(xs, ys, bs, n, (flags & 1) !== 0);
          break;
        }
        case 'SPLINE': {
          B.begin(T.SPLINE, E.layer, E.color, E.tcolor);
          const C = E.codes, V = E.vals;
          const cx = [], cy = [], cz = [], fxs = [], fys = [], fzs = [], kn = [], w = [];
          for (let i = 0; i < E.n; i++) {
            const c = C[i];
            if (c === 10) cx.push(V[i]); else if (c === 20) cy.push(V[i]); else if (c === 30) cz.push(V[i]);
            else if (c === 11) fxs.push(V[i]); else if (c === 21) fys.push(V[i]); else if (c === 31) fzs.push(V[i]);
            else if (c === 40) kn.push(V[i]); else if (c === 41) w.push(V[i]);
          }
          const deg = E.get(71, 3) | 0, flags = E.get(70, 0) | 0;
          const out = [];
          const nc = Math.min(cx.length, cy.length);
          const samples = Math.min(2000, Math.max(16, nc * 8));
          let ok = false;
          while (cz.length < nc) cz.push(0);
          if (nc >= 2) ok = evalSpline(deg, cx.slice(0, nc), cy.slice(0, nc), (w.length === nc && (flags & 4)) ? w : null, kn, samples, out, cz);
          if (!ok) {
            out.length = 0;
            const nf = Math.min(fxs.length, fys.length);
            if (nf >= 2) for (let i = 0; i < nf; i++) out.push(fxs[i], fys[i], fzs[i] || 0);
            else for (let i = 0; i < nc; i++) out.push(cx[i], cy[i], cz[i]);
          }
          for (let i = 3; i < out.length; i += 3) B.seg(out[i - 3], out[i - 2], out[i], out[i + 1], out[i - 1], out[i + 2]);
          break;
        }
        case 'TEXT': case 'ATTDEF': {
          if (t === 'ATTDEF' && (E.get(70, 0) & 1)) return;
          if (t === 'ATTDEF' && B.target !== null) return; // blok içi öznitelik tanımları gösterilmez
          B.begin(t === 'TEXT' ? T.TEXT : T.ATTDEF, E.layer, E.color, E.tcolor);
          const d = this.textData(E, false);
          B.cz = d.z;
          B.text(d.x, d.y, d.h, d.rot, d.align, d.str, d.wf);
          break;
        }
        case 'MTEXT': {
          B.begin(T.MTEXT, E.layer, E.color, E.tcolor);
          B.cz = E.get(30, 0);
          const str = cleanMText(E.text());
          let rot = E.get(50, 0) * DEG;
          if (E.has(11)) rot = Math.atan2(E.get(21, 0), E.get(11, 1));
          const at = E.get(71, 1) | 0;
          const ha = [0, 0, 1, 2, 0, 1, 2, 0, 1, 2][at] || 0, va = [3, 3, 3, 3, 2, 2, 2, 1, 1, 1][at] || 3;
          B.text(E.get(10, 0), E.get(20, 0), E.get(40, 1), rot, ha + 4 * va + 64, str, 1);
          break;
        }
        case 'DIMENSION': case 'ARC_DIMENSION': case 'LARGE_RADIAL_DIMENSION': {
          B.begin(T.DIMENSION, E.layer, E.color, E.tcolor);
          if (E.name) B.inst(B.blockIdx(E.name), 1, 0, 0, 1, 0, 0, 1, 0);
          break;
        }
        case 'SOLID': case 'TRACE': case '3DFACE': {
          B.begin(t === 'SOLID' ? T.SOLID : t === 'TRACE' ? T.TRACE : T['3DFACE'], E.layer, E.color, E.tcolor);
          const k = t === '3DFACE' ? 1 : fx;
          const x = [k * E.get(10, 0), k * E.get(11, 0), k * E.get(12, 0), k * E.get(13, E.get(12, 0))];
          const y = [E.get(20, 0), E.get(21, 0), E.get(22, 0), E.get(23, E.get(22, 0))];
          const z = t === '3DFACE' ? [E.get(30, 0), E.get(31, 0), E.get(32, 0), E.get(33, E.get(32, 0))] : [B.cz, B.cz, B.cz, B.cz];
          const ord = t === '3DFACE' ? [0, 1, 2, 3] : [0, 1, 3, 2];
          const hid = t === '3DFACE' ? (E.get(70, 0) | 0) : 0;   // 3DFACE görünmez kenar bayrakları
          for (let i = 0; i < 4; i++) {
            const a = ord[i], b = ord[(i + 1) % 4];
            if ((hid >> i) & 1) continue;
            if (x[a] !== x[b] || y[a] !== y[b] || z[a] !== z[b]) B.seg(x[a], y[a], x[b], y[b], z[a], z[b]);
          }
          const Q = ord.map(k => [x[k], y[k], z[k]]);
          const same = (u, v) => u[0] === v[0] && u[1] === v[1] && u[2] === v[2];
          B.tri(Q[0][0], Q[0][1], Q[0][2], Q[1][0], Q[1][1], Q[1][2], Q[2][0], Q[2][1], Q[2][2]);
          if (!same(Q[3], Q[2]) && !same(Q[3], Q[0])) B.tri(Q[0][0], Q[0][1], Q[0][2], Q[2][0], Q[2][1], Q[2][2], Q[3][0], Q[3][1], Q[3][2]);
          break;
        }
        case 'LEADER': {
          B.begin(T.LEADER, E.layer, E.color, E.tcolor);
          const xs = E.all(10), ys = E.all(20), zs = E.all(30);
          for (let i = 1; i < Math.min(xs.length, ys.length); i++) B.seg(xs[i - 1], ys[i - 1], xs[i], ys[i], zs[i - 1] || 0, zs[i] || 0);
          break;
        }
        case 'MLINE': {
          B.begin(T.MLINE, E.layer, E.color, E.tcolor);
          const xs = E.all(11), ys = E.all(21), zs = E.all(31);
          for (let i = 1; i < Math.min(xs.length, ys.length); i++) B.seg(xs[i - 1], ys[i - 1], xs[i], ys[i], zs[i - 1] || 0, zs[i] || 0);
          if ((E.get(71, 0) & 2) && xs.length > 2) B.seg(xs[xs.length - 1], ys[ys.length - 1], xs[0], ys[0], zs[xs.length - 1] || 0, zs[0] || 0);
          break;
        }
        case 'MESH': {
          B.begin(T.MESH, E.layer, E.color, E.tcolor);
          if (!this.mesh(E)) { B.unsupported[t] = (B.unsupported[t] || 0) + 1; }
          break;
        }
        case 'HATCH': {
          B.begin(T.HATCH, E.layer, E.color, E.tcolor);
          this.hatch(E, fx);
          break;
        }
        default:
          B.unsupported[t] = (B.unsupported[t] || 0) + 1;
          return;
      }
      B.end(E.fs, fe);
    }
    // MESH: 92 köşe sayısı + 10/20/30 köşeler, 93 yüz listesi boyu + 90 değerleri (n, i1..in)
    mesh(E) {
      const B = this.B, C = E.codes, V = E.vals, N = E.n;
      let i = 0;
      while (i < N && C[i] !== 92) i++;
      if (i >= N) return false;
      const nv = V[i++] | 0, xs = [], ys = [], zs = [];
      while (i < N && xs.length < nv) {
        if (C[i] === 10) xs.push(V[i]); else if (C[i] === 20) ys.push(V[i]); else if (C[i] === 30) zs.push(V[i]); else if (C[i] === 93) break;
        i++;
      }
      while (i < N && C[i] !== 93) i++;
      if (i >= N) return false;
      const nf = V[i++] | 0, F = [];
      while (i < N && F.length < nf) { if (C[i] === 90) F.push(V[i] | 0); i++; }
      const edges = new Set();
      for (let k = 0; k < F.length;) {
        const m = F[k++]; const idx = F.slice(k, k + m).filter(v => v >= 0 && v < xs.length); k += m;
        for (let j = 0; j < idx.length; j++) {
          const a = idx[j], b = idx[(j + 1) % idx.length], key = a < b ? a + ':' + b : b + ':' + a;
          if (!edges.has(key)) { edges.add(key); B.seg(xs[a], ys[a], xs[b], ys[b], zs[a] || 0, zs[b] || 0); }
        }
        for (let j = 1; j + 1 < idx.length; j++) {
          const a = idx[0], b = idx[j], c = idx[j + 1];
          B.tri(xs[a], ys[a], zs[a] || 0, xs[b], ys[b], zs[b] || 0, xs[c], ys[c], zs[c] || 0);
        }
      }
      return true;
    }
    hatch(E, fx) {
      const B = this.B, C = E.codes, V = E.vals, N = E.n;
      let i = 0;
      while (i < N && C[i] !== 91) i++;
      if (i >= N) return;
      const np = V[i++] | 0;
      const next = (code) => { while (i < N && C[i] !== code) i++; return i < N ? V[i++] : 0; };
      for (let p = 0; p < np && i < N; p++) {
        const pf = next(92) | 0;
        if (pf & 2) {
          let hasB = 0;
          while (i < N && C[i] !== 93) { if (C[i] === 72) hasB = V[i]; i++; }
          const nv = (i < N ? V[i++] : 0) | 0;
          const xs = [], ys = [], bs = [];
          for (let v = 0; v < nv && i < N; v++) {
            xs.push(fx * next(10)); ys.push(i < N && C[i] === 20 ? V[i++] : next(20));
            let b = 0; if (hasB && i < N && C[i] === 42) b = V[i++];
            bs.push(fx < 0 ? -b : b);
          }
          B.poly(xs, ys, bs, xs.length, true);
        } else {
          const ne = next(93) | 0;
          for (let e = 0; e < ne && i < N; e++) {
            const et = next(72) | 0;
            if (et === 1) {
              const x1 = next(10), y1 = next(20), x2 = next(11), y2 = next(21);
              B.seg(fx * x1, y1, fx * x2, y2);
            } else if (et === 2) {
              let cx = next(10), cy = next(20); const r = next(40); let a0 = next(50) * DEG, a1 = next(51) * DEG; const ccw = next(73);
              if (!ccw) { const t0 = -a1, t1 = -a0; a0 = t0; a1 = t1; }
              if (fx < 0) { cx = -cx; const t0 = Math.PI - a1, t1 = Math.PI - a0; a0 = t0; a1 = t1; }
              let sw = a1 - a0; while (sw <= 0) sw += 2 * Math.PI; if (sw > 2 * Math.PI + 1e-9) sw = 2 * Math.PI;
              if (r > 0) B.arcSweep(cx, cy, r, a0, sw);
            } else if (et === 3) {
              let cx = next(10), cy = next(20), mx = next(11), my = next(21); const ratio = next(40);
              let t0 = next(50) * DEG, t1 = next(51) * DEG; const ccw = next(73);
              if (!ccw) { const a = -t1, b = -t0; t0 = a; t1 = b; }
              let sw = t1 - t0; while (sw <= 0) sw += 2 * Math.PI; if (sw > 2 * Math.PI + 1e-9) sw = 2 * Math.PI;
              const nx = -my * ratio, ny = mx * ratio;
              const n = Math.max(4, Math.ceil(sw / (2 * Math.PI) * B.SEG));
              let px = cx + mx * Math.cos(t0) + nx * Math.sin(t0), py = cy + my * Math.cos(t0) + ny * Math.sin(t0);
              for (let k = 1; k <= n; k++) {
                const a = t0 + sw * k / n, x = cx + mx * Math.cos(a) + nx * Math.sin(a), y = cy + my * Math.cos(a) + ny * Math.sin(a);
                B.seg(fx * px, py, fx * x, y); px = x; py = y;
              }
            } else if (et === 4) {
              const deg = next(94) | 0; next(73); next(74);
              const nk = next(95) | 0, nc = next(96) | 0;
              const kn = []; for (let k = 0; k < nk && i < N; k++) kn.push(next(40));
              const cx = [], cy = [], w = [];
              for (let k = 0; k < nc && i < N; k++) { cx.push(next(10)); cy.push(next(20)); if (i < N && C[i] === 42) w.push(V[i++]); }
              if (i < N && C[i] === 97) { const nf = V[i++] | 0; for (let k = 0; k < nf && i < N; k++) { next(11); next(21); } }
              const out = [];
              if (!evalSpline(deg, cx, cy, w.length === nc ? w : null, kn, Math.min(1000, Math.max(16, nc * 8)), out))
                for (let k = 0; k < nc; k++) out.push(cx[k], cy[k]);
              for (let k = 2; k < out.length; k += 2) B.seg(fx * out[k - 2], out[k - 1], fx * out[k], out[k + 1]);
            }
          }
        }
      }
    }
  }

  // ───────────────────────── Dosya okuma döngüsü ─────────────────────────
  // readChunk(offset, length) → Uint8Array ; post(type, data, transfer)
  function parseStream(readChunk, size, opts, post) {
    opts = opts || {};
    const CH = opts.chunkSize || (8 << 20);
    const t0 = Date.now();
    const first = readChunk(0, Math.min(CH, size));
    const binary = isBinaryDxf(first);
    const tok = binary ? new BinTok() : new TextTok();
    const B = new Builder(post, opts);
    const P = new Parser(B, tok);
    if (opts.encoding) tok.setDecoder(opts.encoding);
    let eol = '\r\n';
    if (!binary) { const i = first.indexOf(10); eol = (i > 0 && first[i - 1] === 13) ? '\r\n' : '\n'; }
    let off = 0, lastProg = 0, buf = first;
    while (off < size && !tok.stop) {
      if (!buf) buf = readChunk(off, Math.min(CH, size - off));
      const last = off + buf.length >= size;
      tok.feed(buf, off, last);
      off += buf.length; buf = null;
      const now = Date.now();
      if (now - lastProg > 150 || last) { lastProg = now; post('progress', { read: off, size, ents: B.entCount }); }
    }
    P.flushPending(size);
    B.endBlock(); B.blocksDone();
    B.flushChunk(); B.flushEnts(); B.flushTexts(); B.flushInst();
    B.postLayers();
    const ext = B.ext;
    post('done', {
      binary, eol, version: P.version, codepage: P.codepage, encoding: codepageLabel(P.codepage, P.version), units: P.units,
      handseed: P.handseed, handseedHex: P.handseedHex, modelHandle: P.modelHandle || P.firstOwner,
      entStart: P.entStart < 0 ? size : P.entStart, entEnd: P.entEnd < 0 ? size : P.entEnd,
      layerEnd: P.layerEnd, layerTableHandle: P.layerTableHandle,
      origin: [B.ox, B.oy], ext, stats: B.stats, unsupported: B.unsupported, warnings: B.warnings,
      entCount: B.entCount, textCount: B.textCount, instCount: B.instCount, ms: Date.now() - t0, eof: P.eof
    });
  }

  // ───────────────────────── Kaydetme / yama motoru ─────────────────────────
  function fmtNum(v) {
    if (!isFinite(v)) return '0.0';
    if (Math.abs(v) < 1e-12) return '0.0';
    let s = String(Number(v.toPrecision(15)));
    if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) s = v.toFixed(12).replace(/0+$/, '').replace(/\.$/, '.0');
    else if (s.indexOf('.') < 0) s += '.0';
    return s;
  }
  function codeStr(c) { const s = String(c); return s.length >= 3 ? s : ('   ' + s).slice(-3); }

  const OCS_TYPES = new Set(['CIRCLE', 'ARC', 'LWPOLYLINE', 'TEXT', 'ATTRIB', 'ATTDEF', 'INSERT', 'HATCH', 'SOLID', 'TRACE', 'SHAPE', 'VERTEX', 'POLYLINE']);
  // Dönüşümde koordinat sonekleri (10..18 → k): P = nokta, V = vektör (öteleme yok)
  const XF_KIND = {
    LINE: { P: [0, 1] }, POINT: { P: [0] }, CIRCLE: { P: [0] }, ARC: { P: [0] }, ELLIPSE: { P: [0], V: [1] }, LWPOLYLINE: { P: [0] },
    SPLINE: { P: [0, 1], V: [2, 3] }, TEXT: { P: [0, 1] }, ATTRIB: { P: [0, 1] }, ATTDEF: { P: [0, 1] }, MTEXT: { P: [0], V: [1] },
    INSERT: { P: [0] }, SOLID: { P: [0, 1, 2, 3] }, TRACE: { P: [0, 1, 2, 3] }, '3DFACE': { P: [0, 1, 2, 3] }, LEADER: { P: [0] },
    MLINE: { P: [0, 1], V: [2, 3] }, MESH: { P: [0] }, DIMENSION: { P: [0, 1, 2, 3, 4, 5, 6] }, ACAD_TABLE: { P: [0] },
    POLYLINE: {}, SEQEND: {}, IMAGE: { P: [0] }, WIPEOUT: { P: [0] }, TOLERANCE: { P: [0] }, SHAPE: { P: [0] }
  };
  const R2D = 180 / Math.PI;
  // Dönüşüm: T = [a,b,c,d,e,f,zs,zt] → x' = a·x + b·y + e, y' = c·x + d·y + f, z' = zs·z + zt (XY'de benzerlik dönüşümü)
  function xfMake(T) {
    const [a, b, c, d, e, f, zs, zt] = T, det = a * d - b * c;
    return { a, b, c, d, e, f, zs, zt, sc: Math.sqrt(Math.abs(det)), mir: det < 0, th: Math.atan2(c, a) };
  }
  // Çıkış yönü −Z olan (yansımış) OCS çerçevesinde aynı dönüşüm
  function xfConj(X) { return { a: X.a, b: -X.b, c: -X.c, d: X.d, e: -X.e, f: X.f, zs: X.zs, zt: -X.zt, sc: X.sc, mir: X.mir, th: -X.th }; }
  function xfIdentity(T) { return !T || (T[0] === 1 && T[1] === 0 && T[2] === 0 && T[3] === 1 && T[4] === 0 && T[5] === 0 && T[6] === 1 && T[7] === 0); }
  const norm360 = (a) => { a %= 360; if (a < 0) a += 360; return Math.abs(a - 360) < 1e-9 ? 0 : a; };
  function xfAng(X, deg) { return norm360(X.th * R2D + (X.mir ? -deg : deg)); }
  // Aynalamada yazı okunur kalsın (AutoCAD MIRRTEXT=0): yansıyan doğrultunun iki yönünden asıl açıya yakın olanı
  function xfTextAng(X, deg) {
    const a = xfAng(X, deg); if (!X.mir) return a;
    const b = norm360(a + 180), d = (u) => { const x = Math.abs(norm360(u - deg)); return Math.min(x, 360 - x); };
    return d(a) <= d(b) ? a : b;
  }
  // T = A∘B (önce B, sonra A)
  function xfCompose(A, B) {
    return [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3],
      A[0] * B[4] + A[1] * B[5] + A[4], A[2] * B[4] + A[3] * B[5] + A[5], A[6] * B[6], A[6] * B[7] + A[7]];
  }
  function xfInverse(T) {
    const [a, b, c, d, e, f, zs, zt] = T, det = a * d - b * c;
    const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
    return [ia, ib, ic, id, -(ia * e + ib * f), -(ic * e + id * f), 1 / zs, -zt / zs];
  }

  // Ham varlık metnini düzenle. ed: {T (mutlak dönüşüm), aci, layer, copy:{alloc()}}
  function patchEntity(text, ed, eol) {
    const lines = text.split(/\r?\n/);
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    const np = lines.length >> 1;
    let items = new Array(np);
    for (let i = 0; i < np; i++) items[i] = { cs: lines[2 * i], c: parseInt(lines[2 * i], 10), v: lines[2 * i + 1] };
    if (ed.T && !xfIdentity(ed.T)) items = xformItems(items, xfMake(ed.T));
    // alt varlıklar (POLYLINE/VERTEX/SEQEND, INSERT/ATTRIB…)
    let si = -1;
    for (const it of items) { if (it.c === 0) si++; it.si = si; }
    const hmap = new Map();
    if (ed.copy) for (const it of items) if (it.c === 5) { const h = it.v.trim(); if (!hmap.has(h)) hmap.set(h, ed.copy.alloc()); }
    const out = [];
    let skipGroup = false, colorDone = ed.aci === undefined, typeOf = [];
    for (const it of items) if (it.c === 0) typeOf.push(it.v.trim());
    for (const it of items) {
      const code = it.c; let val = it.v;
      const type = typeOf[it.si] || '';
      if (ed.copy) {
        if (code === 102) {
          const v = val.trim();
          if (v.charAt(0) === '{') { skipGroup = true; continue; }
          if (v === '}' && skipGroup) { skipGroup = false; continue; }
        }
        if (skipGroup) continue;
        if (code === 360) continue;
        if (code === 5) val = hmap.get(val.trim()) || val;
        else if (code === 330) { const m = hmap.get(val.trim()); if (m) val = m; }
      }
      if (it.si === 0 && ed.aci !== undefined && (code === 62 || code === 420 || code === 430)) continue;
      if (ed.layer !== undefined && code === 8 && (it.si === 0 || type === 'VERTEX' || type === 'SEQEND')) val = ed.layer;
      out.push(it.cs, val);
      if (!colorDone && it.si === 0 && code === 8) {
        if (ed.aci !== 256) out.push(codeStr(62), String(ed.aci));
        colorDone = true;
      }
    }
    if (!colorDone && ed.aci !== 256) out.splice(2, 0, codeStr(62), String(ed.aci));
    return out.join(eol) + eol;
  }

  // Grup kodu dizisine geometrik dönüşüm uygula (alt varlık bazında). Eksik gerekli kodları ekler.
  function xformItems(items, X) {
    // alt varlıklara böl
    const subs = [];
    for (const it of items) { if (it.c === 0 || !subs.length) subs.push([]); subs[subs.length - 1].push(it); }
    let polyFlags = 0, polyExt = null;
    const zMove = X.zs !== 1 || X.zt !== 0, rotOrScale = X.th !== 0 || X.sc !== 1 || X.mir;
    const out = [];
    for (let sub of subs) {
      const type = sub[0].c === 0 ? sub[0].v.trim() : '';
      const first = (c) => sub.findIndex(it => it.c === c);
      const val = (c, def) => { const k = first(c); return k < 0 ? def : parseFloat(sub[k].v); };
      let ext = null; { const k = first(230); if (k >= 0) ext = parseFloat(sub[k].v); }
      const flags = val(70, 0) | 0;
      if (type === 'POLYLINE') { polyFlags = flags; polyExt = ext; }
      let ocs = OCS_TYPES.has(type);
      if (type === 'VERTEX') { ocs = (polyFlags & (8 | 16 | 64)) === 0; if (ext === null) ext = polyExt; }
      const F = (ocs && ext !== null && ext < 0) ? xfConj(X) : X;
      const ins = (k, it) => { sub.splice(k, 0, it); };
      const mk = (c, v) => ({ cs: codeStr(c), c, v });
      const after = (codes) => { let k = -1; sub.forEach((it, i) => { if (codes.indexOf(it.c) >= 0) k = i; }); return k; };
      const firstAfter = (codes) => { for (let i = 0; i < sub.length; i++) if (codes.indexOf(sub[i].c) >= 0) return i; return -1; };
      // ── eksik kodları tamamla
      if (type === 'INSERT' && (rotOrScale || zMove)) {
        if (first(41) < 0) ins(after([30, 20]) + 1, mk(41, '1.0'));
        if (first(42) < 0) ins(after([41]) + 1, mk(42, '1.0'));
        if (first(43) < 0) ins(after([42]) + 1, mk(43, '1.0'));
        if (first(50) < 0) ins(after([43]) + 1, mk(50, '0.0'));
      }
      if ((type === 'TEXT' || type === 'ATTRIB' || type === 'ATTDEF') && rotOrScale && first(50) < 0) {
        const k = firstAfter([1]); ins((k >= 0 ? k : after([40])) + 1, mk(50, '0.0'));
      }
      if (type === 'MTEXT' && rotOrScale && first(11) < 0) {
        const r = first(50) >= 0 ? val(50, 0) / R2D : 0; const k = first(50); if (k >= 0) sub.splice(k, 1);
        const at = after([1, 3, 7, 210, 220, 230]) + 1;
        ins(at, mk(31, '0.0')); ins(at, mk(21, fmtNum(Math.sin(r)))); ins(at, mk(11, fmtNum(Math.cos(r))));
      }
      if (type === 'LWPOLYLINE' && zMove && first(38) < 0) { const k = first(10); ins(k >= 0 ? k : sub.length, mk(38, '0.0')); }
      if (zMove && type !== 'LWPOLYLINE' && type !== 'HATCH' && type !== 'POLYLINE') {
        const kind = XF_KIND[type];
        if (kind && kind.P) for (const k of kind.P) {
          if (type === 'VERTEX') break;
          for (let i = 0; i < sub.length; i++) {
            if (sub[i].c !== 20 + k) continue;
            const nx = sub[i + 1];
            if (!nx || nx.c !== 30 + k) ins(i + 1, mk(30 + k, '0.0'));
          }
        }
        if (type === 'VERTEX' && first(30) < 0 && first(20) >= 0) ins(first(20) + 1, mk(30, '0.0'));
      }
      // ── VERTEX türü
      let kind = XF_KIND[type];
      if (type === 'VERTEX') {
        const face = (flags & 128) && !(flags & 64);
        kind = face ? {} : { P: [0] };
      }
      const isHatch = type === 'HATCH';
      const fmt = fmtNum;
      // nokta / vektör çiftlerini dönüştür
      const xyPair = (i, isVec) => {
        const cx = sub[i].c; let j = -1;
        for (let k = i + 1; k < sub.length && k <= i + 3; k++) if (sub[k].c === cx + 10) { j = k; break; }
        const x = parseFloat(sub[i].v), y = j >= 0 ? parseFloat(sub[j].v) : 0;
        const nx = F.a * x + F.b * y + (isVec ? 0 : F.e), ny = F.c * x + F.d * y + (isVec ? 0 : F.f);
        sub[i].v = fmt(nx); if (j >= 0) sub[j].v = fmt(ny); else if (!isVec || ny !== 0) ins(i + 1, mk(cx + 10, fmt(ny)));
        return j;
      };
      const done = new Set();
      // HATCH durum makinesi
      let after91 = false, pathPoly = false, edgeType = 0;
      for (let i = 0; i < sub.length; i++) {
        const it = sub[i], c = it.c;
        if (done.has(it)) continue;
        if (isHatch) {
          if (c === 91) { after91 = true; continue; }
          if (c === 92) { pathPoly = (parseInt(it.v, 10) & 2) !== 0; edgeType = 0; continue; }
          if (c === 72 && !pathPoly && after91) { edgeType = parseInt(it.v, 10) || 0; continue; }
          if (c === 98) { pathPoly = true; edgeType = 0; continue; }
          if (c >= 10 && c <= 18) {
            if (!after91) continue;
            const k = c - 10;
            let vec = false;
            if (k === 1) vec = edgeType === 3; else if (k === 2 || k === 3) vec = true; else if (k > 3) continue;
            const j = xyPair(i, vec); if (j >= 0) done.add(sub[j]); continue;
          }
          if (c === 30 && !after91) { it.v = fmt(F.zs * parseFloat(it.v) + F.zt); continue; }
          if (c === 43) { // desen çizgisi taban noktası (43/44)
            const j = sub[i + 1] && sub[i + 1].c === 44 ? i + 1 : -1;
            const x = parseFloat(it.v), y = j >= 0 ? parseFloat(sub[j].v) : 0;
            it.v = fmt(F.a * x + F.b * y + F.e); if (j >= 0) { sub[j].v = fmt(F.c * x + F.d * y + F.f); done.add(sub[j]); }
            continue;
          }
          if (c === 45) {
            const j = sub[i + 1] && sub[i + 1].c === 46 ? i + 1 : -1;
            const x = parseFloat(it.v), y = j >= 0 ? parseFloat(sub[j].v) : 0;
            it.v = fmt(F.a * x + F.b * y); if (j >= 0) { sub[j].v = fmt(F.c * x + F.d * y); done.add(sub[j]); }
            continue;
          }
          if (c === 40 && after91 && edgeType === 2 && !pathPoly) { it.v = fmt(parseFloat(it.v) * F.sc); continue; }
          if ((c === 50 || c === 51) && after91 && edgeType === 2 && !pathPoly) {
            let ccw = 1; for (let k = i + 1; k < sub.length && k < i + 6; k++) if (sub[k].c === 73) { ccw = parseInt(sub[k].v, 10) || 0; break; }
            const a = parseFloat(it.v); it.v = fmt(norm360(ccw ? a + F.th * R2D : a - F.th * R2D)); continue;
          }
          if (c === 52 || c === 53) { it.v = fmt(norm360(parseFloat(it.v) + F.th * R2D)); continue; }
          if (c === 41 || c === 49) { it.v = fmt(parseFloat(it.v) * F.sc); continue; }
          if (c === 460) { it.v = fmt(parseFloat(it.v) + F.th); continue; }
          continue;
        }
        if (c >= 10 && c <= 18) {
          const k = c - 10;
          if (kind && kind.P && kind.P.indexOf(k) >= 0) { const j = xyPair(i, false); if (j >= 0) done.add(sub[j]); }
          else if (kind && kind.V && kind.V.indexOf(k) >= 0) { const j = xyPair(i, true); if (j >= 0) done.add(sub[j]); }
          continue;
        }
        if (c >= 30 && c <= 38) {
          const k = c - 30;
          if (type === 'LWPOLYLINE') { if (c === 38) it.v = fmt(F.zs * parseFloat(it.v) + F.zt); continue; }
          if (type === 'POLYLINE') { if (c === 30 && !(polyFlags & (8 | 16 | 64))) it.v = fmt(F.zs * parseFloat(it.v) + F.zt); continue; }
          if (kind && kind.P && kind.P.indexOf(k) >= 0) it.v = fmt(F.zs * parseFloat(it.v) + F.zt);
          else if (kind && kind.V && kind.V.indexOf(k) >= 0) it.v = fmt(F.zs * parseFloat(it.v));
          continue;
        }
        if (type === 'LEADER' && c >= 211 && c <= 213) {
          const j = sub[i + 1] && sub[i + 1].c === c + 10 ? i + 1 : -1;
          const x = parseFloat(it.v), y = j >= 0 ? parseFloat(sub[j].v) : 0;
          it.v = fmt(F.a * x + F.b * y); if (j >= 0) { sub[j].v = fmt(F.c * x + F.d * y); done.add(sub[j]); }
          continue;
        }
        if (type === 'LEADER' && c >= 231 && c <= 233) { it.v = fmt(F.zs * parseFloat(it.v)); continue; }
        if (c === 39) { it.v = fmt(parseFloat(it.v) * F.zs); continue; }
        const num = () => parseFloat(it.v);
        switch (type) {
          case 'CIRCLE': if (c === 40) it.v = fmt(num() * F.sc); break;
          case 'ARC': if (c === 40) it.v = fmt(num() * F.sc); else if (c === 50 || c === 51) it.v = fmt(xfAng(F, num())); break;
          case 'ELLIPSE': break;
          case 'LWPOLYLINE': if (c === 40 || c === 41 || c === 43) it.v = fmt(num() * F.sc); else if (c === 42 && F.mir) it.v = fmt(-num()); break;
          case 'POLYLINE': if (c === 40 || c === 41) it.v = fmt(num() * F.sc); break;
          case 'VERTEX': if (c === 40 || c === 41) it.v = fmt(num() * F.sc); else if (c === 42 && F.mir) it.v = fmt(-num()); else if (c === 50) it.v = fmt(xfAng(F, num())); break;
          case 'TEXT': case 'ATTRIB': case 'ATTDEF': if (c === 40) it.v = fmt(num() * F.sc); else if (c === 50) it.v = fmt(xfTextAng(F, num())); break;
          case 'MTEXT': if (c === 40 || c === 41 || c === 46 || c === 42 || c === 43) it.v = fmt(num() * F.sc); break;
          case 'INSERT':
            if (c === 41 || c === 44) it.v = fmt(num() * F.sc);
            else if (c === 45) it.v = fmt(num() * F.sc * (F.mir ? -1 : 1));
            else if (c === 42) it.v = fmt(num() * F.sc * (F.mir ? -1 : 1));
            else if (c === 43) { if (F.zs !== 0) it.v = fmt(num() * F.zs); }  // kot atamada blok iç Z ölçeği korunur
            else if (c === 50) it.v = fmt(norm360(F.th * R2D + (F.mir ? -num() : num())));
            break;
          case 'LEADER': if (c === 40 || c === 41) it.v = fmt(num() * F.sc); break;
          case 'MLINE': if (c === 40 || c === 41 || c === 42) it.v = fmt(num() * F.sc); break;
        }
      }
      // aynalamada yön değiştiren değerler
      if (F.mir) {
        if (type === 'ARC') { const a = first(50), b = first(51); if (a >= 0 && b >= 0) { const t = sub[a].v; sub[a].v = sub[b].v; sub[b].v = t; } }
        if (type === 'ELLIPSE') {
          const a = first(41), b = first(42), TP = 2 * Math.PI;
          const s0 = a >= 0 ? parseFloat(sub[a].v) : 0, s1 = b >= 0 ? parseFloat(sub[b].v) : TP;
          if (!(Math.abs(s1 - s0 - TP) < 1e-9 || (s0 === 0 && Math.abs(s1 - TP) < 1e-9))) {
            const n0 = (TP - s1) % TP, n1 = (TP - s0) % TP || TP;
            if (a >= 0) sub[a].v = fmt(n0); else ins(after([40]) + 1, mk(41, fmt(n0)));
            const b2 = first(42); if (b2 >= 0) sub[b2].v = fmt(n1); else ins(after([41]) + 1, mk(42, fmt(n1)));
          }
        }
        if (type === 'MTEXT') { // yön vektörünü okunur yöne çevir
          const a = first(11), b = first(21);
          if (a >= 0 && b >= 0) {
            const ang = Math.atan2(parseFloat(sub[b].v), parseFloat(sub[a].v)) * R2D;
            // dönüşümden önceki açıyı geri bulmak yerine: ters yön okunurluk ölçütü (kosinüs ≥ 0 tercih)
            if (Math.cos(ang / R2D) < -1e-9) { sub[a].v = fmt(-parseFloat(sub[a].v)); sub[b].v = fmt(-parseFloat(sub[b].v)); }
          }
        }
      }
      for (const it of sub) out.push(it);
    }
    return out;
  }

  // Yeni varlık metni üret. def: {type, layer, aci, ...koordinatlar (mutlak, WCS)}; ortak özellikler: ltype, lweight, ltscale, thick, tcolor
  function genEntity(def, ctx) {
    const P = []; const eol = ctx.eol;
    const p = (c, v) => { P.push(codeStr(c), String(v)); };
    const n = fmtNum;
    const modern = ctx.version >= 'AC1012';
    const r2000 = ctx.version >= 'AC1015';
    const head = (type, sub) => {
      p(0, type);
      if (modern) { p(5, ctx.alloc()); if (ctx.owner) p(330, ctx.owner); p(100, 'AcDbEntity'); }
      p(8, def.layer || '0');
      if (def.ltype) p(6, def.ltype);
      if (def.aci !== undefined && def.aci !== 256) p(62, def.aci);
      if (r2000 && def.lweight !== undefined) p(370, def.lweight);
      if (def.ltscale !== undefined && def.ltscale !== 1) p(48, n(def.ltscale));
      if (r2000 && def.tcolor !== undefined && def.tcolor >= 0) p(420, def.tcolor);
      if (modern && sub) p(100, sub);
      if (def.thick) p(39, n(def.thick));
    };
    const z = (v) => n(v || 0);
    // eski sürümlerde (R12) olmayan tipler çoklu çizgiye çevrilir
    const asPolyline = (pts, closed) => {
      head('POLYLINE'); p(66, 1); p(10, '0.0'); p(20, '0.0'); p(30, '0.0'); p(70, (closed ? 1 : 0) | 8);
      for (const q of pts) { p(0, 'VERTEX'); p(8, def.layer || '0'); p(10, n(q[0])); p(20, n(q[1])); p(30, n(q[2] || 0)); p(70, 32); }
      p(0, 'SEQEND'); p(8, def.layer || '0');
    };
    const t = def.type;
    if (t === 'LINE') {
      head('LINE', 'AcDbLine');
      p(10, n(def.x1)); p(20, n(def.y1)); p(30, z(def.z1)); p(11, n(def.x2)); p(21, n(def.y2)); p(31, z(def.z2));
    } else if (t === 'POINT') {
      head('POINT', 'AcDbPoint'); p(10, n(def.x)); p(20, n(def.y)); p(30, z(def.z));
    } else if (t === 'LWPOLYLINE') {
      const cnt = def.xs.length, bs = def.bs || [];
      if (modern) {
        head('LWPOLYLINE', 'AcDbPolyline'); p(90, cnt); p(70, def.closed ? 1 : 0); p(43, '0.0');
        if (def.elev) p(38, n(def.elev));
        for (let i = 0; i < cnt; i++) { p(10, n(def.xs[i])); p(20, n(def.ys[i])); if (bs[i]) p(42, n(bs[i])); }
      } else {
        head('POLYLINE'); p(66, 1); p(10, '0.0'); p(20, '0.0'); p(30, z(def.elev)); p(70, def.closed ? 1 : 0);
        for (let i = 0; i < cnt; i++) { p(0, 'VERTEX'); p(8, def.layer || '0'); p(10, n(def.xs[i])); p(20, n(def.ys[i])); p(30, z(def.elev)); if (bs[i]) p(42, n(bs[i])); }
        p(0, 'SEQEND'); p(8, def.layer || '0');
      }
    } else if (t === 'CIRCLE') {
      head('CIRCLE', 'AcDbCircle');
      p(10, n(def.cx)); p(20, n(def.cy)); p(30, z(def.cz)); p(40, n(def.r));
    } else if (t === 'ARC') {
      head('ARC', 'AcDbCircle');
      p(10, n(def.cx)); p(20, n(def.cy)); p(30, z(def.cz)); p(40, n(def.r));
      if (modern) p(100, 'AcDbArc');
      p(50, n(norm360(def.a0))); p(51, n(norm360(def.a1)));
    } else if (t === 'ELLIPSE') {
      if (modern) {
        head('ELLIPSE', 'AcDbEllipse');
        p(10, n(def.cx)); p(20, n(def.cy)); p(30, z(def.cz)); p(11, n(def.mx)); p(21, n(def.my)); p(31, '0.0');
        p(210, '0.0'); p(220, '0.0'); p(230, '1.0'); p(40, n(def.ratio)); p(41, n(def.t0 || 0)); p(42, n(def.t1 === undefined ? 2 * Math.PI : def.t1));
      } else {
        const pts = [], t0 = def.t0 || 0, t1 = def.t1 === undefined ? 2 * Math.PI : def.t1, N = 72;
        const nx = -def.my * def.ratio, ny = def.mx * def.ratio;
        let sw = t1 - t0; if (sw <= 0) sw += 2 * Math.PI;
        for (let i = 0; i <= N; i++) { const a = t0 + sw * i / N; pts.push([def.cx + def.mx * Math.cos(a) + nx * Math.sin(a), def.cy + def.my * Math.cos(a) + ny * Math.sin(a), def.cz || 0]); }
        asPolyline(pts, false);
      }
    } else if (t === 'SPLINE') {
      // denetim noktalı (CV) kıskaçlı düzgün B-spline
      const cnt = def.xs.length, deg = Math.max(1, Math.min(def.deg || 3, cnt - 1));
      if (modern && cnt >= 2) {
        const knots = [];
        for (let i = 0; i <= deg; i++) knots.push(0);
        for (let i = 1; i < cnt - deg; i++) knots.push(i);
        for (let i = 0; i <= deg; i++) knots.push(cnt - deg);
        head('SPLINE', 'AcDbSpline');
        p(210, '0.0'); p(220, '0.0'); p(230, '1.0'); p(70, 8); p(71, deg); p(72, knots.length); p(73, cnt); p(74, 0);
        p(42, '0.0000001'); p(43, '0.0000001');
        for (const k of knots) p(40, n(k));
        for (let i = 0; i < cnt; i++) { p(10, n(def.xs[i])); p(20, n(def.ys[i])); p(30, z(def.zs ? def.zs[i] : 0)); }
      } else asPolyline(def.xs.map((x, i) => [x, def.ys[i], def.zs ? def.zs[i] : 0]), false);
    } else if (t === 'TEXT') {
      head('TEXT', 'AcDbText');
      p(10, n(def.x)); p(20, n(def.y)); p(30, z(def.z)); p(40, n(def.h)); p(1, def.str);
      if (def.rot) p(50, n(def.rot));
      if (modern) p(100, 'AcDbText');
    }
    return P.join(eol) + eol;
  }

  // Ham varlık metninden düzenleme araçlarının kullandığı geometri tanımı (mutlak WCS). Desteklenmeyen tip: null
  function parseDef(text) {
    const L = text.split(/\r?\n/); const pairs = [];
    for (let i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i], 10), L[i + 1]]);
    if (!pairs.length || pairs[0][0] !== 0) return null;
    const type = pairs[0][1].trim();
    const main = []; let k = 1;
    while (k < pairs.length && pairs[k][0] !== 0) main.push(pairs[k++]);
    const g = (c, d) => { const q = main.find(x => x[0] === c); return q ? parseFloat(q[1]) : d; };
    const gs = (c) => { const q = main.find(x => x[0] === c); return q ? q[1].trim() : undefined; };
    const def = { layer: gs(8) || '0' };
    const aci = g(62, 256); def.aci = aci | 0;
    if (gs(6)) def.ltype = gs(6);
    if (gs(370) !== undefined) def.lweight = parseInt(gs(370), 10);
    if (gs(48) !== undefined) def.ltscale = g(48, 1);
    if (gs(420) !== undefined) def.tcolor = parseInt(gs(420), 10);
    const thick = g(39, 0);
    const flip = g(230, 1) < 0, fx = flip ? -1 : 1;
    if (thick) def.thick = thick * fx;
    if (type === 'LINE') return Object.assign(def, { type, x1: g(10, 0), y1: g(20, 0), z1: g(30, 0), x2: g(11, 0), y2: g(21, 0), z2: g(31, 0) });
    if (type === 'POINT') return Object.assign(def, { type, x: g(10, 0), y: g(20, 0), z: g(30, 0) });
    if (type === 'CIRCLE') return Object.assign(def, { type, cx: fx * g(10, 0), cy: g(20, 0), cz: fx * g(30, 0), r: Math.abs(g(40, 0)) });
    if (type === 'ARC') {
      let a0 = g(50, 0), a1 = g(51, 360);
      if (flip) { const t0 = 180 - a1, t1 = 180 - a0; a0 = norm360(t0); a1 = norm360(t1); }
      return Object.assign(def, { type, cx: fx * g(10, 0), cy: g(20, 0), cz: fx * g(30, 0), r: Math.abs(g(40, 0)), a0, a1 });
    }
    if (type === 'ELLIPSE') {
      if (Math.abs(g(31, 0)) > 1e-9 || g(230, 1) !== 1) return null; // yalnız plan düzleminde
      return Object.assign(def, { type, cx: g(10, 0), cy: g(20, 0), cz: g(30, 0), mx: g(11, 1), my: g(21, 0), ratio: g(40, 1), t0: g(41, 0), t1: g(42, 2 * Math.PI) });
    }
    if (type === 'LWPOLYLINE') {
      const xs = [], ys = [], bs = [];
      for (const [c, v] of main) { if (c === 10) { xs.push(fx * parseFloat(v)); bs.push(0); } else if (c === 20) ys.push(parseFloat(v)); else if (c === 42 && bs.length) bs[bs.length - 1] = fx * parseFloat(v); }
      return Object.assign(def, { type, xs, ys: ys.slice(0, xs.length), bs, closed: (g(70, 0) & 1) !== 0, elev: fx * g(38, 0) });
    }
    if (type === 'POLYLINE') {
      const fl = g(70, 0) | 0;
      if (fl & (16 | 64)) return null;
      const xs = [], ys = [], zs = [], bs = [];
      let v = null;
      for (; k < pairs.length; k++) {
        const [c, val] = pairs[k];
        if (c === 0) { if (v) { xs.push(v.x); ys.push(v.y); zs.push(v.z); bs.push(v.b); } v = val.trim() === 'VERTEX' ? { x: 0, y: 0, z: 0, b: 0 } : null; continue; }
        if (!v) continue;
        if (c === 10) v.x = parseFloat(val); else if (c === 20) v.y = parseFloat(val); else if (c === 30) v.z = parseFloat(val); else if (c === 42) v.b = parseFloat(val);
      }
      if (v) { xs.push(v.x); ys.push(v.y); zs.push(v.z); bs.push(v.b); }
      if (fl & 8) return Object.assign(def, { type: 'POLY3D', xs, ys, zs, closed: (fl & 1) !== 0 });
      return Object.assign(def, { type: 'LWPOLYLINE', xs: xs.map(x => fx * x), ys, bs: bs.map(b => fx * b), closed: (fl & 1) !== 0, elev: fx * g(30, 0) });
    }
    if (type === 'SPLINE') {
      const xs = [], ys = [], zs = [];
      for (const [c, v] of main) { if (c === 10) xs.push(parseFloat(v)); else if (c === 20) ys.push(parseFloat(v)); else if (c === 30) zs.push(parseFloat(v)); }
      return Object.assign(def, { type, xs, ys, zs, deg: g(71, 3) | 0, closed: (g(70, 0) & 1) !== 0 });
    }
    if (type === 'TEXT') return Object.assign(def, { type, x: fx * g(10, 0), y: g(20, 0), z: fx * g(30, 0), h: g(40, 1), rot: g(50, 0), str: gs(1) || '' });
    if (type === 'INSERT') return Object.assign(def, { type, x: fx * g(10, 0), y: g(20, 0), z: fx * g(30, 0), unsupported: true });
    if (type === 'MTEXT') return Object.assign(def, { type, x: g(10, 0), y: g(20, 0), z: g(30, 0), unsupported: true });
    return Object.assign(def, { type, unsupported: true });
  }

  // Kaydetme planı: orijinal dosyanın değişmeyen kısımları bayt aralığı olarak ([a,b]) kopyalanır,
  // yalnızca düzenlenen/eklenen varlıklar yeniden yazılır. read(a,b) → Uint8Array.
  // msg: { size, mode:'full'|'subset', encoding, eol, version, owner, handseed:[a,b]|null, handseedHex,
  //        entStart, entEnd, ops:[{fs,fe,kind:'patch'|'del'|'keep', ed}], copies:[{fs,fe,ed}], news:[def] }
  function buildSaveParts(read, msg) {
    const size = msg.size, eol = msg.eol || '\r\n';
    const enc = makeEncoder(msg.encoding || 'windows-1252');
    let dec; try { dec = new TextDecoder(msg.encoding || 'windows-1252'); } catch (e) { dec = new TextDecoder('windows-1252'); }
    // ham metinleri pencereler halinde oku
    const need = [];
    for (const o of msg.ops) if (o.kind === 'patch') need.push(o);
    for (const c of msg.copies) need.push(c);
    need.sort((a, b) => a.fs - b.fs);
    let w0 = -1, w1 = -1, wb = null;
    for (const it of need) {
      if (!wb || it.fs < w0 || it.fe > w1) {
        w0 = it.fs; w1 = Math.min(size, Math.max(it.fe, it.fs + (4 << 20)));
        wb = read(w0, w1);
      }
      it.text = dec.decode(wb.subarray(it.fs - w0, it.fe - w0));
    }
    // tutamaç (handle) üretici
    const modern = (msg.version || '') >= 'AC1012';
    let hnext = null;
    if (modern) {
      let seed = 0n;
      try { seed = BigInt('0x' + (msg.handseedHex || '0')); } catch (e) { seed = 0n; }
      if (seed === 0n) seed = 0x7FFF0000n;
      hnext = seed;
    }
    let allocated = 0;
    const alloc = () => { allocated++; const h = hnext.toString(16).toUpperCase(); hnext += 1n; return h; };
    const appended = [];
    for (const c of msg.copies) appended.push(patchEntity(c.text, Object.assign({}, c.ed, modern ? { copy: { alloc } } : {}), eol));
    const ctx = { eol, version: msg.version || 'AC1009', owner: msg.owner || '', alloc: modern ? alloc : () => '' };
    for (const d of msg.news) { const txt = genEntity(d.def, ctx); appended.push(d.ed ? patchEntity(txt, d.ed, eol) : txt); }
    const appendText = appended.join('');

    // yeni katmanlar: LAYER tablosunun sonuna (ENDTAB'tan önce)
    let layerText = '';
    if (msg.newLayers && msg.newLayers.length && msg.layerEnd >= 0) {
      for (const L of msg.newLayers) {
        const P = [], p = (c, v) => P.push(codeStr(c), String(v));
        p(0, 'LAYER');
        if (modern) { p(5, alloc()); if (msg.layerTableHandle) p(330, msg.layerTableHandle); p(100, 'AcDbSymbolTableRecord'); p(100, 'AcDbLayerTableRecord'); }
        p(2, L.name); p(70, 0); p(62, L.aci || 7); p(6, 'Continuous');
        layerText += P.join(eol) + eol;
      }
    }
    const events = [];
    if (modern && allocated && msg.handseed) events.push({ fs: msg.handseed[0], fe: msg.handseed[1], text: hnext.toString(16).toUpperCase() });
    if (layerText) events.push({ fs: msg.layerEnd, fe: msg.layerEnd, text: layerText });
    const parts = [];
    let cur = 0;
    const raw = (a, b) => {
      if (b <= a) return;
      const last = parts[parts.length - 1];
      if (Array.isArray(last) && last[1] === a) last[1] = b; else parts.push([a, b]);
    };
    const put = (text) => { if (text) parts.push(enc(text)); };
    if (msg.mode === 'subset') {
      for (const ev of events) { raw(cur, ev.fs); put(ev.text); cur = ev.fe; }
      raw(cur, msg.entStart); cur = msg.entStart;
      const ops = msg.ops.slice().sort((a, b) => a.fs - b.fs);
      for (const o of ops) {
        if (o.kind === 'del') continue;
        if (o.kind === 'patch') put(patchEntity(o.text, o.ed, eol)); else raw(o.fs, o.fe);
      }
      put(appendText);
      raw(msg.entEnd, size);
    } else {
      for (const o of msg.ops) {
        if (o.kind === 'patch') events.push({ fs: o.fs, fe: o.fe, text: patchEntity(o.text, o.ed, eol) });
        else if (o.kind === 'del') events.push({ fs: o.fs, fe: o.fe, text: '' });
      }
      if (appendText) events.push({ fs: msg.entEnd, fe: msg.entEnd, text: appendText, last: true });
      events.sort((a, b) => a.fs - b.fs || (a.last ? 1 : 0) - (b.last ? 1 : 0));
      for (const ev of events) { if (ev.fs < cur) continue; raw(cur, ev.fs); put(ev.text); cur = ev.fe; }
      raw(cur, size);
    }
    return { parts, allocated };
  }

  return {
    buildSaveParts,
    A_NORMAL, A_FG, A_BYBLOCK, A_LAYERCOL, A_HIDDEN, FG, ACI, rgba, aciToRgba, trueToRgba,
    codepageLabel, makeEncoder, decodeDxfString, cleanMText, fastFloat,
    TextTok, BinTok, isBinaryDxf, Builder, Parser, parseStream, evalSpline, textBBox,
    T, TYPE_NAMES, F_BYLAYER, F_NEW, F_POINTS, F_NOBBOX,
    fmtNum, codeStr, patchEntity, genEntity, parseDef, xformItems, xfMake, xfCompose, xfInverse, xfIdentity, xfTextAng, xfAng
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = DXFCore;
