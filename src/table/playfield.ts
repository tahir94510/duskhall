// Pure play-field geometry for the drag clamp. Kept separate from DragController so it can be
// unit-tested without a DOM. The inner board is the canonical [0,1] square; each side has an
// off-board "ledge" apron of depth APRON_FRAC, so the EXTENDED play square is
// [-APRON_FRAC, 1+APRON_FRAC] on each axis. The inner board is sized (board.css) so this
// extended square equals the centered viewport-min square, hence a card whose body is kept
// inside the extended square can never leave the visible page on any device.

import { APRON_FRAC } from "./constants.js";

export interface ClampCard {
  /** canonical offset of this card's centre from the dragged group's seed */
  dx: number;
  dy: number;
  /** cumulative quarter-turns; an odd turn presents the card sideways (w/h swap) */
  rot: number;
}

/**
 * Tightest seed (nx, ny) that keeps EVERY card's full body inside the extended play square
 * [-apron, 1+apron]². The group moves as a rigid block; each card's half-extent on each axis
 * comes from its OWN rotation (odd quarter-turn swaps width/height, matching
 * SlotGrid.cardZoneOverlap). `halfWFrac`/`halfHFrac` are half the card size as fractions of the
 * INNER board. If a pile is larger than the field on an axis (lo > hi) the seed falls back to
 * the extended range on that axis. Pure — negative-rotation safe.
 */
export function clampSeedToField(
  seedNx: number,
  seedNy: number,
  cards: Iterable<ClampCard>,
  halfWFrac: number,
  halfHFrac: number,
  apron: number = APRON_FRAC
): { nx: number; ny: number } {
  const lo = -apron;
  const hi = 1 + apron;
  let loX = lo, hiX = hi, loY = lo, hiY = hi;
  for (const c of cards) {
    const quarter = (((Math.round(c.rot) % 2) + 2) % 2); // 0 = upright, 1 = sideways
    const hx = quarter === 1 ? halfHFrac : halfWFrac;
    const hy = quarter === 1 ? halfWFrac : halfHFrac;
    if (lo + hx - c.dx > loX) loX = lo + hx - c.dx;
    if (hi - hx - c.dx < hiX) hiX = hi - hx - c.dx;
    if (lo + hy - c.dy > loY) loY = lo + hy - c.dy;
    if (hi - hy - c.dy < hiY) hiY = hi - hy - c.dy;
  }
  const clamp = (v: number, l: number, h: number): number =>
    l <= h ? Math.min(Math.max(v, l), h) : Math.min(Math.max(v, lo), hi);
  return { nx: clamp(seedNx, loX, hiX), ny: clamp(seedNy, loY, hiY) };
}

export interface SnapTarget {
  /** stable id for sticky tracking */
  key: string;
  /** canonical centre of the target */
  nx: number;
  ny: number;
}

/**
 * Magnetic, STICKY snap. Engages the nearest target within `snapR` and nudges the seed onto its
 * centre; once stuck (carried in `snapKey`), it HOLDS that target until the seed pulls beyond the
 * looser `breakR`, so a card "clicks in" and only releases when deliberately dragged away
 * (hysteresis — easy to seat, easy to pull out). Returns the (possibly nudged) seed and the new
 * sticky key (null when not snapped). Pure.
 */
export function snapSeed(
  seedNx: number,
  seedNy: number,
  targets: readonly SnapTarget[],
  snapKey: string | null,
  snapR: number,
  breakR: number
): { nx: number; ny: number; snapKey: string | null } {
  const d2 = (t: SnapTarget): number => (t.nx - seedNx) ** 2 + (t.ny - seedNy) ** 2;
  // Stay stuck to the current target while still inside the break radius.
  if (snapKey) {
    const cur = targets.find((t) => t.key === snapKey);
    if (cur && d2(cur) <= breakR * breakR) return { nx: cur.nx, ny: cur.ny, snapKey };
  }
  // Otherwise engage the nearest target within the (tighter) snap radius.
  let best: SnapTarget | null = null;
  let bestD = Infinity;
  for (const t of targets) {
    const d = d2(t);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (best && bestD <= snapR * snapR) return { nx: best.nx, ny: best.ny, snapKey: best.key };
  return { nx: seedNx, ny: seedNy, snapKey: null };
}
