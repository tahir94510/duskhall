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

function cardSize(): { w: number; h: number } {
  const w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w"));
  const cardW = Number.isFinite(w) ? w : 96;
  return { w: cardW, h: cardW * 1.45 };
}

export function findStackOverlapping(state: BoardState, board: BoardSize, seedId: string): string[] {
  const seed = state.cards.get(seedId);
  if (!seed) return [seedId];
  const { w, h } = cardSize();
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

export function topCardAtPoint(
  state: BoardState,
  boardEl: HTMLElement,
  clientX: number,
  clientY: number
): CardState | null {
  const rect = boardEl.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const { w, h } = cardSize();
  let pick: CardState | null = null;
  for (const c of state.cards.values()) {
    const px = c.x * rect.width;
    const py = c.y * rect.height;
    if (localX >= px && localX <= px + w && localY >= py && localY <= py + h) {
      if (!pick || c.z > pick.z) pick = c;
    }
  }
  return pick;
}

export function findStackAtPoint(state: BoardState, boardEl: HTMLElement, clientX: number, clientY: number): string[] {
  const top = topCardAtPoint(state, boardEl, clientX, clientY);
  if (!top) return [];
  return findStackOverlapping(state, { width: boardEl.clientWidth, height: boardEl.clientHeight }, top.id);
}

/**
 * Gather the stack around (focusNx, focusNy). When focus is omitted we fall back
 * to the centroid of the stack.
 */
export function gatherStack(state: BoardState, ids: string[], focusNx?: number, focusNy?: number): void {
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
  // tiny offset per card (~3 px equivalent at 1080p)
  const stepX = 0.0024;
  const stepY = 0.0024;
  let i = 0;
  for (const c of ordered) {
    c.x = cx + i * stepX;
    c.y = cy + i * stepY;
    i++;
  }
}

/**
 * Shuffle the stack in place. Cards do not move; only z-order and face-up state
 * are randomised. Visual jitter is applied via a CSS class by the caller.
 */
export function shuffleStack(state: BoardState, ids: string[]): void {
  if (ids.length < 2) return;
  const rng = mulberry32((performance.now() * 1000) | 0);
  const order = ids.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  // Reassign z-indices in the new order, preserving positions
  const minZ = Math.min(...ids.map((id) => state.cards.get(id)?.z ?? 0));
  for (let i = 0; i < order.length; i++) {
    const c = state.cards.get(order[i]!);
    if (!c) continue;
    c.z = minZ + i;
    c.faceUp = false;
  }
}

export function setStackFaceUp(state: BoardState, ids: string[], faceUp: boolean): void {
  for (const id of ids) {
    const c = state.cards.get(id);
    if (!c) continue;
    c.faceUp = faceUp;
  }
}
