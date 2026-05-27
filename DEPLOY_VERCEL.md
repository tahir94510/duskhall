# GitHub + Vercel Yayınlama Notu

Bu proje framework bağımlılığı olmadan hazırlanmıştır. Amaç, hızlı ve düşük riskli MVP yayınlamaktır.

## GitHub'a yükleme

```bash
git init
git add .
git commit -m "Initial KABAL MVP"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADIN/kabal-mvp-vercel.git
git push -u origin main
```

## Vercel ayarı

- New Project -> GitHub reposunu seç.
- Framework Preset: Other.
- Build Command: boş bırak.
- Output Directory: boş bırak.
- Install Command: boş bırakılabilir.

## Ortam değişkenleri

Vercel -> Project -> Settings -> Environment Variables:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPPORT_URL=https://destek-linkin.com
NEXT_PUBLIC_APP_URL=https://senin-projen.vercel.app
```

Sonra Redeploy yap.

## Oda sistemi

- Site açılınca otomatik oda oluşur.
- Linkteki `?room=KBL-XXXXXX` odanın kimliğidir.
- Invite butonu oda linkini kopyalar.
- Leave butonu kullanıcıyı yeni, temiz bir odaya taşır.

## Neden hafif yapı?

Bu sürümde Next/Vite/Tailwind build zinciri yok. Böylece npm kilitlenmesi, lockfile uyumsuzluğu, Node sürümü veya Vercel build uyarısı riski en aza iner. MVP için gereken masa, kart, modal, oda ve realtime davranışları doğrudan tarayıcıda çalışır.
