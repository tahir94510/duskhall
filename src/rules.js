import { CARD_DEFINITIONS } from "./cards.js";

const cardRows = CARD_DEFINITIONS.map((card) => `
  <div class="rule-pill">
    <strong>${card.name}</strong><br />
    <small>${card.type} · ${card.count} adet</small>
    <p>${card.text}</p>
  </div>
`).join("");

export const RULES_HTML = `
  <div class="modal-copy">
    <h1 id="modalTitle">KABAL: Eterin Varisleri</h1>
    <p>Bu MVP, oyunu otomatik yönetmez. Arkadaşlarınla fiziksel masa gibi oynarsın: kart çekersin, sürüklersin, çevirirsin, kendi alanına saklarsın ve kural kitabına göre hamleleri siz yürütürsünüz.</p>

    <h2>Temel Amaç</h2>
    <p>Oyunu kazanmak için kendi oyun alanına pasif güç sağlayan <strong>Mühür</strong> kartlarını kurmalısın. Aynı anda en fazla 4 Mühür bulunabilir. En az 3 Mühür varken Yükseliş ilan edilir; sıra tekrar sana geldiğinde hâlâ 3 Mühürün varsa kazanırsın.</p>

    <h2>Alanlar</h2>
    <div class="rule-grid">
      <div class="rule-pill"><strong>El</strong><p>Kendi blur alanına koyduğun kartlardır. Rakipler yalnızca kapalı görüntü görür.</p></div>
      <div class="rule-pill"><strong>Masa</strong><p>Ortak açık alandır. Kartlar burada herkes tarafından görülebilir ve taşınabilir.</p></div>
      <div class="rule-pill"><strong>Kayıp Alanı</strong><p>Oynanan büyüler ve yok edilen kartlar için masa üzerinde dilediğiniz bir yığın oluşturabilirsiniz.</p></div>
    </div>

    <h2>Tur Akışı</h2>
    <ol>
      <li><strong>Odaklanma:</strong> Kapalı desteden 2 kart çek.</li>
      <li><strong>Aksiyon:</strong> 2 Hamle Puanını Oluştur, Araştır veya Arın için kullan.</li>
      <li><strong>Kapanış:</strong> Mühür etkilerini çöz, sonra el limitini 7 karta indir.</li>
    </ol>

    <h2>Kart Tipleri</h2>
    <div class="rule-grid">
      <div class="rule-pill"><strong>Mühür</strong><p>Pasif güç kaynağı. Zafer koşulunun merkezidir.</p></div>
      <div class="rule-pill"><strong>Büyü</strong><p>Saldırı ve manipülasyon hamleleri. Genelde oynandıktan sonra çöpe gider.</p></div>
      <div class="rule-pill"><strong>Müdahale</strong><p>Hamle puanı harcamaz. Zincire cevap vermek için anlık oynanır.</p></div>
      <div class="rule-pill"><strong>Hizmetkâr</strong><p>Canlı kalkan. Rakipler Mühürden önce Hizmetkârı hedef almalıdır.</p></div>
    </div>

    <h2>Kısayollar</h2>
    <ul>
      <li><strong>Sol tık / dokun-sürükle:</strong> Kart taşı.</li>
      <li><strong>Sağ tık veya F:</strong> İmlecin altındaki kartı çevir.</li>
      <li><strong>Ctrl + sürükle:</strong> Aynı yığındaki kartları birlikte taşı.</li>
      <li><strong>Ctrl + G:</strong> İmlecin altındaki yığını toparla.</li>
      <li><strong>Ctrl + M:</strong> İmlecin altındaki yığını karıştır.</li>
    </ul>

    <h2>72 Kartlık Deste</h2>
    <div class="rule-grid">${cardRows}</div>
  </div>
`;

export function supportHtml(supportUrl) {
  const safeUrl = supportUrl || "";
  return `
    <div class="modal-copy">
      <h1 id="modalTitle">Support</h1>
      <p>Bu MVP destek alanı hafif tutuldu. Vercel ortam değişkenine <strong>SUPPORT_URL</strong> eklersen bu buton Patreon, Buy Me a Coffee, Discord, form veya istediğin bağlantıya yönlenebilir.</p>
      ${safeUrl ? `<p><a class="ui-button" href="${safeUrl}" target="_blank" rel="noreferrer">Open support link</a></p>` : `<p>Şimdilik destek bağlantısı tanımlı değil.</p>`}
    </div>
  `;
}

export function leaveConfirmHtml() {
  return `
    <div class="modal-copy">
      <h1 id="modalTitle">Leave room?</h1>
      <p>Bu odadan çıkarsan yeni ve temiz bir masa linkine geçersin. Mevcut odadaki kart düzeni bu sekme için bırakılır.</p>
      <div class="confirm-actions">
        <button id="confirmLeave" class="ui-button danger" type="button">Leave and reset</button>
        <button id="cancelLeave" class="ui-button" type="button">Stay</button>
      </div>
    </div>
  `;
}
