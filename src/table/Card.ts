import { CARD_DEFS, CATEGORY_META, type CardDef } from "../game/cards.js";
import { getIcon, BACK_SIGIL } from "../ui/icons.js";
import { t } from "../i18n/index.js";

const DEF_MAP = new Map<string, CardDef>();
for (const d of CARD_DEFS) DEF_MAP.set(d.id, d);

export function createCardElement(instanceId: string, defId: string): { el: HTMLDivElement } {
  const def = DEF_MAP.get(defId);
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = instanceId;
  card.dataset.def = defId;
  card.setAttribute("role", "img");
  card.setAttribute("tabindex", "-1");

  if (def) {
    const cat = CATEGORY_META[def.category];
    card.style.setProperty("--type-color", cat.color);
  }

  const inner = document.createElement("div");
  inner.className = "card__inner";

  const back = document.createElement("div");
  back.className = "card__face card__face--back";
  back.innerHTML = `<span class="card__back-sigil">${BACK_SIGIL}</span>`;

  const front = document.createElement("div");
  front.className = "card__face card__face--front";

  const type = document.createElement("div");
  type.className = "card__type";
  type.dataset.role = "type";
  type.setAttribute("aria-label", "Type");
  if (def) type.innerHTML = getIcon(def.typeIconId);

  const hero = document.createElement("div");
  hero.className = "card__hero";
  hero.dataset.role = "name";
  hero.setAttribute("aria-label", "Card");
  if (def) hero.innerHTML = getIcon(def.nameIconId);

  front.appendChild(type);
  front.appendChild(hero);

  inner.appendChild(back);
  inner.appendChild(front);
  card.appendChild(inner);

  refreshCardLabel(card, defId);
  return { el: card };
}

export function refreshCardLabel(el: HTMLDivElement, defId: string): void {
  el.setAttribute("aria-label", t(`cards.${defId}.name`));
}
