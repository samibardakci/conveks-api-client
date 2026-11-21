# Kullanıcının yapacağı Conveks hazırlığı

Bu istemci TRL4Engine dosyalarını veya servislerini değiştirmez. API zaten çalışıyorsa yalnız müşteri anahtarı yeterlidir.

## API anahtarı hazırlama

TRL4Engine tarafındaki mevcut CLI kullanılır. Aşağıdaki komutlar **örnektir; sen çalıştırırsın**. Tenant oluşturma ve anahtar verme API veritabanına kayıt yazar. Mevcut tenant/anahtar kullanılabiliyorsa yeniden oluşturma gerekmez.

```sh
cd /Users/sami/TRL4Engine
docker compose exec api_service python -m api_service.admin tenant create --name "API Lab Musteri A"
# Çıktıdaki tnt_… kimliğini aşağıya yerleştir:
docker compose exec api_service python -m api_service.admin key create --tenant tnt_…
```

Anahtar yalnız bir kez gösterilir. İstemcinin **Bağlantılar** ekranına gir; sohbet mesajına veya Git'e ekleme.

Tenant izolasyonu için farklı adla ikinci tenant ve anahtar oluştur; istemcide aynı API adresiyle ikinci profil kaydet. Aynı tenant'ın iki farklı anahtarı izolasyon testi için uygun değildir; test bu durumda 200 görüp kalmalıdır.

## Servisler

Gerekli API yolu: `api_service`, `conveks_engine_api`, `distance_service`, OSRM, Kafka, PostgreSQL ve matris Redis'i. Mevcut kurulumunun durumuna göre bunları sen başlatmalısın. İstemci Docker veya Compose komutu çalıştırmaz.

`/health` cevabı API sürecinin ayakta olduğunu gösterir; OSRM, broker ve motorun sağlıklı olduğunun kanıtı değildir. Küçük bir gerçek plan bu yolu doğrular.

## Parametre sınırı bulgusu

İncelenen public model `0 < options.time_limit_s <= 60` kabul ederken generic politika paketi en az 1 saniye ister. Test paketindeki `0.5 saniye kontrat sınırı` testi public kontrata göre başarı bekler; motor reddederse test kalır ve yanıt kaydedilir. Motor veya kontrat düzeltmesini burada yapmıyoruz. API davranışını senin ortamında doğruladıktan sonra tercih edilen sözleşmeye göre sunucu tarafındaki değişikliği sen uygulayabilirsin.

## Profil deneyleri

İş sayısı sınırları 10/11 ve 60/61 etrafında senaryolarla otomatik profil seçimi davranışını dolaylı olarak karşılaştırabilirsin. Public sonuç seçilen `config_id` alanını içermez; istemci tahmini profili gerçek ölçüm gibi sunmaz. Algoritma parametrelerini değiştirmek için sunucu tarafında ayrı bir geliştirme gerekir.

## Ortam hazırlığı isteyen testler

- OSRM erişilemezliği: ilgili test ortamında servisi sen durdurup geri açarsın; 503 ve Retry-After laboratuvardan gözlenir.
- Motor cevapsızlığı: motor erişimini sen kontrol edersin; `timed_out` görülene kadar istemci bütçesini yeterli tut.
- Saklama/idempotency süresi: gerçek süreyi bekleme veya izole sunucu ayarlarını sen değiştirme gerekir.
- İptal anahtar: CLI ile iptal etme işlemini sen yaparsın.
- Kapsam dışı koordinat: kurulu OSRM haritasının dışında veya yoldan uzak bir koordinatı ham isteğe sen seçersin.

Bu adımlar otomatik raporda çalıştırılmadı olarak kalır; manuel koşunun HTTP kayıtları ayrıca raporlanabilir.
