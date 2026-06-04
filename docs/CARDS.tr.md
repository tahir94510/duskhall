# Vaerum: Kart Ansiklopedisi (Türkçe)

Tüm deste: **72 kart**, dört kategoride 16 benzersiz yüz. Her kart tam olarak burada
yazıldığı gibi çözülür; dijital masa kartları taşır ama bu kuralları dayatmaz; onu
oyuncular yapar.

> **Tek doğruluk kaynağı.** Aşağıdaki kart metni uygulama içi ansiklopediyle birebirdir.
> Kanonik metin locale dosyalarında (`public/locales/tr.json` → `cards.*`), yapısal veri
> (kategori, kopya sayıları) ise `src/game/cards.ts` içinde durur. Bir kartın metni ya da
> sayısı değişince bunlarla **birlikte** bu dosyayı (ve İngilizce `CARDS.en.md`'yi)
> güncelleyin. Bkz. `docs/MAINTAINING.md`.

## Dört kategori

| Kategori | Nedir |
| --- | --- |
| **Mühür** | Masanıza yerleştirilen kalıcı yapı. Pasif güç. Yükselişe giden yol. |
| **Büyü** | 1 HP karşılığı elden oynanan tek kullanımlık saldırı. Çözülür, çöpe gider. |
| **Müdahale** | Reaktif kart. HP harcamaz; sıra kimde olursa olsun her an oynanabilir. |
| **Hizmetkâr** | Masanızdaki canlı kalkan. Rakipler önce Hizmetkârları temizlemeden Mühürlerinizi hedef alamaz. |

Deste bileşimi: **Mühür 16** (4 benzersiz × 4), **Büyü 24**, **Müdahale 16**,
**Hizmetkâr 16**.

---

## Mühürler (16)

### Zaman Çatlağı (Mühür, 4 kopya)
Odaklanma aşamasında 2 yerine 3 kart çekersiniz. Her ek kopya +1 kart daha ekler (max 4
kopya, 6 kart). Yerleştirildiği turda değil, bir sonraki turdan itibaren aktif olur.

*Saatte ince bir çatlak; her nefesle büyüyen.*

### Hiçlik Örtüsü (Mühür, 4 kopya)
Diğer Mühürleriniz ve elinizdeki kartlar düşman büyü ve efektlerinden hedef alınamaz
statüsü kazanır. Hiçlik Örtüsü'nün kendisi her zaman hedef alınabilir. Yerleştirildiği
anda aktiftir; istiflenmez.

*Düştüğü yerde dünya bakmayı unutur.*

### Kızıl Monolit (Mühür, 4 kopya)
Aksiyon aşamasında 2 yerine 3 HP kullanırsınız. Her ek kopya +1 HP ekler; toplam HP 5'i
aşamaz. Yerleştirildiği turda değil, bir sonraki turdan itibaren aktif olur.

*Her şey yıkıldığında hâlâ ayakta duran.*

### Ölüçağıranın Gözü (Mühür, 4 kopya)
Kapanış aşamanızın başında, el limiti kontrolünden ÖNCE, Çöplüğün en üstündeki 1 kartı
elinize ALMAK ZORUNDASINIZ. Her ek kopya 1 kart daha ekler. Çöplük boşsa efekt boşa
düşer. Yerleştirildiği turun Kapanış'ında zaten devreye girer. Bu şekilde aldığınız kart
elinize sayılır, yani eli 7'nin üstüne çıkarırsa onu ya da başka bir kartı aynı Kapanış'ta
atabilirsiniz.

*Ölüler hesaplarını sabırlı defterlerde tutar.*

---

## Büyüler (24)

### Eterik Çarpma (Büyü, 8 kopya)
1 HP harcayın. Bir rakibin masasındaki 1 kartı yok edin. Hizmetkâr Kalkanı kuralı
geçerlidir: hedefin Hizmetkârı varsa önce bir Hizmetkâr seçmek zorundasınız. Seçilen
hedef hedef alınamaz ise büyü oynanamaz; HP harcanmaz.

*Görünenle mühürlenen arasındaki temiz bir kesik.*

### Gölge Hırsızlığı (Büyü, 6 kopya)
1 HP harcayın. Seçtiğiniz bir rakibin elindeki kartları ters çevirin; rastgele 1 kartı
kendi elinize alın. Hedefin eli boşsa veya Hiçlik Örtüsü ile korunuyorsa büyü oynanamaz.

*Her sırrın kaldırabileceğin bir ağırlığı vardır.*

### Kadim Görü (Büyü, 4 kopya)
1 HP harcayın. Kapalı desteden 3 kart çekin. Yalnızca kendinize oynanır; hiçbir rakibi
hedeflemez. Çekim sırasında deste biterse önce Eter Dalgalanması işlenir, kalan çekim yeni
desteden tamamlanır.

*Asla kırpılmayan gözü aç.*

### Zihin Paraziti (Büyü, 4 kopya)
1 HP harcayın. Bir rakibin masasındaki 1 Hizmetkârı çalıp kendi masanıza taşıyın. Çalınan
Hizmetkâr sizin 3 Hizmetkâr limitinize dahildir. Masanızda 3 Hizmetkâr varsa veya hedefin
Hizmetkârı yoksa büyü oynanamaz; HP harcanmaz. Tüm sürekli efektler yeni sahibe geçer.

*Sadakat bir kapıdır; anahtar sende.*

### Kaderin Cilvesi (Büyü, 2 kopya)
1 HP harcayın. Elinizdeki tüm kartları seçtiğiniz bir rakibin elindeki tüm kartlarla
toptan takas edin. Masa kartları etkilenmez. El limiti fazlalıkları her oyuncunun bir
sonraki Kapanış'ında giderilir. Hedef Hiçlik Örtüsü ile korunuyorsa oynanamaz.

*Kaderin çarkı kimseye sormadan döner.*

---

## Müdahaleler (16)

### Sustur! (Müdahale, 8 kopya)
HP harcamaz. Sıra kimde olursa olsun, taze atılmış bir Büyü ya da Müdahaleyi anında iptal
etmek için oynanır. İptal edilen kart ve Sustur! Çöplüğe gider. Sustur! başka bir Sustur!
ile iptal edilebilir, üstteki Sustur! alttakini iptal eder.

*Masanın yargıç tokmağı.*

### Karmik Yansıma (Müdahale, 4 kopya)
HP harcamaz. Yalnızca size ya da masanızdaki bir kartınıza (Mühürleriniz ve
Hizmetkârlarınız) yönelen bir saldırıyı iptal etmek için oynanır. Elinizi ya da destenizi
korumaz ve başka bir oyuncuyu kollamak için kullanılamaz. İptal edilen saldırı saldırgana
geri döner ve etkisini olduğu gibi ona uygular. Bu geri dönüşte saldırganın kendi
Hizmetkâr Kalkanı devreye girer: masasında Hizmetkârı varsa, saldırı önce o Hizmetkârları
yok etmek zorundadır, ancak ondan sonra Mühürlerine ulaşabilir.

*Gönderdiğin geri döner, aynı sertlikte.*

### Kan Kefareti (Müdahale, 4 kopya)
HP harcamaz. YALNIZCA KENDİ Mührünüzün yok edilmek üzere olduğu anda oynanır. Mührü
kurtarmak için elinizden 2 kart rastgele çöpe gider. Bu kartları ne siz seçersiniz ne
rakibiniz, yani her zaman bir risktir. Elinizde 2'den az kart varsa oynanamaz.

*Kalp atışıyla ödenen bir yemin.*

---

## Hizmetkârlar (16)

### Rünik Bekçi (Hizmetkâr, 8 kopya)
Masanızda durduğu sürece TÜM Mühürleriniz hedef alınamaz statüsü kazanır. Rünik Bekçi'nin
kendisi her zaman hedeflenebilir. Normal Hizmetkâr olarak Kalkan Kuralı'na tabidir; rakip
önce tüm Hizmetkârları yok etmek zorundadır.

*Demire kazınmış sabır.*

### Buzul Ucube (Hizmetkâr, 4 kopya)
Bu Hizmetkâr yok edildiğinde, onu yok eden oyuncunun bir sonraki turu tamamen atlanır
(Odaklanma, Aksiyon ve Kapanış). Atlanan turda Müdahaleler hâlâ oynanabilir. Ceza, dolaylı
yok etmelerde de uygulanır (Gölge Katili giriş efekti, Karmik Yansıma yönlendirmesi vb.).

*Kendi zamanını tutan bir kış.*

### Gölge Katili (Hizmetkâr, 4 kopya)
Gölge Katili'ni yerleştirdiğinizde, bir rakibin en az 1 Hizmetkârı varsa onlardan birini
ZORUNLU olarak seçip yok edersiniz. Bu sırada Buzul Ucube yok edilirse tur atlama cezası
SİZE uygulanır. Hiçbir rakipte Hizmetkâr yoksa efekt boş geçer; Gölge Katili yine masaya
yerleşir.

*Gölgeler bile ona cevap verir.*

---

Tam oyun kuralları için (tur yapısı, HP, Yükseliş, Eter Dalgalanması, Hizmetkâr Kalkanı
kuralı, kenar durumlar) bkz. [`RULES.tr.md`](RULES.tr.md).
