# Fast DXF

Büyük DXF dosyalarını (1 GB ve üzeri) açmak, 2B/3B gezmek, düzenlemek ve farklı formatlarda kaydetmek için kurulum gerektirmeyen bir araç.

## Başlatma

`DXF Okuyucu.html` dosyasına çift tıklayın. **Chrome veya Edge** önerilir.

- DXF'i pencereye sürükleyin ya da **Dosya → Aç** (Ctrl+O).
- Dosya olmadan çizmeye başlamak için **Dosya → Yeni çizim** (Ctrl+N). Boş bir AutoCAD 2013 DXF'i açılır; birim Ayarlar'dan seçilir.
- İnternet gerekmez; dosyanız bilgisayarınızdan çıkmaz.
- Orijinal dosya hiçbir zaman değiştirilmez; kaydederken yeni bir dosya yazılır.

## Arayüz

| Bölge | İçerik |
|---|---|
| Üst çubuk | Dosya menüsü (aç, kaydet, dışa aktar), geri al / yinele, belge adı, Bul, Git, tema, yardım |
| Şerit | **Gezinme** · **Çiz** (tüm çizim araçları tek açılır menüde) · **Değiştir** · **Özellikler** · **Ölçüm** · **Görünüm** |
| Sol panel | Katmanlar: **Yeni** ile katman oluşturma (ad + renk), arama, göster/gizle, çift tık: yalnız bu; sağ tık: katmandakileri seç, aktif yap, seçimi bu katmana taşı |
| Sağ panel | Özellikler, seçim için **Dönüşüm** kartı (taşı / döndür / ölçekle / ayna / kot ata), arazi yüzeyleri |
| Alt çubuk | Koordinat (yakalanan noktanın Z'si ve türü dahil), komut satırı, **YAKALA ▴** menüsü ve orto |

### Nesne yakalama
- YAKALA ile açılıp kapanır (F3). Yanındaki ▴ menüsünde şu modlar ayrı ayrı seçilir:
  - Uç nokta, Orta nokta, Merkez, Çeyrek noktası
  - Kesişim, Dik, En yakın
  - Düğüm (nokta nesnesi), Ekleme noktası (blok, yazı)
- Menüde yakalama hassasiyeti de piksel olarak ayarlanır.
- Yakalanan noktada AutoCAD'deki gibi şekilli bir işaret ve tür etiketi ("Merkez" gibi) çıkar.
- Daire ve yaylarda ekrandaki çokgenin köşeleri değil gerçek merkez ve çeyrek noktaları yakalanır.
- **Kesinlik:** Yakalanan nokta nesnenin dosyadaki tam tanımından yeniden hesaplanır. Kesişimlerde iki nesnenin tam geometrisi kullanılır. Yani çizilen nesne kaynak koordinatı birebir alır; ekran hassasiyetinden kaynaklanan kayma olmaz.

### Ayarlar (Ctrl+,)
- **Görünüm:** tema, varsayılan görsel stil, ızgara, yazı sınırı
- **Yakalama:** hassasiyet, etiket
- **Düzenleme:** seçim tutamacı, dinamik komut girişi
- **Fare:** tekerlek yönü, yakınlaştırma hızı
- **Yeni çizim:** birim

Ayarlar tarayıcıda saklanır.

### Komut satırı (AutoCAD gibi)
- Çizim alanındayken harf yazmaya başlamanız yeterli; yazdıklarınız komut satırına gider.
- Yazarken öneri listesi açılır. ↑↓ ile seçin, Tab ile tamamlayın, Enter veya boşlukla çalıştırın.
- Boş satırda Enter, boşluk ya da sağ tık son komutu tekrarlar.
- Değer girişi:
  - `x,y[,z]`: mutlak nokta
  - `@dx,dy`: bir önceki noktaya göre
  - `@uzunluk<açı`: kutupsal
  - Tek sayı: imleç yönünde uzunluk; araca göre yarıçap, açı, çarpan ya da uzaklık da olabilir.

| Grup | Kısaltmalar |
|---|---|
| Çiz | `L` çizgi · `PL` polyline · `SPL` spline · `REC` dikdörtgen · `POL` çokgen · `C` daire · `C3P` 3 noktalı daire · `A` yay (3 nokta) · `EL` elips · `PO` nokta · `DT` metin |
| Değiştir | `M` taşı · `CO` kopyala · `RO` döndür · `SC` ölçekle · `MI` ayna · `O` öteleme · `TR` buda · `EX` uzat · `F` kavis · `CHA` pah · `BR` böl · `J` birleştir · `X` patlat · `E` sil · `FLATTEN` kot ata |
| Ölçüm | `DI` mesafe (ΔZ ve eğim dahil) · `AA` alan |
| Görünüm | `Z` pencereyle yakınlaş · `ZE` sığdır · `3DO` yörünge · `PLAN`, `ÖN`, `SAĞ`, `GBISO`… · `TEL`, `GİZLİ`, `GÖLGELİ` · `ARAZİ` |
| Diğer | `BUL` · `GIT 450000,4400000` · `U` geri al |

Tam liste programda **F1** ile açılır.

## Görüntüleme

- **Gezinme:**
  - Tekerlekle imlecin olduğu yere yakınlaşılır.
  - Orta ya da sağ tuşla sürükleyerek kaydırılır.
  - Orta tuşa çift tıklamak çizime sığdırır.
- **3B gezinme:**
  - **Shift + orta tuş:** her araçta yörünge.
  - **ViewCube:** Yüz, kenar veya köşeye tıklayınca o yönden bakar (26 yön). Küp sürüklenerek döndürülür; ⌂ ev görünümüne gider.
  - Perspektif izdüşüm ve düşey abartma (1–10×) seçilebilir.
- **Görsel stiller:**
  - **Tel kafes:** Yalnız çizgiler.
  - **Gizli:** Yüzeylerin arkasındaki çizgiler gizlenir.
  - **Gölgeli:** Yüzeyler ışıkla doldurulur; kenarlar görünür.
  - Gölgeli ve gizli stillerde yüzey olarak çizilenler: 3DFACE, SOLID, TRACE, çokyüzlü ve ızgara kafesler, MESH nesneleri, kalınlıklı (thickness) çizgi, polyline, daire ve yaylar.
- **Kota göre renk:** Düşük kot mavi, yüksek kot kırmızı gösterilir; bir renk lejantı eşlik eder.
- **Arazi yüzeyi (TIN):**
  - Seçilen katmanlardaki noktalar ve eş yükselti köşeleri Delaunay yöntemiyle üçgenlenir.
  - Pencere eş yükselti, kot ve nokta katmanlarını önerir; liste elle değiştirilebilir.
  - Aşırı uzun kenarlı üçgenler (boşluklar) ve aşırı dik üçgenler (hatalı kotlu noktalar) atılır.
  - Örnek: 1 milyon nokta yaklaşık 1 saniyede 2 milyon üçgene dönüşür.
  - Yüzey **Dosya → Arazi yüzeyini DXF'e aktar** ile 3DFACE olarak kaydedilebilir.
- **Hatalı sembol kotları:** Bazı haritalarda sembol bloklarının çizgileri hatalı iç kot taşır (bir uç 0, diğer uç arazi kotu).
  - Program bunu açılışta algılar ve sembolleri ekleme kotunda düz çizer.
  - Ayar 3B menüsünden değiştirilebilir.

## Düzenleme

Tüm düzenlemeler geri alınabilir (Ctrl+Z / Ctrl+Y).

- **Seçim:**
  - Tıklayarak ya da pencereyle seçilir.
  - Soldan sağa pencere: yalnız tamamen içindekiler. Sağdan sola pencere: kesişenler.
  - Shift ile seçime ekleyip çıkarabilirsiniz.
  - Katmana ya da nesne tipine göre hızlı seçim yapılabilir.
- **Seçim tutamacı (gizmo):** Seçimin ortasında görünür. Üstteki küçük çubuktan kip seçilir:
  - **Taşı:** Kırmızı, yeşil ve mavi oklar X, Y ve Z yönünde taşır; sarı kare XY düzleminde serbest taşır.
  - **Döndür:** Z ekseni etrafındaki halka. Shift ile 15° adımlarla döner.
  - **Ölçekle:**
    - Ortadaki kare XYZ ölçekler.
    - X/Y uçlarındaki kareler yalnız XY'yi ölçekler.
    - Z ucundaki kare yalnız Z'yi ölçekler.
    - Shift ile 0,25'lik adımlarla ölçekler.
  - Sürüklerken seçim canlı önizlenir; bıraktığınızda tek bir geri alınabilir işlem olur.
- **Dönüşüm kartı (sağ panel):** Sayıyla kesin işlem için:
  - Taşı: ΔX / ΔY / ΔZ
  - Döndür: açı
  - Ölçekle: XY ve Z çarpanları
  - Ayna: dikey ya da yatay eksen
  - Kot ata: tüm Z'leri tek değere eşitler (düzleştirme)
- **Çizim araçları:** Çizgi, polyline, spline, dikdörtgen, çokgen, daire (merkez-yarıçap ve 3 nokta), yay (3 nokta), elips, nokta, metin.
  - AutoCAD'deki gibi çizgi aracı Enter'a kadar sürer; diğerleri tek nesneden sonra biter.
  - Kotlu bir noktaya yakalanırsanız yeni nesne o kotta oluşur.
- **Değiştirme araçları:**
  - **Taşı / Kopyala:** Taban noktası ve hedef nokta seçilir. İki nokta da kotluysa Z farkı da uygulanır.
  - **Döndür:** Taban noktası ve açı (tıklayarak ya da yazarak). `K` ile kopyalayarak döndürür.
  - **Ölçekle:** Taban noktası ve çarpan. `R` ile referans uzunluğu kullanılır.
  - **Ayna:** Eksenin iki noktası seçilir; sonra kaynağın silinip silinmeyeceği sorulur (E/H).
  - **Öteleme:** Önce uzaklık yazılır, sonra nesne ve taraf seçilir. Çizgi, daire, yay ve polyline (yaylı köşeler dahil) desteklenir.
  - **Buda:** Ekranda görünen tüm nesneler kesici kenardır; budanacak parçaya tıklamanız yeterli.
  - **Uzat:** Ekranda görünen nesneler sınırdır; uzatılacak ucun yakınına tıklanır.
  - **Kavis / Pah:** İki çizgi arasında. Önce yarıçap ya da uzaklık yazılır; 0 verilirse köşe birleştirilir.
  - **Böl:** Nesne tıklanan noktadan ikiye ayrılır.
  - **Birleştir:** Uç uca değen çizgi, yay ve polyline'lar tek polyline olur.
  - **Patlat:** Polyline çizgi ve yaylara ayrılır.
- **Kesişim kesinliği:** Budama ve uzatmada kesici bir yay ya da daireyse, kesişim o nesnenin tam geometrisiyle yeniden hesaplanır. Ekrandaki çokgen yaklaşımı kullanılmaz.

## Kaydetme ve dışa aktarma

- **DXF (değişikliklerle):** Değişmeyen kısımlar (başlık, katmanlar, bloklar, nesneler, sözlükler) bayt bayt korunur. Yalnız değişen nesneler yeniden yazılır.
  - Taşıma, döndürme, ölçekleme, aynalama ve Z değişiklikleri nesnenin kendi DXF kodlarına uygulanır. Etkilenen değerler:
    - koordinatlar ve OCS
    - açılar, yarıçaplar ve yazı yükseklikleri
    - blok ölçek ve dönüşleri
    - tarama desenleri
    - bulge'lar ve elips parametreleri
  - Doğrulama: Gerçek haritadaki 1 milyon nesne döndürülüp aynalanınca her köşe, blok ve yazı beklenen yerde çıktı. ezdxf'in kendi dönüşümüyle karşılaştırıldı ve ezdxf denetimi 0 hata verdi.
- **Seçimi veya ekrandaki alanı ayrı DXF'e kaydet:** Büyük çizimden parça ayıklamak için.
- **SVG ve PDF:** Vektörel çıktı; her zaman plan görünümüyle aktarılır. PDF'de A4–A0 kağıt seçilebilir.
- **PNG:** Ekrandaki görünümün (3B ve gölgeli dahil) 1–8 katı çözünürlükte resmi.

## Neden büyük dosyaları açabiliyor?

- Dosya 8 MB'lık parçalar halinde, arka planda (Web Worker) okunur. Okuma sürerken çizim kademeli olarak görünür.
- Geometri sıkıştırılmış dizilerde tutulur ve ekran kartında (WebGL2) çizilir. Bloklar örneklenerek (instancing) çizilir.

Bu bilgisayarda ölçülen süreler:

| Dosya | Boyut | İçerik | Açılış |
|---|---|---|---|
| ejder3200 hali hazır 16.03.2021.dxf | 416 MB | 1,0 milyon nesne, 11,4 milyon köşe, 108 bin yazı | ~5 sn |
| Sentetik test haritası | 1,1 GB | 1,2 milyon nesne, 60 milyon köşe | ~16 sn |

## Sınırlamalar

- **DWG açılmaz.** Yalnız DXF desteklenir; DWG'yi önce DXF olarak kaydedin.
- **Gösterilmeyen nesneler:** 3D katı (ACIS), resim (IMAGE), WIPEOUT. Bunlar kaydedilen dosyada aynen kalır.
- **Görünüm:**
  - Çizgi tipleri ve kalınlıkları gösterilmez.
  - Taramaların yalnız sınırları çizilir.
- **Plan görünüme bağlı araçlar:** Çizim, değiştirme ve ölçüm araçları plan (üst) görünümde çalışır.
  - 3B görünümde seçim, gizmo, dönüşüm kartı, silme, renk ve katman işlemleri kullanılabilir.
  - Döndürme yalnız Z ekseni etrafında yapılır.
- **Budama, uzatma, öteleme, kavis, birleştirme ve patlatmanın desteklediği tipler:**
  - Tipler: çizgi, yay, daire, polyline (yaylı köşeler dahil).
  - Kavis ve pah yalnız iki çizgi arasında çalışır.
  - Bloklar patlatılamaz.
  - Değiştirilen nesneler yeniden yazılır: katman, renk, çizgi tipi, kalınlık ve çizgi ağırlığı korunur, nesne tutamacı (handle) yenilenir.
- **Taşınamayan nesneler:** Ölçü (DIMENSION) ve tablo nesneleri taşınamaz ve dönüştürülemez. Taramalar aynalanamaz (taşıma, döndürme ve ölçekleme çalışır).
- **Aynalanan yazılar:** AutoCAD'in varsayılanı (MIRRTEXT=0) gibi okunur kalır. Blok içindeki yazıların ekrandaki görünümü bu durumda farklı olabilir.
- **İkili (binary) DXF:** Düzenlemeler kaydedilemez; yalnız seçimi ayrı dosyaya kaydetme çalışır.
- **Yeni katmanlar:** Kaydederken dosyanın katman tablosuna geçerli LAYER kaydı olarak eklenir.
- **Aynı dosyaya kaydetme:** Açık olan dosyanın üzerine kaydedilemez, çünkü kaydederken o dosyadan okunur.

## Klasör yapısı

```
DXF Okuyucu.html      uygulama: Fast DXF (buna çift tıklayın)
js/dxf-core.js        ayrıştırıcı, geometri ve yüzey üretimi, kaydetme / dönüşüm motoru (worker'da da çalışır)
js/workers.js         arka plan işçileri (okuma, kaydetme)
js/store.js           veri deposu, mekânsal ızgara, 2B/3B seçim, yakalama
js/render.js          WebGL2 çizim (tel kafes / gizli / gölgeli, 2B + 3B kamera) + yazı katmanı
js/viewcube.js        görünüm küpü
js/template.js        "Yeni çizim" için boş DXF şablonu
js/geom.js            budama, uzatma, öteleme, kavis, böl, birleştir, patlat; Delaunay üçgenleme
js/edit.js            düzenleme komutları, dönüşümler, geri al / yinele
js/gizmo.js           seçim dönüşüm tutamacı
js/export.js          DXF / SVG / PDF / PNG
js/app.js             arayüz, araçlar, komutlar
tests/                Node ile test betikleri (tarayıcı gerekmez)
```

## Testler (isteğe bağlı, Node.js gerekir)

```
node tests/test_parse.js dosya.dxf                 # okuma hızı ve istatistik
node tests/test_save.js girdi.dxf cikti.dxf        # düzenle → kaydet → yeniden oku
node tests/test_xform.js girdi.dxf [klasör]        # öteleme/Z/döndürme/ölçek/ayna yamasının köşe köşe doğrulaması
node tests/test_geom.js                            # budama, uzatma, öteleme, kavis, Delaunay testleri
python tests/gen_coverage.py kapsam.dxf            # tüm nesne tipleriyle örnek çizim (ezdxf gerekir)
python tests/gen_big.py buyuk.dxf 1100             # ~1,1 GB sentetik test dosyası
```
