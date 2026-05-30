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
  bgLayer: HTMLDivElement;
  zones: HTMLDivElement[];
}

export function buildTable(host: HTMLElement): BoardRefs {
  // Full-bleed, viewport-fixed background + a gentle scrim, painted behind
  // everything. Kept OUT of the rotating board so it always covers the whole
  // screen at any seat (no black bars) and never clips. The scrim softens the
  // art for eye comfort and card legibility without hiding the deck/discard.
  const bgLayer = document.createElement("div");
  bgLayer.className = "app-bg";
  bgLayer.dataset.role = "bg";
  host.appendChild(bgLayer);
  const scrim = document.createElement("div");
  scrim.className = "app-scrim";
  host.appendChild(scrim);

  const root = document.createElement("div");
  root.className = "table";
  host.appendChild(root);

  const zones: HTMLDivElement[] = [];
  // Fixed physical order: [bottom, top, left, right]. Each div is bound to an
  // absolute seat per-viewer at runtime (see Game.refreshZones), so the local
  // player always reads their own area at the bottom.
  const seats = [
    { cls: "zone zone--self zone--bottom" },
    { cls: "zone zone--top" },
    { cls: "zone zone--left" },
    { cls: "zone zone--right" }
  ];
  for (let i = 0; i < seats.length; i++) {
    const z = document.createElement("div");
    z.className = `${seats[i]!.cls} zone--empty`;
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
      <div class="dock dock--canonical" data-role="dock">
        <div class="dock__slot dock__slot--deck" data-role="deck"></div>
        <div class="dock__slot dock__slot--discard" data-role="discard"></div>
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
    bgLayer,
    zones
  };

  paintSlotGrid(refs);
  return refs;
}

function paintSlotGrid(refs: BoardRefs): void {
  refs.slotLayer.innerHTML = "";
  const seats: Seat[] = [0, 1, 2, 3];
  for (const seat of seats) {
    for (const slot of slotsForSeat(seat)) {
      const dot = document.createElement("div");
      dot.className = `slot-mark slot-mark--${slot.kind}`;
      dot.dataset.seat = String(seat);
      dot.dataset.kind = slot.kind;
      dot.style.left = `${slot.nx * 100}%`;
      dot.style.top = `${slot.ny * 100}%`;
      const baseRot = seat === 0 ? 0 : seat === 1 ? 180 : seat === 2 ? -90 : 90;
      dot.style.transform = `translate(-50%, -50%) rotate(${baseRot}deg)`;
      refs.slotLayer.appendChild(dot);
    }
  }
}

export function repaintSlots(refs: BoardRefs): void {
  paintSlotGrid(refs);
}
