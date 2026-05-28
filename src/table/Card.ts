import { BACK_SIGIL } from "../ui/icons.js";
import { t } from "../i18n/index.js";

export function createCardElement(instanceId: string, defId: string): { el: HTMLDivElement } {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = instanceId;
  card.dataset.def = defId;
  card.setAttribute("role", "img");
  card.setAttribute("tabindex", "-1");

  const inner = document.createElement("div");
  inner.className = "card__inner";

  const back = document.createElement("div");
  back.className = "card__face card__face--back";
  back.innerHTML = `<span class="card__back-sigil">${BACK_SIGIL}</span>`;

  const front = document.createElement("div");
  front.className = "card__face card__face--front";
  front.dataset.role = "card-face";
  front.dataset.empty = "true";

  // Card art: user-supplied image at /cards/<defId>.<ext>
  const img = document.createElement("img");
  img.className = "card__art";
  img.alt = "";
  img.draggable = false;
  img.dataset.loaded = "false";

  loadCardArt(img, defId, () => {
    front.dataset.empty = "false";
    img.dataset.loaded = "true";
  });

  front.appendChild(img);

  inner.appendChild(back);
  inner.appendChild(front);
  card.appendChild(inner);

  refreshCardLabel(card, defId);
  return { el: card };
}

const ART_EXTENSIONS = ["webp", "png", "svg", "jpg"];
const tried = new Map<string, string | null>();

function loadCardArt(img: HTMLImageElement, defId: string, onLoad: () => void): void {
  const cached = tried.get(defId);
  if (cached === null) return; // known missing
  if (cached) {
    img.onload = onLoad;
    img.src = cached;
    return;
  }
  let i = 0;
  const tryNext = () => {
    if (i >= ART_EXTENSIONS.length) {
      tried.set(defId, null);
      return;
    }
    const url = `/cards/${defId}.${ART_EXTENSIONS[i++]}`;
    img.onload = () => {
      tried.set(defId, url);
      onLoad();
    };
    img.onerror = tryNext;
    img.src = url;
  };
  tryNext();
}

export function refreshCardLabel(el: HTMLDivElement, defId: string): void {
  el.setAttribute("aria-label", t(`cards.${defId}.name`));
}
