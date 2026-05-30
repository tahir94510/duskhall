import type { BoardState, CardState } from "./types.js";
import { mulberry32 } from "../game/deck.js";

// Tight threshold: a card joins the stack only when its bbox overlaps the seed by ≥75 %.
const OVERLAP_RATIO = 0.75;

interface BoardSize { width: number; height: number; }

function cardPixelBox(c: CardState, board: BoardSize, cardW: number, cardH: number) {
  return { x: c.x * board.width, y: c.y * board.height, w: cardW, h: cardH };
}

function intersectionArea(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

// Fallback only: reading --card-w returns the UNRESOLVED clamp() expression
// (parseFloat -> NaN), so this is never the source of truth. Callers pass the
// real measured pixel size (see Game.cardMetrics) so stack detection matches
// exactly what the browser painted at every screen size.
function cardSizeFallback(): { w: number; h: number } {
  const w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w"));
  const cardW = Number.isFinite(w) && w > 0 ? w : 96;
  return { w: cardW, h: cardW * 1.45 };
}

export function findStackOverlapping(
  state: BoardState,
  board: BoardSize,
  seedId: string,
  size?: { w: number; h: number }
): string[] {
  const seed = state.cards.get(seedId);
  if (!seed) return [seedId];
  const { w, h } = size && size.w > 0 ? size : cardSizeFallback();
  const seedBox = cardPixelBox(seed, board, w, h);
  const seedArea = w * h;
  const out: string[] = [];
  for (const c of state.cards.values()) {
    if (c.id === seedId) { out.push(c.id); continue; }
    const cb = cardPixelBox(c, board, w, h);
    if (intersectionArea(seedBox, cb) / seedArea >= OVERLAP_RATIO) out.push(c.id);
  }
  return out;
}

/**
 * Gather the stack around (focusNx, focusNy). When focus is omitted we fall back
 * to the centroid of the stack. Z-indices are reassigned in order so the
 * gathered stack always sits on top of whatever else is on the board.
 */
export function gatherStack(state: BoardState, ids: string[], focusNx?: number, focusNy?: number, unifyRot?: number): void {
  if (!ids.length) return;
  let cx: number;
  let cy: number;
  if (focusNx !== undefined && focusNy !== undefined) {
    cx = focusNx;
    cy = focusNy;
  } else {
    let sx = 0;
    let sy = 0;
    for (const id of ids) {
      const c = state.cards.get(id);
      if (!c) continue;
      sx += c.x;
      sy += c.y;
    }
    cx = sx / ids.length;
    cy = sy / ids.length;
  }
  const ordered = ids
    .map((id) => state.cards.get(id))
    .filter((c): c is CardState => !!c)
    .sort((a, b) => a.z - b.z);
  // Unify orientation so a pile of mixed 90°/180° cards squares up into one
  // clean, aligned stack, the way you'd straighten a deck by hand. When the
  // caller supplies `unifyRot` (the angle that reads upright for the acting
  // viewer) we use it; otherwise we fall back to the top card's rotation.
  const topRot = unifyRot !== undefined
    ? unifyRot
    : (ordered.length ? ordered[ordered.length - 1]!.rot : 0);
  // v3.7: every card lands exactly on the focus point so the stack is a
  // single tight pile with no diagonal tail. Z is the only visual stride.
  for (const c of ordered) {
    c.x = cx;
    c.y = cy;
    c.rot = topRot;
    state.topZ++;
    c.z = state.topZ;
  }
}

/**
 * Shuffle the stack in place. Cards do not move; only z-order and face-up state
 * are randomised. Visual jitter is applied via a CSS class by the caller.
 *
 * The shuffle runs only on the initiating client; the resulting z-order and
 * face-down state are broadcast as a patch, so every peer ends up with the same
 * pile. The seed is drawn from the crypto RNG (falling back to Math.random in
 * environments without it) so a long-running session never hits 32-bit clock
 * overflow.
 */
export function shuffleStack(state: BoardState, ids: string[], unifyRot?: number): void {
  if (ids.length < 2) return;
  const rng = mulberry32(randomSeed());
  const order = ids.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  // Unify orientation (viewer-upright when supplied, else the current top card),
  // then face every card down.
  let topRot = 0;
  let topZ = -Infinity;
  for (const id of ids) {
    const c = state.cards.get(id);
    if (c && c.z > topZ) { topZ = c.z; topRot = c.rot; }
  }
  if (unifyRot !== undefined) topRot = unifyRot;
  // Reassign z-indices in the new order, preserving positions
  const minZ = Math.min(...ids.map((id) => state.cards.get(id)?.z ?? 0));
  for (let i = 0; i < order.length; i++) {
    const c = state.cards.get(order[i]!);
    if (!c) continue;
    c.z = minZ + i;
    c.faceUp = false;
    c.rot = topRot;
  }
}

/**
 * Turn a whole stack over, the way you would flip a real pile of cards by hand.
 * Two things happen at once:
 *   1. The depth order reverses, so the card that sat on the bottom is now on
 *      top (and vice versa).
 *   2. Every card's face is toggled, so a face-down pile becomes face-up and a
 *      face-up pile becomes face-down.
 * The set of z slots the stack occupies is preserved, so the pile keeps sitting
 * at the same layer relative to the rest of the board. A single card simply
 * flips its face, matching `flipCard`.
 */
export function flipStackOver(state: BoardState, ids: string[]): void {
  const ordered = ids
    .map((id) => state.cards.get(id))
    .filter((c): c is CardState => !!c)
    .sort((a, b) => a.z - b.z);
  if (!ordered.length) return;
  const zSlots = ordered.map((c) => c.z);
  const n = ordered.length;
  for (let i = 0; i < n; i++) {
    const c = ordered[i]!;
    c.z = zSlots[n - 1 - i]!;
    c.faceUp = !c.faceUp;
  }
}

// Seed source for the shuffle. Prefers the crypto RNG; degrades gracefully.
function randomSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === "function") {
    return c.getRandomValues(new Uint32Array(1))[0]!;
  }
  return (Math.random() * 0x100000000) >>> 0;
}
