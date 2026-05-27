export const TYPE_META = {
  "Mühür": {
    label: "Mühür",
    color: "#d8b762",
    icon: "seal",
    help: "Pasif güç kartıdır. En az 3 Mühür kurup Yükseliş ilan ederek bir tam tur dayanmak oyunun ana zafer yoludur."
  },
  "Büyü": {
    label: "Büyü",
    color: "#b74444",
    icon: "flame",
    help: "Saldırı ve manipülasyon kartıdır. Genelde kendi sıranızda oynanır, etkisi çözüldükten sonra kayıp alanına gider."
  },
  "Müdahale": {
    label: "Müdahale",
    color: "#5c83d8",
    icon: "counter",
    help: "Anlık tepki kartıdır. Sıra kimde olursa olsun doğru anda oynanabilir ve zinciri değiştirebilir."
  },
  "Hizmetkâr": {
    label: "Hizmetkâr",
    color: "#4ea06b",
    icon: "guard",
    help: "Canlı kalkan kartıdır. Rakipler Mühürlerinize saldırmadan önce Hizmetkârlarınızı aşmak zorundadır."
  }
};

export const CARD_DEFINITIONS = [
  {
    key: "zaman-catlagi",
    name: "Zaman Çatlağı",
    type: "Mühür",
    count: 4,
    icon: "rift",
    accent: "#d7c073",
    text: "Odaklanma aşamasında desteden 2 yerine 3 kart çekersiniz.",
    short: "Odaklanmada 3 kart çek."
  },
  {
    key: "hiclik-ortusu",
    name: "Hiçlik Örtüsü",
    type: "Mühür",
    count: 4,
    icon: "veil",
    accent: "#a98ee8",
    text: "Masanızdaki diğer Mühürler ve elinizdeki kartlar hedef alınamaz; kendisi korumasızdır.",
    short: "Diğer Mühürleri ve eli korur."
  },
  {
    key: "kizil-monolit",
    name: "Kızıl Monolit",
    type: "Mühür",
    count: 4,
    icon: "monolith",
    accent: "#d45f52",
    text: "Her tur 2 yerine 3 Hamle Puanınız olur.",
    short: "Her tur 3 Hamle Puanı."
  },
  {
    key: "olucagiranin-gozu",
    name: "Ölüçağıranın Gözü",
    type: "Mühür",
    count: 4,
    icon: "eye",
    accent: "#73c8a6",
    text: "Tur biterken çöplüğün en üstündeki 1 kartı mecburen elinize alırsınız.",
    short: "Tur sonunda çöplükten kart al."
  },
  {
    key: "eterik-carpma",
    name: "Eterik Çarpma",
    type: "Büyü",
    count: 8,
    icon: "impact",
    accent: "#f06b56",
    text: "Rakibin masasındaki 1 hedefi yok edin. Hizmetkâr varsa önce onu seçmelisiniz.",
    short: "Geçerli hedefi yok eder."
  },
  {
    key: "golge-hirsizligi",
    name: "Gölge Hırsızlığı",
    type: "Büyü",
    count: 6,
    icon: "hand",
    accent: "#8b6be8",
    text: "Rakibin elinden rastgele 1 kart seçin ve elinize alın.",
    short: "Rakibin elinden 1 kart çal."
  },
  {
    key: "kadim-goru",
    name: "Kadim Görü",
    type: "Büyü",
    count: 4,
    icon: "vision",
    accent: "#f0bb68",
    text: "Kapalı desteden anında 3 kart çekin.",
    short: "Desteden 3 kart çek."
  },
  {
    key: "zihin-paraziti",
    name: "Zihin Paraziti",
    type: "Büyü",
    count: 4,
    icon: "parasite",
    accent: "#d96bd1",
    text: "Bir rakibin Hizmetkârının kontrolünü alın ve kendi masanıza yerleştirin.",
    short: "Hizmetkâr kontrolünü al."
  },
  {
    key: "kaderin-cilvesi",
    name: "Kaderin Cilvesi",
    type: "Büyü",
    count: 2,
    icon: "swap",
    accent: "#68d8ce",
    text: "Elinizdeki tüm kartları, seçtiğiniz rakibin elindeki tüm kartlarla takas edin.",
    short: "Eldeki kartları takas et."
  },
  {
    key: "sustur",
    name: "Sustur!",
    type: "Müdahale",
    count: 8,
    icon: "mute",
    accent: "#7fa2ff",
    text: "Oynanan herhangi bir Büyü veya Müdahale kartının etkisini iptal edin.",
    short: "Büyü veya Müdahaleyi iptal et."
  },
  {
    key: "karmik-yansima",
    name: "Karmik Yansıma",
    type: "Müdahale",
    count: 4,
    icon: "mirror",
    accent: "#90c7ff",
    text: "Size veya kartlarınıza yapılan saldırıyı iptal edin ve saldırana geri çevirin.",
    short: "Saldırıyı geri yansıtır."
  },
  {
    key: "kan-kefareti",
    name: "Kan Kefareti",
    type: "Müdahale",
    count: 4,
    icon: "blood",
    accent: "#e06c87",
    text: "Mührünüz yok edilmek üzereyken, elinizden rastgele 2 kart atarak onu kurtarın.",
    short: "2 kart at, Mührü kurtar."
  },
  {
    key: "runik-bekci",
    name: "Rünik Bekçi",
    type: "Hizmetkâr",
    count: 8,
    icon: "warden",
    accent: "#66c384",
    text: "Masada olduğu sürece kimse Mühürlerinize saldıramaz.",
    short: "Mühürleri korur."
  },
  {
    key: "buzul-ucube",
    name: "Buzul Ucube",
    type: "Hizmetkâr",
    count: 4,
    icon: "ice",
    accent: "#8bd7e8",
    text: "Bu kartı yok eden oyuncu, kendi sırası geldiğinde turunu tamamen pas geçer.",
    short: "Yok edeni turdan düşürür."
  },
  {
    key: "golge-katili",
    name: "Gölge Katili",
    type: "Hizmetkâr",
    count: 4,
    icon: "dagger",
    accent: "#8bd184",
    text: "Masaya koyulduğunda bir rakibin Hizmetkârını seçip yok eder.",
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
        order: n++
      });
    }
  }
  return cards;
}

export function iconSvg(name) {
  const icons = {
    seal: '<circle cx="12" cy="12" r="7"/><path d="M12 5v14M5 12h14"/><path d="M8 8l8 8M16 8l-8 8"/>',
    flame: '<path d="M12 21c4 0 7-3 7-7 0-4-3-6-4-10-3 2-4 5-3 8-2-1-3-3-3-5-2 2-4 5-4 8 0 4 3 6 7 6Z"/>',
    counter: '<path d="M5 12a7 7 0 0 1 11-5"/><path d="M16 3v4h-4"/><path d="M19 12a7 7 0 0 1-11 5"/><path d="M8 21v-4h4"/>',
    guard: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"/><path d="M12 7v10M8 11h8"/>',
    rift: '<path d="M13 2L6 13h6l-1 9 7-12h-6l1-8Z"/>',
    veil: '<path d="M4 7c5-3 11-3 16 0v10c-5 3-11 3-16 0V7Z"/><path d="M8 12c2-2 6-2 8 0M9 16c2 1 4 1 6 0"/>',
    monolith: '<path d="M8 21V6l4-3 4 3v15H8Z"/><path d="M10 8h4M10 13h4M10 18h4"/>',
    eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    impact: '<path d="M12 3l2 6 6 1-5 4 2 6-5-3-5 3 2-6-5-4 6-1 2-6Z"/>',
    hand: '<path d="M7 12V7a2 2 0 0 1 4 0v5"/><path d="M11 11V5a2 2 0 0 1 4 0v7"/><path d="M15 11V8a2 2 0 0 1 4 0v5c0 5-3 8-7 8H9c-2 0-4-2-5-5l-1-3a2 2 0 0 1 4-1l1 2"/>',
    vision: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M19.5 4.5l-2 2M6.5 17.5l-2 2"/>',
    parasite: '<path d="M12 4c4 2 6 5 6 9a6 6 0 0 1-12 0c0-4 2-7 6-9Z"/><path d="M9 11h6M8 15h8M7 7L4 5M17 7l3-2"/>',
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/><path d="M18 7l-3 3M6 17l3-3"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4V9Z"/><path d="M19 9l-6 6M13 9l6 6"/>',
    mirror: '<path d="M12 3l7 4v10l-7 4-7-4V7l7-4Z"/><path d="M12 7v10M8 9l8 6"/>',
    blood: '<path d="M12 2s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12Z"/><path d="M10 15c1 2 3 2 4 0"/>',
    warden: '<path d="M6 20V8l6-4 6 4v12"/><path d="M9 20v-7h6v7M8 10h8"/>',
    ice: '<path d="M12 2v20M4 6l16 12M20 6L4 18"/><path d="M8 4l4 4 4-4M8 20l4-4 4 4"/>',
    dagger: '<path d="M14 3l7 7-4 1-7 7-4-4 7-7 1-4Z"/><path d="M6 14l-3 3 4 4 3-3"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.seal}</svg>`;
}
