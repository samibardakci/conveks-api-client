# Conveks API Lab

Conveks Optimization API v1 için bağımsız, yerelde çalışan örnek müşteri ve test istemcisi. TRL4Engine'i import etmez, veritabanına veya Kafka'sına bağlanmaz. Yalnız public HTTP uçlarını kullanır.

## Başlatma

Node.js **22.13 veya üstü** gerekir (`node:sqlite` kullanılır). Geliştirme ve doğrulama Node 26 ile yapılmıştır.

```sh
cd /Users/sami/conveks-api-client
npm ci
npm run dev
```

Tarayıcı: **http://localhost:4178**. Sunucu yalnız `127.0.0.1` üzerinde dinler. `PORT` ile port değiştirilebilir. Çalışma dizininden bağımsız olarak veri proje içindeki `data/client.sqlite` dosyasına yazılır; `CONVEKS_CLIENT_DB` ile değiştirilebilir.

Üretim derlemesini yerelde çalıştırmak için:

```sh
npm run build
npm start
```

Uygulama yayınlanmaz, harici font/harita servisi çağırmaz. Bağımlılıklar kurulduktan sonra internet bağlantısı olmadan arayüz çalışır; hedef API'ye ağ erişimi gerekir.

## İlk gerçek koşu

1. Conveks API'nin çalışır durumda olduğundan emin olun. Varsayılan adres `http://localhost:8095`.
2. **Bağlantılar** ekranında “Yerel Conveks” profilini seçin, API anahtarını girip kaydedin. “Bağlantıyı test et” yalnız sağlık, OpenAPI ve kimlik kontrolüdür; motoru doğrulamaz.
3. **Planlama alanı** ekranında örnek İzmir senaryosunu inceleyin. Sabit `now` ve vardiyalar birlikte kullanılır; tarihlerin geçmişte olması bu tekrar oynatma için kasıtlıdır.
4. **Optimizasyonu başlat** ile gerçek plan gönderin. Sonuç panelinde rotaları, zamanları, hataları ve HTTP günlüğünü inceleyin.
5. Tutarlılık kontrolleri geçen sonucu **Yerel atamalara uygula** ile örnek müşterinin yerel atama kaydına aktarın. Bu, SAP'ye veya Conveks'e onay göndermez.

Anahtarlar yalnız yerel sunucunun belleğindedir. Tarayıcı localStorage'ına, SQLite'a, rapora veya loga yazılmaz. Sunucuyu yeniden başlatınca yeniden girin. Alternatif: `CONVEKS_KEY` ortam değişkenini dışarıdan tanımlayın; yalnız varsayılan `local` profilinde kullanılır. `.env` otomatik okunmaz; `.env.example` açıklama içindir.

## Ekranlar

- **Planlama alanı:** iş/ekip tabloları, JSON/CSV içe aktarma, senaryo kopyalama/kaydetme, depo, vardiyalar, öncelik ve hesaplama seçenekleri. CSV içe aktarma seçili tablonun tüm satırlarını değiştirir; kalıcı tutmak için Kaydet kullanın. Örnekler `scenarios/` altında.
- **İstek laboratuvarı:** ham gövde (geçersiz JSON dahil), wait, polling, HTTP ve toplam süre bütçesi, idempotency ve tekrar deneme kontrolü. Formdan ayrı düzenlenir; “Senaryodan al” ile güncellenir.
- **Test paketleri:** seçilen senaryodan üretilen HTTP ve davranış testleri; beklenen hata kodu test başarısı sayılır. Koşular sıralı yürütülür. Silme testi yalnız kendi oluşturduğu planı siler.
- **Deneyler:** süre × fazla mesai × tekrar kombinasyonları; en çok 60 koşu, 8 eşzamanlı iş. Eşzamanlılık 1 kalite karşılaştırması, daha yüksek değerler kontrollü yük için. 429 yanıtları HTTP günlüğünde saklanır; tekrar deneme kapatılabilir.
- **Koşu geçmişi:** SQLite'ta kalıcı arşiv; paket bazlı ve toplu JSON raporu, CSV özeti, aynı anahtarla tekrar deneme, yeniden sorgulama ve açıkça seçilerek API'den silme.
- **Bağlantılar:** farklı ortam/tenant profilleri. İzolasyon testinin ikinci anahtarı aynı API'de farklı tenant'a ait olmalıdır.

## Test ve ölçüm semantiği

`HTTP 200` başarılı optimizasyon anlamına gelmez; planın `status` alanı ayrıca kontrol edilir. İstemci zaman aşımı `error`, API'nin zaman aşımı `timed_out` olarak tutulur. “Takibi durdur” motoru iptal etmez. `DELETE` API kaydını siler, yerel arşivi silmez. Sunucu yeniden başlatıldığında çalışmakta olan yerel kayıtlar `interrupted` olur; bilinen plan kimliğiyle sorgulama veya aynı anahtar ve baytlarla tekrar deneme yapılabilir.

Tekrar denemeler aynı gövde baytlarını ve anahtarı korur; yeni deneyler yeni anahtar üretir. `Location` üçüncü bir host'a işaret etse bile anahtar oraya gönderilmez; plan kimliğiyle yapılandırılmış API adresi sorgulanır. Yönlendirmeler takip edilmez.

Ölçümler **ilk HTTP yanıt süresi** ve **uçtan uca istemci süresi**dir. Public API saf motor süresi, kuyruk süresi veya matris süresi vermediğinden bunlar ayrı gösterilmez. Deney tablosu tamamlanan koşuların ortalamalarını ve en yakın sıra yöntemiyle p95 süresini hesaplar; örnek sayısı da görünür. Başarısız koşuları hesaba katmayan ortalamalar bu sayı ile birlikte değerlendirilmelidir.

Rota haritası, koordinatların şematik görünümüdür; kesikli bağlantılar **yol geometrisi değildir**. Gerçek mesafe ve süre değerleri API yanıtından alınır.

## Doğrulama

```sh
npm test
npm run build
```

Testler geçici SQLite ve kontrollü HTTP sunucusu kullanır. Çalışan Conveks API'ye erişmez. Gerçek müşteri uçtan uca doğrulaması, anahtar girildikten sonra UI'daki test paketleriyle ayrıca yapılmalıdır.

## Sınırlar

- Gerçek SAP bağlantısı yoktur; CSV/JSON ve yerel atamalar müşteri tarafını temsil eder.
- Çözücü seçimi, algoritma, amaç ağırlıkları, canlı yeniden planlama ve webhook mevcut public API'de yoktur.
- OSRM/motor kesintisi, anahtar iptali, TTL testleri ve kurulu haritaya özel kapsam testleri ortam hazırlığı ister; UI bunları “çalıştırılmadı” gösterir.
- İstemci, yeni bir global optimalite iddiasında bulunmaz; yalnız public sonuç tutarlılığını kontrol eder.
- İstekler ve sonuçlar yerel SQLite'ta tutulur; API'nin 7 günlük saklama süresi yerel arşivi silmez. Gerçek müşteri verisini kullanırken bu ayrı yerel kopyayı hesaba katın.
- Test ve yük koşuları gerçek API kotasını kullanır. Kapasite sonuçlarını küçük örnek sayısından üretim SLA'sına çevirmeyin.

Sunucu tarafında gerekebilecek işlemler: [docs/SUNUCU_HAZIRLIGI.md](docs/SUNUCU_HAZIRLIGI.md). Bu proje bunları otomatik çalıştırmaz.
