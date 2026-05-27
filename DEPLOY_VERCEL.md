# Vercel Kurulum Notu

Bu paket bağımlılıksızdır. `package.json`, `engines`, `npm install`, `pnpm install`, `next build` veya `vite build` yoktur. Repo içeriğini bu klasördeki dosyalarla güncellediğinde Vercel statik olarak yayınlar.

## Vercel ayarı

- Framework Preset: `Other`
- Build Command: boş
- Output Directory: boş veya `.`

## Ortam değişkenleri

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPPORT_URL
NEXT_PUBLIC_APP_URL
```

`SUPABASE_URL` ve `SUPABASE_ANON_KEY` girilirse linkli eş zamanlı masa çalışır. Girilmezse oyun yerel masa olarak yine açılır.

## Deploy sonrası hızlı kontrol

- Oyun Türkçe açılmalı.
- Deste, Açık ve Kayıp sayaçları görünmeli.
- Davet butonu oda linkini kopyalamalı.
- Kart sağ tık veya F ile çevrilmeli.
- Kart kendi el alanına bırakıldığında yalnızca o oyuncuda görünmeli.
- Rakip alanındaki kartlar görünmemeli, sadece kart sayısı görünmeli.
- Ctrl + G yığını çapraza kaydırmadan toparlamalı.
