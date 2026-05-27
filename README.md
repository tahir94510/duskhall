# KABAL: Eterin Varisleri — Türkçe Hafif MVP

Bu paket, KABAL için ağır kurulum zinciri olmadan çalışan, GitHub'a yüklenip Vercel'e doğrudan deploy edilebilen statik kart masası MVP'sidir.

## Bu sürümde düzeltilenler

- Oyun arayüzündeki bütün görünen metinler Türkçeleştirildi.
- Kartlarda kalan gereksiz İngilizce tip ifadeleri kaldırıldı; Mühür, Büyü, Müdahale ve Hizmetkâr adları Türkçe gösteriliyor.
- Merkez deste çevresindeki gereksiz koyu karartı ve ağır panel görünümü temizlendi.
- Kart toplama işleminde yığının sağ çapraza kayması düzeltildi; kartlar doğrudan aynı merkezde toparlanır.
- Oyuncu el alanı gizliliği güçlendirildi: kendi alanındaki kartları sen görürsün, rakiplerin alanındaki kartlar sende tamamen görünmez; yalnızca kart sayısı görünür.
- Kart alandan çıkarıldığında yeniden masada görünür hale gelir.
- Her oyuncu alanında kart sayısı gösterilir.
- Deste, açık alan ve kayıp alanı için sayaçlar eklendi.
- Mobil ve küçük ekran yerleşimleri yeniden düzenlendi; sayfa scroll tetiklemeden sabit masa olarak çalışır.
- `package.json` yoktur. Bu nedenle Vercel'de `engines.node >=20.9.0`, npm, pnpm veya build uyarı zinciri tetiklenmez.

## Yerelde çalıştırma

```bash
python3 -m http.server 5173
```

Tarayıcıda aç:

```text
http://localhost:5173
```

Yerel Supabase ayarı kullanmak için `config.local.example.json` dosyasını `config.local.json` olarak kopyala ve değerleri gir.

## Vercel deploy

Bu projede kurulum ve build komutu yoktur.

1. Klasörü GitHub repo olarak yükle.
2. Vercel'de projeyi import et.
3. Framework Preset alanında `Other` seç.
4. Build Command alanını boş bırak.
5. Output Directory alanını boş bırak veya `.` kullan.
6. Ortam değişkenlerini gir.

## Ortam değişkenleri

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPPORT_URL=https://destek-linkin.com
NEXT_PUBLIC_APP_URL=https://senin-projen.vercel.app
```

Alternatif adlar da desteklenir:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPPORT_URL
```

## Oynanış kısayolları

- Sürükle: Kartı taşı.
- Sağ tık / F: Kartı çevir.
- Uzun bas: Mobilde kartı çevir.
- Ctrl + sürükle: Aynı yığındaki kartları birlikte taşı.
- Ctrl + G: Yığını toparla.
- Ctrl + M: Yığını karıştır.

## Supabase notu

MVP, veritabanı tablosuna muhtaç değildir. Supabase Realtime Broadcast + Presence kullanır. Bu sayede oda kapandığında kalıcı veri bırakılmaz. `supabase/optional_room_events.sql` sadece ileride kalıcı log veya analitik istersen kullanılabilecek opsiyonel şemadır.
