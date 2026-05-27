export const RULES_HTML = `
  <div class="modal-copy">
    <p class="eyebrow">KABAL · Eterin Varisleri</p>
    <h1>Rules</h1>
    <p>KABAL, otomatik kural motoru olmayan serbest bir kart masasıdır. Kartları kural kitapçığına göre siz oynar, taşır, çevirir, toplar ve karıştırırsınız.</p>

    <div class="rule-grid">
      <div class="rule-pill"><strong>Goal</strong><span>3 Mühür kur, Yükseliş ilan et ve sıra tekrar sana gelene kadar dayan.</span></div>
      <div class="rule-pill"><strong>Table limit</strong><span>En fazla 4 Mühür ve 3 Hizmetkâr.</span></div>
      <div class="rule-pill"><strong>Hand limit</strong><span>Tur sonunda elde en fazla 7 kart.</span></div>
      <div class="rule-pill"><strong>Free table</strong><span>Dağıtım, hedefleme ve sıra takibi oyuncuların kontrolünde.</span></div>
    </div>

    <h2>Turn flow</h2>
    <ol>
      <li><strong>Focus:</strong> Kapalı desteden 2 kart çek.</li>
      <li><strong>Action:</strong> 2 Hamle Puanı kullan. Oluştur, Araştır veya Arın.</li>
      <li><strong>Closing:</strong> Mühür etkilerini çöz ve el limitini kontrol et.</li>
    </ol>

    <h2>Card types</h2>
    <ul>
      <li><strong>Mühür / Seal:</strong> Pasif güç. En az 3 Mühür ile Yükseliş ilan edilir.</li>
      <li><strong>Büyü / Spell:</strong> Saldırı ve manipülasyon kartları. Genelde oynandıktan sonra çöpe gider.</li>
      <li><strong>Müdahale / Intervention:</strong> Sıra kimde olursa olsun tepki olarak oynanabilir.</li>
      <li><strong>Hizmetkâr / Servant:</strong> Canlı kalkan. Rakip önce Hizmetkârı yok etmeden Mühürlere saldıramaz.</li>
    </ul>

    <h2>Controls</h2>
    <ul>
      <li><strong>Drag:</strong> Kartı taşı.</li>
      <li><strong>Right click / F:</strong> Kartı çevir.</li>
      <li><strong>Long press:</strong> Mobilde kartı çevir.</li>
      <li><strong>Ctrl + drag:</strong> Aynı yığındaki kartları birlikte taşı.</li>
      <li><strong>Ctrl + G:</strong> İmlecin altındaki yığını toparla.</li>
      <li><strong>Ctrl + M:</strong> İmlecin altındaki yığını karıştır.</li>
    </ul>

    <h2>Privacy</h2>
    <p>Kendi el alanındaki kartları yalnızca sen açıp görebilirsin. Rakip el alanındaki kartlar kilitlenir ve kapalı görünür. Rakip alanının içine doğrudan kart bırakılamaz; kartı sınırına bırakıp ilgili oyuncunun kendisinin içeri alması gerekir.</p>
  </div>
`;

export function supportHtml(supportUrl = "") {
  const safeUrl = String(supportUrl || "").trim();
  return `
    <div class="modal-copy">
      <p class="eyebrow">Support</p>
      <h1>Destek</h1>
      <p>Bu MVP, arkadaşlarla oynanabilen hafif ve gerçek zamanlı bir kart masası olarak hazırlandı. Destek linkini Vercel ENV üzerinden ayarlayabilirsin.</p>
      ${safeUrl ? `<p><a class="modal-link" href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">Support sayfasını aç</a></p>` : `<p class="soft-note">SUPPORT_URL env değeri eklenmediği için destek linki pasif.</p>`}
    </div>
  `;
}

export function leaveConfirmHtml() {
  return `
    <div class="modal-copy">
      <p class="eyebrow">Leave room</p>
      <h1>Odadan çıkılsın mı?</h1>
      <p>Bu odadan çıkınca yeni ve temiz bir masa linkine geçersin. Mevcut odadaki kart düzeni senin tarafında sıfırlanır.</p>
      <div class="confirm-actions">
        <button id="cancelLeave" class="ui-button" type="button">Stay</button>
        <button id="confirmLeave" class="ui-button danger" type="button">Leave and reset</button>
      </div>
    </div>
  `;
}

function escapeAttr(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
