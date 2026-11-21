# Doğrulama kaydı

21 Kasım 2026, Node.js 26 üzerinde:

- TypeScript kontrolü ve Vite üretim derlemesi başarılı.
- `npm test`: 22 test başarılı. Kontrollü gerçek HTTP sunucusu, yerel uygulama sunucusu, SQLite yeniden açılışı, CSV içe/dışa aktarma, polling, idempotency, tekrar deneme, hata sınıflandırması, iptal, tenant önkoşulu, gizli veri redaksiyonu, rapor ve silme akışları kapsandı.
- Tarayıcıda dar ekran ve masaüstü yerleşimi incelendi.
- İş yetkinliklerini düzenleme, senaryo kaydetme ve sayfa yenileme sonrası kalıcılık doğrulandı.
- 11 iş / 5 ekiplik sentetik senaryo oluşturma doğrulandı.
- Kontrollü ve açıkça etiketli UI test verisiyle sonuç paneli, rota zamanları, zaman çizelgesi, atanamayan işler ve yerel atama işlemi doğrulandı. Bu test verisi teslim edilen başlangıç veritabanına dahil edilmez.

**Gerçek Conveks API testi yapılmadı:** API anahtarı kullanıcı tarafından henüz girilmedi. Yukarıdaki sonuçlar Conveks motorunun üretim doğruluğu veya kapasite onayı değildir. Gerçek uçtan uca ve yük testleri için Bağlantılar ekranından anahtar girip Test paketleri / Deneyler ekranlarını kullanın.

TRL4Engine içinde dosya, ayar veya servis değişikliği yapılmadı.
