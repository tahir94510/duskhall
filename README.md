# KABAL: Eterin Varisleri — Hafif Multiplayer MVP

Bu paket, KABAL için ağır build zinciri olmadan çalışan, Vercel'e doğrudan deploy edilebilen statik kart masası MVP'sidir.

## Neler düzeltildi?

- `package.json` kaldırıldı. Bu nedenle Vercel'de `engines.node >=20.9.0` uyarısı ve dependency install zinciri tetiklenmez.
- Kart boyutları, masa hizası, oyuncu alanları ve merkez deste/dış alan yerleşimi yeniden ölçeklendirildi.
- Kart arka yüzü daha görünür, ön yüz ikonları daha okunabilir hale getirildi.
- Topbar, oda bilgisi, oyuncu alanları ve mobil yerleşim çakışmayacak şekilde düzenlendi.
- Drag/drop, sağ tık/F ile çevirme, mobil long press, Ctrl + drag, Ctrl + G ve Ctrl + M akışları sadeleştirildi.
- Supabase Realtime opsiyonel hale getirildi; ENV yoksa oyun local table olarak kırılmadan çalışır.

## Local çalıştırma

```bash
python3 -m http.server 5173
```

Tarayıcıda:

```text
http://localhost:5173
```

Local Supabase config kullanmak için `config.local.example.json` dosyasını `config.local.json` olarak kopyala ve değerleri gir.

## Vercel deploy

Bu projede npm install veya build komutu yoktur.

1. Bu klasörü GitHub repo olarak yükle.
2. Vercel'de projeyi import et.
3. Framework Preset: `Other`
4. Build Command: boş bırak.
5. Output Directory: boş bırak veya `.` kullan.
6. ENV değişkenlerini gir.

## ENV değişkenleri

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPPORT_URL=https://destek-linkin.com
NEXT_PUBLIC_APP_URL=https://senin-projen.vercel.app
```

Alternatif olarak şu değişken adları da desteklenir:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPPORT_URL
```

## Oynanış kısayolları

- Drag: Kart taşı.
- Right click / F: Kart çevir.
- Long press: Mobilde kart çevir.
- Ctrl + drag: Aynı yığındaki kartları birlikte taşı.
- Ctrl + G: Yığını toparla.
- Ctrl + M: Yığını karıştır.

## Supabase notu

MVP, database tablosuna muhtaç değildir. Supabase Realtime Broadcast + Presence kullanır. Bu sayede oda kapandığında kalıcı veri bırakılmaz. `supabase/optional_room_events.sql` sadece ileride kalıcı log/analitik istersen kullanılabilecek opsiyonel şemadır.
