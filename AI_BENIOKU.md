# AI BENİ OKU — Fast DXF üzerinde çalışacak yapay zekâ için talimatlar

Bu dosya, önceki konuşmalar kaybolsa bile uygulamada nasıl çalışılacağını anlatır. İşe başlamadan önce baştan sona okuyun. Kullanıcıya yönelik tanıtım `README.md`'dedir; bu dosya geliştirme kurallarıdır.

## 1. Proje

- **Fast DXF:** tarayıcıda çalışan, kurulum gerektirmeyen DXF görüntüleyici ve düzenleyici. Büyük (1 GB+) dosyaları parça parça okur, çizer, düzenler, değişmeyen kısımları birebir koruyarak kaydeder.
- **Klasör:** `C:\Users\User\Documents\FurkanProjeler\48-DXF Okuyucu\`
- **Depo:** https://github.com/frkn3d/Fast-DXF (dal: `master`)
- **Yayın (GitHub Pages):** https://frkn3d.github.io/Fast-DXF/ — `index.html` → `DXF Okuyucu.html`'e yönlendirir.
- Derleme adımı, paket yöneticisi, çerçeve yok: düz HTML + klasik `<script>` dosyaları (`js/`).

## 2. Çalışma kuralları (kullanıcının istekleri)

1. **Kullanıcıya Türkçe yanıt verin.** Arayüz metinleri, sürüm notları, kod yorumları da Türkçe.
2. **Her güncellemeden sonra git'e gönderin:** commit + `git push`. Ardından Pages'in yeni sürümü yayınladığını doğrulayın (değişen bir dosyayı `curl` ile çekip yeni metni arayın; birkaç dakika sürebilir).
3. **Başka yazılımların ticari adları geçmez:** arayüzde, belgelerde, sürüm notlarında "AutoCAD", "3ds Max", "SketchUp", "ViewCube" vb. yazılmaz ("CAD programları", "görünüm küpü", "eksen göstergesi" deyin). İstisna: DXF biçiminin parçası olan sabitler (ör. ikili DXF imzası `AutoCAD Binary DXF`, `ACAD` XDATA uygulama adı) koddan değiştirilmez.
4. `43-2026 iNŞAAT\23-Rapor` klasöründeki kullanıcının düzenlediği Excel dosyasına dokunulmaz (o klasör yalnız çalışma dizini olarak açılıyor).
5. Bir değişiklik bittiğinde kullanıcıya kısa Türkçe özet: ne değişti, nasıl kullanılır, ne test edildi, bağlantılar ve sürüm numarası.

## 3. Sürüm numaralandırma ve sürüm notları

- Sürüm biçimi `0.SERİ.N`. İlk sürüm `0.1.1`.
- Her güncellemede son hane **birer artar**: `0.1.9 → 0.1.10 → 0.1.11 …` (ondalık değil; `0.1.10`, `0.1.1`'den sonra değil `0.1.9`'dan sonra gelir).
- `0.x.30`'dan sonra bir sonraki seri başlar: **`0.1.30 → 0.2.0`**, sonra `0.2.1 … 0.2.30 → 0.3.0`.
- Sürüm notları **`js/changelog.js`** içindeki `CHANGELOG` dizisindedir. Yeni sürüm **en üste** eklenir:
  ```js
  { v: '0.1.13', d: 'YYYY-AA-GG', t: 'Kısa başlık', items: ['Madde 1', 'Madde 2'] },
  ```
  `APP_VERSION` otomatik olarak ilk kayıttır; üst çubuktaki sürüm düğmesi (Ayarlar'ın solunda) bu listeyi açar.
- **Dikkat — tırnak hatası:** maddeler tek tırnaklı JS dizesidir. Türkçe ek kesmesi (`Ölçekle'nin`, `0.1.9'dan`) mutlaka `\'` ile kaçırılmalı. Bir kez kaçırılmadığı için sürüm düğmesi tamamen kaybolmuştu. Her düzenlemeden sonra: `node --check js/changelog.js`.
- `README.md`'nin başındaki `Sürüm: **0.1.x**.` satırı da güncellenir; yeni özellik README'nin ilgili bölümüne de yazılır.
- Commit mesajı: `0.1.x: kısa Türkçe açıklama`.

## 4. Mimari

- **Betik sırası** (`DXF Okuyucu.html` sonundaki `<script>` etiketleri): `registry.js` → çekirdek (`dim-core`, `dxf-core`, `template`, `workers`, `store`, `render`, `viewcube`, `geom`, `edit`, `gizmo`, `export`, `layers-ui`) → eklentiler (`tracking`, `text-tool`, `dim`, `dyn-input`, `grips`, `view-aids`, `changelog`, `cursor-icon`, `geom-props`) → en sonda `app.js`. Yeni dosya eklenince etiket `app.js`'ten önce eklenir.
- **Eklenti yapısı:** yeni özellikler mümkün olduğunca ayrı dosyada `FastDXF.use({ name, init(app) { … } })` ile yazılır. `init`, uygulama kurulunca çağrılır.
- **Kancalar (`app.hooks`):** `snap`, `point`, `preview` (önizleme çizimi), `distance`, `tool` (araç değişti), `under` (önizlemenin altına çizim), `props` (Özellikler paneli; `(P, ids)`). Ayrıca `app.addCommand(adlar, id, etiket, menü, fn)` ve `app.addTool(ad, araç, seçenekler)`.
- **Araç nesnesi** (`app.tools.*`): `wantsPoints`, `prompt()`, `start()`, `click(p)`, `input(s)`, `preview(ctx)`, `enter()`, `right()`, `cancel()`, `undoPt()`. İsteğe bağlı `dyn = { fields, constrain(p, base, vals), live(p, base) }` ile kendi dinamik giriş kutuları (ör. dikdörtgen en / boy / açı, daire yarıçap / çap).
- **Nokta çözümü:** `app.point(base)` = `rawPoint` (yakalama → 2B'de hiza / orto, 3B'de ışın ∩ çalışma düzlemi) + `app.dyn.constrain`. `app.toolBase()` aracın son noktasıdır.
- **Koordinatlar:** ekrandaki / araçlardaki noktalar dosya orijinine göre göreli; `A(p)` / `app.absP` mutlak, `app.rel` göreli. Nesne tanımları (`app.getDef(id)`, `app.newDef(tip, alanlar)`) mutlak koordinattadır.
- **Düzenleme:** `app.editor.create(def)`, `replace([id], [def], etiket)`, `move`, `xform`, `layer` — hepsi geri alınabilir. Değişiklikten sonra seçim `app.store.setSel(ids, 'set'); app.selChanged()`.
- **Kaydetme:** `dxf-core.js` `buildSaveParts` — dosyanın değişmeyen bayt aralıkları aynen kopyalanır, yalnız değişen / yeni nesneler yazılır. Tarayıcıdan kaydederken `export.js` mesajı `brEnd`, `brTableHandle`, `blocksEnd`, `dimMax` alanlarını taşımalı (yoksa ölçü blokları `*D` bozulur).
- **Ölçüler:** `dim-core.js` geometri, `dim.js` araçlar ve ayarlar. Ölçüler gerçek DIMENSION + `*D` blok olarak yazılır; stil geçersiz kılmaları DSTYLE XDATA'da, `DIMLFAC` (144) her zaman 1.0 yazılır. Ölçü metni `<> mm` biçiminde birim sonekli.
- **Spline:** çizim aracı tıklanan noktalardan geçen spline üretir (`core.interpSpline`; uydurma noktaları + denetim noktaları + düğümler kaydedilir).

## 5. Varsayılanlar ve bilinçli kararlar

- **Yeni çizim birimi: milimetre** (`INSUNITS 4`) — CAD programlarında 1 birim = 1 mm. Ayarlar'dan cm, m, km, inç, fit. Ayarlar sürümü `settingsVer` (şu an 3) ile eski kayıtlar taşınır (`loadSettings`).
- Şablondaki ölçek çarpanı `$DIMLFAC` ve tüm ölçü stillerinin 144 kodu **1.0** olmalı (100 kalınca ölçü yazıları başka programlarda 100 kat çıkıyordu).
- Uygulama açılınca boş çizimle başlar; görünen tek katman **"Genel"** (`START_LAYER`). DXF'in zorunlu "0" ve "Defpoints" katmanları dosyada durur, boşken listede gizlenir.
- Seçimde nokta tutamaçları **çıkmaz**; "Noktalar" düğmesi (Ölçekle'nin sağında), çift tık ya da `NOKTA` komutu nokta düzenleme kipini açar. Ayarlar → "Noktaları hemen göster" eski davranış.
- Daire / yay merkezi yakalaması, eğrinin üzerinde kısa süre beklenince açılır.
- İmlecin çevresi çakışmasın: araç ikonu sağ üst, hiza etiketi ikonun sağında, yakalama etiketi ve dinamik giriş kutuları altta. Dinamik girişte yazı yerine simgeler (|—| uzunluk / en, dikey boy, ∠ açı, daire içinde yarıçap / çap), açıklama satırı yok.

## 6. Test

- **Sözdizimi:** her değişiklikten sonra `for f in js/*.js; do node --check "$f"; done`.
- **Node testleri** (`tests/`):
  - `node tests/test_dim.js cikti.dxf` → `TAMAM`
  - `node tests/test_geom.js` → `TÜM GEOMETRİ TESTLERİ TAMAM`
  - `node tests/test_save.js girdi.dxf cikti.dxf`
  - `node tests/test_xform.js girdi.dxf cikti_klasoru` ve `test_xform3d.js` → `TAMAM`
  - Örnek girdiler `tests/gen_coverage.py` ile üretilebilir.
- **DXF doğrulama:** kaydedilen dosyaları Python `ezdxf` ile denetleyin (`ezdxf.recover.readfile` → `auditor.errors` boş olmalı).
- **Tarayıcı testleri:** puppeteer-core + yüklü Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`, headless). Uygulama `file:///…/DXF%20Okuyucu.html` ile açılır; `window.app` üzerinden durum okunur, fareyle tıklanır, ekran görüntüsü alınıp bakılır. Bu betikler depoda değil (geçici klasördeydi); gerekirse yeniden yazın.
- Arayüz değişikliklerinde ekran görüntüsü alıp üst üste binme / okunabilirlik kontrol edin.

## 7. Bilinen tuzaklar

- Bash heredoc içinde ters bölü ve tırnaklar bozulabiliyor; çok satırlı Python / JS yamalarını önce dosyaya yazıp çalıştırın ya da düzenleme aracını kullanın.
- `defOf` içinde `fx` adı zaten "aynalı OCS çarpanı" olarak kullanılıyor; yeni değişkenlere aynı adı vermeyin.
- Pages önbelleği: kullanıcı eski sürümü görürse sayfayı yenilemesini söyleyin.
- Satır sonları: depo CRLF uyarısı verir, sorun değil.
