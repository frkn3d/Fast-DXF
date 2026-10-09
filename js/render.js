/* DXF Okuyucu — WebGL2 çizim motoru (2B plan + 3B kamera, tel kafes / gizli çizgi / gölgeli) ve yazı katmanı (Canvas 2D) */
'use strict';

// Ortak köşe gölgelendirici: TRI tanımlıysa üçgen (yüzey) programı
const VS_SRC = (tri) => `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_col;
layout(location=2) in float a_lay;
layout(location=3) in vec3 i_m0;
layout(location=4) in vec3 i_m1;
layout(location=5) in vec2 i_lv;
layout(location=6) in vec4 i_col;
layout(location=7) in vec4 i_lcol;
layout(location=8) in float a_z;
layout(location=9) in vec2 i_z;
layout(location=10) in vec4 i_x;   // blok örneğinin 3B terimleri (m02, m12, m20, m21)
uniform mat4 u_M;
uniform vec3 u_T;
uniform float u_zs;
uniform float u_bflat;
uniform vec4 u_zc;
uniform vec3 u_fg;
uniform sampler2D u_layers;
uniform float u_psize;
uniform vec4 u_hl;
uniform mat4 u_X;   // seçimin önizleme dönüşümü (3B afin, göreli koordinat)
uniform float u_nolay;
uniform vec3 u_lbg;
out vec4 v_col;
out vec3 v_p;
float fl(vec4 c){ return floor(c.a*255.0+0.5); }
vec3 ramp(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.17,0.35,0.85), c1 = vec3(0.10,0.75,0.85), c2 = vec3(0.20,0.80,0.25), c3 = vec3(0.98,0.85,0.15), c4 = vec3(0.90,0.25,0.15);
  if (t < 0.25) return mix(c0, c1, t * 4.0);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) * 4.0);
  if (t < 0.75) return mix(c2, c3, (t - 0.5) * 4.0);
  return mix(c3, c4, (t - 0.75) * 4.0);
}
void main(){
  float a = fl(a_col);
  float lay = a_lay > 65534.5 ? i_lv.x : a_lay;
  vec4 col = a_col;
  v_p = vec3(0.0);
  if (a < 0.5 || i_lv.y < 0.5) { gl_Position = vec4(2.0,2.0,2.0,1.0); v_col = vec4(0.0); return; }
  if (a > 252.5 && a < 253.5) col = i_col; else if (a > 251.5 && a < 252.5) col = i_lcol;
  float a2 = fl(col);
  if (a2 > 251.5 && a2 < 254.5) col = vec4(u_fg, 1.0);
  ivec2 lt = ivec2(int(mod(lay, 256.0)), int(floor(lay / 256.0)));
  float lv = texelFetch(u_layers, lt, 0).r;
  if (u_nolay < 0.5 && lv < 0.5) { gl_Position = vec4(2.0,2.0,2.0,1.0); v_col = vec4(0.0); return; }
  if (u_nolay < 0.5 && lv < 0.9) col = vec4(mix(col.rgb, u_lbg, 0.55), col.a);   // kilitli katman soluk
  vec2 w0 = vec2(dot(i_m0.xy, a_pos) + i_m0.z + i_x.x * a_z, dot(i_m1.xy, a_pos) + i_m1.z + i_x.y * a_z);
  float z0 = u_bflat > 0.5 ? i_z.y : i_x.z * a_pos.x + i_x.w * a_pos.y + i_z.x * a_z + i_z.y;
  vec4 q = u_X * vec4(w0, z0, 1.0);
  float z = q.z;
  vec3 p = vec3(q.xy, z * u_zs) - u_T;
  v_p = p;
  gl_Position = u_M * vec4(p, 1.0);
  gl_PointSize = u_psize;
  if (u_zc.x > 0.5) col = vec4(ramp((z - u_zc.y) / max(u_zc.z - u_zc.y, 1e-6)), 1.0);
  v_col = u_hl.a > 0.5 ? vec4(u_hl.rgb, 1.0) : vec4(col.rgb, 1.0);
}`;
const FS_LINE = `#version 300 es
precision mediump float;
in vec4 v_col; in vec3 v_p; out vec4 o;
void main(){ o = v_col; }`;
const FS_TRI = `#version 300 es
precision highp float;
in vec4 v_col; in vec3 v_p; out vec4 o;
uniform float u_style;   // 1: gizli çizgi (arka plan rengiyle doldur), 2: gölgeli
uniform vec3 u_bg;
uniform vec3 u_light;    // güneş yönü (dünya)
uniform vec3 u_vdir;     // göze doğru
void main(){
  if (u_style < 1.5) { o = vec4(u_bg, 1.0); return; }
  vec3 n = normalize(cross(dFdx(v_p), dFdy(v_p)));
  if (dot(n, u_vdir) < 0.0) n = -n;
  float dif = max(dot(n, normalize(u_light)), 0.0), head = max(dot(n, u_vdir), 0.0);
  float k = 0.22 + 0.58 * dif + 0.28 * head;
  o = vec4(min(v_col.rgb * k, vec3(1.0)), 1.0);
}`;

const DEG = Math.PI / 180;
const XF_ID = [1, 0, 0, 1, 0, 0, 1, 0];
const MAT_ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
// 8 sayılı (düzlem) ya da 12 sayılı (3×4) dönüşüm → sütun öncelikli mat4
function xfMat4(T) {
  const M = T.length === 12 ? T : [T[0], T[1], 0, T[4], T[2], T[3], 0, T[5], 0, 0, T[6], T[7]];
  return new Float32Array([M[0], M[4], M[8], 0, M[1], M[5], M[9], 0, M[2], M[6], M[10], 0, M[3], M[7], M[11], 1]);
}
function xfIsId(T) {
  if (!T) return true;
  if (T.length === 12) return T[0] === 1 && T[1] === 0 && T[2] === 0 && T[3] === 0 && T[4] === 0 && T[5] === 1 && T[6] === 0 && T[7] === 0 && T[8] === 0 && T[9] === 0 && T[10] === 1 && T[11] === 0;
  return T[0] === 1 && T[1] === 0 && T[2] === 0 && T[3] === 1 && T[4] === 0 && T[5] === 0 && T[6] === 1 && T[7] === 0;
}

class Renderer {
  constructor(canvas, overlay, store) {
    this.canvas = canvas; this.overlay = overlay; this.store = store;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('Tarayıcınız WebGL2 desteklemiyor. Güncel Chrome veya Edge kullanın.');
    this.gl = gl;
    this.ctx = overlay.getContext('2d');
    this.prog = this.program(VS_SRC(false), FS_LINE);
    this.tprog = this.program(VS_SRC(true), FS_TRI);
    const uni = (P) => { const U = (n) => gl.getUniformLocation(P, n); return { M: U('u_M'), T: U('u_T'), zs: U('u_zs'), bflat: U('u_bflat'), zc: U('u_zc'), fg: U('u_fg'), layers: U('u_layers'), psize: U('u_psize'), hl: U('u_hl'), X: U('u_X'), lbg: U('u_lbg'), nolay: U('u_nolay'), style: U('u_style'), bg: U('u_bg'), light: U('u_light'), vdir: U('u_vdir') }; };
    this.u = uni(this.prog); this.tu = uni(this.tprog);
    this.layerTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.layerBytes = new Uint8Array(65536);
    this.updateLayers();
    // Kamera: hedef (cx, cy, cz), ölçek (hedefte piksel / birim), yön (az, el derece; Z yukarı)
    this.cx = 0; this.cy = 0; this.cz = 0; this.scale = 1;
    this.az = -90; this.el = 90; this.persp = false; this.fov = 45; this.zs = 1;
    this.zcolor = false; this.zcr = [0, 1];
    this.blockFlat = false;   // blok sembollerini ekleme kotunda düz çiz
    this.style = 'wire';      // 'wire' tel kafes · 'hidden' gizli çizgi · 'shaded' gölgeli
    this.edges = true;        // çizgiler (tel kafes) görünsün mü — yüzeyli stillerde kapatılabilir
    this.dark = true; this.bg = [0.105, 0.118, 0.137]; this.fg = [1, 1, 1];
    this.hl = { chunks: new Map(), blocks: new Map(), dirty: true };
    this.preview = null;       // araç önizlemesi (2D katman)
    this.xf = XF_ID.slice();   // seçimin dönüşüm önizlemesi (göreli koordinat)
    this.textLimit = 25000;
    this.lastTextStats = { drawn: 0, skipped: 0 };
    this.pending = false; this.anim = null;
    this.resize();
  }
  // Eski arayüz: yalnız öteleme önizlemesi
  get offset() { return [this.xf[4], this.xf[5]]; }
  set offset(v) { this.xf = [1, 0, 0, 1, v[0], v[1], 1, 0]; }
  program(vs, fs) {
    const gl = this.gl;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  setTheme(dark) {
    this.dark = dark;
    this.bg = dark ? [0.105, 0.118, 0.137] : [1, 1, 1];
    this.fg = dark ? [1, 1, 1] : [0, 0, 0];
    this.request();
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height); this.dpr = dpr;
    for (const c of [this.canvas, this.overlay]) {
      c.width = Math.round(this.W * dpr); c.height = Math.round(this.H * dpr);
      c.style.width = this.W + 'px'; c.style.height = this.H + 'px';
    }
    this.request();
  }
  updateLayers() {
    const v = this.store.layerVis, b = this.layerBytes;
    const Ls = this.store.layers;
    for (let i = 0; i < 65536; i++) b[i] = v[i] ? 255 : 0;
    for (let i = 0; i < Ls.length; i++) if (b[i] && Ls[i] && Ls[i].locked) b[i] = 160;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 256, gl.RED, gl.UNSIGNED_BYTE, b);
    this.request();
  }

  // ── kamera
  get is2D() { return !this.persp && this.el === 90 && this.az === -90; }
  // Ekran sağı r, ekran yukarısı u, bakış yönü f (göz → hedef)
  basis(az, el) {
    az = (az === undefined ? this.az : az) * DEG; el = (el === undefined ? this.el : el) * DEG;
    const ce = Math.cos(el), se = Math.sin(el), ca = Math.cos(az), sa = Math.sin(az);
    const f = [-ce * ca, -ce * sa, -se], r = [-sa, ca, 0];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { r, u, f };
  }
  // Ortografik derinlik aralığı: çizimin yoğun kutusu + hedefe uzaklık
  depthRange() {
    const S = this.store, v = S.view0 || S.ext || [-50, -50, 50, 50], zr = S.zext || [0, 0], zs = this.zs;
    const cx = (v[0] + v[2]) / 2, cy = (v[1] + v[3]) / 2, cz = (zr[0] + zr[1]) / 2 * zs;
    const half = Math.hypot(v[2] - v[0], v[3] - v[1], (zr[1] - zr[0]) * zs) / 2;
    let sr = 0; for (const s of S.surfaces) if (s.bb) sr = Math.max(sr, Math.hypot(s.bb[2] - s.bb[0], s.bb[3] - s.bb[1]));
    return (Math.hypot(this.cx - cx, this.cy - cy, this.cz * zs - cz) + half + sr) * 1.25 + 10;
  }
  // Belirli bir çıktı boyutu için kamera (factor: ölçek çarpanı, PNG dışa aktarma için)
  cam(W, H, factor) {
    W = W || this.W; H = H || this.H;
    const scale = this.scale * (factor || 1), zs = this.zs;
    const { r, u, f } = this.basis();
    const T = [this.cx, this.cy, this.cz * zs];
    const persp = this.persp;
    const Dist = (H / 2) / (scale * Math.tan(this.fov * DEG / 2));
    const near = Dist * 0.01;
    const cam = {
      W, H, scale, zs, r, u, f, T, persp, Dist, is2D: this.is2D, tmp: [0, 0],
      project(x, y, z, out) {
        const vx = x - T[0], vy = y - T[1], vz = z * zs - T[2];
        let a = vx * r[0] + vy * r[1], b = vx * u[0] + vy * u[1] + vz * u[2];
        if (persp) {
          const d = vx * f[0] + vy * f[1] + vz * f[2] + Dist;
          if (d < near) return false;
          const k = Dist / d; a *= k; b *= k;
        }
        out[0] = a * scale + W / 2; out[1] = H / 2 - b * scale;
        return true;
      }
    };
    // GL matrisi (sütun öncelikli): clip = M · (p − T)
    const sx = 2 * scale / W, sy = 2 * scale / H, M = new Float32Array(16);
    for (let c = 0; c < 3; c++) { M[c * 4] = r[c] * sx; M[c * 4 + 1] = u[c] * sy; }
    if (persp) {
      const n = 0.01;
      for (let c = 0; c < 3; c++) { M[c * 4 + 3] = f[c] / Dist; M[c * 4 + 2] = f[c] / Dist; }
      M[15] = 1; M[14] = 1 - 2 * n;
    } else {
      const D = this.depthRange();
      for (let c = 0; c < 3; c++) M[c * 4 + 2] = f[c] / D;
      M[15] = 1;
    }
    cam.M = M;
    return cam;
  }
  // z verilmezse: 3B çizimde çalışma düzleminin kotu (drawZ), yoksa hedef kotu
  w2s(x, y, z) {
    if (this.is2D) return [(x - this.cx) * this.scale + this.W / 2, this.H / 2 - (y - this.cy) * this.scale];
    const out = [NaN, NaN];
    this.cam().project(x, y, z === undefined ? (this.drawZ !== undefined ? this.drawZ : this.cz) : z, out);
    return out;
  }
  // Ekran noktasının dünya ışını {o, d} (göreli koordinat, Z abartmasız)
  ray3(px, py) {
    const { r, u, f } = this.basis(), zs = this.zs, s = this.scale;
    const a = (px - this.W / 2) / s, b = (this.H / 2 - py) / s;
    const q = [this.cx + r[0] * a + u[0] * b, this.cy + r[1] * a + u[1] * b, this.cz * zs + u[2] * b];
    let o, d;
    if (this.persp) {
      const Dist = (this.H / 2) / (s * Math.tan(this.fov * DEG / 2));
      o = [this.cx - f[0] * Dist, this.cy - f[1] * Dist, this.cz * zs - f[2] * Dist];
      d = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
    } else { o = q; d = f.slice(); }
    return { o: [o[0], o[1], o[2] / zs], d: [d[0], d[1], d[2] / zs] };
  }
  // Ekran noktasından dünya: 3B'de hedef kotundaki yatay düzlemle kesişim
  s2w(px, py) {
    if (this.is2D) return [(px - this.W / 2) / this.scale + this.cx, (this.H / 2 - py) / this.scale + this.cy];
    const p = this.ray(px, py, this.cz);
    return p ? [p[0], p[1]] : [NaN, NaN];
  }
  ray(px, py, zPlane) {
    const { r, u, f } = this.basis(), zs = this.zs, s = this.scale;
    const a = (px - this.W / 2) / s, b = (this.H / 2 - py) / s;
    const T = [this.cx, this.cy, this.cz * zs];
    const q = [T[0] + r[0] * a + u[0] * b, T[1] + r[1] * a + u[1] * b, T[2] + u[2] * b];
    let o, d;
    if (this.persp) {
      const Dist = (this.H / 2) / (s * Math.tan(this.fov * DEG / 2));
      o = [T[0] - f[0] * Dist, T[1] - f[1] * Dist, T[2] - f[2] * Dist];
      d = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
    } else { o = q; d = f; }
    const zp = zPlane * zs;
    if (Math.abs(d[2]) < 1e-9) return null;
    const t = (zp - o[2]) / d[2];
    if (this.persp && t < 0) return null;
    return [o[0] + d[0] * t, o[1] + d[1] * t, zPlane];
  }
  fit(bb, margin, zr) {
    if (!bb) return;
    margin = margin === undefined ? 0.04 : margin;
    if (!this.is2D) { this.fit3(bb, zr || this.store.zview, margin); return; }
    const w = Math.max(bb[2] - bb[0], 1e-6), h = Math.max(bb[3] - bb[1], 1e-6);
    this.cx = (bb[0] + bb[2]) / 2; this.cy = (bb[1] + bb[3]) / 2;
    this.scale = Math.min(this.W / w, this.H / h) * (1 - 2 * margin);
    this.request();
  }
  // 3B kutuyu verilen (ya da mevcut) yönde ekrana sığdıracak hedef/ölçek
  fitParams(bb, zr, margin, az, el) {
    const { r, u } = this.basis(az, el), zs = this.zs;
    zr = zr || [0, 0];
    const c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, (zr[0] + zr[1]) / 2];
    let wa = 1e-9, hb = 1e-9;
    for (let k = 0; k < 8; k++) {
      const x = ((k & 1) ? bb[2] : bb[0]) - c[0], y = ((k & 2) ? bb[3] : bb[1]) - c[1], z = (((k & 4) ? zr[1] : zr[0]) - c[2]) * zs;
      wa = Math.max(wa, Math.abs(x * r[0] + y * r[1])); hb = Math.max(hb, Math.abs(x * u[0] + y * u[1] + z * u[2]));
    }
    const m = (1 - 2 * margin) * (this.persp ? 0.8 : 1);
    return { cx: c[0], cy: c[1], cz: c[2], scale: Math.min(this.W / (2 * wa), this.H / (2 * hb)) * m };
  }
  fit3(bb, zr, margin) {
    const p = this.fitParams(bb, zr, margin);
    this.cx = p.cx; this.cy = p.cy; this.cz = p.cz; this.scale = p.scale;
    this.request();
  }
  zoomAt(px, py, f) {
    const { r, u } = this.basis(), zs = this.zs;
    const a = (px - this.W / 2) / this.scale, b = (this.H / 2 - py) / this.scale;
    const q = [this.cx + r[0] * a + u[0] * b, this.cy + r[1] * a + u[1] * b, this.cz * zs + u[2] * b];
    this.scale = Math.min(1e9, Math.max(1e-9, this.scale * f));
    const a2 = (px - this.W / 2) / this.scale, b2 = (this.H / 2 - py) / this.scale;
    this.cx = q[0] - r[0] * a2 - u[0] * b2; this.cy = q[1] - r[1] * a2 - u[1] * b2; this.cz = (q[2] - u[2] * b2) / zs;
    this.request();
  }
  pan(dx, dy) {
    const { r, u } = this.basis(), s = this.scale;
    this.cx += (-r[0] * dx + u[0] * dy) / s; this.cy += (-r[1] * dx + u[1] * dy) / s; this.cz += (u[2] * dy) / s / this.zs;
    this.request();
  }
  // Ekran dikdörtgenine yakınlaş (2B ve 3B)
  zoomRect(x0, y0, x1, y1) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0); if (w < 2 || h < 2) return;
    const { r, u } = this.basis(), s = this.scale;
    const a = ((x0 + x1) / 2 - this.W / 2) / s, b = (this.H / 2 - (y0 + y1) / 2) / s;
    this.cx += r[0] * a + u[0] * b; this.cy += r[1] * a + u[1] * b; this.cz += u[2] * b / this.zs;
    this.scale = Math.min(1e9, s * Math.min(this.W / w, this.H / h));
    this.request();
  }
  orbit(dAz, dEl) {
    let az = this.az + dAz; while (az > 180) az -= 360; while (az <= -180) az += 360;
    this.az = az; this.el = Math.max(-90, Math.min(90, this.el + dEl));
    if (this.el === 90 && this.az === -90) this.el = 89.999; // yörüngedeyken plan kipine kilitlenme
    this.request();
  }
  // Yumuşak geçiş: hedef {az, el, cx, cy, cz, scale}
  animateTo(to, ms, done) {
    const from = { az: this.az, el: this.el, cx: this.cx, cy: this.cy, cz: this.cz, scale: this.scale };
    let daz = to.az - from.az; while (daz > 180) daz -= 360; while (daz < -180) daz += 360;
    const t0 = performance.now(); ms = ms || 350;
    if (this.anim) cancelAnimationFrame(this.anim);
    const step = () => {
      let t = Math.min(1, (performance.now() - t0) / ms); const e = t * t * (3 - 2 * t);
      if (t >= 1) {
        Object.assign(this, { az: to.az, el: to.el, cx: to.cx, cy: to.cy, cz: to.cz, scale: to.scale });
        this.anim = null; this.request(); if (done) done(); return;
      }
      let az = from.az + daz * e; while (az > 180) az -= 360; while (az <= -180) az += 360;
      this.az = az; this.el = from.el + (to.el - from.el) * e;
      if (this.el === 90 && this.az === -90) this.el = 89.9999;
      this.cx = from.cx + (to.cx - from.cx) * e; this.cy = from.cy + (to.cy - from.cy) * e; this.cz = from.cz + (to.cz - from.cz) * e;
      this.scale = Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * e);
      this.draw();
      this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }
  // Ekranda görünen bölgenin plan (x,y) kutusu
  viewBox() {
    if (this.is2D) { const [x0, y1] = this.s2w(0, 0), [x1, y0] = this.s2w(this.W, this.H); return [x0, y0, x1, y1]; }
    const pts = [[0, 0], [this.W, 0], [0, this.H], [this.W, this.H], [this.W / 2, this.H / 2]].map(p => this.ray(p[0], p[1], this.cz)).filter(Boolean);
    const ext = this.store.ext || [-50, -50, 50, 50];
    if (pts.length < 5) return ext.slice();
    const bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of pts) { bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); }
    return [Math.max(bb[0], ext[0]), Math.max(bb[1], ext[1]), Math.min(bb[2], ext[2]), Math.min(bb[3], ext[3])];
  }

  // ── GPU kaynakları
  attrib(loc, buf, size, type, norm, stride, off, div) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, type, norm, stride || 0, off || 0);
    gl.vertexAttribDivisor(loc, div || 0);
  }
  buffer(data, usage) {
    const gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
    return b;
  }
  vao(pos, col, lay, z) {
    const gl = this.gl, v = gl.createVertexArray(); gl.bindVertexArray(v);
    this.attrib(0, pos, 2, gl.FLOAT, false); this.attrib(1, col, 4, gl.UNSIGNED_BYTE, true); this.attrib(2, lay, 1, gl.UNSIGNED_SHORT, false); this.attrib(8, z, 1, gl.FLOAT, false);
    gl.bindVertexArray(null);
    return v;
  }
  chunkGL(ch) {
    const gl = this.gl;
    if (ch.gl && !ch.realloc) return ch.gl;
    if (ch.gl) this.freeChunk(ch);
    ch.realloc = false;
    const usage = ch.editable ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
    const G = { pos: this.buffer(ch.pos, usage), col: this.buffer(ch.col, usage), lay: this.buffer(ch.lay, usage), z: this.buffer(ch.z, usage),
      ppos: this.buffer(ch.ppos, usage), pcol: this.buffer(ch.pcol, usage), play: this.buffer(ch.play, usage), pz: this.buffer(ch.pz, usage),
      tpos: this.buffer(ch.tpos, usage), tcol: this.buffer(ch.tcol, usage), tlay: this.buffer(ch.tlay, usage), tz: this.buffer(ch.tz, usage) };
    G.vao = this.vao(G.pos, G.col, G.lay, G.z);
    G.pvao = this.vao(G.ppos, G.pcol, G.play, G.pz);
    G.tvao = this.vao(G.tpos, G.tcol, G.tlay, G.tz);
    ch.gl = G; ch.dirty = null;
    return G;
  }
  freeChunk(ch) {
    const gl = this.gl, G = ch.gl; if (!G) return;
    for (const k of ['pos', 'col', 'lay', 'z', 'ppos', 'pcol', 'play', 'pz', 'tpos', 'tcol', 'tlay', 'tz']) gl.deleteBuffer(G[k]);
    gl.deleteVertexArray(G.vao); gl.deleteVertexArray(G.pvao); gl.deleteVertexArray(G.tvao);
    ch.gl = null;
  }
  flushChunk(ch) {
    const d = ch.dirty; if (!d || !ch.gl) return;
    const gl = this.gl, G = ch.gl;
    const up = (buf, arr, comp, r) => { if (!r) return; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, r[0] * comp * arr.BYTES_PER_ELEMENT, arr.subarray(r[0] * comp, r[1] * comp)); };
    up(G.pos, ch.pos, 2, d.pos); up(G.col, ch.col, 1, d.col); up(G.lay, ch.lay, 1, d.lay); up(G.z, ch.z, 1, d.z);
    up(G.ppos, ch.ppos, 2, d.ppos); up(G.pcol, ch.pcol, 1, d.pcol); up(G.play, ch.play, 1, d.play); up(G.pz, ch.pz, 1, d.pz);
    up(G.tpos, ch.tpos, 2, d.tpos); up(G.tcol, ch.tcol, 1, d.tcol); up(G.tlay, ch.tlay, 1, d.tlay); up(G.tz, ch.tz, 1, d.tz);
    ch.dirty = null;
  }
  blockGL(B) {
    const gl = this.gl;
    if (!B.pos || (!B.nV && !B.nP && !B.nT)) return null;
    if (!B.gl || B.geomDirty) {
      if (B.gl) this.freeBlock(B);
      const G = B.gl = { pos: this.buffer(B.pos), col: this.buffer(B.col), lay: this.buffer(B.lay), z: this.buffer(B.z),
        ppos: this.buffer(B.ppos), pcol: this.buffer(B.pcol), play: this.buffer(B.play), pz: this.buffer(B.pz),
        tpos: this.buffer(B.tpos || new Float32Array(0)), tcol: this.buffer(B.tcol || new Uint32Array(0)), tlay: this.buffer(B.tlay || new Uint16Array(0)), tz: this.buffer(B.tz || new Float32Array(0)),
        f: gl.createBuffer(), fz: gl.createBuffer(), fx: gl.createBuffer(), c: gl.createBuffer(), cap: 0 };
      G.vao = gl.createVertexArray(); G.pvao = gl.createVertexArray(); G.tvao = gl.createVertexArray();
      B.geomDirty = false; B.instDirty = true; G.bound = false;
    }
    const G = B.gl;
    if (B.instDirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, G.f); gl.bufferData(gl.ARRAY_BUFFER, B.f.a.subarray(0, B.f.n), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, G.fz); gl.bufferData(gl.ARRAY_BUFFER, B.fz.a.subarray(0, B.fz.n), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, G.fx); gl.bufferData(gl.ARRAY_BUFFER, B.fx.a.subarray(0, B.fx.n), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, G.c); gl.bufferData(gl.ARRAY_BUFFER, B.c.a.subarray(0, B.c.n), gl.DYNAMIC_DRAW);
      B.instDirty = false;
      if (!G.bound) {
        this.bindBlockVAO(G.vao, G.pos, G.col, G.lay, G.z, G.f, G.fz, G.c, G.fx);
        this.bindBlockVAO(G.pvao, G.ppos, G.pcol, G.play, G.pz, G.f, G.fz, G.c, G.fx);
        this.bindBlockVAO(G.tvao, G.tpos, G.tcol, G.tlay, G.tz, G.f, G.fz, G.c, G.fx);
        G.bound = true;
      }
    }
    return G;
  }
  bindBlockVAO(vao, pos, col, lay, z, f, fz, c, fx) {
    const gl = this.gl;
    gl.bindVertexArray(vao);
    this.attrib(0, pos, 2, gl.FLOAT, false); this.attrib(1, col, 4, gl.UNSIGNED_BYTE, true); this.attrib(2, lay, 1, gl.UNSIGNED_SHORT, false); this.attrib(8, z, 1, gl.FLOAT, false);
    this.attrib(3, f, 3, gl.FLOAT, false, 32, 0, 1); this.attrib(4, f, 3, gl.FLOAT, false, 32, 12, 1); this.attrib(5, f, 2, gl.FLOAT, false, 32, 24, 1);
    this.attrib(9, fz, 2, gl.FLOAT, false, 8, 0, 1);
    this.attrib(10, fx, 4, gl.FLOAT, false, 16, 0, 1);
    this.attrib(6, c, 4, gl.UNSIGNED_BYTE, true, 8, 0, 1); this.attrib(7, c, 4, gl.UNSIGNED_BYTE, true, 8, 4, 1);
    gl.bindVertexArray(null);
  }
  freeBlock(B) {
    const gl = this.gl, G = B.gl; if (!G) return;
    for (const k of ['pos', 'col', 'lay', 'z', 'ppos', 'pcol', 'play', 'pz', 'tpos', 'tcol', 'tlay', 'tz', 'f', 'fz', 'fx', 'c']) gl.deleteBuffer(G[k]);
    gl.deleteVertexArray(G.vao); gl.deleteVertexArray(G.pvao); gl.deleteVertexArray(G.tvao);
    B.gl = null;
  }
  surfaceGL(s) {
    if (s.gl) return s.gl;
    const gl = this.gl, G = { pos: this.buffer(s.pos), z: this.buffer(s.z) };
    G.vao = gl.createVertexArray(); gl.bindVertexArray(G.vao);
    this.attrib(0, G.pos, 2, gl.FLOAT, false); this.attrib(8, G.z, 1, gl.FLOAT, false);
    gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
    gl.bindVertexArray(null);
    s.gl = G; return G;
  }
  freeSurface(s) { const gl = this.gl; if (!s.gl) return; gl.deleteBuffer(s.gl.pos); gl.deleteBuffer(s.gl.z); gl.deleteVertexArray(s.gl.vao); s.gl = null; }
  freeAll() {
    for (const ch of this.store.chunks) if (ch) this.freeChunk(ch);
    for (const B of this.store.blocks) if (B) this.freeBlock(B);
    for (const s of this.store.surfaces) this.freeSurface(s);
    this.clearHighlight();
  }

  // ── vurgulama (seçim)
  clearHighlight() {
    const gl = this.gl;
    for (const [, h] of this.hl.blocks) { gl.deleteBuffer(h.f); gl.deleteBuffer(h.fz); gl.deleteBuffer(h.fx); gl.deleteBuffer(h.c); gl.deleteVertexArray(h.vao); gl.deleteVertexArray(h.pvao); }
    for (const [, h] of this.hl.chunks) { if (h.lb) gl.deleteBuffer(h.lb); if (h.pb) gl.deleteBuffer(h.pb); }
    this.hl.blocks = new Map(); this.hl.chunks = new Map(); this.hl.dirty = true;
  }
  buildHighlight() {
    this.clearHighlight();
    const S = this.store, E = S.E, gl = this.gl;
    const perChunk = new Map(), perBlock = new Map();
    for (const id of S.selList) {
      const vc = E.vc.a[id];
      if (vc) {
        const c = E.chunk.a[id];
        let h = perChunk.get(c); if (!h) { h = { l: [], p: [] }; perChunk.set(c, h); }
        const vs = E.vs.a[id];
        if (E.flags.a[id] & F_POINTS) h.p.push(vs, vc); else h.l.push(vs, vc);
      }
      const is = E.is.a[id], ic = E.ic.a[id];
      for (let k = is; k < is + ic; k++) {
        const b = S.IN.blk.a[k]; let arr = perBlock.get(b); if (!arr) { arr = []; perBlock.set(b, arr); } arr.push(S.IN.slot.a[k]);
      }
    }
    const idx = (ranges) => {
      let n = 0; for (let i = 1; i < ranges.length; i += 2) n += ranges[i];
      const a = new Uint32Array(n); let o = 0;
      for (let i = 0; i < ranges.length; i += 2) for (let v = ranges[i]; v < ranges[i] + ranges[i + 1]; v++) a[o++] = v;
      return a;
    };
    for (const [c, h] of perChunk) {
      const o = {};
      if (h.l.length) { const a = idx(h.l); o.lb = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.lb); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, a, gl.STATIC_DRAW); o.ln = a.length; }
      if (h.p.length) { const a = idx(h.p); o.pb = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.pb); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, a, gl.STATIC_DRAW); o.pn = a.length; }
      this.hl.chunks.set(c, o);
    }
    for (const [b, slots] of perBlock) {
      const B = S.blocks[b]; const G = B && this.blockGL(B); if (!G) continue;
      const f = new Float32Array(slots.length * 8), fz = new Float32Array(slots.length * 2), fx = new Float32Array(slots.length * 4), c = new Uint32Array(slots.length * 2);
      slots.forEach((s, i) => {
        f.set(B.f.a.subarray(s * 8, s * 8 + 8), i * 8); fz[2 * i] = B.fz.a[2 * s]; fz[2 * i + 1] = B.fz.a[2 * s + 1];
        fx.set(B.fx.a.subarray(s * 4, s * 4 + 4), i * 4);
        c[2 * i] = B.c.a[2 * s]; c[2 * i + 1] = B.c.a[2 * s + 1];
      });
      const h = { f: this.buffer(f), fz: this.buffer(fz), fx: this.buffer(fx), c: this.buffer(c), n: slots.length, vao: gl.createVertexArray(), pvao: gl.createVertexArray() };
      this.bindBlockVAO(h.vao, G.pos, G.col, G.lay, G.z, h.f, h.fz, h.c, h.fx); this.bindBlockVAO(h.pvao, G.ppos, G.pcol, G.play, G.pz, h.f, h.fz, h.c, h.fx);
      this.hl.blocks.set(b, h);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    this.hl.dirty = false;
  }

  request() { if (!this.pending) { this.pending = true; requestAnimationFrame(() => { this.pending = false; this.draw(); }); } }

  setConstInstance() {
    const gl = this.gl;
    gl.vertexAttrib3f(3, 1, 0, 0); gl.vertexAttrib3f(4, 0, 1, 0); gl.vertexAttrib2f(5, 0, 1);
    gl.vertexAttrib4f(6, 1, 1, 1, 254 / 255); gl.vertexAttrib4f(7, 1, 1, 1, 254 / 255);
    gl.vertexAttrib2f(9, 1, 0); gl.vertexAttrib4f(10, 0, 0, 0, 0);
  }
  setCommon(U, cam, psize) {
    const gl = this.gl;
    gl.uniformMatrix4fv(U.M, false, cam.M);
    gl.uniform3f(U.T, cam.T[0], cam.T[1], cam.T[2]);
    gl.uniform1f(U.zs, cam.zs); gl.uniform1f(U.bflat, 0);
    gl.uniform4f(U.zc, this.zcolor ? 1 : 0, this.zcr[0], this.zcr[1], 0);
    gl.uniform3f(U.fg, this.fg[0], this.fg[1], this.fg[2]);
    gl.uniform3f(U.lbg, this.bg[0], this.bg[1], this.bg[2]);
    gl.uniform1f(U.psize, psize);
    gl.uniform4f(U.hl, 0, 0, 0, 0); gl.uniformMatrix4fv(U.X, false, MAT_ID); gl.uniform1f(U.nolay, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.layerTex); gl.uniform1i(U.layers, 0);
  }
  // Sahneyi verilen kamerayla çiz (ekran veya PNG dışa aktarımı için)
  drawScene(cam, psize) {
    const gl = this.gl, S = this.store, solid = this.style !== 'wire';
    gl.clearColor(this.bg[0], this.bg[1], this.bg[2], 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (solid) {
      // yüzeyler
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 2);
      gl.useProgram(this.tprog);
      const U = this.tu;
      this.setCommon(U, cam, psize);
      gl.uniform1f(U.style, this.style === 'hidden' ? 1 : 2);
      gl.uniform3f(U.bg, this.bg[0], this.bg[1], this.bg[2]);
      gl.uniform3f(U.light, -0.45, 0.6, 0.66);
      gl.uniform3f(U.vdir, -cam.f[0], -cam.f[1], -cam.f[2]);
      this.setConstInstance();
      for (const ch of S.chunks) {
        if (!ch || !ch.nT) continue;
        const G = this.chunkGL(ch); this.flushChunk(ch);
        gl.bindVertexArray(G.tvao); gl.drawArrays(gl.TRIANGLES, 0, ch.nT);
      }
      gl.uniform1f(U.bflat, this.blockFlat ? 1 : 0);
      for (const B of S.blocks) {
        if (!B || !B.n || !B.nT) continue;
        const G = this.blockGL(B); if (!G) continue;
        gl.bindVertexArray(G.tvao); gl.drawArraysInstanced(gl.TRIANGLES, 0, B.nT, B.n);
      }
      gl.uniform1f(U.bflat, 0);
      // arazi yüzeyleri (katmandan bağımsız)
      gl.uniform1f(U.nolay, 1);
      for (const s of S.surfaces) {
        if (!s.visible) continue;
        const G = this.surfaceGL(s);
        gl.bindVertexArray(G.vao);
        this.setConstInstance();
        gl.vertexAttrib4f(1, s.color[0], s.color[1], s.color[2], 1); gl.vertexAttrib1f(2, 0);
        gl.drawArrays(gl.TRIANGLES, 0, s.n);
      }
      gl.uniform1f(U.nolay, 0);
      gl.bindVertexArray(null);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    // çizgiler ve noktalar
    if (!this.edges && solid) { gl.disable(gl.DEPTH_TEST); return; }
    gl.useProgram(this.prog);
    this.setCommon(this.u, cam, psize);
    this.setConstInstance();
    for (const ch of S.chunks) {
      if (!ch) continue;
      const G = this.chunkGL(ch); this.flushChunk(ch);
      if (ch.nV) { gl.bindVertexArray(G.vao); gl.drawArrays(gl.LINES, 0, ch.nV); }
      if (ch.nP) { gl.bindVertexArray(G.pvao); gl.drawArrays(gl.POINTS, 0, ch.nP); }
    }
    gl.uniform1f(this.u.bflat, this.blockFlat ? 1 : 0);
    for (const B of S.blocks) {
      if (!B || !B.n) continue;
      const G = this.blockGL(B); if (!G) continue;
      if (B.nV) { gl.bindVertexArray(G.vao); gl.drawArraysInstanced(gl.LINES, 0, B.nV, B.n); }
      if (B.nP) { gl.bindVertexArray(G.pvao); gl.drawArraysInstanced(gl.POINTS, 0, B.nP, B.n); }
    }
    gl.bindVertexArray(null);
    gl.uniform1f(this.u.bflat, 0);
    gl.disable(gl.DEPTH_TEST);
  }
  drawHighlight() {
    const gl = this.gl, S = this.store;
    if (!S.selList.length) return;
    if (this.hl.dirty) this.buildHighlight();
    const hc = this.dark ? [1.0, 0.62, 0.15] : [0.9, 0.35, 0.0];
    gl.uniform4f(this.u.hl, hc[0], hc[1], hc[2], 1);
    gl.uniformMatrix4fv(this.u.X, false, xfMat4(this.xf));
    gl.uniform1f(this.u.psize, 5 * this.dpr);
    this.setConstInstance();
    for (const [c, h] of this.hl.chunks) {
      const ch = S.chunks[c]; if (!ch || !ch.gl) continue;
      if (h.lb) { gl.bindVertexArray(ch.gl.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, h.lb); gl.drawElements(gl.LINES, h.ln, gl.UNSIGNED_INT, 0); }
      if (h.pb) { gl.bindVertexArray(ch.gl.pvao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, h.pb); gl.drawElements(gl.POINTS, h.pn, gl.UNSIGNED_INT, 0); }
    }
    gl.uniform1f(this.u.bflat, this.blockFlat ? 1 : 0);
    for (const [b, h] of this.hl.blocks) {
      const B = S.blocks[b];
      if (B.nV) { gl.bindVertexArray(h.vao); gl.drawArraysInstanced(gl.LINES, 0, B.nV, h.n); }
      if (B.nP) { gl.bindVertexArray(h.pvao); gl.drawArraysInstanced(gl.POINTS, 0, B.nP, h.n); }
    }
    gl.bindVertexArray(null);
    gl.uniform1f(this.u.bflat, 0);
    gl.uniform4f(this.u.hl, 0, 0, 0, 0); gl.uniformMatrix4fv(this.u.X, false, MAT_ID);
  }
  draw() {
    const gl = this.gl, dpr = this.dpr;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const cam = this.cam();
    this.drawScene(cam, 1.5 * dpr);
    this.drawHighlight();
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.lastTextStats = this.drawTexts(ctx, cam, this.textLimit, true);
    if (this.preview) this.preview(ctx);
    if (this.onDraw) this.onDraw();
  }

  // ── yazılar (Canvas 2D). Dışa aktarma için de kullanılır.
  colorCss(c) {
    const a = c >>> 24;
    if (a >= 252 && a <= 254) return this.dark ? '#ffffff' : '#000000';
    return 'rgb(' + (c & 255) + ',' + ((c >>> 8) & 255) + ',' + ((c >>> 16) & 255) + ')';
  }
  drawTexts(ctx, cam, limit, withSel) {
    if (cam.is2D) return this.drawTexts2D(ctx, cam.W, cam.H, cam.T[0], cam.T[1], cam.scale, limit, withSel);
    return this.drawTexts3D(ctx, cam, limit, withSel);
  }
  // seçili yazının önizleme dönüşümü: [x, y, z, hk, dr]
  xfText(x, y, z, r) {
    const T = this.xf, M = T.length === 12 ? T : [T[0], T[1], 0, T[4], T[2], T[3], 0, T[5], 0, 0, T[6], T[7]];
    const c = Math.cos(r || 0), s = Math.sin(r || 0);
    const dx = M[0] * c + M[1] * s, dy = M[4] * c + M[5] * s, ux = -M[0] * s + M[1] * c, uy = -M[4] * s + M[5] * c, uz = -M[8] * s + M[9] * c;
    return [M[0] * x + M[1] * y + M[2] * z + M[3], M[4] * x + M[5] * y + M[6] * z + M[7], M[8] * x + M[9] * y + M[10] * z + M[11],
      Math.hypot(ux, uy, uz), Math.atan2(dy, dx) - (r || 0)];
  }
  drawTexts2D(ctx, W, H, cx, cy, scale, limit, withSel) {
    const S = this.store, X = S.TX, n = S.nText;
    if (!n) return { drawn: 0, skipped: 0 };
    const xa = X.x.a, ya = X.y.a, ha = X.h.a, ra = X.r.a, wa = X.wf.a, al = X.al.a, ca = X.col.a, la = X.lay.a, ea = X.ent.a, hid = X.hid.a;
    const vis = S.layerVis, sel = S.sel, TS = S.TS;
    const hc = this.dark ? '#ff9e26' : '#e65a00';
    const minPx = 3, x0 = cx - W / 2 / scale, x1 = cx + W / 2 / scale, y0 = cy - H / 2 / scale, y1 = cy + H / 2 / scale;
    let drawn = 0, skipped = 0, lastFont = -1, lastCol = '';
    const moving = !xfIsId(this.xf);
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < n; i++) {
      if (hid[i] || !vis[la[i]]) continue;
      let x = xa[i], y = ya[i], h = ha[i], r = ra[i];
      const isSel = withSel && sel[ea[i]];
      if (isSel && moving) { const q = this.xfText(x, y, 0, r); x = q[0]; y = q[1]; h *= q[3]; r += q[4]; }
      const hp = h * scale;
      if (hp < minPx) continue;
      const str = TS[i];
      const ext = h * (str.length * 0.75 + 2) * (wa[i] || 1);
      if (x + ext < x0 || x - ext > x1 || y + ext < y0 || y - ext > y1) continue;
      if (drawn >= limit) { skipped++; continue; }
      drawn++;
      const sx = (x - cx) * scale + W / 2, sy = H / 2 - (y - cy) * scale;
      const fpx = Math.max(1, Math.round(hp * 1.4 * 2) / 2);
      if (fpx !== lastFont) { ctx.font = fpx + 'px Arial, "Segoe UI", sans-serif'; lastFont = fpx; }
      const css = isSel ? hc : this.colorCss(ca[i]);
      if (css !== lastCol) { ctx.fillStyle = css; lastCol = css; }
      const c = Math.cos(r), s = Math.sin(r), wf = wa[i] || 1;
      ctx.setTransform(c * wf * this.dprT, -s * wf * this.dprT, s * this.dprT, c * this.dprT, sx * this.dprT, sy * this.dprT);
      this.fillText(ctx, str, al[i], hp);
    }
    ctx.setTransform(this.dprT, 0, 0, this.dprT, 0, 0);
    return { drawn, skipped };
  }
  // Hizalamaya göre (çok satırlı dahil) metni yerel koordinatta yaz; hp = bir yazı yüksekliğinin yerel birimdeki karşılığı
  fillText(ctx, str, a, hp) {
    const ha2 = a & 3, va = (a >> 2) & 3;
    ctx.textAlign = ha2 === 1 ? 'center' : ha2 === 2 ? 'right' : 'left';
    if (a & 64 || str.indexOf('\n') >= 0) {
      const lines = str.split('\n'), lh = hp * 1.66, total = lh * (lines.length - 1);
      let top;
      if (va === 3) top = hp; else if (va === 2) top = hp / 2 - total / 2; else top = -total;
      for (let k = 0; k < lines.length; k++) ctx.fillText(lines[k], 0, top + k * lh);
    } else {
      ctx.textBaseline = va === 3 ? 'top' : va === 2 ? 'middle' : va === 1 ? 'bottom' : 'alphabetic';
      ctx.fillText(str, 0, 0);
      ctx.textBaseline = 'alphabetic';
    }
  }
  // 3B: yazı kendi kotundaki yatay düzlemde durur; düzlem ekrana afin olarak izdüşürülür
  drawTexts3D(ctx, cam, limit, withSel) {
    const S = this.store, X = S.TX, n = S.nText;
    if (!n) return { drawn: 0, skipped: 0 };
    const xa = X.x.a, ya = X.y.a, za = X.z.a, ha = X.h.a, ra = X.r.a, wa = X.wf.a, al = X.al.a, ca = X.col.a, la = X.lay.a, ea = X.ent.a, hid = X.hid.a;
    const vis = S.layerVis, sel = S.sel, TS = S.TS, W = cam.W, H = cam.H, d = this.dprT;
    const hc = this.dark ? '#ff9e26' : '#e65a00';
    const L = 20, p0 = [0, 0], p1 = [0, 0], p2 = [0, 0];
    let drawn = 0, skipped = 0, lastCol = '';
    ctx.font = (L * 1.4) + 'px Arial, "Segoe UI", sans-serif';
    for (let i = 0; i < n; i++) {
      if (hid[i] || !vis[la[i]]) continue;
      let x = xa[i], y = ya[i], z = za[i], h = ha[i], r = ra[i];
      const isSel = withSel && sel[ea[i]];
      if (isSel && !xfIsId(this.xf)) { const q = this.xfText(x, y, z, r); x = q[0]; y = q[1]; z = q[2]; h *= q[3]; r += q[4]; }
      if (!cam.project(x, y, z, p0)) continue;
      if (p0[0] < -W || p0[0] > 2 * W || p0[1] < -H || p0[1] > 2 * H) continue;
      const c = Math.cos(r), s = Math.sin(r);
      if (!cam.project(x - s * h, y + c * h, z, p2)) continue;
      const ux = p2[0] - p0[0], uy = p2[1] - p0[1], hp = Math.hypot(ux, uy);
      if (hp < 3) continue;
      const str = TS[i], ext = hp * (str.length * 0.75 + 2) * (wa[i] || 1);
      if (p0[0] + ext < 0 || p0[0] - ext > W || p0[1] + ext < 0 || p0[1] - ext > H) continue;
      if (!cam.project(x + c * h, y + s * h, z, p1)) continue;
      if (drawn >= limit) { skipped++; continue; }
      drawn++;
      const css = isSel ? hc : this.colorCss(ca[i]);
      if (css !== lastCol) { ctx.fillStyle = css; lastCol = css; }
      const wf = (wa[i] || 1) / L;
      ctx.setTransform((p1[0] - p0[0]) * wf * d, (p1[1] - p0[1]) * wf * d, -ux / L * d, -uy / L * d, p0[0] * d, p0[1] * d);
      this.fillText(ctx, str, al[i], L);
    }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { drawn, skipped };
  }
  get dprT() { return this._dprT || this.dpr; }
  set dprT(v) { this._dprT = v; }

  // ── PNG için ekran dışı çizim
  renderToPixels(Wpx, Hpx, cam) {
    const gl = this.gl;
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
    const fb = gl.createFramebuffer(), rb = gl.createRenderbuffer(), db = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, Wpx, Hpx);
    gl.bindRenderbuffer(gl.RENDERBUFFER, db);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, Wpx, Hpx);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, db);
    const fb2 = gl.createFramebuffer(), rb2 = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb2); gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, Wpx, Hpx);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb2); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, Wpx, Hpx);
    this.drawScene(cam, Math.max(2, Wpx / 1500));
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb2);
    gl.blitFramebuffer(0, 0, Wpx, Hpx, 0, 0, Wpx, Hpx, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb2);
    const px = new Uint8Array(Wpx * Hpx * 4);
    gl.readPixels(0, 0, Wpx, Hpx, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb); gl.deleteFramebuffer(fb2); gl.deleteRenderbuffer(rb); gl.deleteRenderbuffer(rb2); gl.deleteRenderbuffer(db);
    this.request();
    return px;
  }
}
