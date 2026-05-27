# KABAL: Eterin Varisleri — Türkçe Dijital Kart Masası

Bu paket, KABAL: Eterin Varisleri için hazırlanmış hafif, bağımlılıksız ve Vercel uyumlu MVP/tam masa sürümüdür. Oyuncular kuralları dokümantasyondan takip eder; masa ise kartları sürükleme, çevirme, yığın taşıma, yığın toparlama, yığın karıştırma, gizli el alanı ve oda linkiyle arkadaşlarla oynama deneyimini sağlar.

## Temel özellikler

- Tamamen Türkçe arayüz.
- 72 kartlık V8 deste yapısı.
- 5 oyuncuya kadar masa yerleşimi: kendi alanın + 4 rakip alanı.
- Rakip el alanındaki kartlar görünmez; yalnızca kart sayısı görünür.
- Kart kendi alanından çıkınca tekrar masada görünür.
- Deste, Açık ve Kayıp alanlarında kart sayaçları.
- Sağ tık / `F` ile kart çevirme.
- `Ctrl + sürükle` ile yığın taşıma.
- `Ctrl + G` ile yığın toparlama.
- `Ctrl + M` ile yığın karıştırma.
- `Shift + A` ile yığını açma, `Shift + K` ile yığını kapatma.
- Mobilde uzun bas ile çevirme ve seçili karta özel küçük işlem paneli.
- Kurallar modalında V8 tam kural kitabı.
- Destek paneli ve bildirim rozetli destek butonu.
- Oda açılış süresi sayacı.
- Supabase Realtime Broadcast + Presence desteği.
- Supabase ENV yoksa yerel masa olarak bozulmadan çalışır.
- `package.json` yoktur; npm/pnpm install ve Node engines uyarısı tetiklemez.

## Yerelde çalıştırma

```bash
python3 -m http.server 5173
```

Sonra tarayıcıdan aç:

```text
http://localhost:5173
```

## Vercel kurulumu

Vercel'de framework seçimi:

```text
Framework Preset: Other
Build Command: boş bırak
Output Directory: .
Install Command: boş bırak
```

Ortam değişkenleri:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPPORT_URL=https://destek-linkin.com
NEXT_PUBLIC_APP_URL=https://senin-projen.vercel.app
```

## Supabase

Bu MVP kalıcı tabloya ihtiyaç duymaz. Realtime Broadcast ve Presence kullanır. Supabase projesinde Realtime kapalıysa oyun yine yerel masa olarak açılır; bağlantı kurulunca oda linki üzerinden senkron çalışır.

## Güvenlik ve telif

`SECURITY_AND_MVP_NOTES.md` ve `COPYRIGHT_NOTICE.md` dosyalarını okuyun. Web istemcisi yüzde yüz çalınamaz hale getirilemez; teknik koruma hukuki korumanın yerine geçmez. Bu paket makul güvenlik başlıkları, throttle ve istemci doğrulamaları içerir.
