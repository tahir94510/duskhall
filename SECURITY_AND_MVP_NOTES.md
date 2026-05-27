# Güvenlik, telif ve MVP notları

Bu paket KABAL: Eterin Varisleri için hafif, Vercel uyumlu ve Supabase Realtime destekli bir dijital kart masasıdır.

## Uygulanan güvenlik önlemleri

- Bağımlılıksız statik ön yüz: npm/pnpm install zinciri yoktur.
- Vercel güvenlik başlıkları: CSP, X-Content-Type-Options, Referrer-Policy, X-Frame-Options ve Permissions-Policy.
- Supabase bağlantısı yalnızca `SUPABASE_URL` ve `SUPABASE_ANON_KEY` girildiğinde çalışır.
- Realtime mesajları istemci tarafında sınırlandırılır; çok büyük patch ve preview paketleri yok sayılır.
- İmleç ve sürükleme yayınları throttle edilir.
- Oda sistemi kalıcı veritabanı kaydı gerektirmez; Broadcast + Presence mantığı gereksiz veri birikimini azaltır.
- Kart gizliliği istemci arayüzünde korunur: rakip el alanındaki kartlar görünmez, yalnızca kart sayısı görünür.

## Telif ve marka koruma notu

- Kart adları, kurallar ve oyun metinleri projeye özel tutulmuştur.
- `COPYRIGHT_NOTICE.md` dosyası temel telif ve kullanım notlarını içerir.
- Web üzerinde yayınlanan hiçbir istemci kodu yüzde yüz çalınamaz hale getirilemez. Gerçek hukuki koruma için marka tescili, tasarım tescili, telif kayıtları ve gerektiğinde lisans sözleşmesi gerekir.
- Bu paket teknik tarafta makul koruma sağlar; hukuki garanti veya saldırılara karşı mutlak dokunulmazlık iddiası taşımaz.

## DDoS ve ölçek notu

Vercel ve Supabase altyapısı temel ölçeklenebilirlik sağlar. Gerçek yüksek trafik / DDoS direnci için domain seviyesinde WAF, rate limit, bot koruması, Supabase kota yönetimi ve gerektiğinde ücretli koruma katmanı kullanılmalıdır.
