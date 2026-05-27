export const TYPE_META = {
  "Mühür": {
    label: "Mühür",
    color: "#8b6cff",
    icon: "sealType",
    help: "Masanıza kurulan kalıcı güç yapılarıdır. Elde tutulurken etki göstermezler; masaya kurulduklarında pasif güç sağlarlar. Zafer koşulunun temelidir.",
    note: "Masa sınırı: aynı anda en fazla 4 Mühür. Kapanıştan sonra masanızda en az 3 Mühür varsa Yükseliş ilan edebilirsiniz."
  },
  "Büyü": {
    label: "Büyü",
    color: "#d24f4f",
    icon: "spellType",
    help: "Aksiyon aşamasında 1 HP harcanarak oynanan tek kullanımlık saldırı ve manipülasyon kartlarıdır. Etkisi çözülsün veya iptal edilsin, genelde Çöplüğe gider.",
    note: "Büyüler yalnızca kendi sıranızda oynanır. Geçerli hedef yoksa büyü oynanamaz ve HP harcanmaz."
  },
  "Müdahale": {
    label: "Müdahale",
    color: "#5f8ee8",
    icon: "interventionType",
    help: "HP harcamayan anlık tepki kartlarıdır. Sıra kimde olursa olsun, doğru anda zincire girerek bir Büyü veya Müdahaleye cevap verebilir.",
    note: "Sustur! evrenseldir. Karmik Yansıma ve Kan Kefareti yalnızca kendi alanınızı veya kendi elinizi korumak için kullanılır."
  },
  "Hizmetkâr": {
    label: "Hizmetkâr",
    color: "#58ad72",
    icon: "servantType",
    help: "Masanızdaki canlı kalkanlar ve özel yetenekli varlıklardır. Rakipler Mühürlerinize saldırmadan önce Hizmetkârlarınızı aşmak zorundadır.",
    note: "Masa sınırı: aynı anda en fazla 3 Hizmetkâr. Hizmetkâr Kalkanı Kuralı mutlak kuraldır."
  }
};

export const CARD_DEFINITIONS = [
  {
    key: "zaman-catlagi",
    name: "Zaman Çatlağı",
    type: "Mühür",
    count: 4,
    icon: "rift",
    accent: "#d8c06b",
    text: "Odaklanma aşamasında 2 yerine 3 kart çekersiniz. Her ek kopya +1 kart daha ekler (2 kopya=4, 3 kopya=5, 4 kopya=6). Yerleştirildiği turda değil, bir sonraki turun Odaklanma aşamasından itibaren aktif olur.",
    short: "Odaklanma çekişini artırır."
  },
  {
    key: "hiclik-ortusu",
    name: "Hiçlik Örtüsü",
    type: "Mühür",
    count: 4,
    icon: "veil",
    accent: "#a98ee8",
    text: "Masanızdaki diğer tüm Mühürler ve elinizdeki kartlar, düşman büyülerinden ve efektlerinden hedef alınamaz statüsü kazanır. Hiçlik Örtüsü'nün kendisi korumasızdır; doğrudan hedef alınabilir. Yerleştirildiği andan itibaren aktif olur.",
    short: "Diğer Mühürleri ve eli korur."
  },
  {
    key: "kizil-monolit",
    name: "Kızıl Monolit",
    type: "Mühür",
    count: 4,
    icon: "monolith",
    accent: "#d45f52",
    text: "Aksiyon aşamasında 2 yerine 3 HP kullanırsınız. Birden fazla kopya istiflenebilir; ancak toplam HP hiçbir zaman 5'i geçemez. Yerleştirildiği turda değil, bir sonraki turdan itibaren aktif olur.",
    short: "Hamle Puanını artırır."
  },
  {
    key: "olucagiranin-gozu",
    name: "Ölüçağıranın Gözü",
    type: "Mühür",
    count: 4,
    icon: "eye",
    accent: "#73c8a6",
    text: "Turunuz biterken, el limiti kontrol edilmeden hemen önce, Çöplüğün en üstündeki 1 kartı elinize almak zorundasınız. Çöplük boşsa efekt gerçekleşmez. Her ek kopya 1 kart daha ekler. Yerleştirildiği turun Kapanış aşamasında devreye girer.",
    short: "Çöplükten kart geri aldırır."
  },
  {
    key: "eterik-carpma",
    name: "Eterik Çarpma",
    type: "Büyü",
    count: 8,
    icon: "impact",
    accent: "#f06b56",
    text: "1 HP harcayın. Bir rakibin masasındaki 1 kartı yok edin. Hizmetkâr Kalkanı Kuralı geçerlidir: hedef oyuncunun masasında Hizmetkâr varsa, zorunlu olarak bir Hizmetkârı hedef almalısınız. Hedef hedef alınamaz ise büyü oynanamaz; HP harcanmaz.",
    short: "Geçerli hedefi yok eder."
  },
  {
    key: "golge-hirsizligi",
    name: "Gölge Hırsızlığı",
    type: "Büyü",
    count: 6,
    icon: "hand",
    accent: "#8b6be8",
    text: "1 HP harcayın. Seçtiğiniz bir rakibin elindeki kartları ters çevirin; gözlerinizi kapatarak rastgele 1 kart alın. Hedefin eli boşsa veya Hiçlik Örtüsü ile korunuyorsa bu büyü oynanamaz.",
    short: "Rakibin elinden kart çalar."
  },
  {
    key: "kadim-goru",
    name: "Kadim Görü",
    type: "Büyü",
    count: 4,
    icon: "vision",
    accent: "#f0bb68",
    text: "1 HP harcayın. Kapalı desteden anında 3 kart çekin. Bu büyü kendinize kullanılır; herhangi bir rakibi hedef almaz. Çekilirken deste biter ve Eter Dalgalanması tetiklenirse önce Dalgalanma işlenir, ardından kalan kart sayısı yeni desteden tamamlanır.",
    short: "Desteden 3 kart çektirir."
  },
  {
    key: "zihin-paraziti",
    name: "Zihin Paraziti",
    type: "Büyü",
    count: 4,
    icon: "parasite",
    accent: "#d96bd1",
    text: "1 HP harcayın. Bir rakibin masasındaki 1 Hizmetkârın kontrolünü alın ve kendi masanıza aktarın. Çalınan Hizmetkâr, 3'lük Hizmetkâr limitinize dahil edilir; masanız doluysa bu büyü oynanamaz. Tüm özel efektler yeni sahibine geçer.",
    short: "Hizmetkâr kontrolünü alır."
  },
  {
    key: "kaderin-cilvesi",
    name: "Kaderin Cilvesi",
    type: "Büyü",
    count: 2,
    icon: "swap",
    accent: "#68d8ce",
    text: "1 HP harcayın. Elinizdeki tüm kartları, seçtiğiniz bir rakibin elindeki tüm kartlarla toptan takas edin. Masadaki kartlar etkilenmez. Takas sonrası el limiti fazlalıkları, her oyuncunun kendi Kapanış aşamasında giderilir. Hedefin eli Hiçlik Örtüsü ile korunuyorsa oynanamaz.",
    short: "Eldeki kartları takas eder."
  },
  {
    key: "sustur",
    name: "Sustur!",
    type: "Müdahale",
    count: 8,
    icon: "mute",
    accent: "#7fa2ff",
    text: "HP harcamaz. Sıra kimde olursa olsun oynanabilir. Masaya yeni atılmış bir Büyü veya Müdahale kartını anında iptal eder. Hem iptal edilen kart hem Sustur!'un kendisi Çöplüğe gider. Sustur!, başka bir Sustur! ile iptal edilebilir.",
    short: "Büyü veya Müdahaleyi iptal eder."
  },
  {
    key: "karmik-yansima",
    name: "Karmik Yansıma",
    type: "Müdahale",
    count: 4,
    icon: "mirror",
    accent: "#90c7ff",
    text: "HP harcamaz. Yalnızca size veya kendi kartlarınıza yönelik bir saldırıyı iptal etmek için oynanabilir. Saldırı iptal edilir ve efekti saldırganın masasına geri çevrilir; bu yansıma saldırganın Hizmetkâr korumasına tabidir. Başka bir oyuncuya saldırıda kullanılamaz.",
    short: "Saldırıyı geri yansıtır."
  },
  {
    key: "kan-kefareti",
    name: "Kan Kefareti",
    type: "Müdahale",
    count: 4,
    icon: "blood",
    accent: "#e06c87",
    text: "HP harcamaz. Yalnızca kendi bir Mührünüz yok edilmek üzereyken oynanabilir. Elinizden rastgele 2 kartı Çöplüğe atarak Mührünüzü kurtarırsınız. Rastgelelik için elinizi ters çevirin, saldırgan 2 kart seçer. Elinizde 2'den az kart varsa oynanamaz.",
    short: "2 kart atıp Mührü kurtarır."
  },
  {
    key: "runik-bekci",
    name: "Rünik Bekçi",
    type: "Hizmetkâr",
    count: 8,
    icon: "warden",
    accent: "#66c384",
    text: "Masanızda durduğu sürece tüm Mühürleriniz hedef alınamaz statüsü kazanır. Rünik Bekçi'nin kendisi her zaman hedeflenebilir. Normal Hizmetkâr olarak Kalkan Kuralı'na tabidir; rakip her koşulda önce onu yok etmek zorundadır. Hiçlik Örtüsü ile birlikte kullanıldığında koruma katlanır.",
    short: "Mühürleri korur."
  },
  {
    key: "buzul-ucube",
    name: "Buzul Ucube",
    type: "Hizmetkâr",
    count: 4,
    icon: "ice",
    accent: "#8bd7e8",
    text: "Bu Hizmetkâr yok edildiğinde, yok eden oyuncunun bir sonraki turu tamamen atlanır. Odaklanma, Aksiyon ve Kapanış gerçekleşmez. Atlanan turda Müdahale kartları tepkisel olarak yine oynanabilir. Ceza, Gölge Katili veya Karmik Yansıma aracılığıyla yok eden oyuncuya da uygulanır.",
    short: "Yok edeni turdan düşürür."
  },
  {
    key: "golge-katili",
    name: "Gölge Katili",
    type: "Hizmetkâr",
    count: 4,
    icon: "dagger",
    accent: "#8bd184",
    text: "Bu kartı masanıza koyduğunuz anda, masada herhangi bir rakibin Hizmetkârı varsa bunlardan birini zorunlu olarak seçin ve anında yok edin. Buzul Ucube yok edilirse bu ceza Gölge Katili'ni oynayan oyuncuya uygulanır. Masada hiç Hizmetkâr yoksa efekt boş geçer; kart yine de masaya yerleşir.",
    short: "Rakip Hizmetkârı yok eder."
  }
];

export function expandDeck() {
  const cards = [];
  let n = 0;
  for (const card of CARD_DEFINITIONS) {
    const meta = TYPE_META[card.type];
    for (let i = 0; i < card.count; i += 1) {
      cards.push({
        ...card,
        id: `${card.key}-${String(i + 1).padStart(2, "0")}`,
        instance: i + 1,
        typeColor: meta.color,
        typeIcon: meta.icon,
        typeHelp: meta.help,
        typeNote: meta.note,
        order: n++
      });
    }
  }
  return cards;
}

export function iconSvg(name) {
  const icons = {
    mark: '<path d="M12 3 20 8v8l-8 5-8-5V8l8-5Z"/><path d="M12 7v10M8 9l8 6M16 9l-8 6"/><circle cx="12" cy="12" r="2.7"/>',
    sealType: '<circle cx="12" cy="12" r="7"/><path d="M12 5v14M5 12h14"/>',
    spellType: '<path d="M12 21c4 0 7-3 7-7 0-4-3-6-4-10-3 2-4 5-3 8-2-1-3-3-3-5-2 2-4 5-4 8 0 4 3 6 7 6Z"/>',
    interventionType: '<path d="M5 12a7 7 0 0 1 11-5"/><path d="M16 3v4h-4"/><path d="M19 12a7 7 0 0 1-11 5"/><path d="M8 21v-4h4"/>',
    servantType: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"/><path d="M12 7v10M8 11h8"/>',
    rift: '<path d="M13 2 6 13h6l-1 9 7-12h-6l1-8Z"/>',
    veil: '<path d="M4 7c5-3 11-3 16 0v10c-5 3-11 3-16 0V7Z"/><path d="M8 12c2-2 6-2 8 0M9 16c2 1 4 1 6 0"/>',
    monolith: '<path d="M8 21V6l4-3 4 3v15H8Z"/><path d="M10 8h4M10 13h4M10 18h4"/>',
    eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    impact: '<path d="M12 3l2 6 6 1-5 4 2 6-5-3-5 3 2-6-5-4 6-1 2-6Z"/>',
    hand: '<path d="M7 12V7a2 2 0 0 1 4 0v5"/><path d="M11 11V5a2 2 0 0 1 4 0v7"/><path d="M15 11V8a2 2 0 0 1 4 0v5c0 5-3 8-7 8H9c-2 0-4-2-5-5l-1-3a2 2 0 0 1 4-1l1 2"/>',
    vision: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M19.5 4.5l-2 2M6.5 17.5l-2 2"/>',
    parasite: '<path d="M12 4c4 2 6 5 6 9a6 6 0 0 1-12 0c0-4 2-7 6-9Z"/><path d="M9 11h6M8 15h8M7 7 4 5M17 7l3-2"/>',
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/><path d="M18 7l-3 3M6 17l3-3"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4V9Z"/><path d="M19 9l-6 6M13 9l6 6"/>',
    mirror: '<path d="M12 3l7 4v10l-7 4-7-4V7l7-4Z"/><path d="M12 7v10M8 9l8 6"/>',
    blood: '<path d="M12 2s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12Z"/><path d="M10 15c1 2 3 2 4 0"/>',
    warden: '<path d="M6 20V8l6-4 6 4v12"/><path d="M9 20v-7h6v7M8 10h8"/>',
    ice: '<path d="M12 2v20M4 6l16 12M20 6 4 18"/><path d="M8 4l4 4 4-4M8 20l4-4 4 4"/>',
    dagger: '<path d="M14 3l7 7-4 1-7 7-4-4 7-7 1-4Z"/><path d="M6 14l-3 3 4 4 3-3"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.mark}</svg>`;
}
