// Pure play-field geometry for the drag clamp. Kept separate from DragController so it can be
// unit-tested without a DOM. Cards live in the canonical [0,1]² board square, but the board is
// a centered square that is usually smaller than the page on its long axis. The clamp keeps a
// dragged card on the PAGE (viewport), NOT on the board: a card may be dragged off the board
// into the surrounding margin, but never off-screen. This is done in screen-pixel space so it is
// exact on every device and aspect ratio, and for every seat rotation.
//
// There is intentionally NO private-zone "wall": a card moves freely everywhere on the page so the
// drag never feels caught. Ownership/privacy is decided by the card's resting position (per-card
// concealment, see Game.cardZoneOwnerOf), and a drop whose body lands in an OCCUPIED rival's area
// bounces back on pointer-up (DragController + Game.isRivalOwnedCard) — so a rival's area can never
// be occupied, with zero drag-time friction.

import { canonicalToScreenDeg, screenToCanonicalDeg, rotateVec, type BoardBox } from "./rotation.js";

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
 * then converted back to canonical. Each axis is clamped INDEPENDENTLY, so a card pressed against
 * one edge still slides freely along it (never locks). The group moves as a rigid block. A card
 * can therefore leave the board into the page margin but never the page. If a card is larger than
 * the page on an axis it is centred on that axis. Pure.
 */
export function clampSeedToPage(
  seedNx: number,
  seedNy: number,
  cards: Iterable<ClampCard>,
  box: BoardBox,
  boardRotDeg: number,
  cardW: number,
  cardH: number,
  bounds: PageBounds
): { nx: number; ny: number } {
  // Works at ANY board rotation in degrees, not just a settled seat angle, so the same clamp keeps
  // a card on the page through a live camera-turn — reaching every edge the current angle exposes
  // while never letting the card body leave the viewport.
  const boardRot = boardRotDeg;
  const seed = canonicalToScreenDeg(seedNx, seedNy, boardRotDeg, box);
  let loX = -Infinity, hiX = Infinity, loY = -Infinity, hiY = Infinity;
  for (const c of cards) {
    // The card's screen offset from the seed (the board rotation turns the canonical offset).
    const [ox, oy] = rotateVec(c.dx * box.width, c.dy * box.height, boardRot);
    // The card's on-screen half-extents are the axis-aligned bounding box of its rectangle rotated
    // by its TOTAL angle (its own rot quarter-turns plus the board rotation). This is exact at every
    // angle: it reduces to cardW/cardH at 0deg and the swapped cardH/cardW at 90deg, and gives the
    // true (larger) diagonal extent at the in-between angles a live camera-turn passes through, so a
    // held card never pokes off the page mid-turn.
    const totalRad = ((c.rot * 90 + boardRot) * Math.PI) / 180;
    const ac = Math.abs(Math.cos(totalRad));
    const as = Math.abs(Math.sin(totalRad));
    const halfX = (ac * cardW + as * cardH) / 2;
    const halfY = (as * cardW + ac * cardH) / 2;
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
  return screenToCanonicalDeg(px, py, boardRotDeg, box);
}
