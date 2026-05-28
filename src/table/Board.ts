import { t } from "../i18n/index.js";

export interface BoardRefs {
  root: HTMLDivElement;
  board: HTMLDivElement;
  cardsLayer: HTMLDivElement;
  dock: HTMLDivElement;
  deckSlot: HTMLDivElement;
  openSlot: HTMLDivElement;
  discardSlot: HTMLDivElement;
  zones: HTMLDivElement[];
}

export function buildTable(host: HTMLElement): BoardRefs {
  const root = document.createElement("div");
  root.className = "table";
  host.appendChild(root);

  const zones: HTMLDivElement[] = [];
  const seats: Array<{ cls: string; aria: string }> = [
    { cls: "zone zone--self zone--bottom", aria: "self" },
    { cls: "zone zone--top", aria: "opponent" },
    { cls: "zone zone--left", aria: "left" },
    { cls: "zone zone--right", aria: "right" }
  ];
  for (let i = 0; i < seats.length; i++) {
    const z = document.createElement("div");
    z.className = `${seats[i]!.cls} zone--empty`;
    z.dataset.seat = String(i);
    z.style.setProperty("--seat-color", `var(--seat-${i})`);
    z.innerHTML = `
      <div class="zone__rail">
        <span class="zone__name" data-role="name"></span>
        <span class="zone__count">0</span>
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
        <span class="dock__count" data-role="deck-count">0</span>
        <span class="dock__label" data-role="deck-label"></span>
      </div>
      <div class="dock__slot" data-role="open">
        <span class="dock__count" data-role="open-count">0</span>
        <span class="dock__label" data-role="open-label"></span>
      </div>
      <div class="dock__slot" data-role="discard">
        <span class="dock__count" data-role="discard-count">0</span>
        <span class="dock__label" data-role="discard-label"></span>
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
    openSlot: board.querySelector<HTMLDivElement>('[data-role="open"]')!,
    discardSlot: board.querySelector<HTMLDivElement>('[data-role="discard"]')!,
    zones
  };

  refreshLabels(refs);
  return refs;
}

export function refreshLabels(refs: BoardRefs): void {
  refs.board.querySelector('[data-role="deck-label"]')!.textContent = t("table.deck");
  refs.board.querySelector('[data-role="open-label"]')!.textContent = t("table.open");
  refs.board.querySelector('[data-role="discard-label"]')!.textContent = t("table.discard");
  const labels = [t("table.seatSelf"), t("table.seatOpponent"), t("table.seatLeft"), t("table.seatRight")];
  for (let i = 0; i < refs.zones.length; i++) {
    const name = refs.zones[i]!.querySelector<HTMLElement>('[data-role="name"]');
    if (name) name.textContent = labels[i] || "";
  }
}
