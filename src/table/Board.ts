import { t } from "../i18n/index.js";
import { slotsForSeat } from "./SlotGrid.js";
import type { Seat } from "./rotation.js";

export interface BoardRefs {
  root: HTMLDivElement;
  board: HTMLDivElement;
  cardsLayer: HTMLDivElement;
  dock: HTMLDivElement;
  deckSlot: HTMLDivElement;
  discardSlot: HTMLDivElement;
  slotLayer: HTMLDivElement;
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
    z.innerHTML = `<div class="zone__rail"><span class="zone__name" data-role="name"></span></div>`;
    root.appendChild(z);
    zones.push(z);
  }

  const board = document.createElement("div");
  board.className = "board";
  board.innerHTML = `
    <div class="board__perspective" data-role="perspective">
      <div class="board__slots" data-role="slots"></div>
      <div class="board__layer board__cards" data-role="cards"></div>
      <div class="dock" data-role="dock">
        <div class="dock__slot" data-role="deck"></div>
        <div class="dock__slot" data-role="discard"></div>
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
    slotLayer: board.querySelector<HTMLDivElement>('[data-role="slots"]')!,
    zones
  };

  paintSlotGrid(refs);
  refreshLabels(refs);
  return refs;
}

function paintSlotGrid(refs: BoardRefs): void {
  refs.slotLayer.innerHTML = "";
  const seats: Seat[] = [0, 1, 2, 3];
  const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w")) || 96;
  const cardH = cardW * 1.45;
  for (const seat of seats) {
    for (const slot of slotsForSeat(seat)) {
      const dot = document.createElement("div");
      dot.className = `slot-mark slot-mark--${slot.kind}`;
      dot.dataset.seat = String(seat);
      dot.dataset.kind = slot.kind;
      // Width relative to current card-w, height proportional
      dot.style.width = `${cardW * 0.7}px`;
      dot.style.height = `${cardH * 0.7}px`;
      dot.style.left = `${slot.nx * 100}%`;
      dot.style.top = `${slot.ny * 100}%`;
      // Orient toward the seat (so cards stand vertically toward owner)
      const baseRot = seat === 0 ? 0 : seat === 1 ? 180 : seat === 2 ? -90 : 90;
      dot.style.transform = `translate(-50%, -50%) rotate(${baseRot}deg)`;
      refs.slotLayer.appendChild(dot);
    }
  }
}

export function refreshLabels(refs: BoardRefs): void {
  const labels = [t("table.seatSelf"), t("table.seatOpponent"), t("table.seatLeft"), t("table.seatRight")];
  for (let i = 0; i < refs.zones.length; i++) {
    const name = refs.zones[i]!.querySelector<HTMLElement>('[data-role="name"]');
    if (name) name.textContent = labels[i] || "";
  }
}

export function repaintSlots(refs: BoardRefs): void {
  paintSlotGrid(refs);
}
