import { CARD_DEFS, CATEGORY_META, type CardDef } from "../game/cards.js";
import { getIcon, BACK_SIGIL } from "../ui/icons.js";
import { t } from "../i18n/index.js";

const DEF_MAP = new Map<string, CardDef>();
for (const d of CARD_DEFS) DEF_MAP.set(d.id, d);

export interface CardElems {
  el: HTMLDivElement;
  type: HTMLDivElement;
  hero: HTMLDivElement;
  name: HTMLDivElement;
}

export function createCardElement(instanceId: string, defId: string): CardElems {
  const def = DEF_MAP.get(defId);
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = instanceId;
  card.dataset.def = defId;
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "-1");

  if (def) {
    const cat = CATEGORY_META[def.category];
    card.style.setProperty("--type-color", cat.color);
    card.style.setProperty("--accent-color", def.accentColor);
  }

  const inner = document.createElement("div");
  inner.className = "card__inner";

  const back = document.createElement("div");
  back.className = "card__face card__face--back";
  back.innerHTML = `<div class="card__back-sigil">${BACK_SIGIL}</div>`;

  const front = document.createElement("div");
  front.className = "card__face card__face--front";

  const corner = document.createElement("div");
  corner.className = "card__corner";

  const type = document.createElement("div");
  type.className = "card__type";
  type.dataset.role = "type";
  type.setAttribute("aria-label", "Card type");
  if (def) type.innerHTML = getIcon(def.typeIconId);

  corner.appendChild(type);

  const hero = document.createElement("div");
  hero.className = "card__hero";

  const heroIcon = document.createElement("div");
  heroIcon.className = "card__hero-icon";
  heroIcon.dataset.role = "name";
  heroIcon.setAttribute("aria-label", "Card name");
  if (def) heroIcon.innerHTML = getIcon(def.nameIconId);
  hero.appendChild(heroIcon);

  const name = document.createElement("div");
  name.className = "card__name";

  front.appendChild(corner);
  front.appendChild(hero);
  front.appendChild(name);

  inner.appendChild(back);
  inner.appendChild(front);
  card.appendChild(inner);

  refreshCardLabel(card, defId);

  return { el: card, type, hero, name };
}

export function refreshCardLabel(el: HTMLDivElement, defId: string): void {
  const nameEl = el.querySelector<HTMLDivElement>(".card__name");
  if (!nameEl) return;
  nameEl.textContent = t(`cards.${defId}.name`);
  el.setAttribute("aria-label", t(`cards.${defId}.name`));
}
