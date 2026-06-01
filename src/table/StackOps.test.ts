import { describe, it, expect } from "vitest";
import type { BoardState, CardState } from "./types.js";
import { findStackOverlapping, flipStackOver, gatherStack, shuffleStack } from "./StackOps.js";

// A 1000 x 1450 board so one card-width (96) maps cleanly; card is 96 x 139.2.
const BOARD = { width: 1000, height: 1450 };
const SIZE = { w: 96, h: 139.2 };

function card(id: string, x: number, y: number, z: number, rot = 0, faceUp = false): CardState {
  return { id, defId: "x", x, y, z, rot, faceUp, ownerSeat: null, ts: 0 };
}

function board(cards: CardState[]): BoardState {
  const m = new Map<string, CardState>();
  for (const c of cards) m.set(c.id, c);
  return { cards: m, topZ: cards.length };
}

describe("findStackOverlapping (rotation-aware)", () => {
  it("groups cards sitting on the same point", () => {
    const st = board([card("a", 0.5, 0.5, 1), card("b", 0.5, 0.5, 2), card("c", 0.5, 0.5, 3)]);
    const stack = findStackOverlapping(st, BOARD, "a", SIZE);
    expect(new Set(stack)).toEqual(new Set(["a", "b", "c"]));
  });

  it("excludes a card that is clearly far away", () => {
    const st = board([card("a", 0.5, 0.5, 1), card("far", 0.1, 0.1, 2)]);
    const stack = findStackOverlapping(st, BOARD, "a", SIZE);
    expect(stack).toEqual(["a"]);
  });

  it("still pairs an upright card with a 90°-rotated card on the same spot", () => {
    // The rotated card's footprint is swapped (h x w); a naive w x h box used to
    // wrongly drop it from the stack, which made group-flip flash its face.
    const st = board([card("up", 0.5, 0.5, 1, 0), card("rot", 0.5, 0.5, 2, 1)]);
    const stack = findStackOverlapping(st, BOARD, "up", SIZE);
    expect(new Set(stack)).toEqual(new Set(["up", "rot"]));
  });

  it("returns ids bottom-to-top by z, not in map order", () => {
    // Insert out of z-order on purpose; the result must be sorted by z so callers
    // (grab/gather/flip) preserve the pile's real stacking.
    const st = board([card("top", 0.5, 0.5, 9), card("bottom", 0.5, 0.5, 1), card("mid", 0.5, 0.5, 5)]);
    const stack = findStackOverlapping(st, BOARD, "mid", SIZE);
    expect(stack).toEqual(["bottom", "mid", "top"]);
  });
});

describe("flipStackOver = real pile flip", () => {
  it("reverses depth order AND toggles every face", () => {
    const st = board([
      card("bottom", 0.5, 0.5, 1, 0, false),
      card("mid", 0.5, 0.5, 2, 0, false),
      card("top", 0.5, 0.5, 3, 0, false)
    ]);
    flipStackOver(st, ["bottom", "mid", "top"]);
    // The card that was on the bottom is now on top (highest z) and vice versa.
    expect(st.cards.get("bottom")!.z).toBe(3);
    expect(st.cards.get("top")!.z).toBe(1);
    expect(st.cards.get("mid")!.z).toBe(2);
    // Every face toggled.
    for (const id of ["bottom", "mid", "top"]) expect(st.cards.get(id)!.faceUp).toBe(true);
  });

  it("flipping a pile twice returns it to the exact starting state", () => {
    const st = board([card("a", 0.5, 0.5, 1, 0, false), card("b", 0.5, 0.5, 2, 0, true)]);
    const before = JSON.stringify([...st.cards.values()].map((c) => [c.id, c.z, c.faceUp]));
    flipStackOver(st, ["a", "b"]);
    flipStackOver(st, ["a", "b"]);
    const after = JSON.stringify([...st.cards.values()].map((c) => [c.id, c.z, c.faceUp]));
    expect(after).toBe(before);
  });
});

describe("gatherStack squares the pile up", () => {
  it("moves every card to the focus point and unifies orientation by the shortest path", () => {
    const st = board([card("a", 0.4, 0.4, 1, 0), card("b", 0.6, 0.6, 2, 1), card("c", 0.5, 0.5, 3, 2)]);
    const before = { a: 0, b: 1, c: 2 } as Record<string, number>;
    gatherStack(st, ["a", "b", "c"], 0.5, 0.5, 4);
    for (const id of ["a", "b", "c"]) {
      const c = st.cards.get(id)!;
      expect(c.x).toBeCloseTo(0.5, 9);
      expect(c.y).toBeCloseTo(0.5, 9);
      // Every card ends on the SAME visual orientation as the target (≡ 4 mod 4),
      expect(((c.rot % 4) + 4) % 4).toBe(0);
      // and moved by the SHORTEST path — at most two quarter-turns, never a full
      // extra turn (the stray-360° bug).
      expect(Math.abs(c.rot - before[id]!)).toBeLessThanOrEqual(2);
    }
    // Internal order preserved (a < b < c by z).
    const za = st.cards.get("a")!.z, zb = st.cards.get("b")!.z, zc = st.cards.get("c")!.z;
    expect(za).toBeLessThan(zb);
    expect(zb).toBeLessThan(zc);
  });

  it("is a no-op on a single card (gather is a multi-card action)", () => {
    const st = board([card("a", 0.4, 0.4, 1, 2)]);
    gatherStack(st, ["a"], 0.6, 0.6, 0);
    // Untouched: no move, no rotation change (mirrors shuffleStack's 2+ guard).
    expect(st.cards.get("a")!.x).toBeCloseTo(0.4, 9);
    expect(st.cards.get("a")!.y).toBeCloseTo(0.4, 9);
    expect(st.cards.get("a")!.rot).toBe(2);
  });
});

describe("flipping a scattered, mixed-rotation pile (toggleStackFlip's sequence)", () => {
  // toggleStackFlip now gathers+aligns the pile onto the top card BEFORE flipping
  // it, so a scattered/odd-angle pile turns over as one solid block instead of the
  // under-cards blinking/teleporting. This reproduces that exact state sequence.
  it("gather-then-flip: cards share x/y, share orientation, reverse z, toggle every face", () => {
    // Scattered positions, mixed rotations, mixed faces; "c" is the top card (z=3).
    const st = board([
      card("a", 0.40, 0.42, 1, 0, true),
      card("b", 0.62, 0.58, 2, 1, false),
      card("c", 0.51, 0.49, 3, 2, true)
    ]);
    const top = st.cards.get("c")!;
    const target = top.rot; // viewer-upright stand-in: square onto the top card
    const facesBefore = { a: true, b: false, c: true } as Record<string, boolean>;

    // 1) gather onto the top card's spot + unify orientation (what the handler does)
    gatherStack(st, ["a", "b", "c"], top.x, top.y, target);
    // 2) turn the pile over
    flipStackOver(st, ["a", "b", "c"]);

    const tx = top.x, ty = top.y;
    for (const id of ["a", "b", "c"]) {
      const c = st.cards.get(id)!;
      // collapsed into one tight, aligned block
      expect(c.x).toBeCloseTo(tx, 9);
      expect(c.y).toBeCloseTo(ty, 9);
      expect(((c.rot % 4) + 4) % 4).toBe(((target % 4) + 4) % 4);
      // every face toggled by the flip
      expect(c.faceUp).toBe(!facesBefore[id]!);
    }
    // depth order reversed: the card that was on top (c) is now at the bottom
    const za = st.cards.get("a")!.z, zb = st.cards.get("b")!.z, zc = st.cards.get("c")!.z;
    expect(zc).toBeLessThan(zb);
    expect(zb).toBeLessThan(za);
  });

  it("gather then flip twice = the gathered state (flip is its own inverse)", () => {
    const st = board([
      card("a", 0.40, 0.42, 1, 0, true),
      card("b", 0.62, 0.58, 2, 3, false)
    ]);
    const top = st.cards.get("b")!;
    gatherStack(st, ["a", "b"], top.x, top.y, top.rot);
    const snap = ["a", "b"].map((id) => ({ ...st.cards.get(id)! }));
    flipStackOver(st, ["a", "b"]);
    flipStackOver(st, ["a", "b"]);
    for (const s of snap) {
      const c = st.cards.get(s.id)!;
      expect(c.faceUp).toBe(s.faceUp);
      expect(c.z).toBe(s.z);
      expect(c.rot).toBe(s.rot);
      expect(c.x).toBeCloseTo(s.x, 9);
      expect(c.y).toBeCloseTo(s.y, 9);
    }
  });
});

describe("shuffleStack", () => {
  it("faces every card down and squares orientation by the shortest path, keeping positions", () => {
    const st = board([card("a", 0.5, 0.5, 1, 0, true), card("b", 0.5, 0.5, 2, 1, false), card("c", 0.5, 0.5, 3, 2, true)]);
    const before = { a: 0, b: 1, c: 2 } as Record<string, number>;
    shuffleStack(st, ["a", "b", "c"], 0);
    for (const id of ["a", "b", "c"]) {
      const c = st.cards.get(id)!;
      expect(c.faceUp).toBe(false);
      // Same visual orientation as the target (≡ 0 mod 4) ...
      expect(((c.rot % 4) + 4) % 4).toBe(0);
      // ... reached by the shortest path (no stray full 360° spin).
      expect(Math.abs(c.rot - before[id]!)).toBeLessThanOrEqual(2);
      expect(c.x).toBeCloseTo(0.5, 9);
    }
    // z-indices remain a permutation of distinct values (a valid stacking order).
    const zs = ["a", "b", "c"].map((id) => st.cards.get(id)!.z);
    expect(new Set(zs).size).toBe(3);
  });

  it("never changes a sideways card by a full turn (the stray-360 bug)", () => {
    // A pile where one card sits at a high cumulative rot (e.g. spun several times).
    const st = board([card("a", 0.5, 0.5, 1, 0, true), card("b", 0.5, 0.5, 2, 9, true)]);
    shuffleStack(st, ["a", "b"], 0);
    // b was at rot 9 (≡1 mod 4); the nearest congruent-to-0 value is 8, a single
    // quarter-turn away — NOT 0 (which would be a 9-step, multi-turn jump).
    expect(st.cards.get("b")!.rot).toBe(8);
    expect(Math.abs(st.cards.get("b")!.rot - 9)).toBeLessThanOrEqual(2);
  });
});
