# Güvenlik ve MVP Notu

Bu sürüm, arkadaşlarla oynanacak serbest masa MVP'sidir. Ağır ve kırılgan bir veritabanı akışı yerine Supabase Realtime Broadcast + Presence kullanır.

- Sunucuda gizli servis anahtarı kullanılmaz.
- Oyuncular oda linkiyle aynı kanala bağlanır.
- Kart hareketleri kısa ve hafif mesajlarla yayınlanır.
- Rakip el alanına ait kartlar istemcide görünmez hale getirilir; yalnızca kart sayısı gösterilir.
- Kalıcı veri zorunlu değildir; oda kapandığında arka tarafta kart düzeni bırakılmaz.

Daha ileri sürümde hesap sistemi, oda sahibi yetkisi, sunucu taraflı doğrulama ve kalıcı maç kaydı eklenebilir.
