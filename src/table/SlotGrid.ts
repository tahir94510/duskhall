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

// How deep each edge band reaches in from its board edge. The centre square of side
// (1 - 2*depth) = 0.44 stays public for the shared deck/discard.
export const ZONE_DEPTH = 0.28;

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

// The seat whose trapezoid contains the point, or null if it is in the public centre (or in the
// off-board margin). Used for live drag-drop ownership (via Game.pointInZone -> screenToCanonical)
// and the point test. The band is the ON-BOARD strip 0 <= edgeDist < ZONE_DEPTH: a point OUTSIDE
// the board (edgeDist < 0, i.e. dragged into the page margin past an edge) is NOT a private zone,
// so cards can be placed in the off-table margins freely (only the page limits the drag).
export function seatForCanonicalPoint(nx: number, ny: number): Seat | null {
  const s = nearestSeat(nx, ny);
  const d = edgeDist(s, nx, ny);
  return d >= 0 && d < ZONE_DEPTH ? s : null;
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

// When the top two trapezoids hold shares this close, the card is straddling their shared
// diagonal and ownership is a near-tie. Pin it to the lower seat index across this narrow band
// rather than let the winner flip on sub-percent sampling jitter (the corner conceal/reveal
// FLICKER). Kept SMALL on purpose: it only needs to span the jitter right at the 50/50 line.
// A wider band would pull a card that clearly sits in one seat's own corner (e.g. 55/45) over to
// the lower-indexed neighbour — concealing/snapping-back a strip of that player's own area — so
// the band is just a hair around the exact diagonal where ownership is genuinely ambiguous.
export const OWNER_TIE_MARGIN = 0.06;

// The seat that owns the card, or null if it is effectively public. Two refinements keep this
// stable and corner-correct, while staying PURE and position-only (every client computes the
// same owner — no path-dependent memory, so a peer who joined mid-drag agrees):
//   1) Privacy is gated on the TOTAL fraction inside ANY zone (sum across all four trapezoids),
//      not the single largest — so a card straddling a corner is judged by how much of its body
//      is in-zone overall, the same boundary as along a flat edge.
//   2) When the top two trapezoids hold nearly-equal shares (a card on their shared diagonal),
//      ownership is pinned to the LOWER seat index instead of the raw argmax. The raw argmax
//      flips between the two seats on tiny position jitter, which — for a viewer who owns one of
//      them — flickered the card concealed/revealed at the corner. The dead-band makes the
//      transition a single clean crossing (one seat, then the other), never a rapid flip-flop.
export function cardZoneOwner(nx: number, ny: number, rot: number, cardWFrac: number, cardHFrac: number): Seat | null {
  const f = cardZoneFractions(nx, ny, rot, cardWFrac, cardHFrac);
  // Top two seats by overlap.
  let s0 = -1, f0 = 0, s1 = -1, f1 = 0;
  for (const s of [0, 1, 2, 3] as Seat[]) {
    if (f[s] > f0) { s1 = s0; f1 = f0; s0 = s; f0 = f[s]; }
    else if (f[s] > f1) { s1 = s; f1 = f[s]; }
  }
  const inZone = f[0] + f[1] + f[2] + f[3];
  if (s0 < 0 || inZone <= ZONE_PRIVACY_FRAC) return null;
  // Genuine corner straddle (both top zones really overlapped, and near-tied) → lower index.
  if (s1 >= 0 && f1 > 0 && f0 - f1 < OWNER_TIE_MARGIN) return Math.min(s0, s1) as Seat;
  return s0 as Seat;
}

/**
 * The fraction (0..1) of the card's footprint that lies in EACH seat's TRAPEZOID, indexed by seat.
 * The footprint is sampled on a grid and every sample classified by seatForCanonicalPoint — i.e.
 * by the actual diagonal-split trapezoid the point sits in, NOT by overlapping rectangle bands.
 * The trapezoids tile the board with no overlap, so this is ANGULARLY CORRECT at every corner and
 * edge and IDENTICAL for all four seats: a card stays "in your zone" while its body is mostly past
 * the visual diagonal, instead of being stolen by a neighbour's full-height side band the moment it
 * nears a corner (the old rectangle max-overlap bug). Rotation-aware (an odd quarter-turn swaps the
 * footprint). `nx, ny` is the card CENTRE; sizes are fractions of the board.
 */
export function cardZoneFractions(nx: number, ny: number, rot: number, cardWFrac: number, cardHFrac: number): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  const quarter = ((Math.round(rot) % 2) + 2) % 2; // 0 or 1 (odd turn swaps w/h)
  const w = quarter === 1 ? cardHFrac : cardWFrac;
  const h = quarter === 1 ? cardWFrac : cardHFrac;
  if (w <= 0 || h <= 0) return out;
  // 9x9 = 81 samples. A finer grid than the old 5x5 keeps the per-zone fractions smooth right
  // at the corner diagonals, so the owner/conceal boundary is a single clean transition as a
  // card crosses (no jagged, sample-noise flip-flop that flashed a card revealed/concealed near
  // a corner). Still trivially cheap: pure arithmetic, a few thousand ops per frame for the deck.
  const N = 9;
  for (let i = 0; i < N; i++) {
    const sx = nx + ((i + 0.5) / N - 0.5) * w;
    for (let j = 0; j < N; j++) {
      const sy = ny + ((j + 0.5) / N - 0.5) * h;
      const s = seatForCanonicalPoint(sx, sy);
      if (s !== null) out[s]++;
    }
  }
  const total = N * N;
  out[0] /= total; out[1] /= total; out[2] /= total; out[3] /= total;
  return out;
}

/**
 * The seat whose TRAPEZOID the card's footprint overlaps MOST, and that overlap as a fraction of
 * the card's area (0..1), or null if the card is in no zone at all (the public centre or off-board).
 * Reports only the single largest zone; cardZoneOwner is the canonical owner test and gates privacy
 * on the TOTAL in-zone fraction (so it is corner-correct). This helper is kept for diagnostics/tests.
 */
export function cardZoneOverlap(nx: number, ny: number, rot: number, cardWFrac: number, cardHFrac: number): { seat: Seat; frac: number } | null {
  const f = cardZoneFractions(nx, ny, rot, cardWFrac, cardHFrac);
  let best: { seat: Seat; frac: number } | null = null;
  for (const s of [0, 1, 2, 3] as Seat[]) {
    // Strictly-greater keeps the lower seat index on an exact corner tie (deterministic for all).
    if (f[s] > 0 && (!best || f[s] > best.frac)) best = { seat: s, frac: f[s] };
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
