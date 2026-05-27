export const RULES_HTML = `
  <div class="modal-copy">
    <p class="eyebrow">KABAL · Eterin Varisleri</p>
    <h1>Kurallar</h1>
    <p>KABAL, otomatik kural motoru olmayan serbest bir kart masasıdır. Kartları kural kitapçığına göre oyuncular taşır, çevirir, toplar, karıştırır ve oynar.</p>

    <div class="rule-grid">
      <div class="rule-pill"><strong>Amaç</strong><span>3 Mühür kur, Yükseliş ilan et ve sıra tekrar sana gelene kadar dayan.</span></div>
      <div class="rule-pill"><strong>Masa sınırı</strong><span>En fazla 4 Mühür ve 3 Hizmetkâr.</span></div>
      <div class="rule-pill"><strong>El sınırı</strong><span>Tur sonunda elde en fazla 7 kart.</span></div>
      <div class="rule-pill"><strong>Serbest masa</strong><span>Dağıtım, hedefleme ve sıra takibi oyuncuların kontrolünde.</span></div>
    </div>

    <h2>Tur akışı</h2>
    <ol>
      <li><strong>Odaklanma:</strong> Kapalı desteden 2 kart çek.</li>
      <li><strong>Aksiyon:</strong> 2 Hamle Puanı kullan. Oluştur, Araştır veya Arın.</li>
      <li><strong>Kapanış:</strong> Mühür etkilerini çöz ve el sınırını kontrol et.</li>
    </ol>

    <h2>Kart tipleri</h2>
    <ul>
      <li><strong>Mühür:</strong> Pasif güç kartıdır. En az 3 Mühür ile Yükseliş ilan edilir.</li>
      <li><strong>Büyü:</strong> Saldırı ve manipülasyon kartıdır. Genelde oynandıktan sonra kayıp alanına gider.</li>
      <li><strong>Müdahale:</strong> Sıra kimde olursa olsun tepki olarak oynanabilir.</li>
      <li><strong>Hizmetkâr:</strong> Canlı kalkan kartıdır. Rakip önce Hizmetkârı yok etmeden Mühürlere saldıramaz.</li>
    </ul>

    <h2>Kısayollar</h2>
    <ul>
      <li><strong>Sürükle:</strong> Kartı taşı.</li>
      <li><strong>Sağ tık / F:</strong> Kartı çevir.</li>
      <li><strong>Uzun bas:</strong> Mobilde kartı çevir.</li>
      <li><strong>Ctrl + sürükle:</strong> Aynı yığındaki kartları birlikte taşı.</li>
      <li><strong>Ctrl + G:</strong> İmlecin altındaki yığını toparla.</li>
      <li><strong>Ctrl + M:</strong> İmlecin altındaki yığını karıştır.</li>
    </ul>

    <h2>Gizlilik</h2>
    <p>Kendi el alanındaki kartları yalnızca sen görürsün. Rakiplerin el alanındaki kartlar sende tamamen görünmez; yalnızca o alanda kaç kart olduğu görünür. Kart alandan çıkınca tekrar masada görünür hale gelir.</p>
  </div>
`;

export function supportHtml(supportUrl = "") {
  const safeUrl = String(supportUrl || "").trim();
  return `
    <div class="modal-copy">
      <p class="eyebrow">Destek</p>
      <h1>Destek</h1>
      <p>Bu MVP, arkadaşlarla oynanabilen hafif ve gerçek zamanlı bir kart masası olarak hazırlandı. Destek linkini Vercel ortam değişkenleri üzerinden ayarlayabilirsin.</p>
      ${safeUrl ? `<p><a class="modal-link" href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">Destek sayfasını aç</a></p>` : `<p class="soft-note">SUPPORT_URL değeri eklenmediği için destek linki pasif.</p>`}
    </div>
  `;
}

export function leaveConfirmHtml() {
  return `
    <div class="modal-copy">
      <p class="eyebrow">Odadan çıkış</p>
      <h1>Odadan çıkılsın mı?</h1>
      <p>Bu odadan çıkınca yeni ve temiz bir masa linkine geçersin. Mevcut odadaki kart düzeni senin tarafında sıfırlanır.</p>
      <div class="confirm-actions">
        <button id="cancelLeave" class="ui-button" type="button">Kal</button>
        <button id="confirmLeave" class="ui-button danger" type="button">Çık ve sıfırla</button>
      </div>
    </div>
  `;
}

function escapeAttr(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
