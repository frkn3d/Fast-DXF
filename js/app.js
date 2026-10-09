/* DXF Okuyucu — arayüz, araçlar, komutlar ve dosya işlemleri */
'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtN = (n) => n.toLocaleString('tr-TR');
const fmtMB = (b) => (b / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' MB';
const num = (s) => { if (s === undefined || s === null) return NaN; s = String(s).trim().replace(/\s/g, ''); if (!s) return NaN; if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.'); return +s; };
const UNITS = { 0: 'birimsiz', 1: 'inç', 2: 'fit', 4: 'milimetre', 5: 'santimetre', 6: 'metre', 7: 'kilometre' };
const UNIT_SFX = { 1: ' in', 2: ' ft', 4: ' mm', 5: ' cm', 6: ' m', 7: ' km' };
const ISO = 35.264;
// Hazır görünümler (az: göz yönünün X ekseninden açısı, el: yükseklik açısı; Z yukarı)
const VIEWS = {
  top: [-90, 90, 'Üst (plan)'], bottom: [-90, -90, 'Alt'], front: [-90, 0, 'Ön'], back: [90, 0, 'Arka'], left: [180, 0, 'Sol'], right: [0, 0, 'Sağ'],
  sw: [-135, ISO, 'GB izometrik'], se: [-45, ISO, 'GD izometrik'], ne: [45, ISO, 'KD izometrik'], nw: [135, ISO, 'KB izometrik']
};
// Plan görünüm gerektiren araçlar (nokta girişi / çizim / değiştirme / ölçüm)
const DRAW_TOOLS = ['line', 'pline', 'spline', 'rect', 'polygon', 'circle', 'circle3', 'arc', 'ellipse', 'point', 'text'];
const PLAN_TOOLS = new Set(DRAW_TOOLS.concat(['move', 'copy', 'rotate', 'scale', 'mirror', 'offset', 'trim', 'extend', 'fillet', 'chamfer', 'break', 'measure', 'area']));
// 3B görünümde de çalışan araçlar: nokta yakalama ile 3B noktalar, boşlukta çalışma düzlemi (Z = başlangıç noktasının kotu)
const TOOLS_3D = new Set(['line', 'pline', 'spline', 'rect', 'polygon', 'circle', 'circle3', 'arc', 'ellipse', 'point', 'move', 'copy', 'measure', 'area', 'grip']);
const planOnly = (name) => PLAN_TOOLS.has(name) && !TOOLS_3D.has(name);
const TOOL_ICON = { line: 'line', pline: 'pline', spline: 'spline', rect: 'rect', polygon: 'polygon', circle: 'circle', circle3: 'circle', arc: 'arc', ellipse: 'ellipse', point: 'point', text: 'text' };
// Komut tablosu: [kısaltmalar, tür ('t' araç, 'c' komut), ad, açıklama, grup]
const COMMANDS = [
  [['l', 'line', 'çizgi'], 't', 'line', 'Çizgi', 'Çiz'],
  [['pl', 'pline', 'polyline'], 't', 'pline', 'Polyline', 'Çiz'],
  [['spl', 'spline'], 't', 'spline', 'Spline (noktalardan geçen)', 'Çiz'],
  [['rec', 'rectang', 'dikdörtgen'], 't', 'rect', 'Dikdörtgen', 'Çiz'],
  [['pol', 'polygon', 'çokgen'], 't', 'polygon', 'Çokgen', 'Çiz'],
  [['c', 'circle', 'daire'], 't', 'circle', 'Daire (merkez, yarıçap)', 'Çiz'],
  [['c3p', '3p'], 't', 'circle3', 'Daire (3 nokta)', 'Çiz'],
  [['a', 'arc', 'yay'], 't', 'arc', 'Yay (3 nokta)', 'Çiz'],
  [['el', 'ellipse', 'elips'], 't', 'ellipse', 'Elips', 'Çiz'],
  [['po', 'point', 'nokta'], 't', 'point', 'Nokta', 'Çiz'],
  [['dt', 't', 'text', 'metin'], 't', 'text', 'Metin', 'Çiz'],
  [['m', 'move', 'taşı'], 't', 'move', 'Taşı', 'Değiştir'],
  [['co', 'cp', 'copy', 'kopyala'], 't', 'copy', 'Kopyala', 'Değiştir'],
  [['ro', 'rotate', 'döndür'], 't', 'rotate', 'Döndür', 'Değiştir'],
  [['sc', 'scale', 'ölçekle'], 't', 'scale', 'Ölçekle', 'Değiştir'],
  [['mi', 'mirror', 'ayna'], 't', 'mirror', 'Ayna', 'Değiştir'],
  [['o', 'offset', 'ötele'], 't', 'offset', 'Öteleme (paralel kopya)', 'Değiştir'],
  [['tr', 'trim', 'buda'], 't', 'trim', 'Buda', 'Değiştir'],
  [['ex', 'extend', 'uzat'], 't', 'extend', 'Uzat', 'Değiştir'],
  [['f', 'fillet', 'kavis'], 't', 'fillet', 'Kavis (köşe yuvarlat)', 'Değiştir'],
  [['cha', 'chamfer', 'pah'], 't', 'chamfer', 'Pah', 'Değiştir'],
  [['br', 'break', 'böl'], 't', 'break', 'Noktada böl', 'Değiştir'],
  [['j', 'join', 'birleştir'], 'c', 'join', 'Birleştir', 'Değiştir'],
  [['x', 'explode', 'patlat'], 'c', 'explode', 'Patlat (polyline → çizgi/yay)', 'Değiştir'],
  [['e', 'erase', 'sil'], 'c', 'erase', 'Sil', 'Değiştir'],
  [['flatten', 'kot', 'düzleştir'], 'c', 'flatten', 'Kot ata / düzleştir', 'Değiştir'],
  [['di', 'dist', 'ölç', 'mea'], 't', 'measure', 'Mesafe ölç (ΔZ, eğim)', 'Ölçüm'],
  [['aa', 'area', 'alan'], 't', 'area', 'Alan ölç', 'Ölçüm'],
  [['z', 'zoom'], 't', 'zoomwin', 'Pencereyle yakınlaş', 'Görünüm'],
  [['ze', 'zoome', 'sığdır'], 'c', 'fit', 'Çizime sığdır', 'Görünüm'],
  [['p', 'pan', 'kaydır'], 't', 'pan', 'Kaydır', 'Görünüm'],
  [['3do', '3dorbit', 'orbit', 'yörünge'], 't', 'orbit', '3B yörünge', 'Görünüm'],
  [['plan', 'üst'], 'c', 'view:top', 'Üst (plan) görünüm', 'Görünüm'],
  [['ön', 'front'], 'c', 'view:front', 'Ön görünüm', 'Görünüm'],
  [['arka', 'back'], 'c', 'view:back', 'Arka görünüm', 'Görünüm'],
  [['sol', 'left'], 'c', 'view:left', 'Sol görünüm', 'Görünüm'],
  [['sağ', 'right'], 'c', 'view:right', 'Sağ görünüm', 'Görünüm'],
  [['alt', 'bottom'], 'c', 'view:bottom', 'Alt görünüm', 'Görünüm'],
  [['gbiso', 'swiso'], 'c', 'view:sw', 'GB izometrik', 'Görünüm'],
  [['gdiso', 'seiso'], 'c', 'view:se', 'GD izometrik', 'Görünüm'],
  [['kdiso', 'neiso'], 'c', 'view:ne', 'KD izometrik', 'Görünüm'],
  [['kbiso', 'nwiso'], 'c', 'view:nw', 'KB izometrik', 'Görünüm'],
  [['ev', 'home'], 'c', 'home', 'Ev görünümü', 'Görünüm'],
  [['persp', 'perspektif'], 'c', 'persp', 'Perspektif / paralel', 'Görünüm'],
  [['tel', 'wire', 'wireframe'], 'c', 'style:wire', 'Görsel stil: tel kafes', 'Görünüm'],
  [['gizli', 'hide', 'hidden'], 'c', 'style:hidden', 'Görsel stil: gizli çizgi', 'Görünüm'],
  [['gölgeli', 'shade', 'shaded'], 'c', 'style:shaded', 'Görsel stil: gölgeli', 'Görünüm'],
  [['arazi', 'tin', 'surface', 'yüzey'], 'c', 'surface', 'Arazi yüzeyi (TIN) oluştur', 'Görünüm'],
  [['bul', 'find'], 'c', 'find', 'Metin bul', 'Araçlar'],
  [['git', 'goto'], 'c', 'goto', 'Koordinata git', 'Araçlar'],
  [['u', 'undo', 'geri'], 'c', 'undo', 'Geri al', 'Araçlar'],
  [['redo', 'yinele'], 'c', 'redo', 'Yinele', 'Araçlar'],
  [['save', 'kaydet', 'qsave'], 'c', 'save', 'DXF kaydet', 'Dosya'],
  [['open', 'aç'], 'c', 'open', 'Aç', 'Dosya']
];
COMMANDS.push([['new', 'yeni'], 'c', 'new', 'Yeni çizim', 'Dosya'], [['op', 'options', 'ayarlar'], 'c', 'settings', 'Ayarlar', 'Araçlar'],
  [['la', 'layer', 'katman'], 'c', 'newlayer', 'Yeni katman', 'Araçlar'], [['os', 'osnap', 'yakala'], 'c', 'osnap', 'Nesne yakalama modları', 'Araçlar']);
const ALIAS = new Map(); for (const c of COMMANDS) for (const a of c[0]) ALIAS.set(a, c);
// Nesne yakalama modları: [anahtar, ad, işaret]
const SNAP_MODES = [['end', 'Uç nokta', '□'], ['mid', 'Orta nokta', '△'], ['cen', 'Merkez', '○'], ['quad', 'Çeyrek noktası', '◇'], ['int', 'Kesişim', '✕'],
  ['perp', 'Dik', '⊥'], ['near', 'En yakın', '⧗'], ['node', 'Düğüm (nokta nesnesi)', '⊗'], ['ins', 'Ekleme noktası (blok, yazı)', '⊡']];
const SNAP_NAME = Object.fromEntries(SNAP_MODES.map(m => [m[0], m[1]]));
const DEFAULT_SNAP = { end: true, mid: true, cen: true, quad: false, int: true, perp: false, near: false, node: true, ins: true };
const DEFAULT_SETTINGS = { theme: 'dark', grid: true, aperture: 12, snapLabels: true, snap: DEFAULT_SNAP, gizmo: true, dynInput: true, wheelInvert: false, zoomSpeed: 1, textLimit: 25000, newUnits: 4, style: 'wire', otrack: true, polar: true, polarInc: 90,
  dynFields: true, gripsAlways: false, originMark: true, axisTripod: true };
function loadSettings() {
  let o = {}; try { o = JSON.parse(localStorage.getItem('fastdxf.settings') || '{}') || {}; } catch (e) { o = {}; }
  const st = Object.assign({}, DEFAULT_SETTINGS, o); st.snap = Object.assign({}, DEFAULT_SNAP, o.snap || {});
  // ayar sürümü 3: yeni çizim birimi varsayılanı milimetre (eski kayıtlarda cm / m kalmışsa)
  if (!(o.settingsVer >= 3)) { if (o.newUnits === undefined || o.newUnits === 5 || o.newUnits === 6) st.newUnits = 4; st.settingsVer = 3; }   // v3: varsayılan birim milimetre (CAD programlarıyla 1 birim = 1 mm)
  return st;
}
function saveSettings(st) { try { localStorage.setItem('fastdxf.settings', JSON.stringify(st)); } catch (e) { /* özel pencerede saklanamayabilir */ } }

class App {
  constructor() {
    this.core = DXFCore();
    // eklenti kancaları: snap() yakalamadan sonra · point(p, base) → nokta ya da null · preview(ctx) · distance(L, base) → nokta ya da null · tool(name) araç değişince
    // under(ctx) ızgaranın hemen üstüne (araç önizlemesinin altına) çizer
    // props(P, ids) özellikler paneline seçim kartı ekler
    this.hooks = { snap: [], point: [], preview: [], distance: [], tool: [], under: [], props: [] };
    this.cenArmed = new Map();   // üzerinde beklenmiş daire/yay/elips → merkez (merkez yakalama yalnız bunlarda)
    this.store = new Store(this.core);
    try { this.R = new Renderer($('gl'), $('ov'), this.store); }
    catch (e) { document.body.innerHTML = '<div style="padding:40px;font:16px sans-serif;color:#ddd">' + esc(e.message) + '</div>'; throw e; }
    this.editor = new Editor(this);
    this.gizmo = new Gizmo(this);
    this.settings = loadSettings();
    this.defCache = new Map(); this.defPending = new Set();   // yakalamada tam geometri
    this.snapOn = true; this.snapModes = Object.assign({}, this.settings.snap);
    this.ortho = false; this.curLayer = 0;
    this.mouse = { sx: 0, sy: 0, wx: 0, wy: 0 };
    this.snapPt = null; this.userMoved = false; this.worker = null;
    this.textH = null; this.lastFit = 0; this.marker = null; this.lastCmd = null;
    this.offsetDist = 1; this.filletR = 0; this.chamferD = 1; this.polySides = 6;
    this.R.preview = (ctx) => this.drawPreview(ctx);
    this.R.onDraw = () => this.afterDraw();
    this.R.setTheme(this.settings.theme !== 'light');
    this.vc = new ViewCubeW(this, $('view'));
    this.initTools();
    for (const pl of FastDXF.plugins) { try { pl.init(this); } catch (e) { console.error('Eklenti başlatılamadı: ' + pl.name, e); } }
    this.applySettings();
    this.bind();
    this.setTool('select');
    new ResizeObserver(() => { this.R.resize(); }).observe($('view'));
    this.updateButtons(); this.update3DUI(); this.updateDoc();
    // açılışta doğrudan boş çizim (tek katman); dosya sürükleyip bırakarak ya da Ctrl+O ile açılır
    setTimeout(() => { if (!this.store.file) this.newDrawing(); }, 0);
  }

  // ───────────── eklenti bağlantı noktaları
  // Komut ekle: aliases (dizi), ad, açıklama, grup; fn(app) verilirse komut doğrudan çalışır, verilmezse aynı adlı araç açılır
  addCommand(aliases, name, label, group, fn) {
    const c = [aliases, fn ? 'f' : 't', name, label, group, fn];
    COMMANDS.push(c); for (const a of aliases) ALIAS.set(a, c);
  }
  // Araç ekle: opts.plan → yalnız plan görünümde; opts.draw → Çiz menüsü aracı
  addTool(name, tool, opts) {
    opts = opts || {};
    this.tools[name] = tool;
    if (opts.plan) PLAN_TOOLS.add(name);
    if (opts.draw) { DRAW_TOOLS.push(name); TOOL_ICON[name] = opts.icon || 'line'; }
  }

  // ───────────── yardımcı diyaloglar
  modal(html, onShow) {
    $('dlg').innerHTML = html; $('modal').classList.add('show');
    if (onShow) onShow($('dlg'));
    const f = $('dlg').querySelector('input,select,button.pri'); if (f) setTimeout(() => { if (f.isConnected) { f.focus(); if (f.select && f.type === 'text') f.select(); } }, 30);
  }
  closeModal() { $('modal').classList.remove('show'); $('dlg').innerHTML = ''; }
  // Esc / pencere dışına tıklama: "Vazgeç" varsa o, tek düğmeli bilgi penceresinde "Tamam/Kapat", yoksa kapat
  dismissModal() {
    const d = $('dlg'), no = d.querySelector('#mNo'); if (no) { no.click(); return; }
    const ok = d.querySelector('#mOk'); if (ok && d.querySelectorAll('.btns button').length === 1) { ok.click(); return; }
    this.closeModal();
  }
  alert(msg) {
    return new Promise(res => this.modal('<h2>Bilgi</h2><div style="max-width:520px">' + esc(msg) + '</div><div class="btns"><button class="btn pri" id="mOk">Tamam</button></div>',
      d => { d.querySelector('#mOk').onclick = () => { this.closeModal(); res(); }; }));
  }
  confirm(msg) {
    return new Promise(res => this.modal('<h2>Onay</h2><div style="max-width:520px">' + esc(msg) + '</div><div class="btns"><button class="btn" id="mNo">Vazgeç</button><button class="btn pri" id="mOk">Evet</button></div>',
      d => { d.querySelector('#mOk').onclick = () => { this.closeModal(); res(true); }; d.querySelector('#mNo').onclick = () => { this.closeModal(); res(false); }; }));
  }
  toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.style.display = 'block';
    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.style.display = 'none', ms || 2600);
  }
  busy(msg) {
    const p = $('prog');
    if (!msg) { if (!this.loading) p.style.display = 'none'; return; }
    p.style.display = 'block'; $('progText').textContent = msg; $('progBar').style.width = '100%';
  }
  yieldUI() { return new Promise(r => setTimeout(r, 16)); }
  prompt(msg) { $('prompt').textContent = msg; }
  contextMenu(x, y, items) {
    const m = $('ctx');
    m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : '<button data-i="' + i + '"' + (it.disabled ? ' disabled' : '') + '>' + esc(it.label) + '</button>').join('');
    m.style.display = 'block';
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, window.innerWidth - r.width - 4) + 'px'; m.style.top = Math.min(y, window.innerHeight - r.height - 4) + 'px';
    m.querySelectorAll('button').forEach(b => b.onclick = (e) => { e.stopPropagation(); m.style.display = 'none'; items[+b.dataset.i].fn(); });
  }
  unit() { const i = this.store.info; return i ? (UNIT_SFX[i.units] || '') : ''; }
  updateDoc() {
    const S = this.store;
    $('docName').innerHTML = S.file ? '<b>' + esc(S.file.name) + '</b>' + (S.isNew ? ' <span style="color:var(--muted)">· yeni, henüz kaydedilmedi</span>' : '') + (S.dirty ? ' <span class="dirty">● kaydedilmemiş değişiklik</span>' : '') : 'Dosya açılmadı';
    document.title = (S.file ? S.file.name + ' — ' : '') + 'Fast DXF';
  }

  // ───────────── dosya açma
  async openDialog() {
    if (window.showOpenFilePicker) {
      try {
        const [h] = await window.showOpenFilePicker({ types: [{ description: 'DXF çizimi', accept: { 'application/dxf': ['.dxf'] } }] });
        this.load(await h.getFile(), h); return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    $('fileIn').click();
  }
  async newDrawing() {
    if (this.store.dirty && !await this.confirm('Kaydedilmemiş değişiklikler var. Yine de yeni çizime başlansın mı?')) return;
    const u = this.settings.newUnits | 0;
    let txt = NEW_DXF_TEMPLATE.replace('$INSUNITS\n 70\n6\n', '$INSUNITS\n 70\n' + u + '\n');
    if (u === 1 || u === 2) txt = txt.replace('$MEASUREMENT\n 70\n1\n', '$MEASUREMENT\n 70\n0\n');   // inç / fit: İngiliz ölçü sistemi
    txt = withStartLayer(txt, START_LAYER);
    this.load(new File([txt], 'Yeni çizim.dxf', { type: 'application/dxf' }), null, { isNew: true, force: true });
  }
  async load(file, handle, opts) {
    if (!file) return;
    opts = opts || {};
    if (!opts.force && this.store.dirty && !await this.confirm('Kaydedilmemiş değişiklikler var. Yine de yeni dosya açılsın mı?')) return;
    this.loadOpts = opts;
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    this.R.freeAll(); this.store.clear(); this.editor.reset(); this.setTool('select'); this.gizmo.invalidate();
    const R = this.R; R.az = -90; R.el = 90; R.persp = false; R.cz = 0; R.zcolor = false; this.setBlockFlat(false);
    this.store.file = file; this.openHandle = handle || null;
    this.loading = true; this.userMoved = false; this.firstFit = false; this.t0 = performance.now();
    $('drop').classList.add('hide');
    $('prog').style.display = 'block'; $('progText').textContent = file.name + ' okunuyor…'; $('progBar').style.width = '0%';
    document.title = file.name + ' — Fast DXF';
    this.renderLayers(); this.renderProps(); this.updateButtons(); this.update3DUI(); this.updateDoc();
    const w = this.worker = spawnWorker(parseWorkerMain);
    w.onmessage = (ev) => this.onMsg(ev.data);
    w.onerror = (ev) => { this.loading = false; this.busy(null); this.alert('Okuma hatası: ' + ev.message); };
    w.postMessage({ file, opts: {} });
  }
  onMsg(m) {
    const S = this.store, d = m.data;
    switch (m.type) {
      case 'layers': S.onLayers(d); this.R.updateLayers(); this.renderLayers(); break;
      case 'chunk': S.onChunk(d); this.R.request(); break;
      case 'ents':
        S.onEnts(d);
        if (!this.firstFit && !this.userMoved) { const bb = robustBox(d.bb); if (bb) { this.R.fit(bb); this.firstFit = true; } }
        break;
      case 'texts': S.onTexts(d); this.R.request(); break;
      case 'inst': S.onInst(d); this.R.request(); break;
      case 'blocks': S.onBlocks(d); this.R.request(); break;
      case 'progress': {
        const p = d.read / d.size;
        $('progBar').style.width = (p * 100).toFixed(1) + '%';
        const el = (performance.now() - this.t0) / 1000;
        $('progText').textContent = S.file.name + ' — %' + (p * 100).toFixed(0) + ' · ' + fmtN(d.ents) + ' nesne · ' + el.toFixed(1) + ' sn' +
          (p > 0.05 ? ' · kalan ~' + Math.max(0, el / p - el).toFixed(0) + ' sn' : '');
        break;
      }
      case 'done': {
        this.loading = false;
        this.worker.terminate(); this.worker = null;
        S.onDone(d);
        S.isNew = !!(this.loadOpts && this.loadOpts.isNew);
        $('prog').style.display = 'none';
        // aktif katman: yeni çizimde başlangıç katmanı; dosyada "0" (yoksa ilk görünür katman)
        const sl = S.isNew ? S.layers.findIndex(L => L.name === START_LAYER) : -1;
        this.curLayer = sl >= 0 ? sl : S.layerVis[0] ? 0 : Math.max(0, S.layers.findIndex((L, i) => S.layerVis[i]));
        this.R.zcr = S.zview.slice();
        if (!this.userMoved) this.R.fit(S.view0);
        this.R.updateLayers(); this.renderLayers(); this.renderProps(); this.updateButtons(); this.update3DUI(); this.updateDoc();
        const sec = ((performance.now() - this.t0) / 1000).toFixed(1);
        const bad = S.suspiciousBlocks();
        if (bad.blocks) this.setBlockFlat(true);
        const faces = S.nTri ? ' · ' + fmtN(Math.round(S.nTri)) + ' yüzey üçgeni (Gölgeli stilde görünür)' : '';
        if (S.isNew) { this.toast('Yeni çizim hazır (' + (UNITS[d.units] || 'birimsiz') + '). Çizmeye başlayın: L, PL, C… · DXF açmak için dosyayı buraya sürükleyin ya da Ctrl+O.', 6000); this.setTool('select'); this.updateDoc(); break; }
        this.toast(S.file.name + ' açıldı: ' + fmtN(S.nEnt) + ' nesne, ' + sec + ' sn' + (S.has3D ? ' · 3B veri var (Shift + orta tuş ile yörünge)' : '') + faces +
          (bad.blocks ? ' · ' + bad.blocks + ' sembol bloğunun iç kotu hatalı görünüyor (' + fmtN(bad.refs) + ' referans); 3B görünümde ekleme kotunda düz çiziliyor.' : ''), bad.blocks ? 9000 : 5000);
        if (!d.eof && !d.binary) this.toast('Uyarı: dosya EOF ile bitmiyor (yarım kalmış olabilir). Okunabilen kısım gösteriliyor.', 6000);
        break;
      }
      case 'error':
        this.loading = false; $('prog').style.display = 'none';
        this.alert('Dosya okunamadı: ' + d);
        break;
    }
  }

  // ───────────── katman paneli
  setLayerVis(fn) {
    const S = this.store;
    for (let i = 0; i < S.layers.length; i++) S.layerVis[i] = fn(i, S.layerVis[i]) ? 1 : 0;
    this.R.updateLayers(); this.renderLayers();
    const keep = S.selList.filter(id => S.layerVis[S.E.layer.a[id]]);
    if (keep.length !== S.selList.length) { S.setSel(keep, 'set'); this.selChanged(); }
  }
  selectWhere(fn, label) {
    const S = this.store; if (!this.ready()) return;
    const E = S.E, fl = E.flags.a, ids = [];
    for (let id = 0; id < S.nEnt; id++) if (!(fl[id] & F_DEL) && fn(id)) ids.push(id);
    S.setSel(ids, 'set'); this.selChanged();
    this.toast(fmtN(S.selList.length) + ' nesne seçildi' + (label ? ' (' + label + ')' : ''));
  }
  selectLayer(i) {
    const S = this.store;
    if (!S.layerVis[i]) { S.layerVis[i] = 1; this.R.updateLayers(); this.renderLayers(); }
    this.selectWhere(id => S.E.layer.a[id] === i, 'katman ' + S.layers[i].name);
  }

  // ───────────── özellikler paneli
  renderProps() {
    const S = this.store, P = $('props');
    if (!S.file) { P.innerHTML = '<div style="color:var(--muted)">Dosya açılmadı.</div>'; return; }
    const info = S.info;
    const o = info ? info.origin : [0, 0];
    const TN = this.core.TYPE_NAMES;
    if (!S.selList.length) {
      if (!info) { P.innerHTML = '<div style="color:var(--muted)">Okunuyor…</div>'; return; }
      // tip sayıları: model alanındaki canlı (silinmemiş) nesnelerden
      const live = {}; { const ty = S.E.type.a, fl = S.E.flags.a; for (let i = 0; i < S.nEnt; i++) if (!(fl[i] & F_DEL)) { const k = TN[ty[i]] || '?'; live[k] = (live[k] || 0) + 1; } }
      const st = Object.entries(live).sort((a, b) => b[1] - a[1]).map(([k, v]) => '<span class="pill sel" data-type="' + esc(k) + '" title="Bu tipteki tüm nesneleri seç">' + esc(k) + ' ' + fmtN(v) + '</span>').join('');
      const un = Object.entries(info.unsupported).map(([k, v]) => '<span class="pill" style="color:var(--warn)">' + esc(k) + ' ' + fmtN(v) + '</span>').join('');
      const surf = S.surfaces.map((s, i) => '<div class="xr" style="grid-template-columns:1fr auto auto"><span>' + esc(s.name) + '<br><span style="color:var(--muted);font-size:11px">' + fmtN(s.n / 3) + ' üçgen</span></span>' +
        '<button class="mini" data-sv="' + i + '">' + (s.visible ? 'Gizle' : 'Göster') + '</button><button class="mini" data-sd="' + i + '">Sil</button></div>').join('');
      P.innerHTML = '<table>' +
        tr('Dosya', esc(S.file.name)) + tr('Boyut', fmtMB(S.file.size)) +
        tr('Sürüm', esc(info.version || '?') + (info.binary ? ' (ikili)' : '')) + tr('Kodlama', esc(info.encoding)) +
        tr('Birim', esc(UNITS[info.units] || ('kod ' + info.units))) +
        tr('Nesne', fmtN(S.nEnt)) + tr('Yazı', fmtN(S.nText)) + tr('Blok referansı', fmtN(S.nInst)) +
        (S.nTri ? tr('Yüzey üçgeni', fmtN(Math.round(S.nTri))) : '') +
        tr('Katman', fmtN(S.layers.length)) + tr('Okuma süresi', (info.ms / 1000).toFixed(1) + ' sn') +
        tr('Kapsam', S.ext ? fmtP(S.ext[0] + o[0], S.ext[1] + o[1]) + '<br>' + fmtP(S.ext[2] + o[0], S.ext[3] + o[1]) : '—') +
        (S.has3D ? tr('Kot (Z)', fmtC(S.zext[0]) + ' … ' + fmtC(S.zext[1]) + (S.zview[0] !== S.zext[0] || S.zview[1] !== S.zext[1] ? '<br><span style="color:var(--muted)">yoğun: ' + fmtC(S.zview[0]) + ' … ' + fmtC(S.zview[1]) + '</span>' : '')) : '') +
        '</table><div style="margin-top:10px;color:var(--muted);font-size:11px">Tipe tıklayın: o tipteki tüm nesneler seçilir</div><div>' + st + '</div>' +
        (un ? '<div style="margin-top:8px;color:var(--muted)">Gösterilemeyen tipler:</div><div>' + un + '</div>' : '') +
        (surf ? '<div class="card"><div class="ch">Arazi yüzeyleri</div><div class="cb">' + surf + '</div></div>' : '') +
        (info.warnings.length ? '<div style="margin-top:8px;color:var(--warn)">' + info.warnings.map(esc).join('<br>') + '</div>' : '') +
        (S.dirty ? '<div style="margin-top:10px;color:var(--warn)">Kaydedilmemiş değişiklikler var.</div>' : '');
      P.querySelectorAll('[data-type]').forEach(el => el.onclick = () => {
        const t = el.dataset.type, codes = new Set(); TN.forEach((n, i) => { if (n === t) codes.add(i); });
        this.selectWhere(id => codes.has(S.E.type.a[id]) && S.layerVis[S.E.layer.a[id]], t);
      });
      P.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => { const s = S.surfaces[+b.dataset.sv]; s.visible = !s.visible; this.R.request(); this.renderProps(); });
      P.querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { const s = S.surfaces.splice(+b.dataset.sd, 1)[0]; this.R.freeSurface(s); this.R.request(); this.renderProps(); this.updateButtons(); });
      return;
    }
    const E = S.E, ids = S.selList;
    const cnt = {}; let len = 0, bb = [Infinity, Infinity, -Infinity, -Infinity], z0 = Infinity, z1 = -Infinity;
    for (const id of ids) {
      const t = TN[E.type.a[id]] || '?'; cnt[t] = (cnt[t] || 0) + 1;
      if (ids.length < 200000) len += S.length(id);
      const b = E.bb.a; bb[0] = Math.min(bb[0], b[4 * id]); bb[1] = Math.min(bb[1], b[4 * id + 1]); bb[2] = Math.max(bb[2], b[4 * id + 2]); bb[3] = Math.max(bb[3], b[4 * id + 3]);
      z0 = Math.min(z0, E.zr.a[2 * id]); z1 = Math.max(z1, E.zr.a[2 * id + 1]);
    }
    const layOpts = S.layers.map((L, i) => [L.name, i]).filter(([n, i]) => !(this.layers && this.layers.sysHidden(i)) && !S.layers[i].deleted).sort((a, b) => a[0].localeCompare(b[0], 'tr', { numeric: true }))
      .map(([n, i]) => '<option value="' + i + '">' + esc(n) + '</option>').join('');
    const types = Object.entries(cnt);
    let html = '<table>' + tr('Seçili', fmtN(ids.length)) + tr('Tipler', types.map(([k, v]) => '<span class="pill' + (types.length > 1 ? ' sel' : '') + '" data-type="' + esc(k) + '"' + (types.length > 1 ? ' title="Seçimi yalnız bu tiple sınırla"' : '') + '>' + esc(k) + ' ' + fmtN(v) + '</span>').join(''));
    const u = this.unit();
    if (ids.length === 1) {
      const id = ids[0], L = S.layers[E.layer.a[id]], aci = E.aci.a[id];
      html += tr('Katman', esc(L ? L.name : '?')) +
        tr('Renk', '<span class="sw" style="display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;background:' + this.R.colorCss(E.color.a[id]) + '"></span> ' + (aci === 256 ? 'Katmana göre' : aci === 0 ? 'Bloğa göre' : 'ACI ' + aci));
      if (E.tc.a[id] && !E.ic.a[id]) html += tr('Metin', esc(S.TS[E.ts.a[id]]).replace(/\n/g, '<br>')) + tr('Yükseklik', fmtC(S.TX.h.a[E.ts.a[id]]));
      if (E.ic.a[id]) { const B = S.blocks[S.IN.blk.a[E.is.a[id]]]; html += tr('Blok', esc(B ? B.name : '?')); }
      if (E.rc.a[id]) html += tr('Yüzey', fmtN(E.rc.a[id] / 3) + ' üçgen');
      const A = S.area(id); if (A !== null) html += tr('Alan', fmtC(A) + (u ? u + '²' : ''));
      if (E.flags.a[id] & F_NEW) html += tr('Durum', '<span style="color:var(--ok)">Yeni (kaydedilmedi)</span>');
      else if (S.edits.has(id) && Export.editState(this).changed(S.edits.get(id))) html += tr('Durum', '<span style="color:var(--warn)">Değiştirildi</span>');
    }
    if (len) html += tr('Toplam uzunluk', fmtC(len) + u + '<br><span style="color:var(--muted);font-size:11px">plan (yatay) uzunluk</span>');
    if (z0 <= z1) html += tr('Kot (Z)', z0 === z1 ? fmtC(z0) : fmtC(z0) + ' … ' + fmtC(z1));
    html += tr('Kutu', fmtP(bb[0] + o[0], bb[1] + o[1]) + '<br>' + fmtP(bb[2] + o[0], bb[3] + o[1]) + '<br>' + fmtC(bb[2] - bb[0]) + ' × ' + fmtC(bb[3] - bb[1]));
    const c = this.gizmo.origin(), ca = this.abs(c[0], c[1]);
    html += '</table>' +
      '<div class="card"><div class="ch">Dönüşüm<span style="text-transform:none;letter-spacing:0;font-weight:400">merkez ' + fmtC(ca[0]) + ' ; ' + fmtC(ca[1]) + '</span></div><div class="cb">' +
      '<div class="xr"><span class="k">Taşı</span><div class="inp c3"><input id="tDX" class="ax-x" placeholder="ΔX"><input id="tDY" class="ax-y" placeholder="ΔY"><input id="tDZ" class="ax-z" placeholder="ΔZ"></div><button class="mini" id="tMove">Uygula</button></div>' +
      '<div class="xr"><span class="k">Döndür °</span><div class="inp c3"><input id="tRX" class="ax-x" placeholder="X" title="X ekseni etrafında (°)"><input id="tRY" class="ax-y" placeholder="Y" title="Y ekseni etrafında (°)"><input id="tRot" class="ax-z" placeholder="Z" title="Z ekseni etrafında (°), + saat yönü tersi"></div><button class="mini" id="tRotB">Uygula</button></div>' +
      '<div class="xr"><span class="k">Ölçekle</span><div class="inp c3"><input id="tSc" class="ax-x" placeholder="X" title="X çarpanı (yalnız bu doluysa tüm eksenler)"><input id="tScY" class="ax-y" placeholder="Y" title="Y çarpanı"><input id="tScZ" class="ax-z" placeholder="Z" title="Z çarpanı"></div><button class="mini" id="tScB">Uygula</button></div>' +
      '<div class="xr"><span class="k">Ayna</span><div class="inp" style="grid-template-columns:1fr 1fr"><button class="mini" id="tMirV" title="Merkezden geçen dikey eksene göre">↔ Dikey eksen</button><button class="mini" id="tMirH" title="Merkezden geçen yatay eksene göre">↕ Yatay eksen</button></div><span></span></div>' +
      '<div class="xr"><span class="k">Kot ata</span><div class="inp"><input id="tZ" class="ax-z" placeholder="Z değeri (düzleştir)"></div><button class="mini" id="tZB">Uygula</button></div>' +
      '</div></div>' +
      '<div style="margin-top:10px"><label style="color:var(--muted)">Katmanı değiştir</label><select id="pLayer"><option value="">— seçin —</option>' + layOpts + '</select></div>' +
      '<div class="actions"><button class="mini" id="pZoom">Seçime yakınlaş</button><button class="mini" id="pColor">Renk…</button><button class="mini" id="pDel">Sil</button>' +
      '<button class="mini" id="pSave">Seçimi DXF kaydet</button><button class="mini" id="pIso">Yalnız bu katman(lar)</button>' +
      (ids.length === 1 ? '<button class="mini" id="pRaw">Ham DXF verisi</button>' : '') + '<button class="mini" id="pClear">Seçimi bırak</button></div>';
    P.innerHTML = html;
    P.querySelectorAll('.pill.sel[data-type]').forEach(el => el.onclick = () => {
      const t = el.dataset.type; S.setSel(S.selList.filter(id => TN[E.type.a[id]] === t), 'set'); this.selChanged();
    });
    const sel = () => S.selList.slice(), ed = this.editor, gz = () => this.gizmo.origin();
    const enter = (ids2, fn) => ids2.forEach(i => { const el = $(i); if (el) el.onkeydown = (e) => { if (e.key === 'Enter') fn(); e.stopPropagation(); }; });
    const doMove = () => { const dx = num($('tDX').value) || 0, dy = num($('tDY').value) || 0, dz = num($('tDZ').value) || 0; if (dx || dy || dz) { ed.move(sel(), dx, dy, dz); this.afterXform(); } };
    const doRot = () => {
      const ax = num($('tRX').value) || 0, ay = num($('tRY').value) || 0, az = num($('tRot').value) || 0, c2 = gz();
      if (!ax && !ay) { if (az) { ed.rotate(sel(), c2[0], c2[1], az); this.afterXform(); } return; }
      // X, sonra Y, sonra Z (merkez etrafında)
      let M = gzRot(c2, [1, 0, 0], ax * Math.PI / 180);
      M = this.core.mMul(gzRot(c2, [0, 1, 0], ay * Math.PI / 180), M); M = this.core.mMul(gzRot(c2, [0, 0, 1], az * Math.PI / 180), M);
      ed.xform(sel(), M, 'rotate', S.selList.length + ' nesne döndürüldü (X ' + ax + '°, Y ' + ay + '°, Z ' + az + '°)'); this.afterXform();
    };
    const doSc = () => {
      const kx = num($('tSc').value), ky = num($('tScY').value), kz = num($('tScZ').value), c2 = gz();
      const X = kx > 0 ? kx : 1, onlyX = kx > 0 && !(ky > 0) && !(kz > 0);
      const Y = onlyX ? X : (ky > 0 ? ky : 1), Z = onlyX ? X : (kz > 0 ? kz : 1);
      if (X === 1 && Y === 1 && Z === 1) return;
      if (X === Y) ed.scale(sel(), c2[0], c2[1], c2[2], X, Z);
      else ed.xform(sel(), gzScale(c2, X, Y, Z), 'scale', S.selList.length + ' nesne ölçeklendi (X ' + X + ', Y ' + Y + ', Z ' + Z + ')');
      this.afterXform();
    };
    const doZ = () => { const z = num($('tZ').value); if (isFinite(z)) { ed.flatten(sel(), z); this.afterXform(); } };
    $('tMove').onclick = doMove; $('tRotB').onclick = doRot; $('tScB').onclick = doSc; $('tZB').onclick = doZ;
    enter(['tDX', 'tDY', 'tDZ'], doMove); enter(['tRX', 'tRY', 'tRot'], doRot); enter(['tSc', 'tScY', 'tScZ'], doSc); enter(['tZ'], doZ);
    $('tMirV').onclick = () => { const c2 = gz(); ed.xform(sel(), ed.mirrorT(c2[0], c2[1], c2[0], c2[1] + 1), 'mirror', S.selList.length + ' nesne aynalandı'); this.afterXform(); };
    $('tMirH').onclick = () => { const c2 = gz(); ed.xform(sel(), ed.mirrorT(c2[0], c2[1], c2[0] + 1, c2[1]), 'mirror', S.selList.length + ' nesne aynalandı'); this.afterXform(); };
    $('pLayer').onchange = (e) => { if (e.target.value !== '') this.editor.layer(S.selList.slice(), +e.target.value); };
    $('pZoom').onclick = () => this.zoomSel();
    $('pColor').onclick = () => this.colorDialog();
    $('pDel').onclick = () => this.deleteSel();
    $('pSave').onclick = () => Export.saveDXF(this, 'subset', S.selList.slice());
    $('pIso').onclick = () => { const Ls = new Set(S.selList.map(id => E.layer.a[id])); this.setLayerVis(i => Ls.has(i)); this.toast(Ls.size + ' katman gösteriliyor'); };
    $('pClear').onclick = () => { S.clearSel(); this.selChanged(); };
    if ($('pRaw')) $('pRaw').onclick = () => this.showRaw(ids[0]);
    for (const h of this.hooks.props) h(P, ids);
  }
  afterXform() { this.gizmo.invalidate(); this.selChanged(); }
  async showRaw(id) {
    const S = this.store, E = S.E;
    if (E.flags.a[id] & F_NEW) {
      const inf = S.newInfo.get(id);
      this.modal('<h2>Yeni nesne</h2><pre class="raw">' + esc(JSON.stringify(inf.def || { kopyaKaynagi: inf.src }, null, 2)) + '</pre><div class="btns"><button class="btn pri" id="mOk">Kapat</button></div>', d => d.querySelector('#mOk').onclick = () => this.closeModal());
      return;
    }
    const fs = E.fs.a[id], fe = Math.min(E.fe.a[id], fs + 200000);
    const buf = await S.file.slice(fs, fe).arrayBuffer();
    let txt;
    if (S.info.binary) txt = '(İkili DXF — ham veri metin olarak gösterilemez; ' + (fe - fs) + ' bayt)';
    else { txt = new TextDecoder(S.info.encoding).decode(buf); const L = txt.split(/\r?\n/); const out = []; for (let i = 0; i + 1 < L.length; i += 2) out.push(L[i].padStart(4) + '  ' + L[i + 1]); txt = out.join('\n'); }
    this.modal('<h2>Ham DXF verisi <span style="color:var(--muted);font-size:12px">bayt ' + fmtN(fs) + '–' + fmtN(E.fe.a[id]) + '</span></h2><pre class="raw">' + esc(txt) + '</pre><div class="btns"><button class="btn pri" id="mOk">Kapat</button></div>',
      d => d.querySelector('#mOk').onclick = () => this.closeModal());
  }

  // ───────────── seçim / düzenleme yardımcıları
  selChanged() { this.gizmo.invalidate(); this.R.hl.dirty = true; this.R.request(); this.renderProps(); this.updateButtons(); }
  // yeni / değişen nesneler kapsamı değiştirir: sığdırma ve 3B odak öncesi yeniden hesaplanır
  freshExtents() { const S = this.store; if (S.extDirty && S.done) { S.computeExtents(); S.extDirty = false; } }
  onEdited() { this.store.extDirty = true; this.defCache.clear(); this.gizmo.invalidate(); this.renderLayers(); this.renderProps(); this.updateButtons(); this.updateDoc(); }
  ready() { if (!this.store.done) { this.toast('Dosya henüz okunuyor, lütfen bekleyin.'); return false; } return true; }
  deleteSel() { if (!this.ready()) return; const ids = this.store.selList.slice(); if (!ids.length) { this.toast('Silinecek nesne seçili değil.'); return; } this.editor.remove(ids); this.selChanged(); }
  zoomSel() {
    const S = this.store, E = S.E; if (!S.selList.length) return;
    const bb = [Infinity, Infinity, -Infinity, -Infinity], zr = [Infinity, -Infinity];
    for (const id of S.selList) {
      const b = E.bb.a; bb[0] = Math.min(bb[0], b[4 * id]); bb[1] = Math.min(bb[1], b[4 * id + 1]); bb[2] = Math.max(bb[2], b[4 * id + 2]); bb[3] = Math.max(bb[3], b[4 * id + 3]);
      zr[0] = Math.min(zr[0], E.zr.a[2 * id]); zr[1] = Math.max(zr[1], E.zr.a[2 * id + 1]);
    }
    this.zoomBox(bb, zr);
  }
  zoomBox(bb, zr) {
    const w = bb[2] - bb[0], h = bb[3] - bb[1], m = Math.max(w, h, 1) * 0.15;
    this.R.fit([bb[0] - m, bb[1] - m, bb[2] + m, bb[3] + m], 0, zr); this.userMoved = true;
  }
  colorDialog() {
    if (!this.ready()) return;
    const S = this.store; if (!S.selList.length) { this.toast('Önce nesne seçin.'); return; }
    let cells = '';
    for (let i = 1; i < 256; i++) cells += '<i data-aci="' + i + '" title="ACI ' + i + '" style="background:' + this.R.colorCss(this.core.ACI[i]) + '"></i>';
    this.modal('<h2>Renk seç (' + fmtN(S.selList.length) + ' nesne)</h2><div class="opts"><button class="btn" data-aci="256">Katmana göre (ByLayer)</button><button class="btn" data-aci="7">Beyaz/Siyah (7)</button></div><div class="aci">' + cells + '</div><div class="btns"><button class="btn" id="mNo">Vazgeç</button></div>', d => {
      d.querySelectorAll('[data-aci]').forEach(el => el.onclick = () => { this.closeModal(); this.editor.color(S.selList.slice(), +el.dataset.aci); });
      d.querySelector('#mNo').onclick = () => this.closeModal();
    });
  }
  updateButtons() {
    const S = this.store, done = !!S.file && S.done, sel = S.selList.length > 0;
    const need = { done, sel: done && sel, info: !!S.info, surf: S.surfaces.length > 0 };
    document.querySelectorAll('[data-need]').forEach(b => b.disabled = !need[b.dataset.need]);
    $('bUndo').disabled = !this.editor.undoStack.length; $('bRedo').disabled = !this.editor.redoStack.length;
    if (this.pointMode && !(sel && done)) this.pointMode = false;
    const gb = $('gzBar'), show = this.gizmo.enabled && sel && done && this.toolName === 'select';
    gb.classList.toggle('show', !!(sel && done && this.toolName === 'select'));
    gb.querySelectorAll('[data-gizmo]').forEach(b => b.classList.toggle('on', b.dataset.gizmo === 'points' ? !!this.pointMode : this.pointMode ? false : b.dataset.gizmo === 'off' ? !this.gizmo.enabled : (this.gizmo.enabled && b.dataset.gizmo === this.gizmo.mode)));
    if (!show) this.gizmo.hover = null;
  }

  // ───────────── 3B görünüm
  focus() {
    this.freshExtents();
    const S = this.store, ext = S.ext;
    let bb = this.R.viewBox();
    if (ext) bb = [Math.max(bb[0], ext[0]), Math.max(bb[1], ext[1]), Math.min(bb[2], ext[2]), Math.min(bb[3], ext[3])];
    if (!(bb[0] < bb[2] && bb[1] < bb[3])) bb = (S.view0 || ext || [-50, -50, 50, 50]).slice();
    const zr = S.done ? S.zRange(bb) : S.zview;
    return { bb, zr };
  }
  setView(az, el, bb, zr) {
    const R = this.R;
    if (!bb) { const f = this.focus(); bb = f.bb; zr = f.zr; }
    if (R.is2D) R.cz = (zr[0] + zr[1]) / 2;
    const p = R.fitParams(bb, zr, 0.04, az, el);
    this.userMoved = true;
    R.animateTo({ az, el, cx: p.cx, cy: p.cy, cz: p.cz, scale: p.scale }, 450, () => this.viewChanged());
    this.vcLoop();
  }
  setNamedView(k) { const v = VIEWS[k]; if (v) { this.setView(v[0], v[1]); this.toast(v[2] + ' görünüm'); } }
  homeView() { this.freshExtents(); const S = this.store; this.setView(-135, ISO, (S.view0 || S.ext || [-50, -50, 50, 50]).slice(), S.zview); }
  vcLoop() { const f = () => { this.vc.draw(); if (this.R.anim) requestAnimationFrame(f); }; requestAnimationFrame(f); }
  beginOrbit() {
    const R = this.R;
    if (R.anim) { cancelAnimationFrame(R.anim); R.anim = null; }
    if (R.is2D) { const f = this.focus(); R.cz = (f.zr[0] + f.zr[1]) / 2; }
    this.snapPt = null;
  }
  orbitBy(dx, dy) { this.R.orbit(-dx * 0.4, dy * 0.4); this.userMoved = true; this.vc.draw(); }
  endOrbit() { this.viewChanged(); }
  togglePersp() {
    const R = this.R;
    if (!R.persp && R.is2D) { const f = this.focus(); R.cz = (f.zr[0] + f.zr[1]) / 2; }
    R.persp = !R.persp; R.request();
    this.viewChanged(); this.toast(R.persp ? 'Perspektif izdüşüm' : 'Paralel izdüşüm');
  }
  setZScale(v) {
    const R = this.R; if (!(v > 0)) return;
    R.zs = v; R.request(); this.update3DUI();
    this.toast('Düşey abartma: ' + v + '×' + (R.is2D ? ' (3B görünümde etkili)' : ''));
  }
  toggleZColor() {
    const R = this.R, S = this.store;
    R.zcolor = !R.zcolor;
    if (R.zcolor && S.done) R.zcr = S.zRange(this.focus().bb);
    R.request(); this.update3DUI();
    if (R.zcolor && !S.has3D) this.toast('Bu çizimde kot (Z) bilgisi yok; tüm nesneler aynı renkte görünür.', 4000);
  }
  // Kenar (tel kafes) çizgileri: yüzeyli stillerde kapatılabilir; tel kafeste kapatmak gölgeliye geçirir
  toggleEdges() {
    const R = this.R; R.edges = !R.edges;
    if (!R.edges && R.style === 'wire') { R.style = 'shaded'; this.toast('Çizgiler gizlendi; yüzeyler gölgeli gösteriliyor.'); }
    R.request(); this.update3DUI();
  }
  setStyle(s) {
    if (s === 'wire') this.R.edges = true;
    this.R.style = s; this.R.request(); this.update3DUI();
    const S = this.store;
    if (s !== 'wire' && !S.nTri && !S.surfaces.length) this.toast('Bu çizimde yüzey (3DFACE, kafes, kalınlık) yok. Haritalar için "Arazi yüzeyi" ile noktalardan yüzey oluşturabilirsiniz.', 6000);
  }
  setBlockFlat(on, say) {
    this.R.blockFlat = this.store.flatBlocks = !!on; this.R.request(); this.update3DUI();
    if (say) this.toast(on ? 'Blok sembolleri ekleme kotunda düz çiziliyor' : 'Blok sembolleri dosyadaki iç kotlarıyla çiziliyor');
  }
  viewChanged() {
    if (!this.R.is2D && planOnly(this.toolName)) this.setTool('select');
    this.snapPt = null; this.update3DUI(); this.updatePrompt(); this.R.request();
  }
  update3DUI() {
    const R = this.R;
    document.querySelectorAll('[data-view]').forEach(b => { const v = VIEWS[b.dataset.view]; b.classList.toggle('on', Math.abs(R.az - v[0]) < 0.01 && Math.abs(R.el - v[1]) < 0.01); });
    document.querySelectorAll('[data-zs]').forEach(b => b.classList.toggle('on', +b.dataset.zs === R.zs));
    document.querySelectorAll('[data-style]').forEach(b => b.classList.toggle('on', b.dataset.style === R.style));
    $('o3Persp').classList.toggle('on', R.persp); $('o3Edges').classList.toggle('on', R.edges); $('o3ZCol').classList.toggle('on', R.zcolor); $('o3Flat').classList.toggle('on', R.blockFlat);
    const lg = $('zlegend');
    if (R.zcolor) { lg.style.display = 'block'; $('zlMin').textContent = fmtC(R.zcr[0]); $('zlMax').textContent = fmtC(R.zcr[1]); }
    else lg.style.display = 'none';
    const st = { wire: '', hidden: ' · gizli çizgi', shaded: ' · gölgeli' }[R.style] + (R.edges ? '' : ' · kenarsız');
    $('viewName').textContent = (R.is2D ? 'Plan' : (Object.values(VIEWS).find(v => Math.abs(R.az - v[0]) < 0.01 && Math.abs(R.el - v[1]) < 0.01) || [0, 0, '3B'])[2]) + (R.persp ? ' · perspektif' : '') + st;
    this.vc.draw();
  }

  // ───────────── arazi yüzeyi (TIN)
  surfaceDialog() {
    if (!this.ready()) return;
    const S = this.store, E = S.E, f = this.focus(), zr = f.zr, pad = Math.max(1, (zr[1] - zr[0]) * 0.03);
    // katman önerisi: eş yükselti / kot / nokta katmanları ve nokta içeren katmanlar
    const ptLayers = new Set(); for (let id = 0; id < S.nEnt; id++) if (E.flags.a[id] & F_POINTS) ptLayers.add(E.layer.a[id]);
    const re = /(EGR|E[ĞG]R[İI]|KOT|NOKTA|POINT|CONTOUR|(^|[_\s-])TOPO|ARAZ|ESYUK|EŞYÜK|SPOT|ELEV)/i;
    const vis = S.layers.map((L, i) => i).filter(i => S.layerVis[i] && (S.layers[i].count || 0) > 0);
    let pre = new Set(vis.filter(i => re.test(S.layers[i].name)));
    if (!pre.size) pre = new Set(vis.filter(i => ptLayers.has(i)));
    if (!pre.size) pre = new Set(vis);
    const rows = vis.sort((a, b) => S.layers[a].name.localeCompare(S.layers[b].name, 'tr', { numeric: true }))
      .map(i => '<label style="display:flex;gap:6px;margin:0;padding:2px 4px;color:var(--text)"><input type="checkbox" data-li="' + i + '"' + (pre.has(i) ? ' checked' : '') + '>' + esc(S.layers[i].name) + ' <span style="color:var(--muted);margin-left:auto">' + fmtN(S.layers[i].count) + '</span></label>').join('');
    this.modal('<h2>Arazi yüzeyi (TIN) oluştur</h2><div style="color:var(--muted);max-width:520px;font-size:12px">Seçili katmanlardaki noktalar ve çizgi köşeleri (eş yükselti eğrileri, kotlu noktalar, 3B polyline\'lar) Delaunay yöntemiyle üçgenlenir. Şev sembolleri, yapı ve yazı gibi kotu güvenilmez katmanları dahil etmeyin.</div>' +
      '<label>Kaynak katmanlar <span style="font-size:11px">(öneri: eş yükselti, kot ve nokta katmanları)</span></label>' +
      '<div style="display:flex;gap:4px;margin-bottom:4px"><button class="mini" id="sAll">Hepsi</button><button class="mini" id="sNone">Hiçbiri</button><button class="mini" id="sSug">Öneri</button></div>' +
      '<div id="sLays" style="max-height:180px;overflow:auto;border:1px solid var(--line2);border-radius:7px;padding:4px">' + rows + '</div>' +
      '<label>Alan</label><div class="opts"><label><input type="radio" name="sreg" value="view" checked> Ekrandaki alan</label><label><input type="radio" name="sreg" value="all"> Tüm çizim</label></div>' +
      '<label>Kot aralığı (dışındaki köşeler yok sayılır — aykırı 0 kotlarını eler)</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><input type="text" id="sZ0" value="' + (zr[0] - pad).toFixed(2) + '"><input type="text" id="sZ1" value="' + (zr[1] + pad).toFixed(2) + '"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px"><div><label>En fazla nokta</label><input type="text" id="sMax" value="1000000"></div>' +
      '<div><label>En uzun kenar</label><input type="text" id="sEdge" placeholder="otomatik"></div>' +
      '<div><label>En dik eğim (%)</label><input type="text" id="sSlope" value="400" title="Bundan dik üçgenler atılır (hatalı kotlu noktaların oluşturduğu uçurumlar). Boş: filtre yok"></div></div>' +
      '<div class="btns"><button class="btn" id="mNo">Vazgeç</button><button class="btn pri" id="mOk">Oluştur</button></div>', d => {
      const boxes = () => [...d.querySelectorAll('[data-li]')];
      d.querySelector('#sAll').onclick = () => boxes().forEach(b => b.checked = true);
      d.querySelector('#sNone').onclick = () => boxes().forEach(b => b.checked = false);
      d.querySelector('#sSug').onclick = () => boxes().forEach(b => b.checked = pre.has(+b.dataset.li));
      d.querySelector('#mNo').onclick = () => this.closeModal();
      d.querySelector('#mOk').onclick = () => {
        const reg = d.querySelector('input[name=sreg]:checked').value;
        const layers = new Set(boxes().filter(b => b.checked).map(b => +b.dataset.li));
        if (!layers.size) { this.toast('En az bir katman seçin.'); return; }
        const opt = { bb: reg === 'view' ? f.bb : (S.view0 || S.ext), layers, z0: num(d.querySelector('#sZ0').value), z1: num(d.querySelector('#sZ1').value),
          max: Math.max(1000, num(d.querySelector('#sMax').value) || 1e6), edge: num(d.querySelector('#sEdge').value), slope: num(d.querySelector('#sSlope').value) };
        this.closeModal();
        this.buildSurface(opt).catch(e => { this.busy(null); this.alert('Yüzey oluşturulamadı: ' + e.message); });
      };
    });
  }
  // dialogdaki önerinin aynısı (kod içinden çağrı ve test için)
  surfaceLayers() {
    const S = this.store, E = S.E, ptLayers = new Set();
    for (let id = 0; id < S.nEnt; id++) if (E.flags.a[id] & F_POINTS) ptLayers.add(E.layer.a[id]);
    const re = /(EGR|E[ĞG]R[İI]|KOT|NOKTA|POINT|CONTOUR|(^|[_\s-])TOPO|ARAZ|ESYUK|EŞYÜK|SPOT|ELEV)/i;
    const vis = S.layers.map((L, i) => i).filter(i => S.layerVis[i] && (S.layers[i].count || 0) > 0);
    let pre = new Set(vis.filter(i => re.test(S.layers[i].name)));
    if (!pre.size) pre = new Set(vis.filter(i => ptLayers.has(i)));
    return pre.size ? pre : new Set(vis);
  }
  async buildSurface(opt) {
    const S = this.store, t0 = performance.now(), bb = opt.bb, z0 = isFinite(opt.z0) ? opt.z0 : -Infinity, z1 = isFinite(opt.z1) ? opt.z1 : Infinity;
    this.busy('Arazi yüzeyi: noktalar toplanıyor…'); await this.yieldUI();
    const w = bb[2] - bb[0], h = bb[3] - bb[1];
    const cell = Math.max(1e-6, Math.sqrt(w * h / opt.max) * 0.75), nx = Math.ceil(w / cell) + 1;
    const seen = new Map(), X = [], Y = [], Z = [];
    const add = (x, y, z) => {
      if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3] || !(z >= z0 && z <= z1)) return;
      const k = Math.floor((y - bb[1]) / cell) * nx + Math.floor((x - bb[0]) / cell);
      if (seen.has(k)) return; seen.set(k, 1); X.push(x); Y.push(y); Z.push(z);
    };
    const vis = opt.layers ? new Uint8Array(65536) : S.layerVis;
    if (opt.layers) for (const i of opt.layers) vis[i] = 1;
    for (const ch of S.chunks) {
      if (!ch) continue;
      for (let v = 0; v < ch.nV; v++) { const c = ch.col[v]; if ((c >>> 24) === 0 || !vis[ch.lay[v]]) continue; add(ch.pos[2 * v], ch.pos[2 * v + 1], ch.z[v]); }
      for (let v = 0; v < ch.nP; v++) { const c = ch.pcol[v]; if ((c >>> 24) === 0 || !vis[ch.play[v]]) continue; add(ch.ppos[2 * v], ch.ppos[2 * v + 1], ch.pz[v]); }
    }
    if (X.length < 3) { this.busy(null); this.alert('Bu alanda ve kot aralığında yeterli nokta yok (' + X.length + ').'); return; }
    this.busy('Üçgenleniyor: ' + fmtN(X.length) + ' nokta…'); await this.yieldUI();
    const coords = new Float64Array(2 * X.length);
    for (let i = 0; i < X.length; i++) { coords[2 * i] = X[i]; coords[2 * i + 1] = Y[i]; }
    const T = Geom.delaunay(coords);
    // kenar sınırı: otomatik = kenar uzunluklarının ortancasının 8 katı
    let maxE = opt.edge;
    if (!(maxE > 0)) {
      const smp = []; const st = Math.max(3, Math.floor(T.length / 30000 / 3) * 3);
      for (let k = 0; k < T.length; k += st) { const a = T[k], b = T[k + 1]; smp.push(Math.hypot(X[a] - X[b], Y[a] - Y[b])); }
      smp.sort((u, v) => u - v); maxE = (smp[smp.length >> 1] || 1) * 8;
    }
    const m2 = maxE * maxE, keep = [], slope = opt.slope > 0 ? opt.slope / 100 : Infinity;
    let steep = 0;
    for (let k = 0; k < T.length; k += 3) {
      const a = T[k], b = T[k + 1], c = T[k + 2];
      const ab = (X[a] - X[b]) ** 2 + (Y[a] - Y[b]) ** 2, bc = (X[b] - X[c]) ** 2 + (Y[b] - Y[c]) ** 2, ca = (X[c] - X[a]) ** 2 + (Y[c] - Y[a]) ** 2;
      if (!(ab <= m2 && bc <= m2 && ca <= m2)) continue;
      if (slope < Infinity) {
        // üçgen düzleminin en büyük eğimi: |∇z|
        const x1 = X[b] - X[a], y1 = Y[b] - Y[a], z1 = Z[b] - Z[a], x2 = X[c] - X[a], y2 = Y[c] - Y[a], z2 = Z[c] - Z[a];
        const nz = x1 * y2 - y1 * x2; if (Math.abs(nz) < 1e-12) { steep++; continue; }
        const gx = (z1 * y2 - y1 * z2) / nz, gy = (x1 * z2 - z1 * x2) / nz;
        if (Math.hypot(gx, gy) > slope) { steep++; continue; }
      }
      keep.push(k);
    }
    const n = keep.length * 3, pos = new Float32Array(2 * n), zz = new Float32Array(n);
    let j = 0, zb0 = Infinity, zb1 = -Infinity;
    for (const k of keep) for (let q = 0; q < 3; q++) { const i = T[k + q]; pos[2 * j] = X[i]; pos[2 * j + 1] = Y[i]; zz[j] = Z[i]; j++; if (Z[i] < zb0) zb0 = Z[i]; if (Z[i] > zb1) zb1 = Z[i]; }
    const s = { name: 'Yüzey ' + (S.surfaces.length + 1), pos, z: zz, n, bb: bb.slice(), zb: [zb0, zb1], color: [0.66, 0.70, 0.58], visible: true, gl: null };
    S.surfaces.push(s);
    if (this.R.style === 'wire') this.R.style = 'shaded';
    this.busy(null); this.R.request(); this.update3DUI(); this.renderProps(); this.updateButtons();
    this.toast(s.name + ': ' + fmtN(keep.length) + ' üçgen, ' + fmtN(X.length) + ' nokta, ' + ((performance.now() - t0) / 1000).toFixed(1) + ' sn' + (steep ? ' · ' + fmtN(steep) + ' aşırı dik üçgen atıldı' : '') + ' · gölgeli görünüme geçildi', 7000);
    s.steep = steep;
  }
  async surfaceToDXF() {
    const S = this.store, s = S.surfaces.find(q => q.visible) || S.surfaces[0]; if (!s) return;
    const o = S.info.origin, f = (v) => v.toFixed(4);
    this.busy('Yüzey DXF\'e yazılıyor… (' + fmtN(s.n / 3) + ' üçgen)'); await this.yieldUI();
    const parts = ['  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1009\n  0\nENDSEC\n  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n 70\n1\n  0\nLAYER\n  2\nARAZI_TIN\n 70\n0\n 62\n3\n  6\nCONTINUOUS\n  0\nENDTAB\n  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n'];
    let buf = '';
    for (let i = 0; i < s.n; i += 3) {
      const P = [0, 1, 2, 2].map(k => [f(s.pos[2 * (i + k)] + o[0]), f(s.pos[2 * (i + k) + 1] + o[1]), f(s.z[i + k])]);
      buf += '  0\n3DFACE\n  8\nARAZI_TIN\n';
      for (let k = 0; k < 4; k++) buf += ' 1' + k + '\n' + P[k][0] + '\n 2' + k + '\n' + P[k][1] + '\n 3' + k + '\n' + P[k][2] + '\n';
      if (buf.length > 4e6) { parts.push(buf); buf = ''; }
    }
    parts.push(buf + '  0\nENDSEC\n  0\nEOF\n');
    const blob = new Blob(parts, { type: 'application/dxf' });
    this.busy(null);
    const ok = await Export.saveBlob(this, blob, Export.baseName(this) + '_arazi_yuzeyi.dxf', 'DXF çizimi', 'application/dxf', 'dxf');
    if (ok) this.toast('Arazi yüzeyi kaydedildi (' + fmtMB(blob.size) + ', ' + fmtN(s.n / 3) + ' 3DFACE)', 5000);
  }

  // ───────────── koordinat dönüşümleri / yakalama
  abs(x, y) { const o = this.store.info ? this.store.info.origin : [0, 0]; return [x + o[0], y + o[1]]; }
  absP(p) { return p && p.abs ? p.abs.slice() : this.abs(p[0], p[1]); }
  rel(x, y) { const o = this.store.info ? this.store.info.origin : [0, 0]; return [x - o[0], y - o[1]]; }
  // İmlecin dünya noktası (yakalama + hiza + orto + dinamik giriş kilitleri uygulanmış); yakalanan noktada Z de döner
  point(base) {
    const p = this.rawPoint(base);
    if (this.dyn) { const q = this.dyn.constrain(p, base || this.toolBase()); if (q) return q; }
    return p;
  }
  rawPoint(base) {
    let p = [this.mouse.wx, this.mouse.wy];
    if (this.snapPt) { p = this.snapPt.p.slice(); if (this.snapPt.abs) p.abs = this.snapPt.abs; return p; }
    if (!this.R.is2D) {
      // 3B: imleç ışınının çalışma düzlemiyle (Z = önceki noktanın kotu, yoksa 0) kesişimi
      const b = base || this.toolBase(), z = b && b[2] !== undefined ? b[2] : 0, q = this.R.ray(this.mouse.sx, this.mouse.sy, z);
      this.R.drawZ = z;
      return q ? [q[0], q[1], z] : [p[0], p[1], z];
    }
    for (const h of this.hooks.point) { const q = h(p, base); if (q) return q; }
    if (this.ortho && base) { if (Math.abs(p[0] - base[0]) > Math.abs(p[1] - base[1])) p[1] = base[1]; else p[0] = base[0]; }
    return p;
  }
  // çizilmekte olan nesnenin girilmiş noktaları (son nokta = taban hariç): yakalanır ve hizalanır
  toolPts() {
    const t = this.tool; if (!t || !t.wantsPoints) return [];
    const P = Array.isArray(t.pts) ? t.pts : Array.isArray(t.P) ? t.P : null;
    return P && P.length > 1 ? P.slice(0, -1).filter(q => q && isFinite(q[0])) : [];
  }
  updateSnap() {
    this.snapPt = null;
    const t = this.tool;
    if (!this.snapOn || !t || !t.wantsPoints || !this.store.grid) return;
    const ap = this.settings.aperture || 12, extra = { armed: this.cenArmed, curves: [], toolPts: this.toolPts() };
    if (this.R.is2D) this.snapPt = this.store.snap(this.mouse.wx, this.mouse.wy, ap / this.R.scale, this.snapModes, this.toolBase(), extra);
    else this.snapPt = this.store.snapScreen(this.mouse.sx, this.mouse.sy, ap, this.snapModes, this.R.cam(), this.R.ray3(this.mouse.sx, this.mouse.sy), ap * (this.R.persp ? 4 : 1.5) / this.R.scale, extra);
    if (this.snapPt) this.refineSnap(this.snapPt);
    this.armCurves(extra.curves);
    for (const h of this.hooks.snap) h();
  }
  // Daire/yay/elips üzerinde ~0,4 sn beklenince merkezi yakalanabilir olur; en çok 4 eğri hatırlanır
  armCurves(curves) {
    if (!this.snapModes.cen || !curves.length) { this._arm = null; return; }
    curves.sort((a, b) => a.d - b.d);
    const c = curves[0];
    if (this.cenArmed.has(c.id)) { this._arm = null; return; }
    if (this._arm && this._arm.id === c.id) return;
    clearTimeout(this._armT);
    const me = this._arm = { id: c.id, c: c.c };
    this._armT = setTimeout(() => {
      if (this._arm !== me) return;
      this.cenArmed.set(me.id, me.c); if (this.cenArmed.size > 4) this.cenArmed.delete(this.cenArmed.keys().next().value);
      this._arm = null; this.updateSnap(); this.showCoords(); this.R.request();
    }, 380);
  }
  // Ekrandaki (float32, parçalı) geometriden bulunan yakalama noktasını nesnenin DXF'teki tam tanımından yeniden hesapla.
  // Tanım ilk seferde arka planda okunur; geldiğinde nokta güncellenir (tıklamadan önce hazır olur).
  fetchDef(id) {
    if (id < 0 || this.defCache.has(id) || this.defPending.has(id)) return;
    this.defPending.add(id);
    this.getDef(id).then(d => { this.defCache.set(id, d || null); }).catch(() => this.defCache.set(id, null)).then(() => {
      this.defPending.delete(id);
      const sp = this.snapPt;
      if (sp && !sp.exact && (sp.id === id || sp.id2 === id)) { this.refineSnap(sp); this.showCoords(); this.R.request(); }
    });
  }
  refineSnap(sp) {
    if (sp.exact || sp.id === undefined || sp.id < 0) return;
    const d = this.defCache.get(sp.id);
    if (d === undefined) { this.fetchDef(sp.id); return; }
    if (!d) return;
    let d2 = null;
    if (sp.kind === 'int' && sp.id2 !== undefined && sp.id2 !== sp.id) { d2 = this.defCache.get(sp.id2); if (d2 === undefined) { this.fetchDef(sp.id2); return; } if (!d2) return; }
    const o = this.store.info.origin, ax = sp.p[0] + o[0], ay = sp.p[1] + o[1];
    const G = Geom.prims(d), cands = [];
    const zOf = (dd) => dd.type === 'LINE' ? null : (dd.elev !== undefined ? dd.elev : dd.cz !== undefined ? dd.cz : dd.z !== undefined ? dd.z : null);
    const add = (x, y, z) => cands.push([x, y, z]);
    switch (sp.kind) {
      case 'end':
        if (d.type === 'LINE') { add(d.x1, d.y1, d.z1); add(d.x2, d.y2, d.z2); }
        else if (G) for (const q of G.P) { const a = Geom.at(q, 0), b = Geom.at(q, 1); add(a[0], a[1], zOf(d)); add(b[0], b[1], zOf(d)); }
        else if (d.xs && d.zs) for (let i = 0; i < d.xs.length; i++) add(d.xs[i], d.ys[i], d.zs[i]);
        break;
      case 'mid':
        if (d.type === 'LINE') add((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2, ((d.z1 || 0) + (d.z2 || 0)) / 2);
        else if (G) for (const q of G.P) { const m = Geom.at(q, 0.5); add(m[0], m[1], zOf(d)); }
        break;
      case 'cen': if (d.cx !== undefined) add(d.cx, d.cy, d.cz || 0); break;
      case 'quad': if (d.r) for (let k = 0; k < 4; k++) add(d.cx + d.r * Math.cos(k * Math.PI / 2), d.cy + d.r * Math.sin(k * Math.PI / 2), d.cz || 0); break;
      case 'node': case 'ins': if (d.x !== undefined) add(d.x, d.y, d.z || 0); break;
      case 'int': {
        const H = d2 ? Geom.prims(d2) : G; if (!G || !H) break;
        for (const p of G.P) for (const q of H.P) { if (p === q) continue; for (const X of Geom.hitPrim(p, q)) add(X[0], X[1], null); }
        break;
      }
      case 'perp': case 'near': {
        if (!G) break;
        const b = this.toolBase(), B = b ? this.abs(b[0], b[1]) : null;
        for (const q of G.P) {
          if (sp.kind === 'perp' && B && q.k === 'L') { const dx = q.x2 - q.x1, dy = q.y2 - q.y1, t = ((B[0] - q.x1) * dx + (B[1] - q.y1) * dy) / (dx * dx + dy * dy); add(q.x1 + t * dx, q.y1 + t * dy, null); }
          if (sp.kind === 'near') { const s0 = Geom.nearestS({ P: [q] }, ax, ay), m = Geom.at(q, s0.s); add(m[0], m[1], null); }
        }
        break;
      }
    }
    let best = null, bd = Infinity;
    // aynı X/Y'deki adaylar (ör. düşey çizginin iki ucu) kotla ayrılır
    const az = sp.p[2];
    for (const c of cands) { const dd = Math.hypot(c[0] - ax, c[1] - ay, c[2] !== null && c[2] !== undefined && isFinite(az) ? c[2] - az : 0); if (dd < bd) { bd = dd; best = c; } }
    const lim = 2 * (this.settings.aperture || 12) / this.R.scale;
    if (!best || bd > lim) return;
    const r = this.rel(best[0], best[1]);
    sp.p = [r[0], r[1], best[2] !== null && best[2] !== undefined ? best[2] : sp.p[2]];
    sp.abs = [best[0], best[1]]; sp.exact = true;
  }
  // aracın son girilen noktası (dik yakalama ve orto için)
  toolBase() { const t = this.tool; if (!t) return null; return t.base || (t.pts && t.pts[t.pts.length - 1]) || t.c || t.a || (t.P && t.P[t.P.length - 1]) || null; }
  // Klavyeyle girilen noktayı tıklama gibi uygula (dinamik giriş)
  commitPoint(p) {
    const t = this.tool; if (!t || !t.click) return;
    Promise.resolve(t.click(p)).then(() => { this.updatePrompt(); this.updateSnap(); this.R.request(); });
  }
  // "x,y[,z]" mutlak · "@dx,dy" göreli · "@uzunluk<açı" · tek sayı: imleç yönünde uzunluk
  parsePoint(s, base) {
    s = s.trim().replace(/\s+/g, '');
    let m;
    if ((m = s.match(/^@(-?[\d.]+)<(-?[\d.]+)$/)) && base) { const L = +m[1], a = +m[2] * Math.PI / 180; return [base[0] + L * Math.cos(a), base[1] + L * Math.sin(a)]; }
    if ((m = s.match(/^@(-?[\d.]+)[,;](-?[\d.]+)$/)) && base) return [base[0] + +m[1], base[1] + +m[2]];
    if ((m = s.match(/^(-?[\d.]+)[,;](-?[\d.]+)(?:[,;](-?[\d.]+))?$/))) { const p = this.rel(+m[1], +m[2]); if (m[3] !== undefined) p.push(+m[3]); return p; }
    if ((m = s.match(/^(-?[\d.]+)$/))) { for (const h of this.hooks.distance) { const q = h(+m[1], base); if (q) return q; } }
    if ((m = s.match(/^(-?[\d.]+)$/)) && base) {
      const L = +m[1]; const [cx, cy] = this.point(base); const a = Math.atan2(cy - base[1], cx - base[0]);
      return [base[0] + L * Math.cos(a), base[1] + L * Math.sin(a)];
    }
    return null;
  }
  // Seçimi bekleyen araçlar
  needSel(name) {
    if (!this.store.selList.length) { this.pendingTool = name; this.toast('Önce nesneleri seçin; sonra Enter veya sağ tık ile devam edin.', 4000); return false; }
    return true;
  }
  newDef(type, props) { return Object.assign({ type, li: this.curLayer }, props); }
  // tek nesnelik çizim araçları bitince seçime döner
  done1() { if (this.toolName !== 'select') this.setTool('select'); }

  // ───────────── araçlar
  initTools() {
    const app = this, S = this.store, R = this.R;
    const A = (p) => app.absP(p);                        // göreli → mutlak (yakalanan noktada tam koordinat)
    const Z = (p) => p[2] !== undefined ? p[2] : 0;
    const strokePts = (ctx, P, closed, color, dash) => {
      if (P.length < 2) return;
      ctx.strokeStyle = color || '#4c9aff'; if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); P.forEach((q, i) => { const s = R.w2s(q[0], q[1], q[2]); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); if (closed) ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    };
    // önizleme etiketi; dinamik giriş alanları açıkken imlecin sağındaki kutularla çakışmasın diye sola yaslanır
    const label = (ctx, txt, p) => {
      const s = R.w2s(p[0], p[1], p[2]), dyn = app.dyn && app.dyn.mode(); ctx.font = '12px Segoe UI, sans-serif'; ctx.fillStyle = '#ffd166';
      if (dyn) { ctx.textAlign = 'right'; ctx.fillText(txt, s[0] - 12, s[1] - 12); } else { ctx.textAlign = 'center'; ctx.fillText(txt, s[0], s[1] - 8); }
    };
    const circ = (c, r, n) => { const P = []; for (let i = 0; i <= (n || 72); i++) { const a = i / (n || 72) * 2 * Math.PI; P.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } return P; };
    const pickEnt = (p) => S.grid ? S.pick(p[0], p[1], 8 / R.scale) : -1;
    const selTool = (name, mk) => Object.assign({ wantsPoints: true, start() { if (!app.ready() || !app.needSel(app.toolName)) return false; if (this.init) this.init(); } }, mk);

    this.tools = {
      select: {
        prompt: () => app.pointMode ? 'Nokta düzenleme: noktaya tıklayın → yeni yere tıklayın ya da sürükleyin (yakalama, hiza, uzunluk/açı geçerli) · Esc: kipten çık' : app.pendingTool ? 'Nesneleri seçin, bitince Enter / sağ tık' : (R.is2D ? 'Seç: tıklayın · soldan sağa pencere: tamamen içindekiler · sağdan sola: kesişenler · Shift: ekle/çıkar · komut yazabilirsiniz (L, TR, M…)'
          : '3B: tıklayarak / pencereyle seçin · Shift + orta tuş: yörünge · orta tuş: kaydır · tekerlek: yakınlaş'),
        down(p, e) { this.drag = { sx: e.offsetX, sy: e.offsetY, w: [app.mouse.wx, app.mouse.wy], shift: e.shiftKey, box: false }; },
        move(e) { const d = this.drag; if (d && Math.hypot(e.offsetX - d.sx, e.offsetY - d.sy) > 4) { d.box = true; R.request(); } },
        up(e) {
          const d = this.drag; this.drag = null; if (!d || !S.grid) return;
          const win = e.offsetX > d.sx;
          if (!R.is2D) {
            const cam = R.cam(), t0 = performance.now();
            if (d.box) S.setSel(S.boxSelectScreen(Math.min(d.sx, e.offsetX), Math.min(d.sy, e.offsetY), Math.max(d.sx, e.offsetX), Math.max(d.sy, e.offsetY), win, cam), d.shift ? 'add' : 'set');
            else { const id = S.pickScreen(e.offsetX, e.offsetY, 6, cam); if (id >= 0) S.setSel([id], d.shift ? 'toggle' : 'set'); else if (!d.shift) S.clearSel(); }
            app.lastPickMs = performance.now() - t0;
          } else if (d.box) {
            const [x0, y0] = d.w, [x1, y1] = [app.mouse.wx, app.mouse.wy];
            S.setSel(S.boxSelect(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), win), d.shift ? 'add' : 'set');
          } else {
            const id = S.pick(app.mouse.wx, app.mouse.wy, 6 / R.scale);
            if (id >= 0) S.setSel([id], d.shift ? 'toggle' : 'set'); else if (!d.shift) S.clearSel();
          }
          app.selChanged();
        },
        enter() { if (app.pendingTool && S.selList.length) { const t = app.pendingTool; app.pendingTool = null; app.setTool(t); return true; } return false; },
        preview(ctx) {
          const d = this.drag; if (!d || !d.box) return;
          const x = Math.min(d.sx, app.mouse.sx), y = Math.min(d.sy, app.mouse.sy), w = Math.abs(app.mouse.sx - d.sx), h = Math.abs(app.mouse.sy - d.sy);
          const win = app.mouse.sx > d.sx;
          ctx.fillStyle = win ? 'rgba(76,154,255,.12)' : 'rgba(63,185,80,.12)'; ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = win ? '#4c9aff' : '#3fb950'; ctx.setLineDash(win ? [] : [6, 4]); ctx.strokeRect(x + .5, y + .5, w, h); ctx.setLineDash([]);
        }
      },
      pan: { prompt: () => 'Kaydır: sol tuşla sürükleyin', down(p, e) { app.startPan(e); } },
      orbit: {
        prompt: () => '3B yörünge: sol tuşla sürükleyin (her araçta: Shift + orta tuş) · Görünüm küpü: hazır görünümler · Esc: bitir',
        down(p, e) { app.beginOrbit(); this.drag = { x: e.offsetX, y: e.offsetY }; },
        move(e) { const d = this.drag; if (d) { app.orbitBy(e.offsetX - d.x, e.offsetY - d.y); d.x = e.offsetX; d.y = e.offsetY; } },
        up() { if (this.drag) { this.drag = null; app.endOrbit(); } }
      },
      zoomwin: {
        prompt: () => 'Yakınlaştırmak için pencere çizin (tıklama: 2×) · E: sığdır',
        down(p, e) { this.drag = { sx: e.offsetX, sy: e.offsetY }; },
        up(e) {
          const d = this.drag; this.drag = null; if (!d) return;
          if (Math.hypot(e.offsetX - d.sx, e.offsetY - d.sy) < 5) R.zoomAt(e.offsetX, e.offsetY, 2);
          else R.zoomRect(d.sx, d.sy, e.offsetX, e.offsetY);
          app.userMoved = true;
        },
        input(s) { if (/^e$/i.test(s.trim())) { app.fit(); app.setTool('select'); return true; } return false; },
        preview(ctx) { const d = this.drag; if (!d) return; ctx.strokeStyle = '#4c9aff'; ctx.strokeRect(Math.min(d.sx, app.mouse.sx) + .5, Math.min(d.sy, app.mouse.sy) + .5, Math.abs(app.mouse.sx - d.sx), Math.abs(app.mouse.sy - d.sy)); }
      },

      // ── çizim
      line: {
        wantsPoints: true, base: null,
        prompt() { return this.base ? 'Sonraki nokta (x,y · @dx,dy · uzunluk) — Enter/Esc: bitir' : 'Çizgi: ilk nokta (tıklayın veya x,y yazın)'; },
        start() { this.base = null; },
        click(p) {
          if (!app.ready()) return;
          if (this.base) { const a = A(this.base), b = A(p); app.editor.create(app.newDef('LINE', { x1: a[0], y1: a[1], z1: Z(this.base), x2: b[0], y2: b[1], z2: Z(p) })); }
          this.base = p;
        },
        input(s) { const p = app.parsePoint(s, this.base); if (!p) return false; this.click(p); return true; },
        preview(ctx) { if (this.base) { app.rubber(ctx, this.base, app.point(this.base)); const c = app.point(this.base); const b = this.base, dz = (c[2] || 0) - (b[2] || 0), L = Math.hypot(c[0] - b[0], c[1] - b[1], R.is2D ? 0 : dz); if (!(app.dyn && app.dyn.mode())) label(ctx, fmtC(L), [(c[0] + b[0]) / 2, (c[1] + b[1]) / 2, ((c[2] || 0) + (b[2] || 0)) / 2]); } }   // uzunluk dinamik girişte zaten görünür
      },
      pline: {
        wantsPoints: true, pts: [],
        prompt() { return this.pts.length ? 'Sonraki nokta — Enter/sağ tık: bitir · K: kapat · Geri tuşu: son noktayı sil' : 'Polyline: ilk nokta'; },
        start() { this.pts = []; },
        click(p) { this.pts.push(p); },
        finish(closed, quiet) {
          const made = this.pts.length >= 2 && app.ready();
          if (made) {
            const a = this.pts.map(A);
            app.editor.create(app.newDef('LWPOLYLINE', { xs: a.map(q => q[0]), ys: a.map(q => q[1]), closed: !!closed && this.pts.length > 2, elev: Z(this.pts[0]) }));
          }
          this.pts = [];
          if (!quiet) app.done1();
        },
        enter() { this.finish(false); return true; }, right() { this.finish(false); return true; },
        dbl() { this.pts.pop(); this.finish(false); }, undoPt() { this.pts.pop(); },
        input(s) { if (/^[kKcC]$/.test(s.trim())) { this.finish(true); return true; } const p = app.parsePoint(s, this.pts[this.pts.length - 1]); if (!p) return false; this.click(p); return true; },
        cancel() { this.finish(false, true); },
        preview(ctx) { const P = this.pts; if (!P.length) return; strokePts(ctx, P.concat([app.point(P[P.length - 1])])); }
      },
      spline: {
        wantsPoints: true, pts: [],
        prompt() { return this.pts.length ? 'Sonraki nokta (eğri noktalardan geçer) — Enter/sağ tık: bitir' : 'Spline: ilk nokta'; },
        start() { this.pts = []; },
        click(p) { this.pts.push(p); },
        finish(quiet) {
          if (this.pts.length >= 2 && app.ready()) { const a = this.pts.map(A), sp = app.core.interpSpline(a.map(q => q[0]), a.map(q => q[1]), this.pts.map(Z)); if (sp) app.editor.create(app.newDef('SPLINE', sp)); }
          this.pts = [];
          if (!quiet) app.done1();
        },
        enter() { this.finish(); return true; }, right() { this.finish(); return true; }, undoPt() { this.pts.pop(); },
        input(s) { const p = app.parsePoint(s, this.pts[this.pts.length - 1]); if (!p) return false; this.click(p); return true; },
        cancel() { this.finish(true); },
        preview(ctx) {
          const P = this.pts.concat(this.pts.length ? [app.point(this.pts[this.pts.length - 1])] : []); if (P.length < 2) return;
          const sp = app.core.interpSpline(P.map(q => q[0]), P.map(q => q[1]), null); if (!sp) return;
          const out = []; if (app.core.evalSpline(sp.deg, sp.xs, sp.ys, null, sp.kn, Math.max(64, P.length * 24), out)) { const C = []; for (let i = 0; i < out.length; i += 2) C.push([out[i], out[i + 1]]); strokePts(ctx, C); }
        }
      },
      rect: {
        wantsPoints: true, a: null, ang: 0,
        prompt() { return this.a ? 'Karşı köşe — en, boy ve açı yazılabilir (Tab ile geçin) · ya da @genişlik,yükseklik' : 'Dikdörtgen: ilk köşe'; },
        start() { this.a = null; this.ang = 0; },
        // ilk köşe a, karşı köşe b; açı (derece) dikdörtgenin ilk kenarının yönü
        corners(a, b, ang) {
          const r = (ang || 0) * Math.PI / 180, ux = Math.cos(r), uy = Math.sin(r), dx = b[0] - a[0], dy = b[1] - a[1];
          const w = dx * ux + dy * uy, h = -dx * uy + dy * ux;
          return [[a[0], a[1]], [a[0] + w * ux, a[1] + w * uy], [a[0] + w * ux - h * uy, a[1] + w * uy + h * ux], [a[0] - h * uy, a[1] + h * ux]];
        },
        // dinamik giriş: [en] [boy] [açı] — yazılmayan değer imleçten; işaret imlecin bulunduğu yandan
        dyn: {
          fields: [{ g: 'w' }, { g: 'h' }, { g: 'ang' }],
          frame(p, base, ang) { const r = ang * Math.PI / 180, ux = Math.cos(r), uy = Math.sin(r), dx = p[0] - base[0], dy = p[1] - base[1]; return [dx * ux + dy * uy, -dx * uy + dy * ux, ux, uy]; },
          constrain(p, base, v) {
            const t = app.tools.rect, ang = v[2] !== null ? v[2] : 0; t.ang = ang;
            if (v[0] === null && v[1] === null) return v[2] === null ? null : p;
            const [w0, h0, ux, uy] = this.frame(p, base, ang);
            const sg = (q) => q < 0 ? -1 : 1, w = v[0] !== null ? Math.abs(v[0]) * (v[0] < 0 ? -1 : sg(w0)) : w0, h = v[1] !== null ? Math.abs(v[1]) * (v[1] < 0 ? -1 : sg(h0)) : h0;
            return [base[0] + w * ux - h * uy, base[1] + w * uy + h * ux, base[2] !== undefined ? base[2] : (p[2] || 0)];
          },
          live(p, base) { const ang = app.tools.rect.ang || 0, f = this.frame(p, base, ang); return [Math.abs(f[0]), Math.abs(f[1]), ang]; }
        },
        click(p) {
          if (!this.a) { this.a = p; this.ang = 0; return; }
          const C = this.corners(this.a, p, this.ang), w = Math.hypot(C[1][0] - C[0][0], C[1][1] - C[0][1]), h = Math.hypot(C[3][0] - C[0][0], C[3][1] - C[0][1]);
          if (app.ready() && w > 1e-9 && h > 1e-9) { const Q = C.map(A); app.editor.create(app.newDef('LWPOLYLINE', { xs: Q.map(q => q[0]), ys: Q.map(q => q[1]), closed: true, elev: Z(this.a) })); }
          this.a = null; this.ang = 0; app.done1();
        },
        input(s) { const p = app.parsePoint(s, this.a); if (!p) return false; this.ang = 0; this.click(p); return true; },
        preview(ctx) {
          if (!this.a) return;
          const b = app.point(this.a), C = this.corners(this.a, b, this.ang); strokePts(ctx, C, true);
          if (!(app.dyn && app.dyn.mode())) label(ctx, fmtC(Math.hypot(C[1][0] - C[0][0], C[1][1] - C[0][1])) + ' × ' + fmtC(Math.hypot(C[3][0] - C[0][0], C[3][1] - C[0][1])), b);
        }
      },
      polygon: {
        wantsPoints: true, c: null,
        prompt() { return this.c ? 'Köşe noktası (çevrel yarıçap) — ya da yarıçap yazın' : 'Çokgen (' + app.polySides + ' kenar): merkez noktası · kenar sayısı için sayı yazın'; },
        start() { this.c = null; },
        verts(c, p) { const n = app.polySides, r = Math.hypot(p[0] - c[0], p[1] - c[1]), a0 = Math.atan2(p[1] - c[1], p[0] - c[0]), V = []; for (let i = 0; i < n; i++) { const a = a0 + i * 2 * Math.PI / n; V.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } return V; },
        click(p) {
          if (!this.c) { this.c = p; return; }
          if (app.ready() && Math.hypot(p[0] - this.c[0], p[1] - this.c[1]) > 0) { const V = this.verts(this.c, p).map(A); app.editor.create(app.newDef('LWPOLYLINE', { xs: V.map(q => q[0]), ys: V.map(q => q[1]), closed: true, elev: Z(this.c) })); }
          this.c = null; app.done1();
        },
        input(s) {
          const v = num(s);
          if (!this.c && Number.isInteger(v) && v >= 3 && v <= 1024 && !/[,;@]/.test(s)) { app.polySides = v; return true; }
          if (this.c && v > 0 && !/[,;@]/.test(s)) { this.click([this.c[0] + v, this.c[1]]); return true; }
          const p = app.parsePoint(s, this.c); if (!p) return false; this.click(p); return true;
        },
        preview(ctx) { if (this.c) strokePts(ctx, this.verts(this.c, app.point(this.c)), true); }
      },
      circle: {
        wantsPoints: true, c: null,
        prompt() { return this.c ? 'Yarıçap (tıklayın ya da yarıçap / çap yazın — Tab ile çapa geçin)' : 'Daire: merkez noktası'; },
        dyn: {
          fields: [{ g: 'r' }, { g: 'd' }],
          constrain(p, c, v) {
            const r = v[0] !== null ? v[0] : v[1] !== null ? v[1] / 2 : null; if (r === null) return null;
            const dx = p[0] - c[0], dy = p[1] - c[1], L = Math.hypot(dx, dy), ux = L > 0 ? dx / L : 1, uy = L > 0 ? dy / L : 0;
            return [c[0] + Math.abs(r) * ux, c[1] + Math.abs(r) * uy, c[2] !== undefined ? c[2] : (p[2] || 0)];
          },
          live(p, c) { const r = Math.hypot(p[0] - c[0], p[1] - c[1]); return [r, 2 * r]; }
        },
        start() { this.c = null; },
        click(p) { if (!this.c) { this.c = p; return; } this.make(Math.hypot(p[0] - this.c[0], p[1] - this.c[1])); },
        make(r) { if (r > 0 && app.ready()) { const a = A(this.c); app.editor.create(app.newDef('CIRCLE', { cx: a[0], cy: a[1], cz: Z(this.c), r })); } this.c = null; app.done1(); },
        input(s) { if (this.c && /^[\d.,]+$/.test(s.trim())) { this.make(num(s)); return true; } const p = app.parsePoint(s, this.c); if (!p) return false; this.click(p); return true; },
        preview(ctx) { if (!this.c) return; const p = app.point(this.c), r = Math.hypot(p[0] - this.c[0], p[1] - this.c[1]); strokePts(ctx, circ(this.c, r)); app.rubber(ctx, this.c, p); if (!(app.dyn && app.dyn.mode())) label(ctx, 'R ' + fmtC(r), p); }
      },
      circle3: {
        wantsPoints: true, P: [],
        prompt() { return 'Daire (3 nokta): ' + (this.P.length + 1) + '. nokta'; },
        start() { this.P = []; },
        cc(a, b, c) {
          const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-12) return null;
          const a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
          const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
          return [ux, uy, Math.hypot(a[0] - ux, a[1] - uy)];
        },
        click(p) {
          this.P.push(p); if (this.P.length < 3) return;
          const c = this.cc(...this.P); this.P = [];
          if (!c) { app.toast('Noktalar doğrusal'); return; }
          if (app.ready()) { const a = A(c); app.editor.create(app.newDef('CIRCLE', { cx: a[0], cy: a[1], cz: Z(p), r: c[2] })); }
          app.done1();
        },
        input(s) { const p = app.parsePoint(s, this.P[this.P.length - 1]); if (!p) return false; this.click(p); return true; },
        preview(ctx) { if (this.P.length === 2) { const c = this.cc(this.P[0], this.P[1], app.point()); if (c) strokePts(ctx, circ(c, c[2])); } else if (this.P.length === 1) app.rubber(ctx, this.P[0], app.point(this.P[0])); }
      },
      arc: {
        wantsPoints: true, P: [],
        prompt() { return ['Yay: başlangıç noktası', 'Yay: ikinci nokta (yay üzerinde)', 'Yay: bitiş noktası'][this.P.length]; },
        start() { this.P = []; },
        def(a, b, c) {
          const k = app.tools.circle3.cc(a, b, c); if (!k) return null;
          const ang = (p) => Math.atan2(p[1] - k[1], p[0] - k[0]) * 180 / Math.PI;
          const n = (x) => ((x % 360) + 360) % 360;
          let a0 = n(ang(a)), a1 = n(ang(c)), am = n(ang(b));
          const inSweep = n(am - a0) < n(a1 - a0);
          if (!inSweep) { const t = a0; a0 = a1; a1 = t; }
          return { cx: k[0], cy: k[1], r: k[2], a0, a1 };
        },
        click(p) {
          this.P.push(p); if (this.P.length < 3) return;
          const d = this.def(...this.P), z = Z(this.P[0]); this.P = [];
          if (!d) { app.toast('Noktalar doğrusal'); return; }
          if (app.ready()) { const a = A([d.cx, d.cy]); app.editor.create(app.newDef('ARC', { cx: a[0], cy: a[1], cz: z, r: d.r, a0: d.a0, a1: d.a1 })); }
          app.done1();
        },
        input(s) { const p = app.parsePoint(s, this.P[this.P.length - 1]); if (!p) return false; this.click(p); return true; },
        preview(ctx) {
          if (this.P.length === 1) app.rubber(ctx, this.P[0], app.point(this.P[0]));
          if (this.P.length === 2) {
            const d = this.def(this.P[0], this.P[1], app.point()); if (!d) return;
            const Pp = []; let sw = ((d.a1 - d.a0) % 360 + 360) % 360; for (let i = 0; i <= 64; i++) { const a = (d.a0 + sw * i / 64) * Math.PI / 180; Pp.push([d.cx + d.r * Math.cos(a), d.cy + d.r * Math.sin(a)]); }
            strokePts(ctx, Pp);
          }
        }
      },
      ellipse: {
        wantsPoints: true, P: [],
        prompt() { return ['Elips: merkez', 'Elips: birinci eksen ucu', 'Elips: diğer eksen uzunluğu (tıklayın veya sayı)'][this.P.length]; },
        start() { this.P = []; },
        def(c, a, d) {
          let mx = a[0] - c[0], my = a[1] - c[1]; const L = Math.hypot(mx, my); if (L < 1e-12 || !(d > 0)) return null;
          let ratio = d / L;
          if (ratio > 1) { const nx = -my / L * d, ny = mx / L * d; mx = nx; my = ny; ratio = 1 / ratio; }
          return { mx, my, ratio };
        },
        other(p) { const c = this.P[0], a = this.P[1], ux = (a[0] - c[0]), uy = (a[1] - c[1]), L = Math.hypot(ux, uy); return Math.abs((p[0] - c[0]) * (-uy / L) + (p[1] - c[1]) * (ux / L)); },
        make(d) {
          const e = this.def(this.P[0], this.P[1], d), c = this.P[0]; this.P = [];
          if (e && app.ready()) { const a = A(c); app.editor.create(app.newDef('ELLIPSE', { cx: a[0], cy: a[1], cz: Z(c), mx: e.mx, my: e.my, ratio: e.ratio, t0: 0, t1: 2 * Math.PI })); }
          app.done1();
        },
        click(p) { if (this.P.length < 2) { this.P.push(p); return; } this.make(this.other(p)); },
        input(s) { if (this.P.length === 2 && /^[\d.,]+$/.test(s.trim())) { this.make(num(s)); return true; } const p = app.parsePoint(s, this.P[this.P.length - 1]); if (!p) return false; this.click(p); return true; },
        preview(ctx) {
          if (this.P.length === 1) app.rubber(ctx, this.P[0], app.point(this.P[0]));
          if (this.P.length === 2) {
            const e = this.def(this.P[0], this.P[1], this.other(app.point())); if (!e) return; const c = this.P[0], nx = -e.my * e.ratio, ny = e.mx * e.ratio, Pp = [];
            for (let i = 0; i <= 72; i++) { const a = i / 72 * 2 * Math.PI; Pp.push([c[0] + e.mx * Math.cos(a) + nx * Math.sin(a), c[1] + e.my * Math.cos(a) + ny * Math.sin(a)]); }
            strokePts(ctx, Pp);
          }
        }
      },
      point: {
        wantsPoints: true,
        prompt: () => 'Nokta: konum (tıklayın veya x,y[,z] yazın) — Esc: bitir',
        click(p) { if (app.ready()) { const a = A(p); app.editor.create(app.newDef('POINT', { x: a[0], y: a[1], z: Z(p) })); } },
        input(s) { const p = app.parsePoint(s, null); if (!p) return false; this.click(p); return true; }
      },

      // ── değiştirme
      move: selTool('move', {
        base: null, copy: false,
        prompt() { return this.base ? 'Hedef nokta (veya @dx,dy) — Esc: iptal' : (this.copy ? 'Kopyala' : 'Taşı') + ': temel nokta (veya doğrudan dx,dy yazın)'; },
        init() { this.base = null; R.offset = [0, 0]; },
        click(p) {
          if (!this.base) { this.base = p; return; }
          const dz = (p[2] !== undefined && this.base[2] !== undefined) ? p[2] - this.base[2] : 0;
          this.apply(p[0] - this.base[0], p[1] - this.base[1], dz);
          if (!this.copy) app.setTool('select');
        },
        apply(dx, dy, dz) {
          R.offset = [0, 0];
          if (this.copy) { const ids = app.editor.copy(S.selList.slice(), 0, 0, [1, 0, 0, 1, dx, dy, 1, dz || 0]); app.toast(ids.length + ' nesne kopyalandı (Esc ile bitirin)'); }
          else app.editor.move(S.selList.slice(), dx, dy, dz);
          app.afterXform();
        },
        move() { if (this.base) { const p = app.point(this.base); R.offset = [p[0] - this.base[0], p[1] - this.base[1]]; } },
        input(s) {
          let m;
          if (!this.base && (m = s.trim().match(/^(-?[\d.]+)[,;](-?[\d.]+)(?:[,;](-?[\d.]+))?$/))) { this.apply(+m[1], +m[2], +(m[3] || 0)); if (!this.copy) app.setTool('select'); return true; }
          const p = app.parsePoint(s, this.base); if (!p) return false; this.click(p); return true;
        },
        cancel() { R.offset = [0, 0]; },
        preview(ctx) { if (this.base) app.rubber(ctx, this.base, app.point(this.base)); }
      }),
      rotate: selTool('rotate', {
        base: null, copy: false,
        prompt() { return this.base ? 'Dönüş açısı (tıklayın veya derece yazın; K: ' + (this.copy ? 'kopya kapalı' : 'kopyalayarak') + ')' : 'Döndür: taban noktası'; },
        init() { this.base = null; this.copy = false; R.xf = [1, 0, 0, 1, 0, 0, 1, 0]; },
        ang(p) { return Math.atan2(p[1] - this.base[1], p[0] - this.base[0]) * 180 / Math.PI; },
        apply(deg) {
          R.xf = [1, 0, 0, 1, 0, 0, 1, 0];
          const T = app.editor.rotT(this.base[0], this.base[1], deg);
          if (this.copy) app.editor.copy(S.selList.slice(), 0, 0, T); else app.editor.xform(S.selList.slice(), T, 'rotate', S.selList.length + ' nesne ' + (+deg.toFixed(4)) + '° döndürüldü');
          app.afterXform(); app.setTool('select');
        },
        click(p) { if (!this.base) { this.base = p; return; } this.apply(this.ang(p)); },
        move() { if (this.base) R.xf = app.editor.rotT(this.base[0], this.base[1], this.ang(app.point(this.base))); },
        input(s) {
          if (/^[kKcC]$/.test(s.trim())) { this.copy = !this.copy; return true; }
          if (this.base && /^-?[\d.,]+$/.test(s.trim())) { this.apply(num(s)); return true; }
          const p = app.parsePoint(s, this.base); if (!p) return false; this.click(p); return true;
        },
        cancel() { R.xf = [1, 0, 0, 1, 0, 0, 1, 0]; },
        preview(ctx) { if (this.base) { const p = app.point(this.base); app.rubber(ctx, this.base, p); label(ctx, this.ang(p).toFixed(2) + '°', p); } }
      }),
      scale: selTool('scale', {
        base: null, ref: null, refLen: 0,
        prompt() { return !this.base ? 'Ölçekle: taban noktası' : this.ref === 'p1' ? 'Referans uzunluğu: ilk nokta' : this.ref === 'p2' ? 'Referans uzunluğu: ikinci nokta' : this.refLen ? 'Yeni uzunluk (tıklayın veya yazın)' : 'Ölçek çarpanı (yazın ya da tıklayın: uzaklık = çarpan) · R: referans'; },
        init() { this.base = null; this.ref = null; this.refLen = 0; R.xf = [1, 0, 0, 1, 0, 0, 1, 0]; },
        k(p) { const d = Math.hypot(p[0] - this.base[0], p[1] - this.base[1]); return this.refLen ? d / this.refLen : d; },
        apply(k) {
          R.xf = [1, 0, 0, 1, 0, 0, 1, 0]; if (!(k > 0)) return;
          app.editor.scale(S.selList.slice(), this.base[0], this.base[1], this.base[2] || 0, k, k); app.afterXform(); app.setTool('select');
        },
        click(p) {
          if (!this.base) { this.base = p; return; }
          if (this.ref === 'p1') { this.r1 = p; this.ref = 'p2'; return; }
          if (this.ref === 'p2') { this.refLen = Math.hypot(p[0] - this.r1[0], p[1] - this.r1[1]); this.ref = null; return; }
          this.apply(this.k(p));
        },
        move() { if (this.base && !this.ref) { const k = this.k(app.point(this.base)); if (k > 0) R.xf = app.editor.scaleT(this.base[0], this.base[1], 0, k, 1); } },
        input(s) {
          if (this.base && /^[rR]$/.test(s.trim())) { this.ref = 'p1'; return true; }
          if (this.base && !this.ref && /^[\d.,]+$/.test(s.trim())) { const v = num(s); this.apply(this.refLen ? v / this.refLen : v); return true; }
          const p = app.parsePoint(s, this.base); if (!p) return false; this.click(p); return true;
        },
        cancel() { R.xf = [1, 0, 0, 1, 0, 0, 1, 0]; },
        preview(ctx) { if (this.base && !this.ref) { const p = app.point(this.base); app.rubber(ctx, this.base, p); label(ctx, '× ' + this.k(p).toFixed(4), p); } }
      }),
      mirror: selTool('mirror', {
        a: null, b: null,
        prompt() { return !this.a ? 'Ayna: eksenin ilk noktası' : !this.b ? 'Ayna: eksenin ikinci noktası' : 'Kaynak nesneler silinsin mi? [E: evet / H: hayır] <H>'; },
        init() { this.a = null; this.b = null; R.xf = [1, 0, 0, 1, 0, 0, 1, 0]; },
        click(p) { if (!this.a) { this.a = p; return; } if (!this.b && Math.hypot(p[0] - this.a[0], p[1] - this.a[1]) > 0) { this.b = p; R.xf = app.editor.mirrorT(this.a[0], this.a[1], p[0], p[1]); } },
        finish(del) {
          const T = app.editor.mirrorT(this.a[0], this.a[1], this.b[0], this.b[1]); R.xf = [1, 0, 0, 1, 0, 0, 1, 0];
          if (del) app.editor.xform(S.selList.slice(), T, 'mirror', S.selList.length + ' nesne aynalandı'); else app.editor.copy(S.selList.slice(), 0, 0, T);
          app.afterXform(); app.setTool('select');
        },
        enter() { if (this.b) { this.finish(false); return true; } return false; }, right() { return this.enter(); },
        input(s) {
          const t = s.trim().toLocaleLowerCase('tr');
          if (this.b && /^(e|evet|y|yes)$/.test(t)) { this.finish(true); return true; }
          if (this.b && /^(h|hayır|n|no)$/.test(t)) { this.finish(false); return true; }
          const p = app.parsePoint(s, this.a); if (!p) return false; this.click(p); return true;
        },
        move() { if (this.a && !this.b) { const p = app.point(this.a); if (Math.hypot(p[0] - this.a[0], p[1] - this.a[1]) > 0) R.xf = app.editor.mirrorT(this.a[0], this.a[1], p[0], p[1]); } },
        cancel() { R.xf = [1, 0, 0, 1, 0, 0, 1, 0]; },
        preview(ctx) { if (this.a) { const p = this.b || app.point(this.a); app.rubber(ctx, this.a, p); } }
      }),
      offset: {
        wantsPoints: true, src: -1, def: null,
        prompt() { return this.src < 0 ? 'Öteleme (' + fmtC(app.offsetDist) + app.unit() + '): ötelenecek nesneyi seçin · uzaklık için sayı yazın' : 'Hangi tarafa? (tıklayın)'; },
        start() { this.src = -1; this.def = null; if (!app.ready()) return false; },
        async click(p) {
          if (this.src < 0) {
            const id = pickEnt(p); if (id < 0) return;
            const d = await app.getDef(id);
            if (!d || !Geom.prims(d)) { app.toast('Bu nesne ötelenemez (çizgi, yay, daire ve polyline desteklenir).'); return; }
            this.src = id; this.def = d; S.setSel([id], 'set'); app.selChanged(); app.updatePrompt(); return;
          }
          const r = Geom.offset(this.def, app.offsetDist, A(p));
          if (r.err) app.toast(r.err); else { app.editor.add(r.defs, 'Öteleme (' + fmtC(app.offsetDist) + ')'); }
          this.src = -1; this.def = null; S.clearSel(); app.selChanged(); app.updatePrompt();
        },
        input(s) { const v = num(s); if (v > 0 && !/[,;@]/.test(s)) { app.offsetDist = v; return true; } return false; },
        preview(ctx) {
          if (this.src >= 0 && this.def) { const r = Geom.offset(this.def, app.offsetDist, A(app.point())); if (r.defs) for (const d of r.defs) app.drawDef(ctx, d, 'rgba(255,209,102,.9)'); }
        }
      },
      trim: {
        wantsPoints: true,
        prompt: () => 'Buda: budanacak parçaya tıklayın (tüm görünür nesneler kesici kenardır) — Esc: bitir',
        start() { if (!app.ready()) return false; },
        click(p) { app.modifyAt('trim', p); }
      },
      extend: {
        wantsPoints: true,
        prompt: () => 'Uzat: uzatılacak ucun yakınına tıklayın (ekranda görünen nesneler sınırdır) — Esc: bitir',
        start() { if (!app.ready()) return false; },
        click(p) { app.modifyAt('extend', p); }
      },
      fillet: {
        wantsPoints: true, first: null, mode: 'fillet',
        prompt() { const v = this.mode === 'fillet' ? 'R = ' + fmtC(app.filletR) : 'uzaklık = ' + fmtC(app.chamferD); return (this.first ? 'İkinci çizgi' : (this.mode === 'fillet' ? 'Kavis' : 'Pah') + ' (' + v + '): ilk çizgi') + ' · değer için sayı yazın'; },
        start() { this.first = null; if (!app.ready()) return false; },
        async click(p) {
          const id = pickEnt(p); if (id < 0) return;
          const d = await app.getDef(id);
          if (!d || d.type !== 'LINE') { app.toast('Kavis/pah çizgiler (LINE) arasında çalışır.'); return; }
          if (!this.first) { this.first = { id, d, p: A(p) }; S.setSel([id], 'set'); app.selChanged(); app.updatePrompt(); return; }
          if (id === this.first.id) return;
          const r = Geom.corner(this.first.d, this.first.p, d, A(p), this.mode, this.mode === 'fillet' ? app.filletR : app.chamferD);
          if (r.err) app.toast(r.err); else app.editor.replace([this.first.id, id], r.defs, this.mode === 'fillet' ? 'Kavis' : 'Pah');
          this.first = null; S.clearSel(); app.selChanged(); app.updatePrompt();
        },
        input(s) { const v = num(s); if (v >= 0 && !/[,;@]/.test(s)) { if (this.mode === 'fillet') app.filletR = v; else app.chamferD = v; return true; } return false; }
      },
      break: {
        wantsPoints: true,
        prompt: () => 'Böl: nesneyi bölünecek noktadan tıklayın (yakalama ile tam nokta) — Esc: bitir',
        start() { if (!app.ready()) return false; },
        click(p) { app.modifyAt('break', p); }
      },

      // ── ölçüm
      measure: {
        wantsPoints: true, a: null, last: null,
        prompt() { return this.a ? 'İkinci nokta' : 'Ölç: ilk nokta (kotlu noktaya yakalarsanız ΔZ ve eğim de hesaplanır)' + (this.last ? '  ·  Son ölçüm: ' + this.last : ''); },
        start() { this.a = null; },
        click(p) {
          if (!this.a) { this.a = p; this.b = null; return; }
          const dx = p[0] - this.a[0], dy = p[1] - this.a[1], hd = Math.hypot(dx, dy), u = app.unit();
          let s = 'Mesafe ' + fmtC(hd) + u + '  ΔX ' + fmtC(dx) + '  ΔY ' + fmtC(dy) + '  Açı ' + (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2) + '°';
          if (p[2] !== undefined && this.a[2] !== undefined) {
            const dz = p[2] - this.a[2];
            s += '  ·  ΔZ ' + fmtC(dz) + '  Eğik ' + fmtC(Math.hypot(hd, dz)) + u + '  Eğim %' + (hd > 0 ? (dz / hd * 100).toFixed(2) : '—');
          }
          this.last = s;
          this.b = p; this.done = [this.a, p]; this.a = null; app.toast(this.last, 8000);
        },
        input(s) { const p = app.parsePoint(s, this.a); if (!p) return false; this.click(p); return true; },
        preview(ctx) {
          const seg = this.a ? [this.a, app.point(this.a)] : this.done;
          if (!seg) return;
          app.rubber(ctx, seg[0], seg[1]);
          const d = Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]);
          let lbl = fmtC(d);
          if (seg[0][2] !== undefined && seg[1][2] !== undefined) lbl += '  ΔZ ' + fmtC(seg[1][2] - seg[0][2]);
          label(ctx, lbl, [(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2]);
        }
      },
      area: {
        wantsPoints: true, pts: [], last: null, done: null,
        prompt() {
          if (!this.pts.length) return 'Alan: köşeleri sırayla tıklayın, Enter / sağ tık: bitir' + (this.last ? '  ·  Son: ' + this.last : '');
          const r = this.calc(this.pts.concat([app.point(this.pts[this.pts.length - 1])]));
          return 'Sonraki köşe — Enter/sağ tık: bitir · Geri: son köşeyi sil  ·  Alan ' + fmtC(r.A) + '  Çevre ' + fmtC(r.L);
        },
        start() { this.pts = []; this.done = null; },
        click(p) { this.pts.push(p); this.done = null; },
        calc(P) {
          let Ar = 0, L = 0;
          for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; Ar += a[0] * b[1] - b[0] * a[1]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); }
          return { A: Math.abs(Ar) / 2, L };
        },
        finish() {
          if (this.pts.length >= 3) {
            const r = this.calc(this.pts), u = app.unit();
            this.last = 'Alan ' + fmtC(r.A) + (u ? u + '²' : '') + '  Çevre ' + fmtC(r.L) + u;
            app.toast(this.last, 8000); this.done = this.pts.slice();
          }
          this.pts = [];
        },
        enter() { this.finish(); return true; }, right() { this.finish(); return true; }, undoPt() { this.pts.pop(); },
        input(s) { const p = app.parsePoint(s, this.pts[this.pts.length - 1]); if (!p) return false; this.click(p); return true; },
        cancel() { this.pts = []; this.done = null; },
        preview(ctx) {
          const P = this.pts.length ? this.pts.concat([app.point(this.pts[this.pts.length - 1])]) : this.done;
          if (!P || P.length < 2) return;
          ctx.beginPath(); P.forEach((q, i) => { const [x, y] = R.w2s(q[0], q[1], q[2]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
          ctx.fillStyle = 'rgba(255,209,102,.18)'; ctx.fill(); ctx.strokeStyle = '#ffd166'; ctx.stroke();
          if (P.length >= 3) {
            let cx = 0, cy = 0; for (const q of P) { cx += q[0]; cy += q[1]; }
            label(ctx, fmtC(this.calc(P).A) + (app.unit() ? app.unit() + '²' : ''), [cx / P.length, cy / P.length]);
          }
        }
      }
    };
    this.tools.copy = Object.assign(Object.create(this.tools.move), { copy: true, base: null });
    this.tools.chamfer = Object.assign(Object.create(this.tools.fillet), { mode: 'chamfer', first: null });
  }
  setTool(name) {
    const t = this.tools[name]; if (!t) return;
    if (planOnly(name) && !this.R.is2D) {
      this.toast('Bu araç plan (üst) görünümde çalışır. Sağ üstteki görünüm küpünde ÜST\'e tıklayın ya da "plan" yazın. (Çizim araçları, Taşı/Kopyala ve ölçüm 3B\'de de çalışır.)', 4500);
      if (this.toolName) return; name = 'select';
    }
    if (this.tool && this.tool.cancel) this.tool.cancel();
    this.gizmo.cancel();
    this.tool = this.tools[name]; this.toolName = name;
    this.cenArmed.clear(); this._arm = null; this.R.drawZ = undefined;
    for (const h of this.hooks.tool) h(name);
    if (PLAN_TOOLS.has(name) && name !== 'measure' && name !== 'area') { if (!this.store.done && this.store.file) { this.toast('Dosya okunurken düzenleme yapılamaz.'); return this.setTool('select'); } }
    if (this.tool.start && this.tool.start() === false) { this.tool = this.tools.select; this.toolName = 'select'; }
    if (this.toolName !== 'select') this.pendingTool = null;
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === this.toolName));
    // çizim bölünmüş düğmesi son kullanılan aracı gösterir
    if (DRAW_TOOLS.indexOf(this.toolName) >= 0) {
      const mb = $('drawMain'), it = document.querySelector('#ddDraw .mi[data-tool="' + this.toolName + '"]');
      mb.dataset.tool = this.toolName; mb.classList.add('on');
      mb.innerHTML = '<svg class="i"><use href="#i-' + TOOL_ICON[this.toolName] + '"/></svg><span>' + esc(it ? it.querySelector('.lbl').textContent.split(' (')[0] : this.toolName) + '</span>';
    }
    $('ov').style.cursor = this.toolName === 'pan' ? 'grab' : this.toolName === 'orbit' ? 'move' : 'crosshair';
    if (this.toolName !== 'select' && !['pan', 'zoomwin', 'orbit'].includes(this.toolName)) this.lastCmd = this.toolName;
    this.updatePrompt(); this.updateButtons(); this.R.request();
  }
  updatePrompt() { const t = this.tool; this.prompt(t ? (typeof t.prompt === 'function' ? t.prompt() : t.prompt) : ''); }
  rubber(ctx, a, b) {
    const [x1, y1] = this.R.w2s(a[0], a[1], a[2]), [x2, y2] = this.R.w2s(b[0], b[1], b[2]);
    ctx.strokeStyle = '#4c9aff'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
  }
  // tanımı (mutlak) ekrana çiz (önizleme)
  drawDef(ctx, d, color) {
    const R = this.R, G = Geom.prims(d); if (!G) return;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    for (const p of G.P) { const n = p.k === 'L' ? 1 : 48; for (let i = 0; i <= n; i++) { const q = Geom.at(p, i / n), r = this.rel(q[0], q[1]), s = R.w2s(r[0], r[1]); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); } }
    ctx.stroke(); ctx.lineWidth = 1;
  }

  // ───────────── değiştirme işlemleri (budama, uzatma, bölme)
  // Varlığın tam geometri tanımı (mutlak WCS): dosyadan okunur, düzenlemeler uygulanır
  async getDef(id) {
    const S = this.store, E = S.E, core = this.core, inf = S.newInfo.get(id);
    const { toEd } = Export.editState(this);
    let text;
    if (inf && inf.def) {
      const d = JSON.parse(JSON.stringify(inf.def)); if (d.li !== undefined && d.layer === undefined) d.layer = S.layers[d.li].name;
      text = core.genEntity(d, { eol: '\n', version: 'AC1015', owner: '', alloc: () => '1' });
    } else {
      if (S.info.binary) return null;
      const src = inf && inf.src !== undefined ? inf.src : id;
      text = new TextDecoder(S.info.encoding).decode(await S.file.slice(E.fs.a[src], E.fe.a[src]).arrayBuffer());
    }
    return core.parseDef(core.patchEntity(text, toEd(S.edits.get(id) || {}), '\n'));
  }
  // Kutudaki görünür nesnelerin çizgi parçaları (mutlak) — kesici / sınır kenarlar
  edgeSegs(bb, exclude) {
    const S = this.store, E = S.E, fl = E.flags.a, o = S.info.origin, out = [];
    const inb = (x1, y1, x2, y2) => !((x1 < bb[0] && x2 < bb[0]) || (x1 > bb[2] && x2 > bb[2]) || (y1 < bb[1] && y2 < bb[1]) || (y1 > bb[3] && y2 > bb[3]));
    S.grid.query(bb[0], bb[1], bb[2], bb[3], (id) => {
      if (id === exclude || (fl[id] & F_DEL) || (fl[id] & F_POINTS) || !S.layerVis[E.layer.a[id]]) return;
      const b = E.bb.a; if (b[4 * id + 2] < bb[0] || b[4 * id] > bb[2] || b[4 * id + 3] < bb[1] || b[4 * id + 1] > bb[3]) return;
      const ch = S.chunks[E.chunk.a[id]], vs = E.vs.a[id], vc = E.vc.a[id];
      if (ch && vc) for (let v = vs; v < vs + vc; v += 2) {
        const x1 = ch.pos[2 * v], y1 = ch.pos[2 * v + 1], x2 = ch.pos[2 * v + 2], y2 = ch.pos[2 * v + 3];
        if (inb(x1, y1, x2, y2)) out.push({ x1: x1 + o[0], y1: y1 + o[1], x2: x2 + o[0], y2: y2 + o[1], id });
      }
      for (let k = E.is.a[id]; k < E.is.a[id] + E.ic.a[id]; k++) {
        const B = S.blocks[S.IN.blk.a[k]]; if (!B || !B.pos || B.nV > 20000) continue;
        const M = S.instM(B, S.IN.slot.a[k]), P = B.pos, Z = B.z;
        for (let v = 0; v < B.nV; v += 2) {
          const X = (j) => M[0] * P[2 * j] + M[1] * P[2 * j + 1] + M[2] * Z[j] + M[3], Y = (j) => M[4] * P[2 * j] + M[5] * P[2 * j + 1] + M[6] * Z[j] + M[7];
          const x1 = X(v), y1 = Y(v), x2 = X(v + 1), y2 = Y(v + 1);
          if (inb(x1, y1, x2, y2)) out.push({ x1: x1 + o[0], y1: y1 + o[1], x2: x2 + o[0], y2: y2 + o[1], id: -1 });
        }
      }
    });
    return out;
  }
  async modifyAt(kind, p) {
    const S = this.store, R = this.R, id = S.pick(p[0], p[1], 8 / R.scale);
    if (id < 0) return;
    const def = await this.getDef(id);
    if (!def || !Geom.prims(def)) { this.toast('Bu nesne tipi desteklenmiyor (çizgi, yay, daire ve polyline).'); return; }
    const pa = this.abs(p[0], p[1]);
    let bb;
    if (kind === 'extend') bb = R.viewBox();
    else { const b = S.E.bb.a, m = Math.max(b[4 * id + 2] - b[4 * id], b[4 * id + 3] - b[4 * id + 1]) * 0.01 + 1e-6; bb = [b[4 * id] - m, b[4 * id + 1] - m, b[4 * id + 2] + m, b[4 * id + 3] + m]; }
    let res;
    if (kind === 'break') res = Geom.breakAt(def, pa);
    else {
      const segs = this.edgeSegs(bb, id);
      const fn = kind === 'trim' ? Geom.trim : Geom.extend;
      // 1) yaklaşık kesişimlerle hangi kesicilerin tam geometrisi gerekiyor?  2) onlarla kesinleştir
      const need = new Set(); fn(def, pa, segs, (cid) => { if (cid >= 0) need.add(cid); return null; });
      const exact = new Map(); for (const cid of need) exact.set(cid, await this.getDef(cid));
      res = fn(def, pa, segs, (cid) => exact.get(cid) || null);
    }
    if (res.err) { this.toast(res.err, 4000); return; }
    if (res.del) { this.editor.replace([id], [], 'Budama (kesişim yok → silindi)'); this.toast('Kesici kenar bulunamadı; nesne silindi (Ctrl+Z ile geri alın).', 4000); }
    else this.editor.replace([id], res.defs, kind === 'trim' ? 'Budama' : kind === 'extend' ? 'Uzatma' : 'Bölme');
    S.clearSel(); this.selChanged();
  }
  async joinSel() {
    const S = this.store; if (!this.ready()) return;
    const ids = S.selList.slice(); if (ids.length < 2) { this.toast('Birleştirmek için en az iki nesne seçin.'); return; }
    const defs = []; for (const id of ids) defs.push(await this.getDef(id));
    const valid = ids.filter((id, i) => defs[i] && Geom.prims(defs[i]));
    const vd = defs.filter(d => d && Geom.prims(d));
    const size = Math.max(1, ...valid.map(id => { const b = S.E.bb.a; return Math.max(b[4 * id + 2] - b[4 * id], b[4 * id + 3] - b[4 * id + 1]); }));
    const r = Geom.join(vd, size * 1e-7 + 1e-6);
    if (r.err) { this.toast(r.err, 4000); return; }
    // yalnızca zincire katılan nesneler değiştirilir
    this.editor.replace(r.usedIdx.map(i => valid[i]), r.defs, 'Birleştir (' + r.used + ' nesne)');
    this.toast(r.used + ' nesne tek polyline oldu' + (r.left ? '; ' + r.left + ' nesne uç uca değmediği için olduğu gibi kaldı.' : '.'), 5000);
    S.clearSel(); this.selChanged();
  }
  async explodeSel() {
    const S = this.store; if (!this.ready()) return;
    const ids = S.selList.slice(); if (!ids.length) { this.toast('Patlatılacak nesneleri seçin.'); return; }
    const olds = [], defs = []; let skipped = 0;
    for (const id of ids) {
      const d = await this.getDef(id); if (!d) { skipped++; continue; }
      const r = Geom.explode(d); if (r.err) { skipped++; continue; }
      olds.push(id); defs.push(...r.defs);
    }
    if (!olds.length) { this.toast('Seçimde patlatılabilir polyline yok (bloklar ve diğer tipler desteklenmiyor).', 4000); return; }
    this.editor.replace(olds, defs, 'Patlat (' + olds.length + ' → ' + defs.length + ')');
    this.toast(olds.length + ' polyline ' + defs.length + ' parçaya ayrıldı' + (skipped ? ' · ' + skipped + ' nesne patlatılamadı' : ''));
    S.clearSel(); this.selChanged();
  }
  flattenDialog() {
    const S = this.store; if (!this.ready()) return;
    if (!S.selList.length) { this.toast('Önce kot atanacak nesneleri seçin.'); return; }
    this.modal('<h2>Kot ata (düzleştir)</h2><div style="color:var(--muted);max-width:440px;font-size:12px">Seçili ' + fmtN(S.selList.length) + ' nesnenin tüm Z değerleri verilen kota eşitlenir (FLATTEN). Bloklarda yalnız ekleme kotu değişir.</div>' +
      '<label>Z değeri</label><input type="text" id="fz" value="0"><div class="btns"><button class="btn" id="mNo">Vazgeç</button><button class="btn pri" id="mOk">Uygula</button></div>', d => {
      const ok = () => { const z = num(d.querySelector('#fz').value); this.closeModal(); if (isFinite(z)) { this.editor.flatten(S.selList.slice(), z); this.afterXform(); } };
      d.querySelector('#mOk').onclick = ok; d.querySelector('#mNo').onclick = () => this.closeModal();
      d.querySelector('#fz').onkeydown = (e) => { if (e.key === 'Enter') ok(); };
    });
  }

  // plan görünümde uyarlanır ızgara (ana çizgiler her 5 aralıkta)
  drawGrid(ctx) {
    const R = this.R; if (!this.settings.grid || !R.is2D || !this.store.info) return;
    const o = this.store.info.origin, minPx = 18;
    let step = Math.pow(10, Math.floor(Math.log10(minPx / R.scale)));
    for (const k of [1, 2, 5, 10]) if (step * k * R.scale >= minPx) { step *= k; break; }
    const [x0, y1] = R.s2w(0, 0), [x1, y0] = R.s2w(R.W, R.H);
    const ax0 = Math.floor((x0 + o[0]) / step), ax1 = Math.ceil((x1 + o[0]) / step), ay0 = Math.floor((y0 + o[1]) / step), ay1 = Math.ceil((y1 + o[1]) / step);
    if ((ax1 - ax0) + (ay1 - ay0) > 600) return;
    const minor = R.dark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)', major = R.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.11)';
    ctx.lineWidth = 1;
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? major : minor; ctx.beginPath();
      for (let i = ax0; i <= ax1; i++) { if ((i % 5 === 0) !== !!pass) continue; const sx = Math.round(R.w2s(i * step - o[0], 0)[0]) + .5; ctx.moveTo(sx, 0); ctx.lineTo(sx, R.H); }
      for (let j = ay0; j <= ay1; j++) { if ((j % 5 === 0) !== !!pass) continue; const sy = Math.round(R.w2s(0, j * step - o[1])[1]) + .5; ctx.moveTo(0, sy); ctx.lineTo(R.W, sy); }
      ctx.stroke();
    }
  }
  drawSnapMarker(ctx, sp) {
    const [x, y] = this.R.w2s(sp.p[0], sp.p[1], sp.p[2]), k = sp.kind, r = 7;
    ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = '#3fe07a'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3;
    ctx.beginPath();
    if (k === 'end') ctx.rect(x - r, y - r, 2 * r, 2 * r);
    else if (k === 'mid') { ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r + 1, y + r - 1); ctx.lineTo(x - r - 1, y + r - 1); ctx.closePath(); }
    else if (k === 'cen') ctx.arc(x, y, r, 0, 2 * Math.PI);
    else if (k === 'quad') { ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r + 1, y); ctx.lineTo(x, y + r + 1); ctx.lineTo(x - r - 1, y); ctx.closePath(); }
    else if (k === 'int') { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); }
    else if (k === 'perp') { ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y + r); ctx.moveTo(x - r, y + r); ctx.lineTo(x - r, y - r); ctx.moveTo(x - r, y); ctx.lineTo(x, y); ctx.lineTo(x, y + r); }
    else if (k === 'near') { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.lineTo(x + r, y + r); ctx.closePath(); }
    else if (k === 'node') { ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.moveTo(x - r * .7, y - r * .7); ctx.lineTo(x + r * .7, y + r * .7); ctx.moveTo(x + r * .7, y - r * .7); ctx.lineTo(x - r * .7, y + r * .7); }
    else if (k === 'ins') { ctx.rect(x - r, y - r, 2 * r, 2 * r); ctx.rect(x - r / 2, y - r / 2, r, r); }
    ctx.stroke();
    if (this.settings.snapLabels) {
      const t = SNAP_NAME[k] || k; ctx.shadowBlur = 0; ctx.font = '600 11px "Segoe UI", sans-serif';
      const w = ctx.measureText(t).width + 10;
      ctx.fillStyle = 'rgba(17,19,23,.9)'; ctx.fillRect(x + 12, y + 10, w, 18);
      ctx.fillStyle = '#3fe07a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + 17, y + 19.5);
    }
    ctx.restore();
  }
  drawPreview(ctx) {
    this.drawGrid(ctx);
    for (const h of this.hooks.under) h(ctx);
    // merkezi yakalanabilir eğriler: merkezde soluk artı
    if (this.cenArmed.size && this.tool && this.tool.wantsPoints) {
      ctx.save(); ctx.strokeStyle = 'rgba(63,224,122,.75)'; ctx.lineWidth = 1;
      for (const c of this.cenArmed.values()) { const [x, y] = this.R.w2s(c[0], c[1], c[2]); if (!isFinite(x)) continue; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke(); }
      ctx.restore();
    }
    if (this.tool && this.tool.preview) this.tool.preview(ctx);
    this.gizmo.draw(ctx);
    for (const h of this.hooks.preview) h(ctx);
    if (this.snapPt) this.drawSnapMarker(ctx, this.snapPt);
    if (this.marker) {
      const m = this.marker, [x, y] = this.R.w2s(m.x, m.y, m.z);
      if (isFinite(x)) {
        ctx.strokeStyle = '#e5534b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 12, 0, 2 * Math.PI);
        ctx.moveTo(x - 20, y); ctx.lineTo(x + 20, y); ctx.moveTo(x, y - 20); ctx.lineTo(x, y + 20); ctx.stroke(); ctx.lineWidth = 1;
        ctx.font = '12px Segoe UI, sans-serif'; ctx.fillStyle = '#e5534b'; ctx.textAlign = 'left'; ctx.fillText(m.label, x + 16, y - 14);
      }
    }
  }
  afterDraw() {
    const st = this.R.lastTextStats, w = $('textwarn');
    if (st && st.skipped) { w.style.display = 'block'; w.textContent = fmtN(st.skipped) + ' yazı bu ölçekte gösterilmiyor — yakınlaştırın'; }
    else w.style.display = 'none';
    const S = this.store;
    $('infoText').textContent = S.file ? fmtN(S.nEnt) + ' nesne' + (S.selList.length ? ' · ' + fmtN(S.selList.length) + ' seçili' : '') + ' · ' : '';
    if (!this.R.anim) this.vc.draw();
  }

  // ───────────── metin bul / koordinata git
  findDialog() {
    if (!this.ready()) return;
    const S = this.store;
    this.modal('<h2>Metin bul</h2><input type="text" id="fQ" placeholder="Aranacak metin (örn. kot, parsel no, yol adı)" value="' + esc(this.lastFind || '') + '">' +
      '<div class="opts" style="margin-top:8px"><label><input type="checkbox" id="fWord"> Tam eşleşme</label><label><input type="checkbox" id="fHidden"> Kapalı katmanlar dahil</label></div>' +
      '<div id="fInfo" style="color:var(--muted);margin:8px 0 4px;font-size:12px"></div><div id="fRes" class="fres"></div>' +
      '<div class="btns"><button class="btn" id="fAll" disabled>Bulunanların hepsini seç</button><button class="btn pri" id="mNo">Kapat</button></div>', d => {
      let hits = [];
      const run = () => {
        const q = d.querySelector('#fQ').value.trim().toLocaleLowerCase('tr'), whole = d.querySelector('#fWord').checked, hidden = d.querySelector('#fHidden').checked;
        this.lastFind = d.querySelector('#fQ').value;
        hits = [];
        if (q) {
          const X = S.TX, TS = S.TS, n = S.nText;
          for (let i = 0; i < n; i++) {
            if (X.hid.a[i] || (!hidden && !S.layerVis[X.lay.a[i]])) continue;
            const s = TS[i].toLocaleLowerCase('tr');
            if (whole ? s.trim() === q : s.indexOf(q) >= 0) hits.push(i);
          }
        }
        d.querySelector('#fInfo').textContent = q ? fmtN(hits.length) + ' sonuç' + (hits.length > 500 ? ' (ilk 500 listeleniyor)' : '') : fmtN(S.nText) + ' yazı içinde arar';
        d.querySelector('#fAll').disabled = !hits.length;
        d.querySelector('#fRes').innerHTML = hits.slice(0, 500).map(i => {
          const L = S.layers[S.TX.lay.a[i]], s = S.TS[i].replace(/\n/g, ' ');
          return '<div class="fr" data-t="' + i + '"><span>' + esc(s.length > 70 ? s.slice(0, 70) + '…' : s) + '</span><span class="fl">' + esc(L ? L.name : '') + '</span></div>';
        }).join('');
      };
      let tm = 0;
      d.querySelector('#fQ').oninput = () => { clearTimeout(tm); tm = setTimeout(run, 150); };
      d.querySelector('#fQ').onkeydown = (e) => { if (e.key === 'Enter' && hits.length) { this.closeModal(); this.gotoText(hits[0]); } };
      d.querySelector('#fWord').onchange = run; d.querySelector('#fHidden').onchange = run;
      d.querySelector('#fRes').onclick = (e) => { const r = e.target.closest('[data-t]'); if (r) { this.closeModal(); this.gotoText(+r.dataset.t); } };
      d.querySelector('#fAll').onclick = () => {
        const L = new Set(hits.map(t => S.TX.lay.a[t])); let opened = 0;
        for (const l of L) if (!S.layerVis[l]) { S.layerVis[l] = 1; opened++; }
        if (opened) { this.R.updateLayers(); this.renderLayers(); }
        this.closeModal(); S.setSel(hits.map(t => S.TX.ent.a[t]), 'set'); this.selChanged(); this.zoomSel();
        this.toast(fmtN(S.selList.length) + ' nesne seçildi');
      };
      d.querySelector('#mNo').onclick = () => this.closeModal();
      run();
    });
  }
  gotoText(t) {
    const S = this.store, X = S.TX, id = X.ent.a[t], li = X.lay.a[t];
    if (!S.layerVis[li]) { S.layerVis[li] = 1; this.R.updateLayers(); this.renderLayers(); this.toast('"' + S.layers[li].name + '" katmanı açıldı'); }
    if (!S.layerVis[S.E.layer.a[id]]) { S.layerVis[S.E.layer.a[id]] = 1; this.R.updateLayers(); this.renderLayers(); }
    const bb = [Infinity, Infinity, -Infinity, -Infinity];
    this.core.textBBox(X.x.a[t], X.y.a[t], X.h.a[t], X.r.a[t], X.al.a[t], S.TS[t], X.wf.a[t], bb);
    const m = Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 2;
    this.R.fit([bb[0] - m, bb[1] - m, bb[2] + m, bb[3] + m], 0, [X.z.a[t], X.z.a[t]]); this.userMoved = true;
    S.setSel([id], 'set'); this.selChanged();
  }
  gotoDialog() {
    const R = this.R, c = this.abs(R.cx, R.cy);
    this.modal('<h2>Koordinata git</h2><label>X (sağa)</label><input type="text" id="gX" value="' + c[0].toFixed(3) + '"><label>Y (yukarı)</label><input type="text" id="gY" value="' + c[1].toFixed(3) + '">' +
      '<label>Görüntü genişliği (çizim birimi, boş: ölçeği koru)</label><input type="text" id="gW" placeholder="örn. 100">' +
      '<div style="color:var(--muted);font-size:12px;margin-top:8px">Komut satırına da yazabilirsiniz: <b>git 450000,4400000</b></div>' +
      '<div class="btns"><button class="btn" id="mNo">Vazgeç</button><button class="btn pri" id="mOk">Git</button></div>', d => {
      const ok = () => {
        const x = num(d.querySelector('#gX').value), y = num(d.querySelector('#gY').value), w = num(d.querySelector('#gW').value || '0');
        if (!isFinite(x) || !isFinite(y)) { this.toast('Geçersiz koordinat'); return; }
        this.closeModal(); this.gotoXY(x, y, w > 0 ? w : 0);
      };
      d.querySelector('#mOk').onclick = ok; d.querySelector('#mNo').onclick = () => this.closeModal();
      d.querySelectorAll('input').forEach(i => i.onkeydown = (e) => { if (e.key === 'Enter') ok(); });
    });
  }
  gotoXY(X, Y, width) {
    if (!this.store.info) return;
    const R = this.R, [x, y] = this.rel(X, Y);
    let z = R.cz;
    if (this.store.done) { const zr = this.store.zRange([x - 50, y - 50, x + 50, y + 50]); z = (zr[0] + zr[1]) / 2; }
    if (width > 0) R.scale = Math.min(R.W, R.H) / width;
    R.cx = x; R.cy = y; if (!R.is2D) R.cz = z;
    this.marker = { x, y, z, label: fmtC(X) + ' ; ' + fmtC(Y) };
    clearTimeout(this._markT); this._markT = setTimeout(() => { this.marker = null; R.request(); }, 15000);
    this.userMoved = true; R.request();
    const e = this.store.ext;
    this.toast('Konum: X ' + fmtC(X) + '  Y ' + fmtC(Y) + (e && (x < e[0] || x > e[2] || y < e[1] || y > e[3]) ? ' — çizim kapsamının dışında' : ''), 4000);
  }

  // ───────────── dışa aktarma diyalogları
  exportDialog(kind) {
    const titles = { svg: 'SVG olarak dışa aktar', pdf: 'PDF olarak dışa aktar', png: 'PNG olarak dışa aktar' };
    let body = '';
    if (kind !== 'png') body += '<label>Alan</label><div class="opts"><label><input type="radio" name="reg" value="view" checked> Ekrandaki görünüm</label><label><input type="radio" name="reg" value="all"> Tüm çizim</label></div>';
    if (kind === 'pdf') body += '<label>Kağıt</label><select id="xSize"><option>A4</option><option selected>A3</option><option>A2</option><option>A1</option><option>A0</option></select>';
    if (kind === 'png') body += '<label>Çözünürlük</label><div class="opts">' + [1, 2, 4, 8].map(f => '<label><input type="radio" name="fac" value="' + f + '"' + (f === 2 ? ' checked' : '') + '> ' + f + '× ekran</label>').join('') + '</div>';
    if (kind !== 'pdf') body += '<label>Arka plan</label><div class="opts"><label><input type="radio" name="bg" value="white" checked> Beyaz</label><label><input type="radio" name="bg" value="dark"> Koyu</label></div>';
    body += '<div style="color:var(--muted);margin-top:10px;font-size:12px;max-width:460px">Yalnızca görünür katmanlar aktarılır.' + (kind === 'png' ? ' Görüntü, ekrandaki görünümün (3B ve gölgeli dahil) ölçeklenmiş halidir.' : ' Çok büyük çizimlerde "Tüm çizim" seçeneği büyük dosya üretebilir.' + (this.R.is2D ? '' : ' <b>SVG/PDF her zaman plan (üstten) görünümle aktarılır</b>; 3B görüntü için PNG kullanın.')) + '</div>';
    this.modal('<h2>' + titles[kind] + '</h2>' + body + '<div class="btns"><button class="btn" id="mNo">Vazgeç</button><button class="btn pri" id="mOk">Dışa aktar</button></div>', d => {
      d.querySelector('#mNo').onclick = () => this.closeModal();
      d.querySelector('#mOk').onclick = () => {
        const v = (n) => { const el = d.querySelector('input[name=' + n + ']:checked'); return el ? el.value : null; };
        const opt = { region: v('reg') || 'view', bg: v('bg') || 'white', factor: +(v('fac') || 2), size: d.querySelector('#xSize') ? d.querySelector('#xSize').value : 'A3' };
        this.closeModal();
        Export[kind](this, opt).catch(e => { this.busy(null); this.alert('Dışa aktarma hatası: ' + e.message); });
      };
    });
  }
  helpDialog() {
    const groups = {};
    for (const c of COMMANDS) (groups[c[4]] = groups[c[4]] || []).push(c);
    const cmds = Object.entries(groups).map(([g, list]) => '<h4>' + esc(g) + '</h4><table class="help">' + list.map(c => '<tr><td><kbd>' + c[0].slice(0, 3).map(esc).join('</kbd> <kbd>') + '</kbd></td><td>' + esc(c[3]) + '</td></tr>').join('') + '</table>').join('');
    const mouse = [['Sol tık / sürükle', 'Seç · pencere (sağa: tamamen içindeki, sola: kesişen) · Shift: ekle/çıkar'], ['Tekerlek', 'İmlecin olduğu yere yakınlaş'], ['Orta / sağ tuş sürükle', 'Kaydır'],
      ['Shift + orta tuş', '3B yörünge'], ['Orta tuş çift tık', 'Çizime sığdır'], ['Seçim tutamacı', 'Oklar: X/Y/Z yönünde taşı · halka: döndür · kareler: ölçekle (Shift: adımlı)'],
      ['Görünüm küpü', 'Yüz/kenar/köşe: hazır görünüm · sürükle: döndür · ⌂: ev'], ['Enter / boşluk / sağ tık', 'Komutu bitir · boş satırda son komutu tekrarla'], ['Esc', 'İptal / seçimi bırak'],
      ['Delete', 'Seçileni sil'], ['Ctrl+Z / Ctrl+Y', 'Geri al / yinele'], ['Ctrl+A / Ctrl+F', 'Hepsini seç / metin bul'], ['F3 / F8', 'Yakalama / orto'], ['F10', 'Kutupsal izleme'], ['Ctrl+O / Ctrl+S', 'Aç / kaydet'],
      ['Sayı + Tab', 'Çizerken: uzunluğu (ya da açıyı) kilitle, diğer alana geç · Enter: noktayı koy'], ['Mavi tutamaç', 'Seçili nesnenin noktasına tıklayın, yeni yere tıklayın (uzat / taşı)'],
      ['Daire üzerinde bekle', 'Merkez yakalaması etkinleşir']];
    this.modal('<h2>Komutlar ve kısayollar</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:0 28px;max-width:860px"><div><h4>Fare ve klavye</h4><table class="help">' + mouse.map(r => '<tr><td><kbd>' + r[0] + '</kbd></td><td>' + r[1] + '</td></tr>').join('') + '</table>' +
      '<h4>Değer girişi</h4><div style="color:var(--muted);font-size:12px">x,y[,z] mutlak · @dx,dy göreli · @uzunluk&lt;açı kutupsal · tek sayı: imleç yönünde uzunluk, yarıçap, açı ya da çarpan.<br>Harf yazınca komut satırına gider; Kısa komut adları geçerlidir.</div></div><div>' + cmds + '</div></div>' +
      '<div class="btns"><button class="btn pri" id="mOk">Kapat</button></div>', d => d.querySelector('#mOk').onclick = () => this.closeModal());
  }

  // ───────────── komutlar
  runCommand(v) {
    const raw = String(v).trim(), c = raw.toLocaleLowerCase('tr');
    if (!c) return;
    let m;
    if ((m = c.match(/^view:(\w+)$/))) { this.setNamedView(m[1]); return; }
    if ((m = c.match(/^style:(\w+)$/))) { this.setStyle(m[1]); return; }
    if ((m = c.match(/^(?:git|goto)\s*(-?[\d.]+)\s*[,; ]\s*(-?[\d.]+)$/))) { this.gotoXY(+m[1], +m[2], 0); return; }
    if ((m = c.match(/^(?:abart|zscale|zs)\s*([\d.]+)$/))) { this.setZScale(+m[1]); return; }
    if (c === 'zoom e' || c === 'z e') { this.fit(); return; }
    const S = this.store, cmd = ALIAS.get(c);
    const name = cmd ? cmd[2] : c;
    if (cmd && cmd[1] === 't') { this.setTool(name); return; }
    if (cmd && cmd[1] === 'f') { this.lastCmd = name; cmd[5](this); return; }
    this.lastCmd = name;
    switch (name) {
      case 'open': this.openDialog(); return;
      case 'new': this.newDrawing(); return;
      case 'settings': this.settingsDialog(); return;
      case 'newlayer': if (this.store.info) this.newLayerDialog(); return;
      case 'osnap': { const dd = $('snapDD'); this.openMenu(dd); return; }
      case 'save': if (S.done) Export.saveDXF(this, 'full'); return;
      case 'savesel': if (!S.selList.length) { this.toast('Önce kaydedilecek nesneleri seçin.'); return; } Export.saveDXF(this, 'subset', S.selList.slice()); return;
      case 'saveview': {
        if (!S.done) return;
        let ids;
        if (this.R.is2D) { const [x0, y0, x1, y1] = this.R.viewBox(); ids = S.boxSelect(x0, y0, x1, y1, false); }
        else ids = S.boxSelectScreen(0, 0, this.R.W, this.R.H, false, this.R.cam());
        if (!ids.length) { this.toast('Ekranda kaydedilecek nesne yok.'); return; }
        this.toast(fmtN(ids.length) + ' nesne kaydediliyor…'); Export.saveDXF(this, 'subset', ids); return;
      }
      case 'svg': case 'pdf': case 'png': if (S.done) this.exportDialog(name); return;
      case 'surfdxf': this.surfaceToDXF(); return;
      case 'undo': this.editor.undo(); this.selChanged(); return;
      case 'redo': this.editor.redo(); this.selChanged(); return;
      case 'fit': this.fit(); return;
      case 'home': this.homeView(); return;
      case 'persp': this.togglePersp(); return;
      case 'edges': this.toggleEdges(); return;
      case 'zcolor': this.toggleZColor(); return;
      case 'flatblocks': this.setBlockFlat(!this.R.blockFlat, true); return;
      case 'surface': this.surfaceDialog(); return;
      case 'find': this.findDialog(); return;
      case 'goto': this.gotoDialog(); return;
      case 'theme': this.setSetting('theme', this.R.dark ? 'light' : 'dark'); return;
      case 'help': this.helpDialog(); return;
      case 'erase': this.deleteSel(); return;
      case 'color': this.colorDialog(); return;
      case 'tolayer': if (!S.selList.length) { this.toast('Önce nesne seçin.'); return; } this.editor.layer(S.selList.slice(), this.curLayer); return;
      case 'join': if (!S.selList.length) { this.toast('Önce birleştirilecek nesneleri seçin.'); return; } this.joinSel(); return;
      case 'explode': if (!S.selList.length) { this.toast('Önce patlatılacak nesneleri seçin.'); return; } this.explodeSel(); return;
      case 'flatten': this.flattenDialog(); return;
    }
    this.toast('Anlaşılmadı: "' + raw + '" — komut listesi için F1');
  }
  // komut satırı önerileri
  suggest(text) {
    const box = $('sugg'), t = text.trim().toLocaleLowerCase('tr');
    if (!t || /^[-@\d.,;]/.test(t)) { box.style.display = 'none'; this.sugg = []; return; }
    const hit = [];
    for (const c of COMMANDS) {
      const ex = c[0].indexOf(t) === 0 ? 0 : c[0].some(a => a.indexOf(t) === 0) ? 1 : c[3].toLocaleLowerCase('tr').indexOf(t) >= 0 ? 2 : -1;
      if (ex >= 0) hit.push([ex, c]);
    }
    hit.sort((a, b) => a[0] - b[0]);
    this.sugg = hit.slice(0, 8).map(h => h[1]); this.suggI = 0;
    if (!this.sugg.length) { box.style.display = 'none'; return; }
    box.innerHTML = this.sugg.map((c, i) => '<div class="si' + (i === 0 ? ' on' : '') + '" data-i="' + i + '"><b>' + esc(c[0][0].toUpperCase()) + '</b>' + esc(c[3]) + ' <span>' + esc(c[0].slice(1, 3).join(', ')) + '</span></div>').join('');
    box.style.display = 'block';
  }

  // ───────────── olaylar
  startPan(e) { this.panning = { x: e.offsetX, y: e.offsetY, moved: false, btn: e.button }; $('ov').style.cursor = 'grabbing'; }
  stopAnim() { if (this.R.anim) { cancelAnimationFrame(this.R.anim); this.R.anim = null; this.viewChanged(); } }
  // Açılır menüler: tek davranış. Menü ekrana sabit konumda açılır (şerit kırpmaz, sayfa kaymaz), ekran kenarına sığdırılır.
  initMenus() {
    const dds = [...document.querySelectorAll('.dd')];
    const btnOf = (dd) => dd.querySelector(':scope > .dd-btn') || dd.querySelector(':scope .dd-btn');
    const menuOf = (dd) => dd.querySelector(':scope > .dd-menu');
    const place = (dd) => {
      const menu = menuOf(dd), anchor = dd.classList.contains('split') || dd.id === 'snapDD' ? dd : btnOf(dd);
      const r = anchor.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
      menu.style.maxHeight = 'none'; menu.style.left = '0px'; menu.style.top = '0px';
      const mw = menu.offsetWidth, mh = menu.scrollHeight;
      const left = Math.max(6, Math.min(r.left, vw - mw - 6));
      let top, avail;
      if (dd.classList.contains('up')) { avail = r.top - 10; top = Math.max(6, r.top - 4 - Math.min(mh, avail)); }
      else { avail = vh - r.bottom - 10; top = r.bottom + 4; }
      menu.style.maxHeight = Math.max(140, avail) + 'px';
      menu.style.left = left + 'px'; menu.style.top = top + 'px';
    };
    const close = () => { dds.forEach(d => d.classList.remove('open')); document.querySelectorAll('.mi.kb').forEach(b => b.classList.remove('kb')); };
    const open = (dd) => { close(); this.updateButtons(); if (dd.id === 'snapDD') this.renderSnapMenu(); dd.classList.add('open'); place(dd); };
    for (const dd of dds) {
      const btn = btnOf(dd);
      btn.addEventListener('click', (e) => { e.stopPropagation(); if (dd.classList.contains('open')) close(); else open(dd); });
      btn.addEventListener('mouseenter', () => { if (dds.some(d => d.classList.contains('open')) && !dd.classList.contains('open') && !dd.classList.contains('up')) open(dd); });
      menuOf(dd).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled && !b.closest('[data-keep]')) close(); });
    }
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.dd')) close(); if (!e.target.closest('#ctx')) $('ctx').style.display = 'none'; }, true);
    window.addEventListener('resize', close); window.addEventListener('blur', close);
    this.closeMenus = close; this.openMenu = open; this.placeMenu = place;
    this.menusOpen = () => dds.some(d => d.classList.contains('open'));
    // klavyeyle gezinme: ↑↓ öğeler, Enter seç, ←→ komşu menü
    this.menuKey = (e) => {
      const dd = dds.find(d => d.classList.contains('open')); if (!dd) return false;
      const items = [...menuOf(dd).querySelectorAll('button.mi')].filter(b => !b.disabled && b.offsetParent);
      let i = items.findIndex(b => b.classList.contains('kb'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (i >= 0) items[i].classList.remove('kb');
        i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
        items[i].classList.add('kb'); items[i].scrollIntoView({ block: 'nearest' }); return true;
      }
      if (e.key === 'Enter' && i >= 0) { e.preventDefault(); items[i].click(); return true; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const top = dds.filter(d => !d.classList.contains('up')), k = top.indexOf(dd); if (k < 0) return true;
        e.preventDefault(); open(top[(k + (e.key === 'ArrowRight' ? 1 : top.length - 1)) % top.length]); return true;
      }
      if (e.key === 'Escape') { close(); return true; }
      return false;
    };
  }
  renderSnapMenu() {
    const m = $('snapMenu'), ap = this.settings.aperture || 12;
    m.innerHTML = '<div class="mhead">Nesne yakalama · F3 aç/kapat</div>' +
      SNAP_MODES.map(([k, l, sym]) => '<button class="mi' + (this.snapModes[k] ? ' on' : '') + '" data-keep="1" data-sm="' + k + '"><span class="ck"></span><span class="mk">' + sym + '</span><span class="lbl">' + l + '</span></button>').join('') +
      '<div class="msep"></div><div style="display:flex;gap:4px;padding:2px 8px 4px" data-keep="1"><button class="mini" data-sa="all">Hepsi</button><button class="mini" data-sa="none">Hiçbiri</button><button class="mini" data-sa="def">Varsayılan</button></div>' +
      '<div class="msub" data-keep="1">Hassasiyet <input type="range" min="4" max="30" value="' + ap + '" id="smAp"><span id="smApV" style="min-width:38px;text-align:right">' + ap + ' px</span></div>';
    m.querySelectorAll('[data-sm]').forEach(b => b.onclick = () => {
      const k = b.dataset.sm; this.snapModes[k] = !this.snapModes[k]; b.classList.toggle('on', this.snapModes[k]);
      if (this.snapModes[k] && !this.snapOn) this.toggleSnap();
      this.settings.snap = Object.assign({}, this.snapModes); saveSettings(this.settings);
    });
    m.querySelectorAll('[data-sa]').forEach(b => b.onclick = () => {
      const a = b.dataset.sa;
      for (const [k] of SNAP_MODES) this.snapModes[k] = a === 'all' ? true : a === 'none' ? false : DEFAULT_SNAP[k];
      if (a !== 'none' && !this.snapOn) this.toggleSnap();
      this.settings.snap = Object.assign({}, this.snapModes); saveSettings(this.settings); this.renderSnapMenu();
    });
    $('smAp').oninput = (e) => { this.settings.aperture = +e.target.value; $('smApV').textContent = e.target.value + ' px'; saveSettings(this.settings); };
  }

  // ───────────── ayarlar
  applySettings() {
    const st = this.settings, R = this.R;
    R.setTheme(st.theme !== 'light'); $('view').style.background = R.dark ? '#1b1e23' : '#fff';
    R.textLimit = st.textLimit; this.gizmo.enabled = !!st.gizmo;
    const nh = document.querySelector('#ddFile [data-cmd="new"] .hint'); if (nh) nh.textContent = 'Boş bir çizimle başlayın (' + (UNITS[st.newUnits] || 'milimetre') + ')';
    if (st.style && st.style !== R.style) R.style = st.style;
    this.renderLayers(); this.vc.draw(); this.update3DUI(); this.updateButtons(); R.request();
  }
  setSetting(k, v) { this.settings[k] = v; saveSettings(this.settings); this.applySettings(); }
  settingsDialog() {
    const st = this.settings;
    const sw = (k, on) => '<button class="sw2' + (on ? ' on' : '') + '" data-sw="' + k + '"></button>';
    const sel = (k, opts) => '<select data-sel="' + k + '">' + opts.map(([v, l]) => '<option value="' + v + '"' + (String(st[k]) === String(v) ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
    const rng = (k, mn, mx, stp, fmt) => '<input type="range" data-rng="' + k + '" min="' + mn + '" max="' + mx + '" step="' + stp + '" value="' + st[k] + '"><span data-rv="' + k + '" style="min-width:52px;text-align:right">' + fmt(st[k]) + '</span>';
    const row = (lb, hint, ctl) => '<div class="lb">' + lb + (hint ? '<small>' + hint + '</small>' : '') + '</div><div class="ctl">' + ctl + '</div>';
    const fmts = { aperture: v => v + ' px', zoomSpeed: v => (+v).toFixed(1) + '×' };
    this.modal('<h2>Ayarlar</h2><div class="set">' +
      '<h4>Görünüm</h4>' +
      row('Tema', 'Çizim alanı ve arayüz arka planı', sel('theme', [['dark', 'Koyu'], ['light', 'Açık']])) +
      row('Varsayılan görsel stil', 'Dosya açılınca', sel('style', [['wire', 'Tel kafes'], ['hidden', 'Gizli çizgi'], ['shaded', 'Gölgeli']])) +
      row('Izgara', 'Plan ve 3B görünümde uyarlanır ızgara', sw('grid', st.grid)) +
      row('Başlangıç noktası', '0,0,0 noktasını eksen çizgileriyle hafifçe göster', sw('originMark', st.originMark)) +
      row('Eksen göstergesi', 'Sol alt köşede X / Y / Z yönleri', sw('axisTripod', st.axisTripod)) +
      row('Yazı sınırı', 'Uzaktan bakarken aynı anda çizilen en çok yazı', sel('textLimit', [[5000, '5.000'], [25000, '25.000'], [100000, '100.000'], [1000000, 'Sınırsız']])) +
      '<h4>Nesne yakalama</h4>' +
      row('Hassasiyet', 'İmlecin yakalama yarıçapı', rng('aperture', 4, 30, 1, fmts.aperture)) +
      row('Yakalama etiketi', 'İşaretin yanında "Uç nokta", "Merkez"… yazsın', sw('snapLabels', st.snapLabels)) +
      row('Modlar', 'Durum çubuğundaki YAKALA ▴ menüsünden', '<button class="mini" id="setSnap">Yakalama modlarını aç</button>') +
      '<h4>Düzenleme</h4>' +
      row('Seçim tutamacı', 'Seçimde X/Y/Z taşı · döndür · ölçekle tutamacı', sw('gizmo', st.gizmo)) +
      row('Dinamik komut girişi', 'Çizim alanında harf yazınca komut satırına gider', sw('dynInput', st.dynInput)) +
      row('İmleçte uzunluk / açı', 'Sayı yazınca imlecin yanındaki alana girer; Tab: alan değiştir ve değeri kilitle', sw('dynFields', st.dynFields)) +
      row('Noktaları hemen göster', 'Kapalıyken seçimde noktalar çıkmaz; seçim çubuğundaki Noktalar düğmesi, çift tık ya da NOKTA komutuyla açılır', sw('gripsAlways', st.gripsAlways)) +
      '<h4>Fare</h4>' +
      row('Tekerlek yönü', 'Yakınlaştırma yönünü ters çevir', sw('wheelInvert', st.wheelInvert)) +
      row('Yakınlaştırma hızı', '', rng('zoomSpeed', 0.3, 3, 0.1, fmts.zoomSpeed)) +
      '<h4>Yeni çizim</h4>' +
      row('Birim', 'Dosya → Yeni çizim için', sel('newUnits', [[4, 'Milimetre'], [5, 'Santimetre'], [6, 'Metre'], [7, 'Kilometre'], [1, 'İnç'], [2, 'Fit']])) +
      '</div><div class="btns"><button class="btn" id="setReset">Varsayılanlara dön</button><button class="btn pri" id="mOk">Kapat</button></div>', d => {
      d.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => { const k = b.dataset.sw; b.classList.toggle('on'); this.setSetting(k, b.classList.contains('on')); });
      d.querySelectorAll('[data-sel]').forEach(el => el.onchange = () => { const k = el.dataset.sel, v = el.value; this.setSetting(k, /^\d+$/.test(v) ? +v : v); });
      d.querySelectorAll('[data-rng]').forEach(el => el.oninput = () => { const k = el.dataset.rng; d.querySelector('[data-rv="' + k + '"]').textContent = fmts[k](el.value); this.setSetting(k, +el.value); });
      d.querySelector('#setSnap').onclick = () => { this.closeModal(); this.openMenu($('snapDD')); };
      d.querySelector('#setReset').onclick = () => { this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); this.snapModes = Object.assign({}, DEFAULT_SNAP); saveSettings(this.settings); this.applySettings(); this.closeModal(); this.settingsDialog(); };
      d.querySelector('#mOk').onclick = () => this.closeModal();
    });
  }

  // ───────────── katman oluştur
  bind() {
    const ov = $('ov'), R = this.R, S = this.store;
    this.initMenus();
    $('modal').addEventListener('mousedown', (e) => { if (e.target === $('modal')) this.dismissModal(); });
    $('fileIn').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; this.load(f, null); };
    document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => { if (!b.disabled) this.runCommand(b.dataset.cmd); }));
    document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => this.setTool(b.dataset.tool)));
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => this.setNamedView(b.dataset.view));
    document.querySelectorAll('[data-zs]').forEach(b => b.onclick = () => this.setZScale(+b.dataset.zs));
    document.querySelectorAll('[data-style]').forEach(b => b.onclick = () => this.setStyle(b.dataset.style));
    document.querySelectorAll('[data-gizmo]').forEach(b => b.onclick = () => {
      const g = b.dataset.gizmo;
      if (g === 'points') { this.setPointMode(!this.pointMode); return; }
      this.pointMode = false; if (this.grips) { this.grips.key = ''; this.grips.refresh(); }
      if (g === 'off') this.gizmo.enabled = !this.gizmo.enabled; else { this.gizmo.enabled = true; this.gizmo.mode = g; }
      this.updateButtons(); R.request();
    });
    $('tSnap').onclick = () => this.toggleSnap(); $('tOrtho').onclick = () => this.toggleOrtho();
    $('layNew').onclick = () => { if (this.store.info) this.newLayerDialog(); else this.toast('Önce bir çizim açın ya da Dosya → Yeni çizim.'); };
    $('curLayer').onchange = (e) => this.setCurLayer(+e.target.value);

    // katman paneli
    $('laySearch').oninput = () => this.renderLayers();
    $('layAll').onclick = () => this.setLayerVis(() => true);
    $('layNone').onclick = () => this.setLayerVis(() => false);
    $('layInv').onclick = () => this.setLayerVis((i, v) => !v);
    // sürükle-bırak
    const view = $('view');
    view.addEventListener('dragover', (e) => { e.preventDefault(); view.classList.add('dragover'); });
    view.addEventListener('dragleave', () => view.classList.remove('dragover'));
    view.addEventListener('drop', async (e) => {
      e.preventDefault(); view.classList.remove('dragover');
      const it = e.dataTransfer.items && e.dataTransfer.items[0];
      let handle = null;
      if (it && it.getAsFileSystemHandle) { try { handle = await it.getAsFileSystemHandle(); } catch (err) { handle = null; } }
      const f = e.dataTransfer.files[0];
      if (f) this.load(f, handle && handle.kind === 'file' ? handle : null);
    });

    // fare
    ov.addEventListener('contextmenu', (e) => e.preventDefault());
    ov.addEventListener('pointerdown', (e) => {
      ov.setPointerCapture(e.pointerId);
      if (document.activeElement === $('cmdin') && !this.tool.wantsPoints) $('cmdin').blur();
      this.track(e);
      if (e.button === 1 && e.shiftKey) { e.preventDefault(); this.stopAnim(); this.beginOrbit(); this.orbiting = { x: e.offsetX, y: e.offsetY }; ov.style.cursor = 'move'; return; }
      if (e.button === 1 || e.button === 2 || (e.button === 0 && this.spaceDown)) { e.preventDefault(); this.stopAnim(); this.startPan(e); return; }
      if (e.button !== 0) return;
      // çift tık: tuvalde imleç yakalandığı için tarayıcının dblclick olayına güvenilmez — kendimiz algılarız
      const now = performance.now(), lp = this._lastDown;
      const isDbl = !!lp && now - lp.t < 450 && Math.hypot(e.offsetX - lp.x, e.offsetY - lp.y) < 5;
      this._lastDown = isDbl ? null : { t: now, x: e.offsetX, y: e.offsetY };
      if (isDbl && this.tool.dbl && this.toolName === 'select') { this.tool.dbl(); this.updatePrompt(); R.request(); return; }
      // seçim tutamacı
      // nokta tutamaçları (grip) gizmonun üstünde çizilir: karenin içine tıklanırsa tutamaç, değilse gizmo
      if (this.toolName === 'select') {
        if (this.grips && this.grips.down(e)) { R.request(); return; }
        const h = this.gizmo.hit(e.offsetX, e.offsetY); if (h && this.gizmo.begin(h, e)) { R.request(); return; }
      }
      const t = this.tool;
      if (t.down) t.down(this.point(), e);
      else if (t.click) {
        const base = t.base || (t.pts && t.pts[t.pts.length - 1]) || t.c || t.a || (t.P && t.P[t.P.length - 1]);
        const pt = this.point(base);
        if (this.dyn) this.dyn.reset();
        Promise.resolve(t.click(pt)).then(() => { if (isDbl && t.dbl && this.tool === t) t.dbl(); this.updatePrompt(); this.updateSnap(); R.request(); });
      }
    });
    ov.addEventListener('pointermove', (e) => {
      const o = this.orbiting;
      if (o) { this.orbitBy(e.offsetX - o.x, e.offsetY - o.y); o.x = e.offsetX; o.y = e.offsetY; this.track(e); return; }
      const p = this.panning;
      if (p) {
        const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) p.moved = true;
        if (p.moved) { R.pan(dx, dy); p.x = e.offsetX; p.y = e.offsetY; this.userMoved = true; }
        this.track(e); return;
      }
      this.track(e);
      if (this.gizmo.drag) { this.gizmo.move(e, e.shiftKey); return; }
      if (this.toolName === 'select' && !this.tool.drag) {
        const gh = this.grips ? this.grips.hover(e) : false;
        const h = !gh && this.gizmo.active ? this.gizmo.hit(e.offsetX, e.offsetY) : null;
        if (h !== this.gizmo.hover) { this.gizmo.hover = h; if (!gh) ov.style.cursor = h ? 'pointer' : 'crosshair'; R.request(); }
      }
      this.updateSnap(); this.showCoords();
      if (this.tool.move) this.tool.move(e);
      if (this.toolName === 'area') this.updatePrompt();
      R.request();
    });
    ov.addEventListener('pointerup', (e) => {
      if (this.orbiting) { this.orbiting = null; this.endOrbit(); ov.style.cursor = this.toolName === 'pan' ? 'grab' : this.toolName === 'orbit' ? 'move' : 'crosshair'; return; }
      if (this.gizmo.drag) { this.gizmo.end(); return; }
      const p = this.panning;
      if (p) {
        this.panning = null; ov.style.cursor = this.toolName === 'pan' ? 'grab' : this.toolName === 'orbit' ? 'move' : 'crosshair';
        if (!p.moved && p.btn === 2) this.rightClick();
        return;
      }
      if (e.button === 0 && this.tool.up) { this.tool.up(e); R.request(); }
    });
    ov.addEventListener('dblclick', (e) => {
      if (e.button === 1) { this.fit(); return; }
    });
    ov.addEventListener('auxclick', (e) => { if (e.button === 1 && e.detail === 2) this.fit(); });
    ov.addEventListener('wheel', (e) => {
      e.preventDefault(); this.stopAnim();
      const sp = (this.settings.zoomSpeed || 1) * (this.settings.wheelInvert ? -1 : 1);
      const f = Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 33 : 1) * sp);
      R.zoomAt(e.offsetX, e.offsetY, f); this.userMoved = true; this.track(e); this.gizmo.invalidate();
    }, { passive: false });

    // komut satırı
    const cmd = $('cmdin');
    cmd.addEventListener('input', () => this.suggest(cmd.value));
    cmd.addEventListener('blur', () => setTimeout(() => { $('sugg').style.display = 'none'; }, 150));
    $('sugg').addEventListener('mousedown', (e) => { const r = e.target.closest('.si'); if (r) { e.preventDefault(); const c = this.sugg[+r.dataset.i]; cmd.value = ''; $('sugg').style.display = 'none'; this.runCommand(c[0][0]); if (!this.tool.wantsPoints) cmd.blur(); } });
    const submit = () => {
      let v = cmd.value.trim();
      const box = $('sugg');
      if (box.style.display === 'block' && this.sugg && this.sugg.length && !ALIAS.has(v.toLocaleLowerCase('tr')) && !(this.tool.input && /^[-@\d]/.test(v))) v = this.sugg[this.suggI][0][0];
      cmd.value = ''; box.style.display = 'none';
      if (!v) { this.enter(); return; }
      const t = this.tool;
      if (t.input && t.input(v)) { this.updatePrompt(); this.R.request(); }
      else this.runCommand(v);
      if (!this.tool.wantsPoints) cmd.blur();
    };
    cmd.addEventListener('keydown', (e) => {
      const box = $('sugg');
      if (box.style.display === 'block' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault(); this.suggI = (this.suggI + (e.key === 'ArrowDown' ? 1 : this.sugg.length - 1)) % this.sugg.length;
        box.querySelectorAll('.si').forEach((el, i) => el.classList.toggle('on', i === this.suggI)); return;
      }
      if (e.key === 'Tab' && box.style.display === 'block') { e.preventDefault(); cmd.value = this.sugg[this.suggI][0][0]; this.suggest(cmd.value); return; }
      if (e.key === 'Enter' || (e.key === ' ' && cmd.value.trim() && !/[,;@]/.test(cmd.value) && !this.tool.input)) { e.preventDefault(); submit(); }
      else if (e.key === ' ' && cmd.value.trim() && this.tool.input) { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { cmd.value = ''; box.style.display = 'none'; cmd.blur(); this.escape(); }
      else if (e.key === 'Backspace' && !cmd.value && this.tool.undoPt) { e.preventDefault(); this.tool.undoPt(); this.updatePrompt(); this.R.request(); }
      e.stopPropagation();
    });
    window.addEventListener('keydown', (e) => {
      if ($('modal').classList.contains('show')) { if (e.key === 'Escape') this.dismissModal(); return; }
      if (this.menusOpen() && this.menuKey(e)) return;
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'SELECT' || tgt.tagName === 'TEXTAREA')) return;
      const k = e.key, ctrl = e.ctrlKey || e.metaKey;
      if (k === 'Escape' && this.menusOpen()) { this.closeMenus(); return; }
      if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.editor.redo() : this.editor.undo(); this.selChanged(); return; }
      if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); this.editor.redo(); this.selChanged(); return; }
      if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); if (S.done) Export.saveDXF(this, 'full'); return; }
      if (ctrl && k.toLowerCase() === 'o') { e.preventDefault(); this.openDialog(); return; }
      if (ctrl && k.toLowerCase() === 'a') { e.preventDefault(); this.selectAll(); return; }
      if (ctrl && k.toLowerCase() === 'f') { e.preventDefault(); this.findDialog(); return; }
      if (ctrl && k.toLowerCase() === 'n') { e.preventDefault(); this.newDrawing(); return; }
      if (ctrl && k === ',') { e.preventDefault(); this.settingsDialog(); return; }
      if (ctrl || e.altKey) return;
      // dinamik giriş (uzunluk / açı alanları, Tab ile kilit)
      if (this.dyn && this.dyn.key(e)) { e.preventDefault(); R.request(); return; }
      if (k === 'Escape') { if (this.gizmo.drag) { this.gizmo.cancel(); return; } this.escape(); return; }
      if (k === 'Backspace' && this.tool.undoPt) { e.preventDefault(); this.tool.undoPt(); this.updatePrompt(); R.request(); return; }
      if (k === 'Delete') { e.preventDefault(); this.deleteSel(); return; }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); this.enter(true); return; }
      if (k === 'Home') { this.homeView(); return; }
      if (k === 'F1') { e.preventDefault(); this.helpDialog(); return; }
      if (k === 'F3') { e.preventDefault(); this.toggleSnap(); return; }
      if (k === 'F8') { e.preventDefault(); this.toggleOrtho(); return; }
      // harf / rakam: komut satırına (dinamik giriş)
      if (this.settings.dynInput && k.length === 1 && /[\p{L}\d@.\-]/u.test(k)) { cmd.focus(); return; }
    });
    window.addEventListener('beforeunload', (e) => { if (this.store.dirty) { e.preventDefault(); e.returnValue = ''; } });
  }
  track(e) {
    this.mouse.sx = e.offsetX; this.mouse.sy = e.offsetY;
    const [wx, wy] = this.R.s2w(e.offsetX, e.offsetY);
    this.mouse.wx = wx; this.mouse.wy = wy;
    this.showCoords();
  }
  showCoords() {
    const R = this.R, sp = this.snapPt;
    if (sp) { const [ax, ay] = sp.abs || this.abs(sp.p[0], sp.p[1]); $('coords').textContent = 'X: ' + fmtC(ax) + '   Y: ' + fmtC(ay) + '   Z: ' + fmtC(sp.p[2]) + '  · ' + (SNAP_NAME[sp.kind] || ''); return; }
    if (!isFinite(this.mouse.wx)) { $('coords').textContent = 'X: —   Y: —'; return; }
    const [ax, ay] = this.abs(this.mouse.wx, this.mouse.wy);
    $('coords').textContent = 'X: ' + fmtC(ax) + '   Y: ' + fmtC(ay) + (R.is2D ? '' : '   Z: ' + fmtC(R.cz));
  }
  fit() {
    this.freshExtents();
    const S = this.store, R = this.R;
    if (!S.ext) { if (S.view0) R.fit(S.view0); return; }
    const now = performance.now();
    if (now - this.lastFit < 1500 && (S.view0 !== S.ext || S.zview[0] !== S.zext[0] || S.zview[1] !== S.zext[1])) { R.fit(S.ext, 0.04, S.zext); this.toast('Tüm çizim (aykırı uzak nesneler dahil)'); this.lastFit = 0; }
    else { R.fit(S.view0, 0.04, S.zview); this.lastFit = now; if (S.view0 !== S.ext) this.toast('Tekrar basarsanız uzak/aykırı nesneler dahil tümü gösterilir'); }
    this.userMoved = true; this.gizmo.invalidate();
  }
  escape() {
    const t = this.tool;
    if (this.toolName !== 'select') { this.setTool('select'); return; }
    if (t.drag) { t.drag = null; this.R.request(); return; }
    if (this.pointMode) { this.setPointMode(false); return; }   // önce nokta kipinden çık, seçim kalsın
    this.pendingTool = null;
    if (this.marker) { this.marker = null; this.R.request(); }
    if (this.store.selList.length) { this.store.clearSel(); this.selChanged(); }
    this.updatePrompt();
  }
  enter(fromKey) {
    const t = this.tool;
    if (t.enter && t.enter()) { this.updatePrompt(); this.R.request(); return; }
    if (this.toolName !== 'select') { this.setTool('select'); return; }
    // boş Enter: son komutu tekrarla
    if (fromKey && this.lastCmd) { const n = this.lastCmd; if (this.tools[n]) this.setTool(n); else this.runCommand(n); }
  }
  rightClick() {
    const t = this.tool;
    if (t.right && t.right()) { this.updatePrompt(); this.R.request(); return; }
    if (t.enter && t.enter()) { this.updatePrompt(); this.R.request(); return; }
    if (this.toolName !== 'select') this.setTool('select');
  }
  // Nokta düzenleme kipi: seçili nesnelerin noktaları görünür, gizmo gizlenir
  setPointMode(on, quiet) {
    const S = this.store;
    if (on && !S.selList.length) { this.toast('Önce noktalarını düzenleyeceğiniz nesneyi seçin.'); on = false; }
    this.pointMode = !!on; this.gizmo.hover = null;
    if (this.grips) { this.grips.key = ''; this.grips.refresh(); }
    this.updateButtons(); this.updatePrompt(); this.R.request();
    if (on && !quiet) this.toast('Nokta düzenleme: mavi noktaya tıklayın, sonra yeni yerine tıklayın (ya da sürükleyin). Esc: kipten çık.', 5000);
  }
  toggleSnap() { this.snapOn = !this.snapOn; $('tSnap').classList.toggle('on', this.snapOn); this.snapPt = null; this.R.request(); }
  toggleOrtho() { this.ortho = !this.ortho; $('tOrtho').classList.toggle('on', this.ortho); }
  selectAll() {
    const S = this.store; if (!S.done) return;
    const ids = []; for (let i = 0; i < S.nEnt; i++) ids.push(i);
    S.setSel(ids, 'set'); this.selChanged(); this.toast(fmtN(S.selList.length) + ' nesne seçildi');
  }
}

// Yeni çizimin tek görünen katmanı. "0" ve "Defpoints" DXF için zorunludur; dosyada kalır, boşken listede gizlenir.
const START_LAYER = 'Genel';
function withStartLayer(txt, name) {
  const m = /\$HANDSEED\n  5\n([0-9A-Fa-f]+)\n/.exec(txt); if (!m) return txt;
  const h = m[1].toUpperCase(), next = (parseInt(h, 16) + 1).toString(16).toUpperCase();
  const def = txt.indexOf('\n  2\nDefpoints\n'), end = def >= 0 ? txt.indexOf('  0\nENDTAB\n', def) : -1; if (end < 0) return txt;
  const rec = '  0\nLAYER\n  5\n' + h + '\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\n' + name + '\n 70\n0\n 62\n7\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n';
  txt = txt.slice(0, end) + rec + txt.slice(end);
  return txt.replace(m[0], '$HANDSEED\n  5\n' + next + '\n').replace('$CLAYER\n  8\n0\n', '$CLAYER\n  8\n' + name + '\n');
}
function tr(k, v) { return '<tr><td>' + k + '</td><td>' + v + '</td></tr>'; }
function fmtP(x, y) { return 'X ' + fmtC(x) + '<br>Y ' + fmtC(y); }
function fmtC(v) { if (!isFinite(v)) return '—'; const a = Math.abs(v); return v.toLocaleString('tr-TR', { maximumFractionDigits: a >= 1000 ? 3 : a >= 1 ? 4 : 6 }); }
// Bir varlık grubunun aykırı değerlerden arınmış kutusu (ilk görünüm için)
function robustBox(bb) {
  const n = bb.length >> 2; if (!n) return null;
  const xs = [], ys = []; const step = Math.max(1, Math.floor(n / 50000));
  for (let i = 0; i < n; i += step) { const a = bb[4 * i]; if (!(a <= bb[4 * i + 2])) continue; xs.push((a + bb[4 * i + 2]) / 2); ys.push((bb[4 * i + 1] + bb[4 * i + 3]) / 2); }
  if (!xs.length) return null;
  const fx = Float64Array.from(xs).sort(), fy = Float64Array.from(ys).sort();
  const q = (a, p) => a[Math.floor(p * (a.length - 1))];
  const x0 = q(fx, 0.01), x1 = q(fx, 0.99), y0 = q(fy, 0.01), y1 = q(fy, 0.99);
  const w = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1);
  return [x0 - w * 0.1, y0 - h * 0.1, x1 + w * 0.1, y1 + h * 0.1];
}

window.app = new App();
