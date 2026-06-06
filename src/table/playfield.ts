// Pure play-field geometry for the drag clamp. Kept separate from DragController so it can be
// unit-tested without a DOM. Card positions live in the canonical [0,1]² board square; this
// clamps a dragged group's seed so every card's full body stays inside that square — a card
// never hangs off an edge and never leaves the board.

export interface ClampCard {
  /** canonical offset of this card's centre from the dragged group's seed */
  dx: number;
  dy: number;
  /** cumulative quarter-turns; an odd turn presents the card sideways (w/h swap) */
  rot: number;
}

/**
 * Tightest seed (nx, ny) that keeps EVERY card's full body inside the [0,1] board square. The
 * group moves as a rigid block; each card's half-extent on each axis comes from its OWN rotation
 * (an odd quarter-turn swaps width/height, matching SlotGrid.cardZoneOverlap), so an upright card
 * can sit flush to any edge and into a corner while a sideways card is still fully contained.
 * `halfWFrac`/`halfHFrac` are half the card size as fractions of the board. If a pile is larger
 * than the board on an axis (lo > hi), the seed falls back to [0,1] on that axis. Pure —
 * negative-rotation safe.
 */
export function clampSeedToField(
  seedNx: number,
  seedNy: number,
  cards: Iterable<ClampCard>,
  halfWFrac: number,
  halfHFrac: number
): { nx: number; ny: number } {
  let loX = 0, hiX = 1, loY = 0, hiY = 1;
  for (const c of cards) {
    const quarter = (((Math.round(c.rot) % 2) + 2) % 2); // 0 = upright, 1 = sideways
    const hx = quarter === 1 ? halfHFrac : halfWFrac;
    const hy = quarter === 1 ? halfWFrac : halfHFrac;
    if (hx - c.dx > loX) loX = hx - c.dx;
    if (1 - hx - c.dx < hiX) hiX = 1 - hx - c.dx;
    if (hy - c.dy > loY) loY = hy - c.dy;
    if (1 - hy - c.dy < hiY) hiY = 1 - hy - c.dy;
  }
  const clamp = (v: number, l: number, h: number): number =>
    l <= h ? Math.min(Math.max(v, l), h) : Math.min(Math.max(v, 0), 1);
  return { nx: clamp(seedNx, loX, hiX), ny: clamp(seedNy, loY, hiY) };
}
