# ZAN, Kart Referansı (4 yüz, 40 kart)

ZAN'da her biri onarlık dört tür vardır; toplam 40 kart. Türlerin sırası ve gücü yoktur. İsimler
ve hikâye metinleri `public/locales/modes/zan.tr.json` (`cards.*`) ile aynıdır; görseller
`public/modes/zan/cards/<id>.<ext>` altında yer alır.

| id | İsim | Adet | Hikâye |
|----|------|-----:|--------|
| `raven` | Kuzgun | 10 | Kara dalın üstünde bekler, geçip giden yalanları sayar. |
| `skull` | Kuru Kafa | 10 | Yanlış iddiaya güvenen herkesten geriye kalan. |
| `moon` | Ay | 10 | Soğuk bir ışık; tam da şüpheye düşürecek kadar. |
| `eye` | Göz | 10 | Asla kırpılmaz ve seni ele veren o küçük işareti çoktan gördü. |

Kart görseli kuralı: `raven.webp`, `skull.webp`, `moon.webp`, `eye.webp` dosyalarını
`public/modes/zan/cards/` içine bırak; paylaşılan kart arkası için isteğe bağlı olarak `back.webp`
ekle (ZAN `hasCardBackImage: true` bildirir). Vite eklentisi manifesti yeniden üretir; eksik
dosyalar yer tutucu bir yüze ve yerleşik CSS arkaya döner, böylece temiz bir kopya sıfır 404 üretir.
