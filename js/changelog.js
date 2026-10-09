/* Fast DXF — sürüm notları. Yeni sürümde en üste bir kayıt eklenir; numara 0.1.x biçiminde birer artar.
 * Üst çubukta Ayarlar düğmesinin solundaki sürüm düğmesi bu listeyi açar. */
'use strict';

const CHANGELOG = [
  { v: '0.1.8', d: '2026-10-09', t: 'Noktalardan geçen spline, çap ölçüsü ikonu', items: [
    'Spline artık tıklanan noktalardan geçer; çizerken kırık denetim çizgileri yerine yalnız düzgün eğri görünür.',
    'Spline nokta düzenleme kipinde tıklanan noktalarından düzenlenir; eğri yeniden noktalardan geçirilir.',
    'Dosyadaki spline'ların düğüm (knot) değerleri ve uydurma noktaları korunur; eğriler daha yumuşak çizilir.',
    'Çap ölçüsü ikonu çemberi baştan başa geçen çift oklu çizgiyle çizildi; yarıçap ikonundan ayrıldı.'
  ] },
  { v: '0.1.7', d: '2026-10-09', t: 'Nokta düzenleme kipi', items: [
    'Nesne seçilince noktalar artık kendiliğinden çıkmaz; seçim gizmo ile gelir.',
    'Nokta düzenleme kipi: seçim çubuğundaki "Noktalar" düğmesi, nesneye çift tık ya da NOKTA komutu. Kipte gizmo gizlenir; uç, köşe, orta ve merkez noktaları görünür.',
    'Bir noktaya tıklayıp yeni yerine tıklayın ya da sürükleyin; yakalama, hiza ve uzunluk / açı girişi çalışır, koordinat da yazılabilir (ör. 120,45). Kip, düzenlemeden sonra açık kalır.',
    'Esc nokta kipinden çıkar (seçim kalır); boşluğa tıklamak seçimi ve kipi kapatır.',
    'İsteyenler için Ayarlar → "Noktaları hemen göster" ile noktalar her seçimde görünür.'
  ] },
  { v: '0.1.6', d: '2026-10-09', t: 'Metin düzenleme, ölçü ofsetleri ve birimi, tek katmanla başlangıç', items: [
    'Yazılar sonradan düzenlenebilir: tek yazı seçiliyken sağdaki Özellikler panelinde içerik, yükseklik ve açı kutusu; "Yerinde düzenle" düğmesi, ED komutu ya da yazıya çift tık.',
    'Dinamik giriş alanlarında hangi alanda olduğunuz açıkça görünür: "Uzunluk" / "Açı" etiketleri, etkin alanda mavi çerçeve ve yanıp sönen imleç, altında Tab\'ın ne yapacağını söyleyen ipucu.',
    'Çizerken üst üste binen yazılar ayrıldı: hiza etiketi imlecin üstünde, yakalama etiketi ve uzunluk / açı alanları altında; çizginin ortasındaki tekrar eden uzunluk yazısı kaldırıldı.',
    'Ölçü ayarlarına ofsetler eklendi: ok / eğik çizgi boyu, uzatma çizgisi ofseti ve taşması, yazı ofseti, ölçü çizgisi taşması.',
    'Ölçülerde birim gösterilir (ör. 12,50 cm); ayarlardan kapatılabilir.',
    'Yeni çizim birimine inç ve fit eklendi; varsayılan birim santimetre.',
    'Uygulama açılınca doğrudan boş bir çizimle başlar; tek katman ("Genel") görünür. DXF\'in zorunlu "0" ve "Defpoints" katmanları boşken listede gizlenir.',
    'Arayüz ve belgelerden başka yazılımların ticari adları kaldırıldı.'
  ] },
  { v: '0.1.5', d: '2026-10-09', t: 'Dinamik giriş, tutamaçlar, 3B çizim, eksen göstergesi', items: [
    'Dinamik giriş: çizerken imlecin yanında uzunluk ve açı alanları. Sayı yazın, Tab ile değeri kilitleyip diğer alana geçin; kilitli uzunluk ya da açı imleci kısıtlar, Enter noktayı koyar. İlk noktada X / Y alanları.',
    'Nokta tutamaçları (grip): seçili nesnelerin uç, köşe, orta, merkez, çeyrek ve ölçü noktalarında mavi kareler. Kareye tıklayıp yeni yere tıklayın ya da sürükleyin; çizgiyi uzatır, polyline köşesini / kenarını kaydırır, yarıçapı değiştirir, nesneyi taşır.',
    '3B görünümde çizim: çizim araçları, Taşı / Kopyala, Mesafe ve Alan 3B görünümde de çalışır. Nesne yakalama 3B noktaları ekrandan bulur; boşluğa tıklanınca nokta çalışma düzlemine (önceki noktanın kotu) düşer.',
    'Sol alt köşede eksen göstergesi (X kırmızı, Y yeşil, Z mavi), 0,0,0 noktasında hafif eksen çizgileri, 3B görünümde hafif zemin ızgarası.',
    'Merkez yakalama: dairenin / yayın merkezi yalnız eğrinin üzerinde kısa süre beklenince etkinleşir; dairenin içinde çizerken imleç artık merkeze çekilmez.',
    'Hizalama, çizilmekte olan nesnenin kendi noktalarıyla da çalışır (ör. polyline\'ı ilk noktasının hizasında kapatmak); bu noktalar yakalanabilir.',
    'Ölçüler: ölçü çizgisi, uzatma çizgisi ve yazı renkleri ayrı ayrı seçilebilir; inşaat projelerine uygun eğik çizgi (tick) uç tipi; ayarlar programda çizilmiş tüm ölçülere uygulanabilir.',
    'Ölçü menüsü son kullanılan ölçü aracını hatırlar; hizalı ölçü ikonu eğik çizildi.',
    'Sürüm notları penceresi (bu pencere).'
  ] },
  { v: '0.1.4', d: '2026-10-09', t: 'Hizalama, metin aracı, ölçülendirme', items: [
    'Kutupsal izleme (KUTUPSAL, F10; açı adımı sağ tıkla) ve nesne yakalama izi (İZ): hiza çizgileri, hiza kesişimleri, hiza yönünde uzaklık yazma.',
    'Metin aracı: tıklanan yerde açılan düzenleyici (yükseklik, açı, hizalama); Shift+Enter ile çok satırlı yazı (MTEXT); yazıya çift tıklayınca yerinde düzenleme.',
    'Ölçülendirme: doğrusal (DLI), hizalı (DAL), açı (DAN), yarıçap (DRA), çap (DDI) ve ölçü ayarları (D). Ölçüler CAD programlarında düzenlenebilen gerçek DIMENSION nesneleri olarak kaydedilir.',
    'Katman satırında kilit düğmesi; pencerelerin dışına tıklayınca kapanması; tel kafes kenarlarını kapatma (Kenarlar).',
    'Çift tıklama algılaması düzeltildi; "dik" yakalama varsayılan olarak kapalı.'
  ] },
  { v: '0.1.3', d: '2026-10-09', t: '3B dönüşüm, 3B gizmo, katman yöneticisi', items: [
    'Tam 3B dönüşüm: X / Y / Z eksenlerinde döndürme, eksen başına ölçek, aynalama; ekranda ve kaydedilen DXF\'te.',
    'Gizmo: tek eksende, düzlemde (XY / YZ / XZ) ve ekran düzleminde taşıma; X / Y / Z halkalarıyla döndürme; tek, iki eksende ve orantılı ölçekleme. Taşırken gizmo nesneyle birlikte gider.',
    'Katmanlar: renk, kilit, yeniden adlandırma, silme (geri alınabilir, dosyaya yazılır).',
    'Eğik düzlemdeki (OCS) nesneler ve 3B blok örnekleri doğru okunur.',
    'Eklenti yapısı: yeni özellikler ayrı dosyalarda (registry.js).'
  ] },
  { v: '0.1.2', d: '2026-10-09', t: 'Menüler, nesne yakalama, yeni çizim', items: [
    'Açılır menüler ekrana sabit konumda açılır; klavyeyle gezinme.',
    'Dosya → Yeni çizim (boş DXF şablonu) ve yeni katman oluşturma.',
    'Ayarlar penceresi (tema, ızgara, yakalama, fare, yeni çizim birimi); ayarlar saklanır.',
    'Nesne yakalama yeniden yazıldı: uç, orta, merkez, çeyrek, kesişim, dik, en yakın, düğüm, ekleme noktası; nokta nesnenin tam DXF geometrisinden hesaplanır.',
    'Plan görünümde uyarlanır ızgara; GitHub Pages üzerinden tarayıcıda açılabilir.'
  ] },
  { v: '0.1.1', d: '2026-10-09', t: 'İlk sürüm', items: [
    'Büyük DXF dosyalarını (1 GB ve üzeri) parça parça, arka planda okuma; okuma sırasında kademeli gösterim.',
    'Plan ve 3B gezinme, Görünüm küpü, hazır görünümler, perspektif, gölgeli / gizli çizgi stilleri, kot renklendirme, arazi yüzeyi (TIN).',
    'Çizim ve düzenleme araçları (çizgi, polyline, daire, yay, taşı, döndür, buda, uzat, öteleme, kavis…); geri al / yinele.',
    'Değişmeyen kısımları birebir koruyan DXF kaydetme; SVG, PDF ve PNG dışa aktarma; metin bulma ve koordinata gitme.'
  ] }
];
const APP_VERSION = CHANGELOG[0].v;

FastDXF.use({
  name: 'surum-notlari',
  init(app) {
    const dialog = () => {
      const html = CHANGELOG.map((r, i) => '<div class="clv' + (i === 0 ? ' cur' : '') + '"><div class="clh"><b>' + esc(r.v) + '</b><span>' + esc(r.t) + '</span><em>' + esc(r.d.split('-').reverse().join('.')) + (i === 0 ? ' · kullandığınız sürüm' : '') + '</em></div><ul>' +
        r.items.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul></div>').join('');
      app.modal('<h2>Sürüm notları <span style="color:var(--muted);font-size:12px;font-weight:400">Fast DXF ' + esc(APP_VERSION) + '</span></h2><div class="cl">' + html + '</div>' +
        '<div class="btns"><button class="btn pri" id="mOk">Kapat</button></div>', d => d.querySelector('#mOk').onclick = () => app.closeModal());
    };
    app.addCommand(['surum', 'sürüm', 'changelog', 'version', 'ver'], 'changelog', 'Sürüm notları', 'Araçlar', dialog);
    const set = $('bSettings');
    if (set) {
      set.insertAdjacentHTML('beforebegin', '<button class="tbtn" id="bVer" title="Sürüm notları — tüm güncellemeler">v' + esc(APP_VERSION) + '</button>');
      $('bVer').onclick = dialog;
    }
  }
});
