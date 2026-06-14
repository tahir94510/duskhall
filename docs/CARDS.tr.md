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
| **Büyü** | 1 HP karşılığı elden oynanan tek kullanımlık saldırı. Çözülür, sonra Çöplüğe gider. |
| **Müdahale** | Reaktif kart. HP harcamaz; sıra kimde olursa olsun her an oynanabilir. |
| **Hizmetkâr** | Masanızdaki canlı kalkan. Rakipler önce Hizmetkârları temizlemeden Mühürlerinizi hedef alamaz. |

Deste bileşimi: **Mühür 16** (4 benzersiz × 4), **Büyü 24**, **Müdahale 16**,
**Hizmetkâr 16**.

---

## Mühürler (16)

### Zaman Çatlağı (Mühür, 4 kopya)
Her tur 1 fazla kart çekersin. Odaklanma'da 2 yerine 3 kart çekilir; her ek kopya +1 ekler
(en fazla 4 kopya, 6 kart). Bir sonraki turdan itibaren işler.

*Saatte ince bir çatlak; her nefesle büyüyen.*

### Hiçlik Örtüsü (Mühür, 4 kopya)
Diğer Mühürlerini ve elini korumaya alır. İkisi de düşman büyü ve efektlerince hedef
alınamaz; Örtü'nün kendisi her zaman hedeflenebilir. Anında işler; ek kopya fayda
sağlamaz.

*Düştüğü yerde dünya bakmayı unutur.*

### Kızıl Monolit (Mühür, 4 kopya)
Her tur 1 fazla HP verir. Aksiyon'da 2 yerine 3 HP harcarsın; her ek kopya +1 ekler,
toplam asla 5'i aşmaz. Bir sonraki turdan itibaren işler.

*Her şey yıkıldığında hâlâ ayakta duran.*

### Ölüçağıranın Gözü (Mühür, 4 kopya)
Çöplüğün en üst kartını her tur eline alırsın. Kapanış'ının başında işler (her ek kopya
bir kart daha) ve konulduğu turda da çalışır. Çöplük boşsa bir şey olmaz. El limiti
kontrolünden önce çeker, yani tutmak istediğin bir kartı asla feda ettirmez.

*Ölüler hesaplarını sabırlı defterlerde tutar.*

---

## Büyüler (24)

### Eterik Çarpma (Büyü, 7 kopya)
Rakibin masasından bir kartı yok et. Hizmetkâr Kalkanı geçerli: hedefin Hizmetkârı varsa
önce bir Hizmetkâr seçmek zorundasın. Hedef hedeflenemezse oynanamaz, HP harcanmaz. 1 HP.

*Görünenle mühürlenen arasındaki temiz bir kesik.*

### Gölge Hırsızlığı (Büyü, 5 kopya)
Bir rakibin elinden rastgele bir kart çal. Eli kimse göremeden kapalı karıştırılır ve
içinden rastgele biri eline geçer; hangisini alacağını ne sen ne rakip seçer. Eli boşsa ya
da Hiçlik Örtüsü ile korunuyorsa oynanamaz, HP harcanmaz. 1 HP.

*Her sırrın kaldırabileceğin bir ağırlığı vardır.*

### Kadim Görü (Büyü, 4 kopya)
Desteden 3 kart çek. Yalnızca sana işler; kimseyi hedeflemez. Çekim sırasında deste
biterse önce Eter Dalgalanması çözülür, kalan kartlar yeni desteden gelir. 1 HP.

*Asla kırpılmayan gözü aç.*

### Zihin Paraziti (Büyü, 4 kopya)
Rakibin bir Hizmetkârını kendi masana geçir. Sürekli etkileri artık sana hizmet eder ve 3
Hizmetkâr sınırına sayılır. Boş bir yuvan olmalı: zaten 3 Hizmetkârın varsa oynanamaz
(çalmak için kendi kartını atıp yer açamazsın), hedefin Hizmetkârı yoksa da oynanamaz; HP
harcanmaz. 1 HP.

*Sadakat bir kapıdır; anahtar sende.*

### Kaderin Cilvesi (Büyü, 4 kopya)
Elini, seçtiğin bir rakibin eliyle komple takas et. Masadaki kartlar etkilenmez; el limiti
fazlası herkesin kendi Kapanış'ında çözülür. Hedef Hiçlik Örtüsü ile korunuyorsa
oynanamaz. 1 HP.

*Kaderin çarkı kimseye sormadan döner.*

---

## Müdahaleler (16)

### Sustur! (Müdahale, 8 kopya)
Yeni oynanmış bir Büyü ya da Müdahaleyi iptal et. İptal edilen kart da Sustur! da Çöplüğe
gider. Sustur! başka bir Sustur! ile susturulabilir; üstteki alttakini iptal eder. HP
istemez; sıra kimde olursa olsun her an oynanabilir.

*Masanın yargıç tokmağı.*

### Karmik Yansıma (Müdahale, 4 kopya)
Sana ya da masandaki bir kartına yönelen saldırıyı saldırgana geri çevir. Saldırı,
sahibine tam etkisiyle işler; geri dönüşte onun kendi Hizmetkâr Kalkanı geçerlidir.
Yalnızca kendini korur: elini, desteni ya da başka bir oyuncuyu kollayamaz. HP istemez;
her an oynanabilir.

*Gönderdiğin geri döner, aynı sertlikte.*

### Kan Kefareti (Müdahale, 4 kopya)
Yok edilmek üzere olan KENDİ Mührünü kurtar. Tam o anda oynanır; bedel olarak elinden
rastgele 2 kart Çöplüğe gider. Kartları ne sen seçersin ne rakibin; her zaman bir
kumardır. Elinde 2'den az kart varsa oynanamaz. HP istemez.

*Kalp atışıyla ödenen bir yemin.*

---

## Hizmetkârlar (16)

### Rünik Bekçi (Hizmetkâr, 8 kopya)
Masanda durduğu sürece tüm Mühürlerin hedeflenemez olur. Bekçi'nin kendisi hedeflenebilir;
Kalkan kuralı gereği rakip, Mühürlerine uzanmadan önce tüm Hizmetkârları yok etmek
zorundadır.

*Demire kazınmış sabır.*

### Buzul Ucube (Hizmetkâr, 4 kopya)
Bunu yok eden, bir sonraki turunun tamamını atlar. Atlanan turda Odaklanma, Aksiyon ve
Kapanış yoktur; Müdahaleler yine oynanabilir. Ceza dolaylı yok etmelerde de işler, örneğin
bir Gölge Katili girişi ya da Karmik Yansıma dönüşü; yalnızca yok edilmesi bunu tetikler,
çalınması tetiklemez.

*Kendi zamanını tutan bir kış.*

### Gölge Katili (Hizmetkâr, 4 kopya)
Masaya koyduğunda, bir rakibin Hizmetkârı varsa birini seçip hemen yok etmek zorundasın.
Bu yolla bir Buzul Ucube yok edersen tur-atlama cezasını SEN ödersin. Hiçbir rakipte
Hizmetkâr yoksa etki boşa düşer ama Katil yine de masana gelir.

*Gölgeler bile ona cevap verir.*

---

Tam oyun kuralları için (tur yapısı, HP, Yükseliş, Eter Dalgalanması, Hizmetkâr Kalkanı
kuralı, kenar durumlar) bkz. [`RULES.tr.md`](RULES.tr.md).
