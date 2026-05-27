# Vercel Deploy Notları

1. Paketi GitHub reposuna yükle.
2. Vercel'de yeni proje aç ve repoyu import et.
3. Framework Preset olarak `Other` seç.
4. Build Command, Install Command ve Output Directory alanlarını boş bırak veya Output Directory için `.` kullan.
5. Ortam değişkenlerini ekle:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPPORT_URL
NEXT_PUBLIC_APP_URL
```

6. Deploy et.

Bu pakette `package.json` bulunmadığı için Vercel dependency install aşaması çalıştırmaz; `engines.node` uyarısı, pnpm lockfile uyarısı veya npm install hatası tetiklenmez.
