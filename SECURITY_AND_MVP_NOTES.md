# Güvenlik ve MVP Notları

Bu paket bilinçli olarak hafif MVP şeklinde tasarlanmıştır.

## Güvenli olan taraflar

- Service role key kullanılmaz.
- Supabase public anon key dışında gizli bilgi frontend'e verilmez.
- Oda verisi database'e yazılmaz; kalıcı veri biriktirme yoktur.
- Rakip alanlarına doğrudan kart bırakma UI düzeyinde engellenir.
- Remote hand kartları diğer oyuncularda kapalı ve kilitli görünür.
- Vercel ENV okuma işlemi `/api/config` fonksiyonuyla yapılır.

## MVP sınırları

Bu sürüm server-authoritative değildir. Yani rekabetçi/ödüllü bir ürün için hileye karşı nihai güvenlik sağlamaz. Arkadaşlarla oynanacak sosyal masa MVP'si için yeterli hafifliktedir.

Tam güvenlik istenirse ikinci fazda şunlar eklenebilir:

- Supabase Auth veya anonymous auth.
- Server-side oda sahibi ve oyuncu yetki modeli.
- Database-backed room state ve RLS politikaları.
- Gizli eller için server-side doğrulama veya şifrelenmiş payload.
- Rate limit ve abuse koruması.
- Oda TTL cleanup cron'u.

Bu fazlar MVP'yi ağırlaştıracağı için bu pakete dahil edilmemiştir.
