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
  it("moves every card to the focus point and unifies rotation", () => {
    const st = board([card("a", 0.4, 0.4, 1, 0), card("b", 0.6, 0.6, 2, 1), card("c", 0.5, 0.5, 3, 2)]);
    gatherStack(st, ["a", "b", "c"], 0.5, 0.5, 4);
    for (const id of ["a", "b", "c"]) {
      expect(st.cards.get(id)!.x).toBeCloseTo(0.5, 9);
      expect(st.cards.get(id)!.y).toBeCloseTo(0.5, 9);
      expect(st.cards.get(id)!.rot).toBe(4); // all equalized to the supplied upright
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

describe("shuffleStack", () => {
  it("faces every card down and equalizes rotation, keeping positions", () => {
    const st = board([card("a", 0.5, 0.5, 1, 0, true), card("b", 0.5, 0.5, 2, 1, false), card("c", 0.5, 0.5, 3, 2, true)]);
    shuffleStack(st, ["a", "b", "c"], 0);
    for (const id of ["a", "b", "c"]) {
      expect(st.cards.get(id)!.faceUp).toBe(false);
      expect(st.cards.get(id)!.rot).toBe(0);
      expect(st.cards.get(id)!.x).toBeCloseTo(0.5, 9);
    }
    // z-indices remain a permutation of distinct values (a valid stacking order).
    const zs = ["a", "b", "c"].map((id) => st.cards.get(id)!.z);
    expect(new Set(zs).size).toBe(3);
  });
});
