# Vercel Deploy

Bu paket bağımlılıksızdır. `package.json`, `engines`, `npm install`, `pnpm install`, `next build` veya `vite build` yoktur.

## Kurulum

- GitHub'a yükle.
- Vercel > New Project > Import.
- Framework Preset: Other.
- Build Command: boş.
- Output Directory: boş veya `.`.

## ENV

Gerekli ENV değerleri:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPPORT_URL
NEXT_PUBLIC_APP_URL
```

`/api/config` bu değerleri frontend'e güvenli biçimde public config olarak döndürür. Service role key kullanma; sadece public anon key kullan.

## Kontrol

Deploy sonrası:

- `/api/config` JSON dönmeli.
- Ana sayfa açıldığında oda linki otomatik oluşmalı.
- Invite butonu linki kopyalamalı.
- İki farklı tarayıcıda aynı oda linki açıldığında imleçler ve kart hareketleri senkron çalışmalı.
