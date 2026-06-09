// Tidy a player's own hidden-zone cards into a clean, deck-like layout: identical cards
// collected into one stack, stacks grouped by category, the whole set centred inside the
// seat's trapezoid and never spilling into a neighbour's area — for any card count.
//
// PURE and DOM-free, on purpose: every placement is computed in canonical [0,1] board space
// from the FIXED card footprint (CARD_CANON_W/H), the same frame the privacy system uses, so
// the result is identical for every viewer/device and unit-testable in node (no measured
// pixels, no live board). Game.ts applies the returned targets to state and lets the normal
// patch + CSS transition animate the slide for the actor and every peer alike.

import type { CardState } from "./types.js";
import type { Seat } from "./rotation.js";
import { nearestCongruentRot } from "./StackOps.js";
import { CARD_CANON_W, CARD_CANON_H, ZONE_DEPTH } from "./SlotGrid.js";
import { CARD_DEFS, type CardCategory } from "../game/cards.js";

export interface ArrangeTarget {
  id: string;
  x: number;
  y: number;
  /** RELATIVE z (0,1,2,…) in final stacking order. The caller rebases onto board topZ so the
   *  arranged set rests on top of everything else (mirrors gatherStack). */
  z: number;
  rot: number;
}

export interface ArrangeOpts {
  /** The rot value that reads upright for the acting viewer (Game.viewerUprightRot). Every card
   *  squares to the congruent angle nearest its own rot, so nothing spins a stray full turn. */
  uprightRot: number;
  /** Canonical card footprint; defaults to the shared CARD_CANON_W/H. */
  cardW?: number;
  cardH?: number;
}

// Category display order: Seals first, then Spells, Interventions, Servants — the order the
// design lists them (and CARD_DEFS is authored in). Stacks are grouped by this so same-type
// piles sit together and read as a tidy hand.
const CATEGORY_RANK: Record<CardCategory, number> = {
  seal: 0,
  spell: 1,
  intervention: 2,
  servant: 3
};

// defId -> category and -> authoring index, derived once from the catalogue. The authoring
// index gives a stable, designer-meaningful order WITHIN a category (not alphabetical), so the
// layout is deterministic and reads the same every time.
const DEF_CATEGORY = new Map<string, CardCategory>();
const DEF_INDEX = new Map<string, number>();
CARD_DEFS.forEach((d, i) => { DEF_CATEGORY.set(d.id, d.category); DEF_INDEX.set(d.id, i); });

// Layout tuning, all in canonical board units. Kept here as named constants so the geometry is
// easy to reason about and re-tune without hunting through the math.
const MARGIN = 0.012;          // breathing room kept clear of every zone boundary
const PILE_GAP = 0.02;         // gap between adjacent stacks of the same category
const CATEGORY_GAP = 0.03;     // extra gap inserted where the category changes, so groups read
const TWO_ROW_THRESHOLD = 8;   // above this many stacks, split into two depth-staggered rows

// Map a point in the seat's LOCAL frame — u along the player's board edge (0 = centre line,
// + = the player's right), d the depth inward from that edge — to canonical [0,1]. The four
// cases are the single source of truth for "where does this seat's zone live", mirroring the
// trapezoid bands in SlotGrid. Pure axis swap/flip; no rotation needed because every card is
// laid upright in this local frame and squared to uprightRot.
export function localToCanonical(seat: Seat, u: number, d: number): { nx: number; ny: number } {
  switch (seat) {
    case 0: return { nx: 0.5 + u, ny: 1 - d }; // bottom edge (y=1)
    case 1: return { nx: 0.5 - u, ny: d };     // top edge (y=0)
    case 2: return { nx: d, ny: 0.5 - u };     // left edge (x=0)
    case 3: return { nx: 1 - d, ny: 0.5 + u }; // right edge (x=1)
  }
}

// The largest along-edge offset (centre of a card) that keeps the WHOLE upright footprint inside
// the seat's trapezoid at depth `d`. The trapezoid narrows toward the centre along a 45° diagonal:
// at depth d' the seat owns offsets |u| <= 0.5 - d'. The owned width SHRINKS with depth, so the
// binding corner is the card's DEEPEST edge (d + H/2, nearest the inner point); requiring
// |u| + W/2 <= 0.5 - (d + H/2) for that corner gives this bound, minus a margin.
function uMaxAtDepth(d: number, w: number, h: number): number {
  return Math.max(0, 0.5 - d - h / 2 - w / 2 - MARGIN);
}

interface Pile { defId: string; ids: string[]; }

// Collect identical cards (same defId) into one stack, then order the stacks by category and
// authoring index. Within a stack, members keep their relative depth (current z, then id) so a
// tidy never needlessly reshuffles which copy sits on top.
function buildPiles(cards: CardState[]): Pile[] {
  const groups = new Map<string, CardState[]>();
  for (const c of cards) {
    const arr = groups.get(c.defId);
    if (arr) arr.push(c); else groups.set(c.defId, [c]);
  }
  const piles: Pile[] = [];
  for (const [defId, members] of groups) {
    members.sort((a, b) => (a.z - b.z) || a.id.localeCompare(b.id));
    piles.push({ defId, ids: members.map((m) => m.id) });
  }
  const rank = (defId: string): number => {
    const cat = DEF_CATEGORY.get(defId);
    return cat ? CATEGORY_RANK[cat] : 99; // unknown defs sort to the end, deterministically
  };
  const idx = (defId: string): number => DEF_INDEX.get(defId) ?? Number.MAX_SAFE_INTEGER;
  piles.sort((a, b) =>
    (rank(a.defId) - rank(b.defId)) ||
    (idx(a.defId) - idx(b.defId)) ||
    a.defId.localeCompare(b.defId));
  return piles;
}

// Even-ish along-edge offsets for one row of stacks: a slightly wider gap where the category
// changes (so groups read), the whole row centred on u=0, then uniformly compressed if it would
// otherwise overshoot uMax — so any count fits inside the zone, fanning tighter as it grows.
function rowOffsets(piles: Pile[], uMax: number, w: number): number[] {
  const n = piles.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  // Cumulative centres from a left anchor at 0, with a category-change bonus between stacks.
  const centres: number[] = [0];
  for (let i = 1; i < n; i++) {
    const changed = DEF_CATEGORY.get(piles[i]!.defId) !== DEF_CATEGORY.get(piles[i - 1]!.defId);
    centres.push(centres[i - 1]! + w + PILE_GAP + (changed ? CATEGORY_GAP : 0));
  }
  // Centre the row about u=0.
  const span = centres[n - 1]!;
  const half = span / 2;
  let offs = centres.map((c) => c - half);
  // Compress uniformly if the outermost centre would push a footprint past the safe bound.
  if (half > uMax) {
    const scale = uMax / half;
    offs = offs.map((o) => o * scale);
  }
  return offs;
}

// Lay one row of stacks at a fixed depth, emitting a target per card. `zCounter` is threaded so
// z increases across the whole arranged set (row by row, stack by stack, bottom to top).
function placeRow(
  piles: Pile[],
  seat: Seat,
  d: number,
  w: number,
  h: number,
  uprightRot: number,
  byId: Map<string, CardState>,
  zCounter: { z: number },
  out: ArrangeTarget[]
): void {
  const offs = rowOffsets(piles, uMaxAtDepth(d, w, h), w);
  piles.forEach((pile, i) => {
    const { nx, ny } = localToCanonical(seat, offs[i]!, d);
    for (const id of pile.ids) {
      const card = byId.get(id);
      if (!card) continue;
      out.push({ id, x: nx, y: ny, z: zCounter.z++, rot: nearestCongruentRot(card.rot, uprightRot) });
    }
  });
}

/**
 * Compute tidy in-zone placements for `cards` (already filtered to ONE seat's own zone). Returns
 * one target per input card, with RELATIVE z. Fewer than two cards is already "arranged", so it
 * returns []. Deterministic: identical inputs (in any order) yield identical targets.
 */
export function arrangeZone(cards: CardState[], seat: Seat, opts: ArrangeOpts): ArrangeTarget[] {
  if (cards.length < 1) return [];
  const w = opts.cardW ?? CARD_CANON_W;
  const h = opts.cardH ?? CARD_CANON_H;
  const piles = buildPiles(cards);
  const byId = new Map(cards.map((c) => [c.id, c] as const));
  const out: ArrangeTarget[] = [];
  const zCounter = { z: 0 };
  if (piles.length <= TWO_ROW_THRESHOLD) {
    // One row, centred in the depth band: the card (height H) sits centred in the 0.28-deep zone.
    placeRow(piles, seat, ZONE_DEPTH / 2, w, h, opts.uprightRot, byId, zCounter, out);
  } else {
    // Two depth-staggered rows (two upright rows can't fit stacked, so they overlap in depth like a
    // real two-row fan). The back row sits nearer the board edge (nearer the player), the front row
    // nearer the centre. The FRONT row is placed FIRST so it gets the lower z and sits UNDERNEATH;
    // the BACK row (nearer the player) is placed LAST so it gets the higher z and overlaps ON TOP —
    // the way a hand fans, with the row closest to you in front. Each row lays out half the stacks
    // with its own safe width, halving the overlap of a single row.
    const half = Math.ceil(piles.length / 2);
    const back = piles.slice(0, half);   // nearer the board edge (shallower depth, nearer the player)
    const front = piles.slice(half);     // nearer the centre (deeper)
    const dBack = ZONE_DEPTH / 2 - 0.025;
    const dFront = ZONE_DEPTH / 2 + 0.025;
    placeRow(front, seat, dFront, w, h, opts.uprightRot, byId, zCounter, out); // behind (lower z)
    placeRow(back, seat, dBack, w, h, opts.uprightRot, byId, zCounter, out);   // on top (higher z)
  }
  return out;
}

/**
 * True when `cards` already sit where arrangeZone would place them — same (x,y) within `eps` and
 * the same orientation (mod 4). z is intentionally ignored (it always rebases), so a repeat tidy
 * on an already-arranged zone is a silent no-op. Mirrors StackOps.isTidyStack.
 */
export function isZoneArranged(cards: CardState[], seat: Seat, opts: ArrangeOpts, eps = 1e-3): boolean {
  if (cards.length < 1) return true;
  const targets = arrangeZone(cards, seat, opts);
  if (targets.length !== cards.length) return false;
  const byId = new Map(cards.map((c) => [c.id, c] as const));
  for (const tgt of targets) {
    const c = byId.get(tgt.id);
    if (!c) return false;
    if (Math.abs(c.x - tgt.x) > eps || Math.abs(c.y - tgt.y) > eps) return false;
    if ((((c.rot % 4) + 4) % 4) !== (((tgt.rot % 4) + 4) % 4)) return false;
  }
  return true;
}
