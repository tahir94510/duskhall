import { t } from "../i18n/index.js";

export interface BoardRefs {
  root: HTMLDivElement;
  board: HTMLDivElement;
  cardsLayer: HTMLDivElement;
  dock: HTMLDivElement;
  deckSlot: HTMLDivElement;
  discardSlot: HTMLDivElement;
  zones: HTMLDivElement[];
}

export function buildTable(host: HTMLElement): BoardRefs {
  const root = document.createElement("div");
  root.className = "table";
  host.appendChild(root);

  const zones: HTMLDivElement[] = [];
  const seats = [
    { cls: "zone zone--self zone--bottom" },
    { cls: "zone zone--top" },
    { cls: "zone zone--left" },
    { cls: "zone zone--right" }
  ];
  for (let i = 0; i < seats.length; i++) {
    const z = document.createElement("div");
    z.className = `${seats[i]!.cls} zone--empty`;
    z.dataset.seat = String(i);
    z.style.setProperty("--seat-color", `var(--seat-${i})`);
    z.innerHTML = `
      <div class="zone__rail">
        <span class="zone__name" data-role="name"></span>
        <span class="zone__count" data-role="count">0</span>
      </div>
      <div class="zone__cards" data-role="zone-cards"></div>
    `;
    root.appendChild(z);
    zones.push(z);
  }

  const board = document.createElement("div");
  board.className = "board";
  board.innerHTML = `
    <div class="board__layer board__cards" data-role="cards"></div>
    <div class="dock" data-role="dock">
      <div class="dock__slot" data-role="deck">
        <span class="dock__value" data-role="deck-value">0</span>
      </div>
      <div class="dock__slot" data-role="discard">
        <span class="dock__value" data-role="discard-value">0</span>
      </div>
    </div>
  `;
  root.appendChild(board);

  const refs: BoardRefs = {
    root,
    board,
    cardsLayer: board.querySelector<HTMLDivElement>('[data-role="cards"]')!,
    dock: board.querySelector<HTMLDivElement>('[data-role="dock"]')!,
    deckSlot: board.querySelector<HTMLDivElement>('[data-role="deck"]')!,
    discardSlot: board.querySelector<HTMLDivElement>('[data-role="discard"]')!,
    zones
  };

  refreshLabels(refs);
  return refs;
}

export function refreshLabels(refs: BoardRefs): void {
  refs.deckSlot.setAttribute("data-label", t("table.deck"));
  refs.discardSlot.setAttribute("data-label", t("table.discard"));
  const labels = [t("table.seatSelf"), t("table.seatOpponent"), t("table.seatLeft"), t("table.seatRight")];
  for (let i = 0; i < refs.zones.length; i++) {
    const name = refs.zones[i]!.querySelector<HTMLElement>('[data-role="name"]');
    if (name) name.textContent = labels[i] || "";
  }
}
