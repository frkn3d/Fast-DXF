/* Fast DXF — katman paneli ve katman özellikleri
 * Satır: görünürlük · kilit · renk · ad · nesne sayısı. Tık: aktif katman · çift tık: yalnız bu · sağ tık: menü.
 * Renk / ad / kilit / silme geri alınabilir komutlardır (Editor.layerProps) ve kaydederken LAYER tablosuna yazılır. */
'use strict';

const LAY_ICON = {
  eyeOn: '<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1A10 10 0 0112 6c7 0 11 6 11 6a17 17 0 01-3.3 3.9M6.3 6.3C3 8.4 1 12 1 12s4 7 11 7a10 10 0 005.7-1.7"/></svg>',
  lockOn: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
  lockOff: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/></svg>'
};
const LAYER_BAD_CHARS = /[<>\/\\":;?*|=`]/;

class LayerPanel {
  constructor(app) { this.app = app; this.S = app.store; }
  // DXF'in zorunlu sistem katmanları ("0", "Defpoints") boşsa ve aktif değilse listede gösterilmez
  sysHidden(i) {
    const L = this.S.layers[i]; if (!L || i === this.app.curLayer || (L.count || 0) > 0) return false;
    const n = L.name.toLowerCase(); return n === '0' || n === 'defpoints';
  }
  // görünen (silinmemiş) katmanlar, ada göre
  visibleIdx(q) {
    const S = this.S;
    const idx = S.layers.map((L, i) => i).filter(i => S.layers[i] && !S.layers[i].deleted && !this.sysHidden(i) && (!q || S.layers[i].name.toLocaleLowerCase('tr').includes(q)));
    return idx.sort((a, b) => S.layers[a].name.localeCompare(S.layers[b].name, 'tr', { numeric: true }));
  }
  render() {
    const app = this.app, S = this.S, q = ($('laySearch').value || '').toLocaleLowerCase('tr');
    const idx = this.visibleIdx(q), parts = [];
    for (const i of idx.slice(0, 5000)) {
      const L = S.layers[i], on = S.layerVis[i];
      parts.push('<div class="lay' + (on ? '' : ' off') + (L.locked ? ' locked' : '') + (i === app.curLayer ? ' cur' : '') + '" data-i="' + i + '" title="' + esc(L.name) + '">' +
        '<button class="eye" data-eye="1" title="' + (on ? 'Gizle' : 'Göster') + '">' + (on ? LAY_ICON.eyeOn : LAY_ICON.eyeOff) + '</button>' +
        '<button class="eye lk' + (L.locked ? ' on' : '') + '" data-lock="1" title="' + (L.locked ? 'Kilidi aç' : 'Kilitle (seçilemez, düzenlenemez)') + '">' + (L.locked ? LAY_ICON.lockOn : LAY_ICON.lockOff) + '</button>' +
        '<span class="sw" data-color="1" title="Renk: ACI ' + L.aci + ' — değiştirmek için tıklayın" style="background:' + app.R.colorCss(L.rgba) + '"></span>' +
        '<span class="nm">' + esc(L.name) + '</span><span class="ct">' + fmtN(L.count || 0) + '</span></div>');
    }
    $('layers').innerHTML = parts.join('');
    const n = S.layers.filter((L, i) => L && !L.deleted && !this.sysHidden(i)).length;
    $('layCount').textContent = n ? '(' + n + ')' : '';
    // aktif katman seçici
    const sel = $('curLayer'), sorted = this.visibleIdx('').map(i => [S.layers[i].name, i]);
    sel.innerHTML = sorted.length ? sorted.map(([nm, i]) => '<option value="' + i + '"' + (i === app.curLayer ? ' selected' : '') + '>' + esc(nm) + '</option>').join('') : '<option>—</option>';
  }
  setCurrent(i) {
    const L = this.S.layers[i]; if (!L || L.deleted) return;
    this.app.curLayer = i; this.render();
  }
  // ── renk
  aciGrid(sel) {
    let cells = '';
    for (let i = 1; i < 256; i++) cells += '<i data-aci="' + i + '" title="ACI ' + i + '" style="background:' + this.app.R.colorCss(this.app.core.ACI[i]) + (i === sel ? ';outline:2px solid #fff' : '') + '"></i>';
    return cells;
  }
  colorDialog(i) {
    const app = this.app, L = this.S.layers[i];
    const std = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(a => '<i data-aci="' + a + '" title="ACI ' + a + '" style="background:' + app.R.colorCss(app.core.ACI[a]) + '"></i>').join('');
    app.modal('<h2>"' + esc(L.name) + '" katman rengi</h2><div style="color:var(--muted);font-size:12px;margin-bottom:6px">Şu an: ACI ' + L.aci + ' · ByLayer (katmana göre) renkli tüm nesneler birlikte değişir.</div>' +
      '<label>Standart renkler</label><div class="aci std">' + std + '</div><label>Renk dizini (ACI)</label><div class="aci" id="lcA">' + this.aciGrid(L.aci) + '</div>' +
      '<div class="btns"><button class="btn" id="mNo">Vazgeç</button></div>', d => {
      d.querySelectorAll('[data-aci]').forEach(el => el.onclick = () => {
        const aci = +el.dataset.aci; app.closeModal();
        if (aci !== L.aci) { app.editor.layerColor(i, aci); this.render(); app.toast('"' + L.name + '" katman rengi: ACI ' + aci); }
      });
      d.querySelector('#mNo').onclick = () => app.closeModal();
    });
  }
  // ── yeniden adlandır
  nameError(name, except) {
    if (!name) return 'Ad boş olamaz.';
    if (LAYER_BAD_CHARS.test(name)) return 'Geçersiz karakter (< > / \\ " : ; ? * | = ` kullanılamaz).';
    if (this.S.layers.some((L, k) => k !== except && L && L.name.toUpperCase() === name.toUpperCase())) return 'Bu adda bir katman zaten var.';
    return '';
  }
  usedInBlocks(i) {
    for (const B of this.S.blocks) {
      if (!B || !B.pos) continue;
      const has = (A, n) => { if (A) for (let v = 0; v < n; v++) if (A[v] === i) return true; return false; };
      if (has(B.lay, B.nV) || has(B.play, B.nP) || has(B.tlay, B.nT)) return true;
    }
    return false;
  }
  renameDialog(i) {
    const app = this.app, L = this.S.layers[i];
    if (L.name === '0' || /^defpoints$/i.test(L.name)) { app.toast('"' + L.name + '" katmanının adı değiştirilemez.'); return; }
    const warn = this.usedInBlocks(i) ? '<div style="color:var(--warn);font-size:12px;margin-top:6px">Bu katman blok tanımlarında da kullanılıyor; blokların içindeki nesneler kaydedilen dosyada eski adla kalır.</div>' : '';
    app.modal('<h2>Katmanı yeniden adlandır</h2><label>Yeni ad</label><input type="text" id="lN" value="' + esc(L.name) + '">' + warn +
      '<div class="btns"><button class="btn" id="mNo">Vazgeç</button><button class="btn pri" id="mOk">Adlandır</button></div>', d => {
      const ok = () => {
        const name = d.querySelector('#lN').value.trim();
        if (name === L.name) { app.closeModal(); return; }
        const err = this.nameError(name, i); if (err) { app.toast(err); return; }
        app.closeModal(); app.editor.layerRename(i, name); this.render(); app.renderProps();
      };
      d.querySelector('#mOk').onclick = ok; d.querySelector('#mNo').onclick = () => app.closeModal();
      d.querySelector('#lN').onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    });
  }
  // ── kilit
  toggleLock(i) {
    const L = this.S.layers[i];
    this.app.editor.layerLock(i, !L.locked); this.render();
    this.app.toast('"' + L.name + '" ' + (L.locked ? 'kilitlendi: nesneleri seçilemez ve düzenlenemez (yakalama çalışır).' : 'kilidi açıldı.'));
  }
  // ── sil (yalnız boş katman)
  remove(i) {
    const app = this.app, S = this.S, L = S.layers[i];
    let why = '';
    if (L.name === '0' || /^defpoints$/i.test(L.name)) why = '"' + L.name + '" katmanı silinemez.';
    else if (i === app.curLayer) why = 'Aktif katman silinemez; önce başka bir katmanı aktif yapın.';
    else if ((L.count || 0) > 0) why = 'Katmanda ' + fmtN(L.count) + ' nesne var. Önce nesneleri silin ya da başka katmana taşıyın.';
    else if (this.usedInBlocks(i)) why = 'Katman blok tanımlarında kullanılıyor.';
    if (why) { app.toast(why, 4500); return; }
    app.editor.layerDelete(i); this.render(); app.toast('"' + L.name + '" katmanı silindi (Ctrl+Z ile geri alınabilir).');
  }
  // ── yeni katman
  newDialog() {
    const app = this.app, S = this.S; let n = 1; while (S.layers.some(L => L.name.toUpperCase() === ('KATMAN' + n))) n++;
    let aci = 7;
    app.modal('<h2>Yeni katman</h2><label>Ad</label><input type="text" id="lN" value="Katman' + n + '"><label>Renk <span id="lC" style="color:var(--text)">ACI 7</span></label><div class="aci" id="lA">' + this.aciGrid(7) + '</div>' +
      '<div class="opts" style="margin-top:10px"><label><input type="checkbox" id="lCur" checked> Aktif katman yap</label></div>' +
      '<div class="btns"><button class="btn" id="mNo">Vazgeç</button><button class="btn pri" id="mOk">Oluştur</button></div>', d => {
      d.querySelector('#lA').onclick = (e) => { const c = e.target.closest('[data-aci]'); if (!c) return; d.querySelectorAll('#lA i').forEach(x => x.style.outline = ''); c.style.outline = '2px solid #fff'; aci = +c.dataset.aci; d.querySelector('#lC').textContent = 'ACI ' + aci; };
      const ok = () => {
        const name = d.querySelector('#lN').value.trim(), err = this.nameError(name, -1);
        if (err) { app.toast(err); return; }
        const cur = d.querySelector('#lCur').checked;
        app.closeModal(); this.add(name, aci, cur);
      };
      d.querySelector('#mOk').onclick = ok; d.querySelector('#mNo').onclick = () => app.closeModal();
      d.querySelector('#lN').onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    });
  }
  add(name, aci, makeCurrent) {
    const app = this.app, S = this.S, i = S.layers.length;
    S.layers.push({ name, aci, rgba: app.core.aciToRgba(aci), off: false, frozen: false, locked: false, count: 0, isNew: true });
    S.layerVis[i] = 1; app.R.updateLayers();
    if (makeCurrent !== false) app.curLayer = i;
    S.dirty = true; this.render(); app.updateDoc();
    app.toast('"' + name + '" katmanı oluşturuldu' + (makeCurrent !== false ? ' ve aktif yapıldı' : ''));
    return i;
  }
  bind() {
    const app = this.app, S = this.S, box = $('layers');
    box.addEventListener('click', (e) => {
      const row = e.target.closest('.lay'); if (!row) return;
      const i = +row.dataset.i;
      if (e.target.closest('[data-eye]')) { S.layerVis[i] = S.layerVis[i] ? 0 : 1; app.setLayerVis((k, v) => v); return; }
      if (e.target.closest('[data-lock]')) { this.toggleLock(i); return; }
      if (e.target.closest('[data-color]')) { this.colorDialog(i); return; }
      this.setCurrent(i); app.toast('Aktif katman: ' + S.layers[i].name);
    });
    box.addEventListener('dblclick', (e) => {
      const row = e.target.closest('.lay'); if (!row || e.target.closest('button,[data-color]')) return;
      const i = +row.dataset.i; app.setLayerVis(k => k === i); app.toast('Yalnızca "' + S.layers[i].name + '" gösteriliyor');
    });
    box.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.lay'); if (!row) return;
      e.preventDefault(); e.stopPropagation();
      const i = +row.dataset.i, L = S.layers[i];
      app.contextMenu(e.clientX, e.clientY, [
        { label: 'Aktif katman yap', fn: () => this.setCurrent(i) },
        { label: 'Bu katmandaki nesneleri seç (' + fmtN(L.count || 0) + ')', fn: () => app.selectLayer(i), disabled: !S.done || L.locked },
        { label: 'Yalnız bu katmanı göster', fn: () => app.setLayerVis(k => k === i) },
        { label: S.layerVis[i] ? 'Katmanı gizle' : 'Katmanı göster', fn: () => { S.layerVis[i] = S.layerVis[i] ? 0 : 1; app.setLayerVis((k, v) => v); } },
        '-',
        { label: 'Renk…', fn: () => this.colorDialog(i) },
        { label: 'Yeniden adlandır…', fn: () => this.renameDialog(i) },
        { label: L.locked ? 'Kilidi aç' : 'Kilitle', fn: () => this.toggleLock(i) },
        { label: 'Katmanı sil', fn: () => this.remove(i) },
        '-',
        { label: 'Seçili nesneleri bu katmana taşı (' + fmtN(S.selList.length) + ')', fn: () => app.editor.layer(S.selList.slice(), i), disabled: !S.selList.length || L.locked }
      ]);
    });
  }
}

FastDXF.use({
  name: 'katmanlar',
  init(app) {
    const P = app.layers = new LayerPanel(app);
    app.renderLayers = () => P.render();
    app.setCurLayer = (i) => P.setCurrent(i);
    app.newLayerDialog = () => P.newDialog();
    app.addLayer = (n, a, c) => P.add(n, a, c);
    P.bind();
  }
});
