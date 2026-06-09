import { slotsForSeat } from "./SlotGrid.js";
import type { Seat } from "./rotation.js";
import { t } from "../i18n/index.js";
import { ICON_CLOSE } from "../ui/icons.js";

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
  /** Non-rotating seat-label groups, same physical order as `zones`:
      [bottom, top, left, right]. Each holds the name + status light + kick. */
  labels: HTMLDivElement[];
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
  // The four hand trays live in their OWN grid layer (mirroring the table's tracks) so its 4
  // outer corners can be rounded together (zones.css .zones clip-path) — giving the table four
  // soft edges. Cards live in .board (a separate layer) and may overflow into the page margin,
  // so they are NEVER clipped by this rounding.
  const zoneLayer = document.createElement("div");
  zoneLayer.className = "zones";
  zoneLayer.dataset.role = "zones";
  root.appendChild(zoneLayer);
  // Fixed physical order: [bottom, top, left, right]. Each div is bound to an
  // absolute seat per-viewer at runtime (see Game.refreshZones), so the local
  // player always reads their own area at the bottom. zone--self here is only the
  // boot-frame default; refreshZones re-binds it to whichever physical slot the
  // local seat currently renders in (it moves during a V camera turn).
  const seats = [
    { cls: "zone zone--self zone--bottom" },
    { cls: "zone zone--top" },
    { cls: "zone zone--left" },
    { cls: "zone zone--right" }
  ];
  for (let i = 0; i < seats.length; i++) {
    const z = document.createElement("div");
    z.className = `${seats[i]!.cls} zone--empty`;
    // The name / status light / kick now live in the separate non-rotating label
    // layer (built below), so the zone div is just the frosted panel.
    zoneLayer.appendChild(z);
    zones.push(z);
  }

  const board = document.createElement("div");
  board.className = "board";
  board.innerHTML = `
    <div class="board__perspective" data-role="perspective">
      <div class="board__slots" data-role="slots"></div>
      <div class="board__layer board__cards" data-role="cards"></div>
      <div class="dock dock--canonical" data-role="dock">
        <div class="dock__slot dock__slot--deck" data-role="deck"><span class="dock__label">${escapeHtml(t("table.deck"))}</span></div>
        <div class="dock__slot dock__slot--discard" data-role="discard"><span class="dock__label">${escapeHtml(t("table.discard"))}</span></div>
      </div>
    </div>
  `;
  root.appendChild(board);

  // The seat-label layer is a SIBLING of .board (a direct child of the table), NOT a child
  // of it: .board is a z-index stacking context, so a label nested inside it could be
  // covered by any sibling zone painted later. As a top-level layer at --z-seat it is
  // unconditionally above every zone and card, so names/lights/kick are ALWAYS visible and
  // upright (it never rotates with the board). Physical order matches `zones`.
  const labelLayer = document.createElement("div");
  labelLayer.className = "board__labels";
  labelLayer.dataset.role = "labels";
  labelLayer.innerHTML = ["bottom", "top", "left", "right"].map((slot) => `
    <div class="seat-label seat-label--${slot}">
      <span class="seat-label__cluster">
        <i class="seat-label__dot" aria-hidden="true"></i>
        <span class="seat-label__text" data-role="name"></span>
        <button class="seat-label__kick" type="button" data-action="kick" hidden>${ICON_CLOSE}</button>
      </span>
    </div>`).join("");
  root.appendChild(labelLayer);

  const refs: BoardRefs = {
    root,
    board,
    cardsLayer: board.querySelector<HTMLDivElement>('[data-role="cards"]')!,
    dock: board.querySelector<HTMLDivElement>('[data-role="dock"]')!,
    deckSlot: board.querySelector<HTMLDivElement>('[data-role="deck"]')!,
    discardSlot: board.querySelector<HTMLDivElement>('[data-role="discard"]')!,
    slotLayer: board.querySelector<HTMLDivElement>('[data-role="slots"]')!,
    bgLayer,
    zones,
    labels: Array.from(labelLayer.querySelectorAll<HTMLDivElement>(".seat-label"))
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

// Re-label the deck/discard markers when the language changes.
export function refreshDockLabels(refs: BoardRefs): void {
  const deck = refs.deckSlot.querySelector<HTMLElement>(".dock__label");
  const discard = refs.discardSlot.querySelector<HTMLElement>(".dock__label");
  if (deck) deck.textContent = t("table.deck");
  if (discard) discard.textContent = t("table.discard");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
