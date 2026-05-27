# Supabase Kullanımı

Bu sürüm Supabase tarafında tablo zorunluluğu gerektirmez. Oyun, Supabase Realtime Broadcast ve Presence ile çalışır.

Gerekli ENV değerleri:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
```

Realtime bağlantısı kurulduğunda:

- Oyuncu varlığı odaya yansır.
- İmleçler görünür.
- Kart hareketi, çevirme, yığın açma/kapatma, toparlama ve karıştırma yayınlanır.
- Rakip el alanındaki kartlar istemci arayüzünde görünmez; yalnızca sayı görünür.

Ücretsiz MVP için kalıcı oda tablosu kullanılmaz. Daha ileri sürümde oda geçmişi, kullanıcı hesabı, moderasyon ve replay istenirse tablo yapısı eklenebilir.
