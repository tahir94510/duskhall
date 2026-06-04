// Slot positions inside each player's tableau zone.
// 4 Seal slots in front, then a small gap, then 3 Servant slots behind them
// (relative to the seat). Pure geometry, drag controller uses these for
// magnetic snap; CSS draws the matching outlines.

import type { Seat } from "./rotation.js";

export type SlotKind = "seal" | "servant";

export interface SlotPos {
  seat: Seat;
  kind: SlotKind;
  /** index within its row (0-based) */
  index: number;
  /** canonical normalised position of slot centre */
  nx: number;
  ny: number;
}

const SEAL_COUNT = 4;
const SERVANT_COUNT = 3;

// Each zone occupies a fixed rectangle in canonical space. These were chosen to
// match the .table CSS grid: bottom strip ~22vh, top strip ~18vh, side strips
// ~17vw. We approximate the same rectangles in normalised board coords.
//
// Seat 0 (bottom): y in [0.78, 0.96], x in [0.10, 0.90]
// Seat 1 (top):    y in [0.04, 0.22], x in [0.10, 0.90]
// Seat 2 (left):   x in [0.04, 0.22], y in [0.20, 0.80]
// Seat 3 (right):  x in [0.78, 0.96], y in [0.20, 0.80]

interface ZoneRect {
  // canonical normalised rect
  x0: number; y0: number; x1: number; y1: number;
  // orientation: which axis the row runs along (horizontal or vertical)
  horizontal: boolean;
  // direction: which side is "in front" (closer to the centre)
  // For bottom seat, seals are on the inner edge (y near 0.78)
  // For left seat, seals are on the inner edge (x near 0.22), etc.
}

// Each seat's private zone runs all the way to its board EDGE (0 or 1 on the outer
// side), matching the drawn strip, so a card resting at the very edge of a player's area
// still counts as inside it (it was wrongly treated as public when the rect stopped a few
// percent short of the edge). The inner side is the privacy boundary toward the centre.
const ZONES: Record<Seat, ZoneRect> = {
  0: { x0: 0.16, y0: 0.78, x1: 0.84, y1: 1.0, horizontal: true },
  1: { x0: 0.16, y0: 0.0, x1: 0.84, y1: 0.22, horizontal: true },
  2: { x0: 0.0, y0: 0.22, x1: 0.22, y1: 0.78, horizontal: false },
  3: { x0: 0.78, y0: 0.22, x1: 1.0, y1: 0.78, horizontal: false }
};

// Is a canonical [0,1] point inside a seat's zone rectangle? Canonical (board-
// shared) space, so it is correct for every viewer regardless of board rotation —
// unlike the viewport-pixel zone hit test. Used to claim ownership when a player
// flips / rotates / gathers / shuffles a card that is sitting in their own zone,
// matching what a drag-drop into the zone already does.
export function pointInZoneCanonical(seat: Seat, nx: number, ny: number): boolean {
  const z = ZONES[seat];
  return nx >= z.x0 && nx <= z.x1 && ny >= z.y0 && ny <= z.y1;
}

/** A seat's private-zone rectangle in canonical [0,1] coords (shared across viewers). */
export function zoneRect(seat: Seat): { x0: number; y0: number; x1: number; y1: number } {
  const z = ZONES[seat];
  return { x0: z.x0, y0: z.y0, x1: z.x1, y1: z.y1 };
}

// Privacy-first overlap threshold: a card counts as inside a seat's private zone (so
// it is concealed from, and untouchable by, everyone else) as soon as this fraction of
// its area is in, even a sliver poking in from ANY side. It only becomes public again
// once it is almost fully out (less than this is left in). Low on purpose: a card a
// player nudges anywhere near their own area must never flash to the table.
export const ZONE_PRIVACY_FRAC = 0.1;

// Canonical card footprint as a FIXED fraction of the board, shared by every client.
// The rendered card size (--card-w: clamp(58px,7.6vmin,126px)) is a different fraction of
// the board on each device/viewport, so deriving the overlap from measured pixels made
// two players on different screen sizes disagree on whether a card is "in" a zone (a card
// dragged out could stay concealed on one view). Using these fixed canonical dimensions
// makes the conceal/reveal boundary identical for everyone, on every device, from every
// side. Tuned to roughly match the typical rendered card fraction. Keep in one place.
export const CARD_CANON_W = 0.085;
export const CARD_CANON_H = 0.125;

export function cardZoneOwner(nx: number, ny: number, rot: number, cardWFrac: number, cardHFrac: number): Seat | null {
  const o = cardZoneOverlap(nx, ny, rot, cardWFrac, cardHFrac);
  return o && o.frac > ZONE_PRIVACY_FRAC ? o.seat : null;
}

/**
 * The seat whose private zone overlaps the card the MOST, with that overlap as a
 * fraction of the card's area (0..1), or null if no zone is touched. cardZoneOwner gates
 * this at ZONE_PRIVACY_FRAC (eager hide, late reveal). `nx, ny` is the card CENTRE
 * fraction; `cardWFrac, cardHFrac` are the card's size as fractions of the board.
 * Rotation-aware (an odd quarter-turn swaps the footprint). Zones never overlap, so the
 * single best match is unambiguous.
 */
export function cardZoneOverlap(nx: number, ny: number, rot: number, cardWFrac: number, cardHFrac: number): { seat: Seat; frac: number } | null {
  const quarter = ((Math.round(rot) % 2) + 2) % 2; // 0 or 1 (odd turn swaps w/h)
  const w = quarter === 1 ? cardHFrac : cardWFrac;
  const h = quarter === 1 ? cardWFrac : cardHFrac;
  const area = w * h;
  if (area <= 0) return null;
  const cx0 = nx - w / 2, cy0 = ny - h / 2, cx1 = nx + w / 2, cy1 = ny + h / 2;
  let best: { seat: Seat; frac: number } | null = null;
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    const z = ZONES[seat];
    const ix = Math.min(cx1, z.x1) - Math.max(cx0, z.x0);
    const iy = Math.min(cy1, z.y1) - Math.max(cy0, z.y0);
    if (ix <= 0 || iy <= 0) continue;
    const frac = (ix * iy) / area;
    if (!best || frac > best.frac) best = { seat, frac };
  }
  return best;
}

const ROW_GAP = 0.018; // gap between the two rows (Seal row vs Servant row), in canonical units

// v3.2: per-seat slot grid is intentionally empty. The visual was cluttering
// the table and the snap-to-slot magnetism is now reserved for the central
// Deck / Discard dock (see Game.applySnap). Returning [] for every seat keeps
// every consumer working without rendering slot outlines.
export function slotsForSeat(_seat: Seat): SlotPos[] { return []; }

// Legacy implementation preserved below for the day per-seat slots come back.
// @ts-expect-error kept intentionally unused for future revival
function _legacySlotsForSeat(seat: Seat): SlotPos[] {
  const rect = ZONES[seat];
  const out: SlotPos[] = [];
  const longSide = rect.horizontal ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
  const shortSide = rect.horizontal ? rect.y1 - rect.y0 : rect.x1 - rect.x0;
  const halfRow = (shortSide - ROW_GAP) / 2;

  for (let k = 0; k < 2; k++) {
    const kind: SlotKind = k === 0 ? "seal" : "servant";
    const count = kind === "seal" ? SEAL_COUNT : SERVANT_COUNT;
    for (let i = 0; i < count; i++) {
      // even spacing along the long side
      const t = (i + 0.5) / count;
      const longPos = rect.horizontal ? rect.x0 + t * longSide : rect.y0 + t * longSide;
      // distance from inner edge: seal row sits closer to centre
      const innerOffset = k * (halfRow + ROW_GAP) + halfRow / 2;
      let nx = 0;
      let ny = 0;
      if (rect.horizontal) {
        nx = longPos;
        // seat 0: inner edge is y0 (top of bottom zone). Move "outward" (away from centre) by innerOffset.
        // seat 1: inner edge is y1 (bottom of top zone). Move outward (upward) by innerOffset.
        if (seat === 0) ny = rect.y0 + innerOffset;
        else ny = rect.y1 - innerOffset;
      } else {
        ny = longPos;
        if (seat === 2) nx = rect.x0 + innerOffset;
        else nx = rect.x1 - innerOffset;
      }
      out.push({ seat, kind, index: i, nx, ny });
    }
  }
  return out;
}

export function allSlots(): SlotPos[] {
  const out: SlotPos[] = [];
  for (const s of [0, 1, 2, 3] as Seat[]) out.push(...slotsForSeat(s));
  return out;
}

/**
 * Snap radius in canonical-space squared distance. Card-w as fraction of board ≈ 0.08,
 * so snap kicks in within ~0.4 card-widths (~3 % of board) and breaks at ~0.6 card-widths.
 */
const SNAP_RADIUS = 0.035;
const BREAK_RADIUS = 0.06;

export function findNearestSlot(slots: SlotPos[], nx: number, ny: number, ownerSeat: Seat | null): { slot: SlotPos; dist: number } | null {
  let best: { slot: SlotPos; dist: number } | null = null;
  for (const s of slots) {
    if (ownerSeat !== null && s.seat !== ownerSeat) continue;
    const dx = s.nx - nx;
    const dy = s.ny - ny;
    const d = Math.hypot(dx, dy);
    if (!best || d < best.dist) best = { slot: s, dist: d };
  }
  return best;
}

export { SNAP_RADIUS, BREAK_RADIUS };
