/* Fast DXF — ölçü (DIMENSION) geometrisi: doğrusal, hizalı, yarıçap, çap, açı (3 nokta).
 * Hem arayüzde (önizleme) hem işçide (okuma ve kaydetmede blok üretimi) kullanılır; bu yüzden kendi kendine yeter.
 * def (mutlak WCS): { kind, x1,y1, x2,y2, cx,cy (merkez/tepe), lx,ly (ölçü çizgisi / yay konumu), rot, z, h, asz, exo, exe, gap, dec, sep, text,
 *   tsz (>0: ok yerine eğik çizgi / inşaat "tick"), dle (eğik çizgide ölçü çizgisi taşması), clrd / clre / clrt (ölçü çizgisi / uzatma / yazı rengi, ACI; 0 bloğa göre) }
 * Çıktı: { segs:[[x1,y1,x2,y2,rol]], tris:[[x1,y1,x2,y2,x3,y3]], texts:[{x,y,h,rot(°),str}], value, tx, ty } — rol: 'd' ölçü çizgisi/ok, 'e' uzatma çizgisi */
'use strict';

function DXFDimCore() {
  const D2R = Math.PI / 180;
  // ISO-25 oranları (yazı yüksekliğine göre)
  function norm(def) {
    const h = def.h > 0 ? def.h : 2.5;
    return Object.assign({ asz: h, exo: h * 0.25, exe: h * 0.5, gap: h * 0.25, dec: 2, sep: ',', text: '', tsz: 0, dle: 0, clrd: 0, clre: 0, clrt: 0 }, def, { h });
  }
  function fmtVal(d, v, kind) {
    let s = (Math.round(v * Math.pow(10, d.dec)) / Math.pow(10, d.dec)).toFixed(d.dec);
    if (d.sep && d.sep !== '.') s = s.replace('.', d.sep);
    if (kind === 'radius') s = 'R' + s; else if (kind === 'diameter') s = '%%c' + s; else if (kind === 'angular') s += '%%d';
    if (d.text) s = String(d.text).replace('<>', s);
    return s;
  }
  // okunur yazı açısı (−90°, 90°]
  const upright = (deg) => { while (deg > 90 + 1e-9) deg -= 180; while (deg <= -90 + 1e-9) deg += 180; return deg; };
  function geom(def0) {
    const d = norm(def0), out = { segs: [], tris: [], texts: [], value: 0, tx: 0, ty: 0 };
    const seg = (a, b, role) => out.segs.push([a[0], a[1], b[0], b[1], role || 'd']);
    const tick = d.tsz > 0;
    // eğik çizgi (mimari tick): ölçü doğrultusu u'ya 45°, iz düşümleri tsz
    const stroke = (tip, u) => { const v = [(u[0] - u[1]) * d.tsz / 2, (u[1] + u[0]) * d.tsz / 2]; seg([tip[0] - v[0], tip[1] - v[1]], [tip[0] + v[0], tip[1] + v[1]]); };
    // dolu kapalı ok: uç tip, gövde doğrultusu dir (uçtan içeri)
    const arrow = (tip, dir) => {
      const b = [tip[0] + dir[0] * d.asz, tip[1] + dir[1] * d.asz], w = d.asz / 6, n = [-dir[1] * w, dir[0] * w];
      out.tris.push([tip[0], tip[1], b[0] + n[0], b[1] + n[1], b[0] - n[0], b[1] - n[1]]);
    };
    const text = (mid, angDeg, str) => {
      const a = upright(angDeg), r = a * D2R, up = [-Math.sin(r), Math.cos(r)], off = d.gap + d.h / 2;
      const x = mid[0] + up[0] * off, y = mid[1] + up[1] * off;
      out.texts.push({ x, y, h: d.h, rot: a, str }); out.tx = x; out.ty = y;
    };
    const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
    const P1 = [d.x1, d.y1], P2 = [d.x2, d.y2], L = [d.lx, d.ly];
    if (d.kind === 'linear' || d.kind === 'aligned') {
      const u = d.kind === 'aligned' ? unit([P2[0] - P1[0], P2[1] - P1[1]]) : [Math.cos((d.rot || 0) * D2R), Math.sin((d.rot || 0) * D2R)];
      const n = [-u[1], u[0]];
      const off = (P) => (L[0] - P[0]) * n[0] + (L[1] - P[1]) * n[1];
      const A = [P1[0] + n[0] * off(P1), P1[1] + n[1] * off(P1)], B = [P2[0] + n[0] * off(P2), P2[1] + n[1] * off(P2)];
      // uzatma çizgileri
      for (const [P, Q] of [[P1, A], [P2, B]]) {
        const v = [Q[0] - P[0], Q[1] - P[1]], l = Math.hypot(v[0], v[1]); if (l < 1e-12) continue;
        const e = [v[0] / l, v[1] / l];
        if (l > d.exo) seg([P[0] + e[0] * d.exo, P[1] + e[1] * d.exo], [Q[0] + e[0] * d.exe, Q[1] + e[1] * d.exe], 'e');
      }
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]); out.value = len;
      const dir = len > 1e-12 ? [(B[0] - A[0]) / len, (B[1] - A[1]) / len] : u;
      if (tick) { const x = d.dle || 0; seg([A[0] - dir[0] * x, A[1] - dir[1] * x], [B[0] + dir[0] * x, B[1] + dir[1] * x]); stroke(A, dir); stroke(B, dir); }
      else if (len > 2.6 * d.asz) { seg(A, B); arrow(A, dir); arrow(B, [-dir[0], -dir[1]]); }
      else {   // dar: oklar dışarıda
        const e = d.asz * 1.6;
        seg([A[0] - dir[0] * e, A[1] - dir[1] * e], [B[0] + dir[0] * e, B[1] + dir[1] * e]);
        arrow(A, [-dir[0], -dir[1]]); arrow(B, dir);
      }
      text([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], Math.atan2(dir[1], dir[0]) / D2R, fmtVal(d, len, d.kind));
      out.A = A; out.B = B;
    } else if (d.kind === 'radius' || d.kind === 'diameter') {
      const C = [d.cx, d.cy], R = Math.hypot(P2[0] - C[0], P2[1] - C[1]);
      const e = unit([P2[0] - C[0], P2[1] - C[1]]);
      const Q = d.kind === 'diameter' ? [C[0] - e[0] * R, C[1] - e[1] * R] : C;
      seg(Q, P2); arrow(P2, [-e[0], -e[1]]);
      if (d.kind === 'diameter') arrow(Q, e);
      out.value = d.kind === 'diameter' ? 2 * R : R;
      text([(Q[0] + P2[0]) / 2, (Q[1] + P2[1]) / 2], Math.atan2(e[1], e[0]) / D2R, fmtVal(d, out.value, d.kind));
    } else if (d.kind === 'angular') {
      const V = [d.cx, d.cy], r = Math.hypot(L[0] - V[0], L[1] - V[1]);
      const a1 = Math.atan2(P1[1] - V[1], P1[0] - V[0]), a2 = Math.atan2(P2[1] - V[1], P2[0] - V[0]), aL = Math.atan2(L[1] - V[1], L[0] - V[0]);
      const TP = 2 * Math.PI, ccw = (a, b) => { let s = b - a; while (s < 0) s += TP; while (s >= TP) s -= TP; return s; };
      let s0 = a1, sw = ccw(a1, a2);
      if (ccw(a1, aL) > sw) { s0 = a2; sw = ccw(a2, a1); }   // konum diğer açının içinde
      out.value = sw / D2R;
      const n = Math.max(8, Math.ceil(sw / (Math.PI / 48)));
      let prev = [V[0] + r * Math.cos(s0), V[1] + r * Math.sin(s0)];
      for (let i = 1; i <= n; i++) { const a = s0 + sw * i / n, q = [V[0] + r * Math.cos(a), V[1] + r * Math.sin(a)]; seg(prev, q); prev = q; }
      // uzatma çizgileri (yay ışın üzerindeki noktanın ötesindeyse)
      for (const [P, a] of [[P1, a1], [P2, a2]]) {
        const lp = Math.hypot(P[0] - V[0], P[1] - V[1]), e = [Math.cos(a), Math.sin(a)];
        if (r > lp + d.exo) seg([V[0] + e[0] * (lp + d.exo), V[1] + e[1] * (lp + d.exo)], [V[0] + e[0] * (r + d.exe), V[1] + e[1] * (r + d.exe)], 'e');
      }
      const e0 = s0, e1 = s0 + sw;
      if (tick) {
        stroke([V[0] + r * Math.cos(e0), V[1] + r * Math.sin(e0)], [-Math.sin(e0), Math.cos(e0)]);
        stroke([V[0] + r * Math.cos(e1), V[1] + r * Math.sin(e1)], [-Math.sin(e1), Math.cos(e1)]);
      } else if (r * sw > 2.6 * d.asz) {
        arrow([V[0] + r * Math.cos(e0), V[1] + r * Math.sin(e0)], [-Math.sin(e0), Math.cos(e0)]);
        arrow([V[0] + r * Math.cos(e1), V[1] + r * Math.sin(e1)], [Math.sin(e1), -Math.cos(e1)]);
      }
      const am = s0 + sw / 2;
      text([V[0] + r * Math.cos(am), V[1] + r * Math.sin(am)], am / D2R - 90, fmtVal(d, out.value, 'angular'));
    }
    return out;
  }
  // DXF tip kodu (70 & 7) ↔ tür
  const KIND_OF = { 0: 'linear', 1: 'aligned', 3: 'diameter', 4: 'radius', 5: 'angular' };
  const CODE_OF = { linear: 0, aligned: 1, diameter: 3, radius: 4, angular: 5 };
  // XDATA DSTYLE geçersiz kılmaları: DIM değişkeninin grup kodu → alan
  const OVR = [[140, 'h', 1040], [41, 'asz', 1040], [42, 'exo', 1040], [44, 'exe', 1040], [147, 'gap', 1040], [271, 'dec', 1070],
    [142, 'tsz', 1040], [46, 'dle', 1040], [176, 'clrd', 1070], [177, 'clre', 1070], [178, 'clrt', 1070]];
  return { geom, norm, fmtVal, upright, KIND_OF, CODE_OF, OVR };
}
if (typeof module !== 'undefined' && module.exports) module.exports = DXFDimCore;
