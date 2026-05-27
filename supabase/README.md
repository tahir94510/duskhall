# Supabase Setup

Bu MVP için tablo oluşturmak şart değildir.

Kullanılan özellikler:

- Realtime Broadcast: kart hareketleri ve flip olayları.
- Presence: oyuncu listesi ve imleçler.

Vercel ENV olarak yalnızca şu iki değer yeterlidir:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
```

Service role key kullanmayın.

`optional_room_events.sql` dosyası sadece ileride kalıcı oda geçmişi veya analitik istenirse kullanılabilecek opsiyonel bir başlangıç şemasıdır.
