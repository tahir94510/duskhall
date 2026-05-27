# Security & MVP Notes

Bu sürüm, arkadaşlarla oynanacak serbest masa MVP'sidir. Ağır ve kırılgan backend yerine Supabase Realtime Broadcast + Presence kullanır.

## Güvenlik yaklaşımı

- Service role key kullanılmaz.
- Frontend'e yalnızca public anon key gönderilir.
- Oda state'i kalıcı veritabanına yazılmaz; herkes odadan çıkınca veri doğal olarak kaybolur.
- Broadcast mesajları kart id, konum, flip ve oyuncu imleci gibi masa verileriyle sınırlıdır.
- Vercel `/api/config` endpoint'i `no-store` ile çalışır.

## MVP sınırı

Bu sürümde otomatik kural hakemliği yoktur. Dağıtım, sıra takibi, hedefleme ve kazanma kontrolü oyuncuların anlaşmasına bırakılır. Amaç masa etkileşimlerini hızlı, temiz, stabil ve düşük maliyetli sunmaktır.

## İleri seviye öneriler

Daha sonra ranked oda, kullanıcı hesabı, kalıcı geçmiş, anti-spam rate limit ve moderation istenirse Supabase Edge Functions veya küçük bir authoritative server eklenebilir.
