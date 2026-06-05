// Slot positions inside each player's tableau zone.
// 4 Seal slots in front, then a small gap, then 3 Servant slots behind them
// (relative to the seat). Pure geometry, drag controller uses these for
// magnetic snap; CSS draws the matching outlines.

import type { Seat } from "./rotation.js";
import { APRON_FRAC } from "./constants.js";

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

// The four zones are full-width EDGE BANDS, ZONE_DEPTH (0.28) deep, that meet along the two
// board diagonals so each seat owns a TRAPEZOID: the seat's whole board edge (wide) tapering
// to the 0.44 inner edge, with the four corners split evenly between the two seats that share
// them. This is the symmetric you/opponent/left/right table the design doc describes (full
// D4 symmetry, each trapezoid the next rotated 90deg about the centre, so after a seat's board
// rotation every player sees an IDENTICAL hand area), but each hand area is now nearly the
// full board edge wide and about 64% larger in area than a centre-only strip, so a player
// reads their whole hand at a glance. Ownership is resolved by the NEAREST board edge to the
// card centre (the diagonal split), gated to ZONE_DEPTH so the centre 0.44 x 0.44 stays public
// for the shared deck/discard. The drawn panels (zones.css) are clipped to the same trapezoids,
// so what looks private IS private.
//
// Seat 0 (bottom): nearest the y=1 edge, within 0.28; widest at y=1, tapering to x in [0.28,0.72]
// Seat 1 (top):    nearest the y=0 edge
// Seat 2 (left):   nearest the x=0 edge
// Seat 3 (right):  nearest the x=1 edge
// The corners belong to whichever of the two adjacent edges is closer (a 45deg diagonal split).

interface ZoneRect {
  // canonical normalised rect
  x0: number; y0: number; x1: number; y1: number;
  // orientation: which axis the row runs along (horizontal or vertical)
  horizontal: boolean;
  // direction: which side is "in front" (closer to the centre)
  // For bottom seat, seals are on the inner edge (y near 0.72)
  // For left seat, seals are on the inner edge (x near 0.28), etc.
}

// How deep each edge band (private hand zone) reaches in from its board edge. The centre
// square of side (1 - 2*depth) = 0.64 stays public, holding the shared deck/discard AND a
// one-card-tall tableau shelf in front of each player (where face-up Seals/Servants are laid
// out, overlapping). 0.18 keeps the hand a full-edge trapezoid while leaving room for that
// shelf to clear the deck/discard on every edge; ZONES, the CSS grid tracks and the trapezoid
// clip-paths all key off this value.
export const ZONE_DEPTH = 0.18;

// The full-width edge band for each seat (the trapezoid's bounding rectangle). These OVERLAP
// at the corners by design; the diagonal split between adjacent seats is resolved by
// nearestSeat (the card centre's closest board edge), and the drawn panel is clipped to the
// matching trapezoid in zones.css. zoneRect exposes these bounding bands.
const ZONES: Record<Seat, ZoneRect> = {
  0: { x0: 0.0, y0: 1 - ZONE_DEPTH, x1: 1.0, y1: 1.0, horizontal: true },
  1: { x0: 0.0, y0: 0.0, x1: 1.0, y1: ZONE_DEPTH, horizontal: true },
  2: { x0: 0.0, y0: 0.0, x1: ZONE_DEPTH, y1: 1.0, horizontal: false },
  3: { x0: 1 - ZONE_DEPTH, y0: 0.0, x1: 1.0, y1: 1.0, horizontal: false }
};

// Perpendicular distance from a canonical point to a seat's own board edge.
function edgeDist(seat: Seat, nx: number, ny: number): number {
  switch (seat) {
    case 0: return 1 - ny; // bottom edge y=1
    case 1: return ny;     // top edge y=0
    case 2: return nx;     // left edge x=0
    case 3: return 1 - nx; // right edge x=1
  }
}

// The seat whose board EDGE is closest to (nx, ny). This is the diagonal corner split: a
// point in a corner belongs to whichever of the two adjacent edges it is nearer. Ties (a
// point exactly on a diagonal, measure zero) break by seat order, deterministically for every
// client.
function nearestSeat(nx: number, ny: number): Seat {
  let best: Seat = 0;
  for (const s of [1, 2, 3] as Seat[]) if (edgeDist(s, nx, ny) < edgeDist(best, nx, ny)) best = s;
  return best;
}

// The seat whose trapezoid contains the point, or null if it is in the public centre. Used
// for live drag-drop ownership (via Game.pointInZone -> screenToCanonical) and the point test.
export function seatForCanonicalPoint(nx: number, ny: number): Seat | null {
  const s = nearestSeat(nx, ny);
  return edgeDist(s, nx, ny) < ZONE_DEPTH ? s : null;
}

// Is a canonical [0,1] point inside a seat's trapezoid? Canonical (board-shared) space, so it
// is correct for every viewer regardless of board rotation — unlike a viewport-pixel zone box,
// which on the trapezoids would overlap at the corners. Used by Game.pointInZone (live drag),
// and to claim ownership when a player flips / rotates / gathers / shuffles a card sitting in
// their own zone, matching what a drag-drop into the zone already does.
export function pointInZoneCanonical(seat: Seat, nx: number, ny: number): boolean {
  return seatForCanonicalPoint(nx, ny) === seat;
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
// The rendered card size (--card-w, board.css) is a different fraction of the board on
// each device/viewport, so deriving the overlap from measured pixels made two players on
// different screen sizes disagree on whether a card is "in" a zone (a card dragged out
// could stay concealed on one view). Using these fixed canonical dimensions makes the
// conceal/reveal boundary IDENTICAL for everyone, on every device, from every side.
// Tuned to match the typical rendered card fraction (the .table base card is 0.125·field
// wide, 1.45× tall) so the privacy boundary tracks the VISIBLE card: a card reads as
// private right as it visually enters your zone, and public as it visually leaves — the
// same for the actor and every onlooker. Keep this in step with board.css --card-w.
export const CARD_CANON_W = 0.125;
export const CARD_CANON_H = 0.181;

export function cardZoneOwner(nx: number, ny: number, rot: number, cardWFrac: number, cardHFrac: number): Seat | null {
  const o = cardZoneOverlap(nx, ny, rot, cardWFrac, cardHFrac);
  return o && o.frac > ZONE_PRIVACY_FRAC ? o.seat : null;
}

/**
 * The seat that owns the card and how far it has entered that seat's zone, as a fraction of
 * the card's area (0..1), or null if the card is in the public centre. cardZoneOwner gates
 * this at ZONE_PRIVACY_FRAC (eager hide, late reveal). `nx, ny` is the card CENTRE fraction;
 * `cardWFrac, cardHFrac` are the card's size as fractions of the board. The owner is the seat
 * whose board edge is nearest the card centre (the diagonal corner split), so a card straddling
 * a corner belongs to one player unambiguously; the fraction is then how much of the card's
 * footprint has crossed into that seat's full-width edge band. Rotation-aware (an odd
 * quarter-turn swaps the footprint).
 */
export function cardZoneOverlap(nx: number, ny: number, rot: number, cardWFrac: number, cardHFrac: number): { seat: Seat; frac: number } | null {
  const quarter = ((Math.round(rot) % 2) + 2) % 2; // 0 or 1 (odd turn swaps w/h)
  const w = quarter === 1 ? cardHFrac : cardWFrac;
  const h = quarter === 1 ? cardWFrac : cardHFrac;
  const area = w * h;
  if (area <= 0) return null;
  const seat = nearestSeat(nx, ny);
  const z = ZONES[seat];
  const cx0 = nx - w / 2, cy0 = ny - h / 2, cx1 = nx + w / 2, cy1 = ny + h / 2;
  const ix = Math.min(cx1, z.x1) - Math.max(cx0, z.x0);
  const iy = Math.min(cy1, z.y1) - Math.max(cy0, z.y0);
  if (ix <= 0 || iy <= 0) return null;
  return { seat, frac: (ix * iy) / area };
}

// Spacing between adjacent ledge slots, along the seat's edge, in canonical units. A touch over
// one card width (CARD_CANON_W 0.125) so the 4 Seals + 3 Servants sit shoulder-to-shoulder in a
// single tidy row without overlapping.
const LEDGE_STEP = 0.128;

// Per-seat tableau slots: 4 Seal + 3 Servant positions laid in ONE row across that seat's
// off-board ledge apron, just OUTSIDE the seat's own board edge (canonical coords beyond [0,1],
// at the apron centre line APRON_FRAC/2 out). Because the ledge lives in the rotating board
// layer, every viewer sees their OWN ledge as a horizontal row in front of them and rivals'
// ledges around the table — fully symmetric. Used for the snap targets (Game.applySnap) and the
// drawn slot outlines (Board.paintSlotGrid). Seals fill the first SEAL_COUNT positions, Servants
// the rest, so the face-up tableau reads left-to-right as Seals then Servants in each own view.
export function slotsForSeat(seat: Seat): SlotPos[] {
  const total = SEAL_COUNT + SERVANT_COUNT; // 7
  const mid = 1 + APRON_FRAC / 2; // apron centre line just past the [0,1] edge
  const out: SlotPos[] = [];
  for (let i = 0; i < total; i++) {
    // Even, centred spread along the seat's edge.
    const along = 0.5 + (i - (total - 1) / 2) * LEDGE_STEP;
    const kind: SlotKind = i < SEAL_COUNT ? "seal" : "servant";
    const index = i < SEAL_COUNT ? i : i - SEAL_COUNT;
    let nx = 0;
    let ny = 0;
    switch (seat) {
      case 0: nx = along; ny = mid; break;       // bottom apron: y just past 1
      case 1: nx = along; ny = 1 - mid; break;   // top apron: y just past 0 (= -APRON_FRAC/2)
      case 2: nx = 1 - mid; ny = along; break;   // left apron: x just past 0
      case 3: nx = mid; ny = along; break;       // right apron: x just past 1
    }
    out.push({ seat, kind, index, nx, ny });
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
