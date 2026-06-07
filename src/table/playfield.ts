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

// A dragged card reduced to the seat's (depth, lateral) frame: its offset from the seed and the
// half-extents that set how far its BODY must clear each wall. Built once per drag-move.
interface ZoneCard { od: number; ou: number; hd: number; inset: number; }

// Map a canonical offset (dx, dy) from the seed into the seat's (depth, lateral) axes. Mirrors
// seatDepthLateral's per-seat axis/sign choice (SlotGrid.ts) so card and seed share one frame.
function offsetToDepthLateral(seat: Seat, dx: number, dy: number): { od: number; ou: number } {
  switch (seat) {
    case 0: return { od: -dy, ou: dx };
    case 1: return { od: dy, ou: dx };
    case 2: return { od: dx, ou: dy };
    case 3: return { od: -dx, ou: dy };
  }
}

// Inverse of seatDepthLateral for the SEED point: (depth, lateral) -> canonical (nx, ny).
function depthLateralToSeed(seat: Seat, d: number, u: number): { nx: number; ny: number } {
  switch (seat) {
    case 0: return { nx: u, ny: 1 - d };
    case 1: return { nx: u, ny: d };
    case 2: return { nx: d, ny: u };
    case 3: return { nx: 1 - d, ny: u };
  }
}

function zoneCardsOf(cards: ClampCard[], seat: Seat, cardWFrac: number, cardHFrac: number): ZoneCard[] {
  const depthIsY = seatDepthIsY(seat);
  return cards.map((c) => {
    const { od, ou } = offsetToDepthLateral(seat, c.dx, c.dy);
    const quarter = ((Math.round(c.rot) % 2) + 2) % 2; // an odd turn swaps the footprint
    const wx = quarter === 1 ? cardHFrac : cardWFrac;
    const wy = quarter === 1 ? cardWFrac : cardHFrac;
    const hd = (depthIsY ? wy : wx) / 2; // half-extent along the depth axis
    const hu = (depthIsY ? wx : wy) / 2; // half-extent along the lateral axis
    return { od, ou, hd, inset: hd + hu };
  });
}

/**
 * Confine the dragged group to the local player's OWN private zone as a one-way pocket whose only
 * opening is the FRONT DOOR (the inner edge toward the table centre). It must feel FRICTIONLESS:
 * a card that hits the outer edge or a diagonal leg keeps moving — it SLIDES along the wall/corner
 * (never locks), and the only way out is the door (so a card can never teleport out a side).
 *
 * How: the pocket is the convex trapezoid (outer edge, door "ceiling" at ZONE_DEPTH, two 45° legs).
 *  - The constraint only applies once the whole group is FULLY inside (`inPocket(prev)`); while a
 *    card is entering, in the centre, over a rival, or in the page margin it moves completely freely
 *    ("not counted inside until fully in").
 *  - If the destination leaves cleanly through the door (`exitsThroughDoor`) it passes unchanged.
 *  - Otherwise the destination is PROJECTED onto the trapezoid (closest feasible point), which keeps
 *    the tangential component → the card slides along the wall instead of freezing, and the door
 *    ceiling keeps a non-door move inside, so a diagonal exit is impossible.
 * Pure, canonical, footprint-based, group-aware (every card's body is kept inside). Spectator: no-op.
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
  const zc = zoneCardsOf(Array.from(cards), seat, cardWFrac, cardHFrac);

  // Whole group resting FULLY inside the pocket: every card in the band [hd, ZONE_DEPTH] and within
  // both diagonal legs. Only then do the walls apply.
  const inPocket = (d: number, u: number): boolean => {
    for (const c of zc) {
      const cd = d + c.od;
      if (cd < c.hd || cd > ZONE_DEPTH) return false;
      const cu = u + c.ou;
      if (cu - cd < c.inset) return false;
      if (cu + cd > 1 - c.inset) return false;
    }
    return true;
  };
  // Leaving through the FRONT DOOR: every card past the inner edge AND within the door's lateral
  // opening (the funnel width at the door). The ONLY exit — a destination aimed past a side/outer
  // wall fails this and is clamped (slid) instead, so a card can never slip/teleport out a diagonal.
  const exitsThroughDoor = (d: number, u: number): boolean => {
    for (const c of zc) {
      if (d + c.od <= ZONE_DEPTH) return false;
      const cu = u + c.ou;
      if (cu < ZONE_DEPTH + c.inset || cu > 1 - ZONE_DEPTH - c.inset) return false;
    }
    return true;
  };
  // Project a point onto the convex pocket (outer edge, door ceiling, two legs) by cycling the
  // half-plane projections. The closest feasible point preserves tangential motion, so the card
  // SLIDES along a wall/corner rather than locking.
  const project = (d0: number, u0: number): { d: number; u: number } => {
    let d = d0, u = u0;
    for (let i = 0; i < 8; i++) {
      for (const c of zc) {
        let cd = d + c.od;
        if (cd < c.hd) { d = c.hd - c.od; cd = c.hd; }                   // outer board edge
        if (cd > ZONE_DEPTH) { d = ZONE_DEPTH - c.od; cd = ZONE_DEPTH; } // door ceiling
        const a = (u + c.ou) - cd;                                       // left leg: u - d >= inset
        if (a < c.inset) { const t = (c.inset - a) / 2; d -= t; u += t; }
        const b = (u + c.ou) + (d + c.od);                              // right leg: u + d <= 1 - inset
        if (b > 1 - c.inset) { const t = (b - (1 - c.inset)) / 2; d -= t; u -= t; }
      }
    }
    return { d, u };
  };

  const p = seatDepthLateral(seat, prev.nx, prev.ny);
  if (!inPocket(p.d, p.u)) return { nx: next.nx, ny: next.ny };       // outside / entering -> free
  const n = seatDepthLateral(seat, next.nx, next.ny);
  if (exitsThroughDoor(n.d, n.u)) return { nx: next.nx, ny: next.ny }; // leaving via the door -> free
  const { d, u } = project(n.d, n.u);
  return depthLateralToSeed(seat, d, u);
}
