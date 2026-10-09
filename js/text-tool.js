/* Fast DXF — metin aracı (TEXT / MTEXT, yerinde düzenleyici)
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
    return this.editId(id);
  }
  isText(id) { const t = this.app.core.TYPE_NAMES[this.app.store.E.type.a[id]]; return t === 'TEXT' || t === 'MTEXT'; }
  // var olan yazıyı yerinde düzenleyicide aç
  async editId(id) {
    const app = this.app; if (!this.isText(id)) return false;
    if (!app.R.is2D) { app.toast('Yazıyı yerinde düzenlemek için plan görünüme geçin; içeriği sağdaki Özellikler panelinden de değiştirebilirsiniz.', 4500); return false; }
    const d = await app.getDef(id); if (!d || d.str === undefined) return false;
    const r = app.rel(d.x, d.y);
    app.setTool('text');
    this.open([r[0], r[1], d.z || 0], { id, def: d });
    return true;
  }
  // Özellikler panelinden: içerik, yükseklik, açı değiştir (yeniden oluşturma; geri alınabilir)
  async applyProps(id, str, h, rot) {
    const app = this.app, d = await app.getDef(id); if (!d || d.str === undefined) return;
    str = str.replace(/\s+$/, ''); if (!str.trim()) { app.toast('Metin boş olamaz (silmek için Sil).'); return; }
    const nd = JSON.parse(JSON.stringify(d)); nd.str = str; if (h > 0) nd.h = h; if (isFinite(rot)) nd.rot = rot;
    if (nd.type === 'TEXT' && str.indexOf('\n') >= 0) { nd.type = 'MTEXT'; const J = TEXT_JUST.find(j => j[2] === (d.ha || 0) && j[3] === (d.va || 0)); nd.attach = J ? J[4] : 1; }
    const ids = app.editor.replace([id], [nd], 'Metin düzenlendi');
    if (ids.length) { app.store.setSel(ids, 'set'); app.selChanged(); }
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
    app.addCommand(['ed', 'ddedit', 'textedit', 'metindüzenle'], 'textedit', 'Metni düzenle (yazıya çift tık)', 'Değiştir', () => {
      const S = app.store, id = S.selList.length === 1 ? S.selList[0] : -1;
      if (id >= 0 && T.isText(id)) T.editId(id); else app.toast('Bir yazı seçip ED yazın ya da yazının üzerine çift tıklayın.');
    });
    // Özellikler paneli: tek yazı seçiliyken içerik / yükseklik / açı düzenleme kartı
    app.hooks.props.push((P, ids) => {
      const S = app.store; if (ids.length !== 1 || !T.isText(ids[0])) return;
      const id = ids[0], E = S.E, t = E.ts.a[id]; if (!E.tc.a[id]) return;
      const X = S.TX, str = S.TS[t], h = X.h.a[t], rot = X.r.a[t] * 180 / Math.PI;
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = '<div class="ch">Metin<span style="text-transform:none;letter-spacing:0;font-weight:400">Shift+Enter: yeni satır</span></div><div class="cb">' +
        '<textarea id="ptStr" rows="' + Math.min(6, Math.max(2, str.split('\n').length)) + '" style="width:100%;resize:vertical;font:13px Arial,sans-serif;background:var(--bg);color:var(--text);border:1px solid var(--line2);border-radius:6px;padding:4px 6px">' + esc(str) + '</textarea>' +
        '<div class="xr"><span class="k">Yükseklik</span><div class="inp"><input id="ptH" value="' + (+h.toPrecision(6)) + '"></div><span></span></div>' +
        '<div class="xr"><span class="k">Açı °</span><div class="inp"><input id="ptR" value="' + (+rot.toFixed(4)) + '"></div><span></span></div>' +
        '<div class="actions"><button class="mini" id="ptOk">Uygula</button><button class="mini" id="ptEd">Yerinde düzenle</button></div></div>';
      const tbl = P.querySelector('table'); if (tbl && tbl.nextSibling) P.insertBefore(card, tbl.nextSibling); else P.appendChild(card);
      const ok = () => T.applyProps(id, card.querySelector('#ptStr').value, num(card.querySelector('#ptH').value), num(card.querySelector('#ptR').value));
      card.querySelector('#ptOk').onclick = ok; card.querySelector('#ptEd').onclick = () => T.editId(id);
      card.querySelector('#ptStr').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ok(); } };
      for (const k of ['#ptH', '#ptR']) card.querySelector(k).onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); };
    });
  }
});
