import type { BoardState, CardState } from "./types.js";
import { mulberry32 } from "../game/deck.js";

// A card joins the stack when its (rotation-aware) footprint overlaps the seed by
// at least this fraction of the SMALLER card's area. 0.6 is deliberate: two
// perpendicular cards (one upright, one at 90°) sharing a centre overlap by ~69 %
// of a card — above 0.6, so a mixed-orientation pile is detected as one stack —
// while the deck (0.40) and discard (0.60) markers never overlap at all, so the
// two central piles can never merge. Same-orientation cards still need to sit
// squarely on top of each other (well above 60 %) to group.
const OVERLAP_RATIO = 0.6;

// Two cards count as the SAME pile (one stacked on the other) when their centres sit within this
// canonical distance on both axes. A gathered or tidied stack co-locates its cards exactly (0
// apart), while the tidy layout's neighbouring stacks are always >= ~0.05 apart (adjacent type
// stacks) and its two depth rows are 0.05 apart — all comfortably outside this epsilon, so the
// stack count never bleeds one stack into the next. Canonical (device-independent) units.
const STACK_POS_EPS = 0.03;

// The cumulative quarter-turn value congruent to `target` (mod 4) that is NEAREST
// to a card's CURRENT `rot`. `rot` is cumulative (it never wraps), so naively
// writing the same `target` to every card can change a sideways card's value by a
// FULL turn (a multiple of 4) — which the shuffle keyframe then animates as a
// stray 360° spin. Snapping to the nearest congruent value keeps every card's
// change to at most ±2 quarter-turns (the shortest path), so the pile squares up
// cleanly with no full turn, while still landing on the same visual orientation.
export function nearestCongruentRot(current: number, target: number): number {
  return target + 4 * Math.round((current - target) / 4);
}

interface BoardSize { width: number; height: number; }

function cardPixelBox(c: CardState, board: BoardSize, cardW: number, cardH: number) {
  // (c.x, c.y) is the card CENTRE fraction. A card rotated by an odd quarter-turn
  // (90°/270°) presents a swapped footprint (h x w), so its axis-aligned bounding
  // box must swap dimensions; otherwise a rotated card on a pile is mis-measured
  // and wrongly excluded from the stack (the cause of mixed-rotation flip flicker
  // and "can't grab the rotated card"). Even quarter-turns keep w x h.
  const quarter = ((Math.round(c.rot) % 2) + 2) % 2; // 0 or 1
  const w = quarter === 1 ? cardH : cardW;
  const h = quarter === 1 ? cardW : cardH;
  return { x: c.x * board.width - w / 2, y: c.y * board.height - h / 2, w, h };
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
  const hits: CardState[] = [];
  for (const c of state.cards.values()) {
    if (c.id === seedId) { hits.push(c); continue; }
    const cb = cardPixelBox(c, board, w, h);
    const inter = intersectionArea(seedBox, cb);
    if (inter <= 0) continue;
    // Measure overlap against the SMALLER of the two footprints so a rotated card
    // (swapped w/h) still pairs with an upright one when they sit on the same pile.
    const minArea = Math.min(seedBox.w * seedBox.h, cb.w * cb.h);
    if (inter / minArea >= OVERLAP_RATIO) hits.push(c);
  }
  // Return ids in ascending z (bottom-to-top). Every caller (grab, gather, flip,
  // shuffle, stack-rotate) wants the pile's real stacking order, not the arbitrary
  // Map iteration order, so the order is correct in one place for all of them.
  hits.sort((a, b) => a.z - b.z);
  return hits.map((c) => c.id);
}

// Max canonical span (centre to centre) of one CONNECTED pile. The deck (DECK_NX
// 0.40) and discard (DISCARD_NX 0.60) centres are 0.20 apart, so capping the pile's
// x-span strictly under 0.20 means a wide fan can never bridge the two central
// piles into one. y is looser (the two piles share a row, so y never bridges them)
// but still bounded so a pile stays local and never swallows a tableau heap.
const MAX_STACK_SPAN_X = 0.19;
const MAX_STACK_SPAN_Y = 0.42;

/**
 * Find the whole CONNECTED pile a card belongs to: a flood-fill where a card joins
 * if it overlaps ANY already-included card by >= OVERLAP_RATIO (of the smaller
 * footprint), bounded by a span guard so a spread/fanned layout is gathered as one
 * stack WITHOUT bridging the two central piles. Unlike findStackOverlapping (which
 * tests overlap against the single seed only — correct for "grab the tight pile
 * under the cursor"), this captures a hand-spread deck the player means to flip,
 * shuffle, gather or rotate as a whole. Returns ids in ascending z (bottom-to-top),
 * matching findStackOverlapping's contract.
 */
export function findConnectedStack(
  state: BoardState,
  board: BoardSize,
  seedId: string,
  size?: { w: number; h: number }
): string[] {
  const seed = state.cards.get(seedId);
  if (!seed) return [seedId];
  const { w, h } = size && size.w > 0 ? size : cardSizeFallback();
  // Deterministic candidate order (z then id) so the captured set is predictable.
  const all = Array.from(state.cards.values()).sort((a, b) => (a.z - b.z) || a.id.localeCompare(b.id));
  const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const c of all) boxes.set(c.id, cardPixelBox(c, board, w, h));

  const included = new Set<string>([seed.id]);
  let minX = seed.x, maxX = seed.x, minY = seed.y, maxY = seed.y;
  const queue: CardState[] = [seed];
  while (queue.length) {
    const cur = queue.shift()!;
    const curBox = boxes.get(cur.id)!;
    for (const c of all) {
      if (included.has(c.id)) continue;
      const cb = boxes.get(c.id)!;
      const inter = intersectionArea(curBox, cb);
      if (inter <= 0) continue;
      const minArea = Math.min(curBox.w * curBox.h, cb.w * cb.h);
      if (inter / minArea < OVERLAP_RATIO) continue;
      // Span guard: adding this card must keep the whole pile within the safe box,
      // so a wide fan never reaches from one central pile into the other.
      const nMinX = Math.min(minX, c.x), nMaxX = Math.max(maxX, c.x);
      const nMinY = Math.min(minY, c.y), nMaxY = Math.max(maxY, c.y);
      if (nMaxX - nMinX > MAX_STACK_SPAN_X || nMaxY - nMinY > MAX_STACK_SPAN_Y) continue;
      included.add(c.id);
      minX = nMinX; maxX = nMaxX; minY = nMinY; maxY = nMaxY;
      queue.push(c);
    }
  }
  return all.filter((c) => included.has(c.id)).map((c) => c.id);
}

/**
 * For each card: how many cards sit DIRECTLY stacked on its exact spot (share its centre within
 * STACK_POS_EPS), and whether it is COVERED by another card on that spot (one with a higher z, ties
 * broken by id) — i.e. it is buried, not the top of its pile. Deliberately POSITIONAL rather than
 * overlap-based: a loose-overlap test wrongly merges neighbouring stacks that merely graze each
 * other (the tidy layout's adjacent type-stacks and its two depth-staggered rows), which made the
 * stack count "jump" once a hand held more than one card type. `count` drives the hover info box's
 * pile line; `covered` lets the renderer suppress the drop shadow of buried cards so a tight pile
 * casts ONE clean shadow instead of N stacked ones smearing into a dark blob (most visible while a
 * rotate or gather slides the cards together). Type-agnostic, canonical units (identical on every
 * device). O(n^2) in the card count: cheap for a table deck, only run on dirty render frames.
 */
export function coLocatedStacks(state: BoardState, eps = STACK_POS_EPS): Map<string, { count: number; covered: boolean }> {
  const cards = Array.from(state.cards.values());
  const out = new Map<string, { count: number; covered: boolean }>();
  for (const a of cards) {
    let count = 0;
    let covered = false;
    for (const b of cards) {
      if (Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps) {
        count++;
        // Another card shares this spot and sits above us (higher z, ties broken by id): we are
        // buried. Exactly one card per pile — the topmost — ends up not covered.
        if (b.id !== a.id && (b.z > a.z || (b.z === a.z && b.id > a.id))) covered = true;
      }
    }
    out.set(a.id, { count, covered });
  }
  return out;
}

/**
 * Square every card's ORIENTATION to one angle, without moving or restacking
 * them. This is the first phase of a tidy: straighten a fanned/cross-laid pile so
 * the cards all face the same way, before they are gathered into one spot. Each
 * card squares by the shortest path (nearestCongruentRot) so nothing spins a full
 * extra turn. Faces and positions are untouched.
 */
export function alignRotation(state: BoardState, ids: string[], target: number): void {
  for (const id of ids) {
    const c = state.cards.get(id);
    if (c) c.rot = nearestCongruentRot(c.rot, target);
  }
}

/** True if the cards do NOT all share the same visual orientation (mod 4) — i.e.
 *  there is a horizontal/angle difference that a straighten step should fix first. */
export function rotationsDiffer(state: BoardState, ids: string[], target: number): boolean {
  const t = ((target % 4) + 4) % 4;
  for (const id of ids) {
    const c = state.cards.get(id);
    if (c && (((c.rot % 4) + 4) % 4) !== t) return true;
  }
  return false;
}

/**
 * Gather the stack around (focusNx, focusNy). When focus is omitted we fall back
 * to the centroid of the stack. Z-indices are reassigned in order so the
 * gathered stack always sits on top of whatever else is on the board.
 */
export function gatherStack(state: BoardState, ids: string[], focusNx?: number, focusNy?: number, unifyRot?: number): void {
  // Gather is a multi-card action; a single card is already a tidy pile of one.
  // Mirrors shuffleStack's guard so neither op runs on a lone card.
  if (ids.length < 2) return;
  let cx: number;
  let cy: number;
  if (focusNx !== undefined && focusNy !== undefined) {
    cx = focusNx;
    cy = focusNy;
  } else {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const id of ids) {
      const c = state.cards.get(id);
      if (!c) continue;
      sx += c.x;
      sy += c.y;
      n++;
    }
    // Divide by the number of cards actually found, not ids.length: an id whose card
    // vanished mid-gesture would otherwise drag the centroid toward (0,0) and place
    // the gathered pile off-target.
    cx = n ? sx / n : 0;
    cy = n ? sy / n : 0;
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
    // Square up by the SHORTEST path: the congruent target nearest this card's
    // own cumulative rot, so a sideways card never spins a full extra turn.
    c.rot = nearestCongruentRot(c.rot, topRot);
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
  // Reassign z-indices in the new order, preserving positions. Use a dedicated
  // counter (not the loop index) so a card that vanished mid-gesture doesn't leave
  // a gap in the z range — the survivors stay densely, contiguously stacked. The
  // floor is the lowest z among the cards that ACTUALLY exist; a missing id must not
  // drag it to 0 (a stray `?? 0`) and yank the whole pile to the bottom of the board.
  const presentZs = ids.map((id) => state.cards.get(id)?.z).filter((z): z is number => z !== undefined);
  const minZ = presentZs.length ? Math.min(...presentZs) : 0;
  let zi = 0;
  for (let i = 0; i < order.length; i++) {
    const c = state.cards.get(order[i]!);
    if (!c) continue;
    c.z = minZ + zi;
    zi++;
    c.faceUp = false;
    // Square up by the SHORTEST path (nearest congruent angle to this card's own
    // cumulative rot) so a sideways card never does a stray full 360° spin when
    // the shuffle wobble plays — the bug that gather avoided only by luck.
    c.rot = nearestCongruentRot(c.rot, topRot);
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

/**
 * Set EVERY card in the pile to one face, without moving or restacking them. This
 * is the "unify" turn: a deck that reads open (or closed) flips wholesale to the
 * single target face, so a pile with mixed faces no longer stays mixed (the cause
 * of undercards flashing through during a turn). Z-order is PRESERVED (no depth
 * reversal), so the same card stays on top and the turn reads as one solid block.
 */
export function setStackFace(state: BoardState, ids: string[], faceUp: boolean): void {
  for (const id of ids) {
    const c = state.cards.get(id);
    if (c) c.faceUp = faceUp;
  }
}

/**
 * Turn a whole pile OVER the way you flip a real stack of cards by hand: the depth
 * order REVERSES (the card on the bottom ends up on top, and the one you were looking
 * at on top ends up on the bottom) AND every card is brought to ONE consistent face,
 * the `target`. So a messy pile — some cards face-up, some face-down, the central
 * exception cards — is squared to a single facing as it turns, instead of staying
 * mixed (which would leave undercards flashing the wrong way). The set of z SLOTS the
 * pile occupies is preserved (it keeps its layer); only their assignment reverses.
 * Pass `target = !(top card's faceUp)` for the natural "flip what I'm looking at" turn:
 * a face-up-topped pile turns to all-backs, a face-down-topped pile turns to all-faces.
 * A single card simply adopts the target face.
 */
export function turnStackOver(state: BoardState, ids: string[], target: boolean): void {
  const ordered = ids
    .map((id) => state.cards.get(id))
    .filter((c): c is CardState => !!c)
    .sort((a, b) => a.z - b.z);
  if (!ordered.length) return;
  const zSlots = ordered.map((c) => c.z);
  const n = ordered.length;
  for (let i = 0; i < n; i++) {
    const c = ordered[i]!;
    c.z = zSlots[n - 1 - i]!; // reverse depth: bottom ↔ top
    c.faceUp = target;        // unify facing to the target
  }
}

/** The id of the card currently on TOP of the pile (highest z), or null for an empty
 *  set. Used as the flip REFERENCE: the target face is the toggle of this card's
 *  current face. (After the turnStackOver reversal, flipVisibleCardId — not this —
 *  picks which card stays visible through the animation.) */
export function topVisibleId(state: BoardState, ids: string[]): string | null {
  let pick: CardState | null = null;
  for (const id of ids) {
    const c = state.cards.get(id);
    if (!c) continue;
    if (!pick || c.z > pick.z) pick = c;
  }
  return pick ? pick.id : null;
}

/**
 * Which card should stay VISIBLE while a pile turns over (the others are hidden so
 * the stack reads as one solid block). Call AFTER flipStackOver (z already reversed).
 * The visible card must present a GENERIC BACK at the turn's start so there is no
 * art-swap pop at t=0:
 *  - Opening (toFaceUp=true): the cards were all face-down (backs) before the flip,
 *    so any choice is pop-free; pick the NEW top (highest z after the reversal) so
 *    the card that ends on top is the one we keep showing.
 *  - Closing (toFaceUp=false): the cards were face-up (art) before the flip. Keep the
 *    OLD top — the card the player was actually looking at — visible so it turns from
 *    its own art to a back, continuously. After the z-reversal the old top sits at
 *    the BOTTOM (lowest z).
 * Returns null for an empty set; the single-card case returns that card either way.
 */
export function flipVisibleCardId(state: BoardState, ids: string[], toFaceUp: boolean): string | null {
  let pick: CardState | null = null;
  for (const id of ids) {
    const c = state.cards.get(id);
    if (!c) continue;
    if (!pick) { pick = c; continue; }
    // Opening → highest z (new top); closing → lowest z (old top, now at bottom).
    if (toFaceUp ? c.z > pick.z : c.z < pick.z) pick = c;
  }
  return pick ? pick.id : null;
}

/**
 * True when the pile is ALREADY a tidy single stack at (ax, ay) with every card
 * squared to `target` (mod 4), so the gather phase before a flip/shuffle can be
 * skipped (a resting deck/discard turns instantly, no dead-time). `eps` tolerates
 * sub-pixel float drift in the canonical [0,1] coordinates.
 */
export function isTidyStack(
  state: BoardState,
  ids: string[],
  ax: number,
  ay: number,
  target: number,
  eps = 1e-3
): boolean {
  const t = ((target % 4) + 4) % 4;
  for (const id of ids) {
    const c = state.cards.get(id);
    if (!c) continue;
    if (Math.abs(c.x - ax) > eps || Math.abs(c.y - ay) > eps) return false;
    if ((((c.rot % 4) + 4) % 4) !== t) return false;
  }
  return true;
}

// Seed source for the shuffle. Prefers the crypto RNG; degrades gracefully.
function randomSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === "function") {
    return c.getRandomValues(new Uint32Array(1))[0]!;
  }
  return (Math.random() * 0x100000000) >>> 0;
}
