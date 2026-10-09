/* Fast DXF — metin aracı (AutoCAD TEXT / MTEXT gibi, yerinde düzenleyici)
 *  · Tıklanan noktada çizim üzerinde düzenleyici açılır; yükseklik, açı ve hizalama küçük çubuktan değişir.
 *  · Enter: bitir (tek satır → TEXT) · Shift+Enter: yeni satır (çok satır → MTEXT) · Esc: vazgeç.
 *  · Düzenleyici açıkken çizimde başka yere tıklamak yazıyı kaydeder ve oraya yeni yazı başlatır.
 *  · Seç aracında yazıya çift tık: içeriği yerinde düzenle (DDEDIT). */
'use strict';

const TEXT_JUST = [
  ['sol', 'Sol', 0, 0, 1], ['orta', 'Orta', 1, 0, 2], ['sag', 'Sağ', 2, 0, 3], ['ortala', 'Ortala', 4, 2, 5],
  ['ust-sol', 'Üst sol', 0, 3, 1], ['ust-orta', 'Üst orta', 1, 3, 2], ['ust-sag', 'Üst sağ', 2, 3, 3]
];   // [anahtar, ad, TEXT 72, TEXT 73, MTEXT 71]

class TextTool {
  constructor(app) {
    this.app = app; this.R = app.R; this.box = null; this.cur = null;
    this.just = app.settings.textJust || 'sol';
  }
  defaultH() {
    if (this.app.textH) return this.app.textH;
    const v = 20 / this.R.scale, p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m < 1.5 ? 1 : m < 2.2 ? 2 : m < 3 ? 2.5 : m < 7 ? 5 : 10) * p;
  }
  // p: göreli nokta · edit: { id, def } mevcut yazı
  open(p, edit) {
    this.close(false);
    const app = this.app, d = edit && edit.def;
    const h = d ? d.h : this.defaultH(), rot = d ? (d.rot || 0) : (app.textRot || 0);
    if (d) { const J = TEXT_JUST.find(j => d.type === 'MTEXT' ? j[4] === d.attach : (j[2] === (d.ha || 0) && j[3] === (d.va || 0))); this.justEdit = J ? J[0] : 'sol'; }
    this.cur = { p, edit, h, rot };
    const el = document.createElement('div'); el.className = 'tedit';
    el.innerHTML = '<textarea spellcheck="false" rows="1" placeholder="Metin yazın…"></textarea>' +
      '<div class="tbar"><label>Yükseklik<input class="tH" type="text" value="' + (+h.toPrecision(6)) + '"></label>' +
      '<label>Açı°<input class="tR" type="text" value="' + (+(+rot).toPrecision(6)) + '"></label>' +
      '<select class="tJ">' + TEXT_JUST.map(j => '<option value="' + j[0] + '"' + (j[0] === (edit ? this.justEdit : this.just) ? ' selected' : '') + '>' + j[1] + '</option>').join('') + '</select>' +
      '<button class="tOk" title="Bitir (Enter)">✓</button><button class="tNo" title="Vazgeç (Esc)">✕</button></div>' +
      '<div class="thint">Enter: bitir · Shift+Enter: yeni satır · Esc: vazgeç</div>';
    $('view').appendChild(el); this.box = el;
    const ta = el.querySelector('textarea');
    ta.value = d ? d.str : '';
    const stop = (e) => e.stopPropagation();
    for (const ev of ['pointerdown', 'mousedown', 'wheel', 'dblclick', 'contextmenu']) el.addEventListener(ev, stop);
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(false); }
    });
    for (const k of ['tH', 'tR']) el.querySelector('.' + k).addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); this.commit(); } if (e.key === 'Escape') this.close(false); });
    ta.addEventListener('input', () => this.layout());
    el.querySelector('.tH').addEventListener('input', () => this.layout());
    el.querySelector('.tR').addEventListener('input', () => this.layout());
    el.querySelector('.tJ').addEventListener('change', () => this.layout());
    el.querySelector('.tOk').onclick = () => this.commit();
    el.querySelector('.tNo').onclick = () => this.close(false);
    this.layout();
    setTimeout(() => { ta.focus(); ta.select(); }, 0);
    app.prompt(edit ? 'Metni düzenleyin — Enter: bitir · Esc: vazgeç' : 'Metin yazın — Enter: bitir · Shift+Enter: yeni satır · Esc: vazgeç · başka noktaya tıklayın: yeni metin');
  }
  vals() {
    const b = this.box, h = num(b.querySelector('.tH').value), r = num(b.querySelector('.tR').value);
    return { h: h > 0 ? h : this.cur.h, rot: isFinite(r) ? r : 0, just: b.querySelector('.tJ').value, str: b.querySelector('textarea').value };
  }
  // düzenleyiciyi metnin çizimdeki yerine, ölçeğine ve açısına yerleştir
  layout() {
    if (!this.box) return;
    const v = this.vals(), ta = this.box.querySelector('textarea'), R = this.R;
    const s = R.w2s(this.cur.p[0], this.cur.p[1], this.cur.p[2] || 0);
    const px = Math.max(11, Math.min(96, v.h * R.scale * 1.25));
    ta.style.fontSize = px + 'px'; ta.style.lineHeight = (px * 1.25) + 'px';
    const lines = v.str.split('\n');
    ta.style.height = (lines.length * px * 1.25 + 8) + 'px';
    ta.style.width = Math.max(120, Math.max(...lines.map(l => l.length)) * px * 0.62 + 24) + 'px';
    const J = TEXT_JUST.find(j => j[0] === v.just) || TEXT_JUST[0];
    const w = ta.offsetWidth, hh = ta.offsetHeight;
    // hizalama noktası = tıklanan nokta
    const ax = J[2] === 1 || J[2] === 4 ? w / 2 : J[2] === 2 ? w : 0, ay = J[3] === 3 ? 0 : J[3] === 2 ? hh / 2 : hh - px * 0.3;
    ta.style.textAlign = J[2] === 1 || J[2] === 4 ? 'center' : J[2] === 2 ? 'right' : 'left';
    this.box.style.left = (s[0] - ax) + 'px'; this.box.style.top = (s[1] - ay) + 'px';
    ta.style.transformOrigin = ax + 'px ' + ay + 'px'; ta.style.transform = 'rotate(' + (-v.rot) + 'deg)';
  }
  commit() {
    if (!this.box) return false;
    const app = this.app, v = this.vals(), c = this.cur, str = v.str.replace(/\s+$/, '');
    this.close(true);
    if (!str.trim()) return false;
    if (!app.ready()) return false;
    app.textH = v.h; app.textRot = v.rot;
    const J = TEXT_JUST.find(j => j[0] === v.just) || TEXT_JUST[0];
    if (!c.edit) { this.just = v.just; app.setSetting('textJust', v.just); }
    const a = app.absP(c.p), multi = str.indexOf('\n') >= 0;
    const base = c.edit ? { layer: c.edit.def.layer, aci: c.edit.def.aci, style: c.edit.def.style } : {};
    const def = multi
      ? Object.assign(app.newDef('MTEXT', { x: a[0], y: a[1], z: c.p[2] || 0, h: v.h, rot: v.rot, str, attach: J[4] }), base)
      : Object.assign(app.newDef('TEXT', { x: a[0], y: a[1], z: c.p[2] || 0, h: v.h, rot: v.rot, str, ha: J[2], va: J[3], wf: c.edit && c.edit.def.wf }), base);
    if (c.edit) {
      if (c.edit.def.layer !== undefined) delete def.li;
      app.editor.replace([c.edit.id], [def], 'Metin düzenlendi');
      app.store.clearSel(); app.selChanged();
    } else app.editor.create(def);
    return true;
  }
  close(keep) {
    if (this.box) { this.box.remove(); this.box = null; }
    if (!keep) this.cur = null;
    this.app.updatePrompt();
  }
  // seç aracında çift tık: yazıyı düzenle
  async editAt(x, y) {
    const app = this.app, S = app.store; if (!S.grid || !app.R.is2D) return false;
    const id = S.pick(x, y, 6 / app.R.scale); if (id < 0) return false;
    const t = app.core.TYPE_NAMES[S.E.type.a[id]]; if (t !== 'TEXT' && t !== 'MTEXT') return false;
    const d = await app.getDef(id); if (!d || d.str === undefined) return false;
    const r = app.rel(d.x, d.y);
    app.setTool('text');
    this.open([r[0], r[1], d.z || 0], { id, def: d });
    return true;
  }
}

FastDXF.use({
  name: 'metin',
  init(app) {
    const T = app.textTool = new TextTool(app);
    app.addTool('text', {
      wantsPoints: true,
      prompt: () => 'Metin: yerleşim noktasını tıklayın (yakalama ve hiza geçerli)',
      start() { },
      click(p) { if (T.box) T.commit(); if (app.ready()) T.open(p, null); },
      input(s) { const p = app.parsePoint(s, null); if (!p) return false; this.click(p); return true; },
      cancel() { T.close(false); },
      enter() { if (T.box) { T.commit(); return true; } return false; }
    }, { plan: true });
    const sel = app.tools.select, oldDbl = sel.dbl;
    sel.dbl = function () { T.editAt(app.mouse.wx, app.mouse.wy).then(ok => { if (!ok && oldDbl) oldDbl.call(sel); }); };
    // görünüm değişince düzenleyici yerini korusun
    const prevDraw = app.R.onDraw;
    app.R.onDraw = () => { if (prevDraw) prevDraw(); if (T.box) T.layout(); };
    app.addCommand(['ed', 'ddedit', 'textedit', 'metindüzenle'], 'textedit', 'Metni düzenle (yazıya çift tık)', 'Değiştir', () => app.toast('Seç aracında yazının üzerine çift tıklayın.'));
  }
});
