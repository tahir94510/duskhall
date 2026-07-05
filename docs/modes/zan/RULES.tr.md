# ZAN: Kusursuz Şüphe Kuralları

Dört kişilik bir blöf oyunu. Kazanan yoktur, yalnızca bir kaybeden vardır: başka birini dört ceza
kartı biriktirmeye zorla.

- **Oyuncu:** 4 (tam olarak)
- **Süre:** 10-15 dakika
- **Deste:** 40 kart, her biri onarlık dört tür: Kuzgun, Kuru Kafa, Ay, Göz. Türlerin sırası ve
  gücü yoktur; bir kart yalnızca üstüne iliştirilen iddia kadar değerlidir.

Bu belge uygulama içi kural kitapçığını yansıtır (`public/locales/modes/zan.tr.json` → `rulesDoc`).
İfade konusunda locale metni esastır; ikisini uyumlu tut.

## Amaç

Oyun, herhangi bir oyuncunun önünde **4 ceza kartı** (türü ne olursa olsun) biriktiği an biter. O
oyuncu kaybeder; diğer herkes birlikte kazanır. Yani oyunun tamamı, kartları ve suçu herkesin
üstüne yıkarken kendi tarafını temiz tutma çabasıdır.

## Kurulum

1. 40 kartın tamamını karıştır ve eşit dağıt: dört oyuncunun her birinin elinde **10 kart** olur.
   Masada hiç kart kalmaz (çekilecek deste yoktur).
2. İlk turu açacak oyuncuyu sistem rastgele seçer.

## Bir turun oynanışı

Turu açan, elinden bir kart alır ve başka bir oyuncunun önüne **kapalı** olarak sürer; yüksek
sesle bir tür söyler, örneğin "Bu bir Kuzgun." İddia doğru da olabilir, blöf de.

Kartı önüne gelen oyuncunun tam olarak iki seçeneği vardır:

- **Meydan okumak.** İddianın doğru mu yalan mı olduğunu söyler, sonra kartı açarsın. Meydan okuma
  her zaman **en son** yapılan iddiayı (kartın seninle geldiği iddiayı) yargılar.
  - Doğru bildiysen (yalanı yakaladın ya da doğruyu onayladın): kart, **o iddiayı yapan oyuncuya
    ceza** olur.
  - Yanlış bildiysen: kart **senin** cezan olur.
  - Her iki durumda da, kart alındığı an tur biter.
- **Paslamak.** Karta gizlice bakarsın (artık gerçeği bilirsin), sonra başka bir oyuncuya kapalı
  sürer ve kendi iddianı yaparsın, türü aynen tekrarla ya da değiştir; doğru ya da yalan.

Bir karta her oyuncu turda **yalnızca bir kez** dokunabilir. Kart, biri ona meydan okuyana dek
dolaşır. Ona henüz dokunmamış **dördüncü ve son** oyuncuya ulaştığında, o oyuncunun pas hakkı
kalmaz ve **meydan okumak zorundadır**.

## Kaybetmek ve sonraki tur

- Ceza kartları oyunun sonuna kadar sahibinin önünde açık kalır; asla ele geri dönmez.
- Az önce ceza alan oyuncu, **bir sonraki turu açar**.
- İlk **4 ceza kartına** ulaşan oyuncu anında kaybeder; diğer herkes kazanır.

## Oyun neden asla kilitlenmez (matematiği)

Yalnızca turu açan, elinden bir kart harcar (tur başına bir). Bir oyuncu 4. ceza oyunu bitirmeden
önce en fazla 3 ceza biriktirir; dört oyuncuda oyun en fazla `3 + 3 + 3 + 3 + 1 = 13` tur sürer.
10 kartlık bir el 13 tur içinde asla tükenmez, dolayısıyla oyuncunun elinde her zaman açacak bir
kart bulunur. Kilitlenme imkânsızdır.

## İsteğe bağlı varyant (varsayılan değil)

Daha derin bir dedüksiyon oyunu için, 4 karışık türe ek olarak **aynı türden 3 ceza kartının** da
kaybettirdiğini kabul edebilirsiniz. Böylece her oyuncu önünde hangi türlerin biriktiğini kollar.
En kısa ve en basit oyun için temel kuralı (herhangi 4 ceza) koruyun.

## Dijital masada

ZAN, kartları dağıtan ve tutan ama kuralları dayatmayan paylaşımlı Duskhall masasında çalışır -
turu, tıpkı yüz yüze oynuyormuş gibi, kendiniz yönetirsiniz. İddia yapmak için kartı kapalı sür,
meydan okumak için çevir, aldığın kartları kendi alanında açık tut. Ekranın altındaki buzlu şerit
senin gizli elindir.
