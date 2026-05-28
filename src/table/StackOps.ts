import type { BoardState, CardState } from "./types.js";
import { mulberry32 } from "../game/deck.js";

function radius(): number {
  const sample = document.documentElement;
  const w = parseFloat(getComputedStyle(sample).getPropertyValue("--card-w"));
  const cardW = Number.isFinite(w) ? w : 96;
  return cardW * 1.1;
}

export function findStack(state: BoardState, centerId: string): string[] {
  const center = state.cards.get(centerId);
  if (!center) return [centerId];
  const r = radius();
  const found: string[] = [];
  for (const c of state.cards.values()) {
    const dx = c.x - center.x;
    const dy = c.y - center.y;
    if (Math.hypot(dx, dy) <= r) found.push(c.id);
  }
  return found.length ? found : [centerId];
}

export function findStackAtPoint(state: BoardState, host: HTMLElement, clientX: number, clientY: number): string[] {
  const r = radius();
  const board = host.getBoundingClientRect();
  const localX = clientX - board.left;
  const localY = clientY - board.top;
  let nearest: CardState | null = null;
  let nearestDist = Infinity;
  const w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w"));
  const cardW = Number.isFinite(w) ? w : 96;
  const cardH = cardW * 1.45;
  for (const c of state.cards.values()) {
    const cx = c.x + cardW / 2;
    const cy = c.y + cardH / 2;
    const d = Math.hypot(cx - localX, cy - localY);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = c;
    }
  }
  if (!nearest || nearestDist > r * 1.5) return [];
  return findStack(state, nearest.id);
}

export function gatherStack(state: BoardState, ids: string[]): void {
  if (!ids.length) return;
  let avgX = 0;
  let avgY = 0;
  for (const id of ids) {
    const c = state.cards.get(id);
    if (!c) continue;
    avgX += c.x;
    avgY += c.y;
  }
  avgX /= ids.length;
  avgY /= ids.length;
  let i = 0;
  const ordered = ids
    .map((id) => state.cards.get(id))
    .filter((c): c is CardState => !!c)
    .sort((a, b) => a.z - b.z);
  for (const c of ordered) {
    c.x = avgX + i * 2;
    c.y = avgY + i * 2;
    i++;
  }
}

export function shuffleStack(state: BoardState, ids: string[]): void {
  if (ids.length < 2) return;
  const rng = mulberry32((performance.now() * 1000) | 0);
  const positions = ids
    .map((id) => state.cards.get(id))
    .filter((c): c is CardState => !!c)
    .map((c) => ({ x: c.x, y: c.y, z: c.z }));
  const order = ids.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  for (let i = 0; i < order.length; i++) {
    const c = state.cards.get(order[i]!);
    const pos = positions[i];
    if (!c || !pos) continue;
    c.x = pos.x;
    c.y = pos.y;
    c.z = pos.z;
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
