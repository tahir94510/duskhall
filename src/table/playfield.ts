// Pure play-field geometry for the drag clamp. Kept separate from DragController so it can be
// unit-tested without a DOM. Cards live in the canonical [0,1]² board square, but the board is
// a centered square that is usually smaller than the page on its long axis. The clamp keeps a
// dragged card on the PAGE (viewport), NOT on the board: a card may be dragged off the board
// into the surrounding margin, but never off-screen. This is done in screen-pixel space so it is
// exact on every device and aspect ratio, and for every seat rotation.

import { canonicalToScreen, screenToCanonical, seatRotationDeg, rotateVec, type Seat, type BoardBox } from "./rotation.js";
import { seatDepthLateral, seatDepthIsY, ZONE_DEPTH } from "./SlotGrid.js";

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

/** A canonical seed position (the dragged group's reference point). */
export interface SeedPos { nx: number; ny: number; }

// Is a single card's footprint OUTSIDE the seat's own trapezoid, i.e. has it crossed one of
// the three solid walls (the outer board edge or either diagonal leg)? The card is taken as an
// axis-aligned box in the seat's (depth, lateral) frame (true since the board is square), so its
// nearest corner must clear each wall by the half-extents. The DOOR (depth past ZONE_DEPTH,
// toward the centre) is never a wall, so a card heading into the public centre is always free.
function cardOutsideOwnZone(
  cx: number, cy: number, rot: number, seat: Seat, cardWFrac: number, cardHFrac: number
): boolean {
  const { d, u } = seatDepthLateral(seat, cx, cy);
  // Canonical footprint swaps on an odd card quarter-turn, exactly like cardZoneOverlap.
  const quarter = ((Math.round(rot) % 2) + 2) % 2;
  const wx = quarter === 1 ? cardHFrac : cardWFrac; // extent along canonical X
  const wy = quarter === 1 ? cardWFrac : cardHFrac; // extent along canonical Y
  const depthIsY = seatDepthIsY(seat);
  const hd = (depthIsY ? wy : wx) / 2; // half-extent along the depth axis
  const hu = (depthIsY ? wx : wy) / 2; // half-extent along the lateral axis
  // Outer wall: the card's near edge cannot pass the board edge (d = 0).
  if (d < hd) return true;
  // Diagonal legs exist only within the band [0, ZONE_DEPTH]; past the door it is open.
  if (d <= ZONE_DEPTH) {
    const inset = hu + hd; // nearest box corner to a 45° leg
    if (u - d < inset) return true;       // left leg (u = d)
    if (1 - d - u < inset) return true;   // right leg (u = 1 - d)
  }
  return false;
}

/**
 * Confine the dragged group to the local player's OWN private zone as a one-way pocket: the
 * three solid walls (outer board edge + the two diagonal legs) may be crossed INWARD from
 * anywhere, but never OUTWARD — the only way out is the front door (the inner edge toward the
 * table centre). Pure, canonical, footprint-based (the card BODY stops at the frame), and applied
 * to the whole group as a rigid block (the tightest card binds, like clampSeedToPage).
 *
 * Implementation: a group position is "outside" if ANY card's footprint has crossed a wall. If
 * the new seed is inside (or heading into the centre) it passes unchanged, so a card can be
 * pushed in from any side. If it would cross a wall outward (prev inside, next outside) we
 * binary-search the furthest still-inside point on the prev→next segment and stop there. If the
 * group is already outside it is never trapped (it can keep leaving / re-enter freely). For a
 * spectator (no seat) it is a no-op.
 */
export function clampSeedToOwnZone(
  prev: SeedPos,
  next: SeedPos,
  cards: Iterable<ClampCard>,
  seat: Seat,
  cardWFrac: number,
  cardHFrac: number
): { nx: number; ny: number } {
  if (seat < 0) return { nx: next.nx, ny: next.ny };
  const arr = Array.from(cards);
  const forbidden = (sx: number, sy: number): boolean => {
    for (const c of arr) {
      if (cardOutsideOwnZone(sx + c.dx, sy + c.dy, c.rot, seat, cardWFrac, cardHFrac)) return true;
    }
    return false;
  };
  // Is the WHOLE group resting INSIDE the pocket right now — in the band (every card on the pocket
  // side of the door) and past none of the walls? ONLY then do the pocket walls apply. A card in
  // the open centre, over a rival's area, out in the page margin, or entering from outside is
  // completely unconstrained. (The earlier version keyed off "not forbidden", which treats the open
  // centre as inside — so a card entering from the front-sides or dragged across a rival's zone got
  // snagged on the diagonal wall and froze. That was the reported regression.)
  const inPocket = (sx: number, sy: number): boolean => {
    for (const c of arr) {
      const { d } = seatDepthLateral(seat, sx + c.dx, sy + c.dy);
      if (d > ZONE_DEPTH) return false; // past the door, into the public centre
      if (cardOutsideOwnZone(sx + c.dx, sy + c.dy, c.rot, seat, cardWFrac, cardHFrac)) return false;
    }
    return true;
  };
  // Not in our pocket -> never constrained: move (and enter from any side) freely.
  if (!inPocket(prev.nx, prev.ny)) return { nx: next.nx, ny: next.ny };
  // In the pocket: free to stay inside or leave through the front door (the centre); only blocked
  // from crossing the outer board edge or a diagonal leg outward.
  if (!forbidden(next.nx, next.ny)) return { nx: next.nx, ny: next.ny };
  // Crossing a wall outward: stop at the furthest point that keeps every card inside.
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const mx = prev.nx + (next.nx - prev.nx) * mid;
    const my = prev.ny + (next.ny - prev.ny) * mid;
    if (forbidden(mx, my)) hi = mid; else lo = mid;
  }
  return { nx: prev.nx + (next.nx - prev.nx) * lo, ny: prev.ny + (next.ny - prev.ny) * lo };
}
