import { slotsForSeat } from "./SlotGrid.js";
import { APRON_FRAC } from "./constants.js";
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
    // The name / status light / kick now live in the separate non-rotating label
    // layer (built below), so the zone div is just the frosted panel.
    root.appendChild(z);
    zones.push(z);
  }

  const board = document.createElement("div");
  board.className = "board";
  // The seat-label layer is a sibling of (and painted after / above) the rotating
  // perspective, so the names/lights/kick stay upright and always above cards.
  // Physical group order matches `zones`: [bottom, top, left, right].
  board.innerHTML = `
    <div class="board__perspective" data-role="perspective">
      <div class="board__slots" data-role="slots"></div>
      <div class="board__layer board__cards" data-role="cards"></div>
      <div class="dock dock--canonical" data-role="dock">
        <div class="dock__slot dock__slot--deck" data-role="deck"><span class="dock__label">${escapeHtml(t("table.deck"))}</span></div>
        <div class="dock__slot dock__slot--discard" data-role="discard"><span class="dock__label">${escapeHtml(t("table.discard"))}</span></div>
      </div>
    </div>
    <div class="board__labels" data-role="labels">
      ${["bottom", "top", "left", "right"].map((slot) => `
        <div class="seat-label seat-label--${slot}">
          <span class="seat-label__cluster">
            <i class="seat-label__dot" aria-hidden="true"></i>
            <span class="seat-label__text" data-role="name"></span>
            <button class="seat-label__kick" type="button" data-action="kick" hidden>${ICON_CLOSE}</button>
          </span>
        </div>`).join("")}
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
    zones,
    labels: Array.from(board.querySelectorAll<HTMLDivElement>(".seat-label"))
  };

  paintSlotGrid(refs);
  paintLedges(refs);
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

// One tableau LEDGE per seat: a single framed band sitting in the apron just OUTSIDE that
// seat's own board edge (centre at the apron mid-line, APRON_FRAC/2 past the [0,1] edge), one
// card tall and a 7-card row wide, holding the player's face-up Seals and Servants. Moving it
// off the board frees the private hand zone and declutters the centre, while the slot row
// inside it (paintSlotGrid) gives 4 Seal + 3 Servant snap positions. It lives in the rotating
// board layer, so each viewer sees their OWN ledge as a horizontal band in front of them
// (label upright) and rivals' ledges around the table at their own angles. The off-board cards
// stay on the visible page because the drag clamp keeps every body inside the extended square
// (DragController / playfield.ts). `vertical` seats (left/right) get the long axis along their
// edge. Positions can be just outside [0,1]; the layers do not clip (overflow visible).
const LEDGES: Array<{ seat: Seat; cx: number; cy: number; vertical: boolean }> = [
  { seat: 0, cx: 0.5, cy: 1 + APRON_FRAC / 2, vertical: false },
  { seat: 1, cx: 0.5, cy: -APRON_FRAC / 2, vertical: false },
  { seat: 2, cx: -APRON_FRAC / 2, cy: 0.5, vertical: true },
  { seat: 3, cx: 1 + APRON_FRAC / 2, cy: 0.5, vertical: true }
];

function paintLedges(refs: BoardRefs): void {
  for (const l of LEDGES) {
    const ledge = document.createElement("div");
    ledge.className = "tableau-ledge";
    ledge.dataset.seat = String(l.seat);
    ledge.style.left = `${l.cx * 100}%`;
    ledge.style.top = `${l.cy * 100}%`;
    // One card tall, a 7-card row wide along the player's edge (4 Seals + 3 Servants, matching
    // the slot row). For side seats the long axis runs vertically, so width/height swap. Sizes
    // are in card units so they scale with the board.
    const long = "calc(var(--card-w) * 7.3)";
    const short = "var(--card-h)";
    ledge.style.width = l.vertical ? short : long;
    ledge.style.height = l.vertical ? long : short;
    // The label counter-rotates the board rotation so it reads upright for the local viewer
    // (matching the deck/discard labels), and is updated on language change by refreshDockLabels.
    ledge.innerHTML = `<span class="tableau-ledge__label">${escapeHtml(t("table.tableau"))}</span>`;
    refs.slotLayer.appendChild(ledge);
  }
}

export function repaintSlots(refs: BoardRefs): void {
  paintSlotGrid(refs);
  paintLedges(refs);
}

// Re-label the deck/discard markers when the language changes.
export function refreshDockLabels(refs: BoardRefs): void {
  const deck = refs.deckSlot.querySelector<HTMLElement>(".dock__label");
  const discard = refs.discardSlot.querySelector<HTMLElement>(".dock__label");
  if (deck) deck.textContent = t("table.deck");
  if (discard) discard.textContent = t("table.discard");
  // Per-seat tableau ledge labels share the language refresh.
  for (const label of refs.slotLayer.querySelectorAll<HTMLElement>(".tableau-ledge__label")) {
    label.textContent = t("table.tableau");
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
