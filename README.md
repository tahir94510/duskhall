# KABAL: Eterin Varisleri - Hafif Multiplayer MVP

Bu paket, KABAL için ağır framework kurulumuna girmeyen, GitHub'a yüklenip Vercel'de çalıştırılabilecek hafif bir kart masası MVP'sidir.

## Ne var?

- 72 kartlık deste: 15 özgün kart tanımı ve dokümantasyondaki adetlere göre çoğaltılmış tam deste.
- Tek sayfalık siyah/asil kart masası.
- Drag-drop kart taşıma.
- Sağ tık veya `F` ile kart çevirme.
- `Ctrl + drag` ile aynı yığındaki kartları toplu taşıma.
- `Ctrl + G` ile yığın toparlama.
- `Ctrl + M` ile yığın karıştırma.
- Kendi blur alanına alınan kartlarda MVP düzeyinde görsel gizlilik.
- Rakip blur alanlarına doğrudan kart bırakmayı engelleyen güvenli etkileşim.
- Oda linki: `?room=KBL-XXXXXX`.
- Opsiyonel Supabase Realtime: imleçler, kart hareketleri, flip, gather ve mix senkronize olur.
- Supabase yoksa oyun local table olarak çalışır.
- Vercel API üzerinden ENV okuma; frontend'e gizli anahtar koymaz, sadece public anon key kullanır.
- PWA manifest, favicon, OG görseli, robots ve sitemap dosyaları.

## Lokal çalıştırma

```bash
cd kabal-mvp-vercel
python3 -m http.server 5173
```

Sonra tarayıcıda:

```text
http://localhost:5173
```

Supabase'i lokal test etmek için:

```bash
cp config.local.example.json config.local.json
```

`config.local.json` içine Supabase project URL ve public anon key ekle.

## Vercel deploy

1. Bu klasörü GitHub reposuna yükle.
2. Vercel'de yeni proje olarak import et.
3. Framework preset: `Other` veya statik proje olarak bırak.
4. Build command boş kalabilir.
5. Output directory boş kalabilir.
6. Environment Variables bölümüne şunları ekle:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPPORT_URL=https://destek-linkin.com
NEXT_PUBLIC_APP_URL=https://senin-projen.vercel.app
```

Supabase ENV eklemezsen oyun yine açılır, ama arkadaşlarla gerçek zamanlı senkron çalışmaz.

## Supabase kurulumu

Bu MVP Supabase Database tablosu kullanmaz. Realtime Broadcast kanalı kullanır. Bu yüzden SQL migration zorunlu değildir.

Gerekenler:

- Supabase projesi oluştur.
- Project Settings -> API bölümünden `Project URL` ve `anon public` key'i al.
- Vercel ENV'lerine ekle.

Bu yapı oda verisini kalıcı olarak database'e yazmaz. Herkes odadan çıkınca oda doğal olarak boşalır; kalıcı kart verisi bırakılmaz.

## MVP sınırları

- Oyun kurallarını otomatik uygulamaz. Fiziksel masa gibi serbest oynanır.
- Görsel gizlilik vardır; rakibin elindeki kartlar kullanıcı arayüzünde kapalı görünür. Bu, MVP için yeterli hafif yaklaşımdır; tam rekabetçi güvenlik için server-authoritative şifreli el yönetimi gerekir.
- Supabase public anon key frontend'de kullanılabilir; bu Supabase'in önerdiği public client modelidir. Service role key asla eklenmemelidir.

## Dosya yapısı

```text
api/config.js                 Vercel ENV okuma fonksiyonu
assets/icon.svg               Uygulama/fav icon
assets/og.svg                 Sosyal medya görseli
src/app.js                    Ana oyun motoru
src/cards.js                  72 kart verisi ve ikon sistemi
src/net.js                    Opsiyonel Supabase Realtime bağlantısı
src/rules.js                  Kurallar, destek ve çıkış modal içerikleri
index.html                    Tek sayfalık uygulama kabuğu
styles.css                    Tam responsive masa ve kart tasarımı
vercel.json                   Vercel rewrite ayarları
manifest.webmanifest          PWA manifest
robots.txt / sitemap.xml      SEO dosyaları
```

## Kontrol

```bash
npm run check
```

Paket bağımlılıksızdır. `npm install` zorunlu değildir.
