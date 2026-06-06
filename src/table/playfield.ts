// Pure play-field geometry for the drag clamp. Kept separate from DragController so it can be
// unit-tested without a DOM. Cards live in the canonical [0,1]² board square, but the board is
// a centered square that is usually smaller than the page on its long axis. The clamp keeps a
// dragged card on the PAGE (viewport), NOT on the board: a card may be dragged off the board
// into the surrounding margin, but never off-screen. This is done in screen-pixel space so it is
// exact on every device and aspect ratio, and for every seat rotation.

import { canonicalToScreen, screenToCanonical, seatRotationDeg, rotateVec, type Seat, type BoardBox } from "./rotation.js";

export interface ClampCard {
  /** canonical offset of this card's centre from the dragged group's seed */
  dx: number;
  dy: number;
  /** cumulative quarter-turns; with the board rotation, an odd total swaps w/h on screen */
  rot: number;
}

/** Viewport rectangle (page bounds) in client pixels. */
export interface PageBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Clamp the dragged group's seed so EVERY card's full body stays within the page `bounds`. Works
 * in screen pixels: the seed's screen point is constrained so each card's axis-aligned screen
 * box (its size swapped when the card+board rotation lands sideways) fits inside the viewport,
 * then converted back to canonical. The group moves as a rigid block. A card can therefore leave
 * the board into the page margin but never the page. If a card is larger than the page on an axis
 * it is centred on that axis. Pure.
 */
export function clampSeedToPage(
  seedNx: number,
  seedNy: number,
  cards: Iterable<ClampCard>,
  box: BoardBox,
  seat: Seat,
  cardW: number,
  cardH: number,
  bounds: PageBounds
): { nx: number; ny: number } {
  const boardRot = seatRotationDeg(seat);
  const seed = canonicalToScreen(seedNx, seedNy, seat, box);
  let loX = -Infinity, hiX = Infinity, loY = -Infinity, hiY = Infinity;
  for (const c of cards) {
    // The card's screen offset from the seed (the board rotation turns the canonical offset).
    const [ox, oy] = rotateVec(c.dx * box.width, c.dy * box.height, boardRot);
    // Total quarter-turns on screen = card rot + board rot; an odd total swaps width/height.
    const quarter = (((Math.round(c.rot) + boardRot / 90) % 2) + 2) % 2;
    const halfX = (quarter === 1 ? cardH : cardW) / 2;
    const halfY = (quarter === 1 ? cardW : cardH) / 2;
    // bounds.minX + halfX <= seed.px + ox <= bounds.maxX - halfX  (and same for y)
    loX = Math.max(loX, bounds.minX + halfX - ox);
    hiX = Math.min(hiX, bounds.maxX - halfX - ox);
    loY = Math.max(loY, bounds.minY + halfY - oy);
    hiY = Math.min(hiY, bounds.maxY - halfY - oy);
  }
  const clampAxis = (v: number, lo: number, hi: number): number =>
    lo <= hi ? Math.min(Math.max(v, lo), hi) : (lo + hi) / 2;
  const px = clampAxis(seed.px, loX, hiX);
  const py = clampAxis(seed.py, loY, hiY);
  return screenToCanonical(px, py, seat, box);
}
