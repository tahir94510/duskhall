import { describe, it, expect } from "vitest";
import type { BoardState, CardState } from "./types.js";
import { findStackOverlapping, findConnectedStack, flipStackOver, gatherStack, shuffleStack, alignRotation, rotationsDiffer, flipVisibleCardId, isTidyStack, nearestCongruentRot, setStackFace, topVisibleId, turnStackOver } from "./StackOps.js";

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

describe("findConnectedStack (transitive pile capture, span-guarded)", () => {
  it("captures a fanned pile whose far end single-seed overlap misses", () => {
    // a–b and b–c overlap by >60%, but a and c are too far apart to overlap.
    const st = board([card("a", 0.40, 0.5, 1), card("b", 0.43, 0.5, 2), card("c", 0.46, 0.5, 3)]);
    // Single-seed from 'a' only reaches 'b' (c doesn't overlap the seed itself)...
    expect(new Set(findStackOverlapping(st, BOARD, "a", SIZE))).toEqual(new Set(["a", "b"]));
    // ...connected capture follows the chain and gets the whole fan, bottom-to-top.
    expect(findConnectedStack(st, BOARD, "a", SIZE)).toEqual(["a", "b", "c"]);
  });

  it("never bridges the deck (0.40) and discard (0.60) piles, even via a dense fan", () => {
    const st = board([
      card("d0", 0.40, 0.5, 1), card("d1", 0.43, 0.5, 2), card("d2", 0.46, 0.5, 3),
      card("d3", 0.49, 0.5, 4), card("d4", 0.52, 0.5, 5), card("d5", 0.55, 0.5, 6),
      card("d6", 0.58, 0.5, 7),
      card("discard", 0.60, 0.5, 8) // overlaps d6 but lands past the span cap
    ]);
    const stack = findConnectedStack(st, BOARD, "d0", SIZE);
    expect(stack).toContain("d6");        // the fan is captured up to the cap
    expect(stack).not.toContain("discard"); // the other central pile is never pulled in
  });

  it("returns ids bottom-to-top by z (contract parity with findStackOverlapping)", () => {
    const st = board([card("top", 0.5, 0.5, 9), card("bottom", 0.5, 0.5, 1), card("mid", 0.5, 0.5, 5)]);
    expect(findConnectedStack(st, BOARD, "mid", SIZE)).toEqual(["bottom", "mid", "top"]);
  });

  it("a lone card returns just itself", () => {
    const st = board([card("solo", 0.5, 0.5, 1), card("far", 0.1, 0.1, 2)]);
    expect(findConnectedStack(st, BOARD, "solo", SIZE)).toEqual(["solo"]);
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

describe("rotating a mixed-angle pile (rotateStack's sequence) aligns it as it turns", () => {
  // rotateStack gathers onto the anchor card and squares every card to
  // (anchor.rot + dir), so a ragged pile turns into one aligned block, keeping
  // faces. This reproduces that exact gatherStack call.
  it("squares every card to anchor.rot+dir, collapses onto the anchor, keeps faces", () => {
    const st = board([
      card("a", 0.40, 0.42, 1, 0, true),
      card("b", 0.62, 0.58, 2, 2, false),
      card("anchor", 0.50, 0.50, 3, 1, true) // top card, rot = 1 (90°)
    ]);
    const anchor = st.cards.get("anchor")!;
    const dir = 1;
    const target = anchor.rot + dir; // 2 → all cards end congruent to 2 mod 4
    gatherStack(st, ["a", "b", "anchor"], anchor.x, anchor.y, target);
    const facesAfter = { a: true, b: false, anchor: true } as Record<string, boolean>;
    for (const id of ["a", "b", "anchor"]) {
      const c = st.cards.get(id)!;
      expect(c.x).toBeCloseTo(0.50, 9);
      expect(c.y).toBeCloseTo(0.50, 9);
      expect(((c.rot % 4) + 4) % 4).toBe(((target % 4) + 4) % 4);
      expect(c.faceUp).toBe(facesAfter[id]!); // faces untouched by a rotate
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

describe("shuffleAt's gather-then-shuffle: tidy first, then a clean stacking order", () => {
  // The handler now gathers the pile onto the seed BEFORE shuffling. This locks
  // that order: scattered cards collapse onto one spot, get a contiguous z-band on
  // top of the board, and the shuffle keeps that band (a valid, collision-free
  // order) instead of reusing the old scattered z values.
  it("collapses scattered cards onto the seed and yields a clean contiguous z-order", () => {
    // Two scattered table cards (low z) plus an unrelated card far away at high z.
    const st = board([
      card("a", 0.40, 0.42, 1, 0, true),
      card("b", 0.62, 0.58, 2, 1, false),
      card("seed", 0.50, 0.50, 3, 2, true),
      card("other", 0.05, 0.05, 99, 0, false) // a high-z card elsewhere on the table
    ]);
    const seed = st.cards.get("seed")!;
    // The handler keeps state.topZ >= every card's z (syncTopZ) before gathering,
    // so the lift clears the whole board. Mirror that invariant here.
    st.topZ = Math.max(...[...st.cards.values()].map((c) => c.z));
    // 1) gather onto the seed (what shuffleAt does first)
    gatherStack(st, ["a", "b", "seed"], seed.x, seed.y, seed.rot);
    // 2) shuffle the gathered pile
    shuffleStack(st, ["a", "b", "seed"], seed.rot);

    const sx = seed.x, sy = seed.y;
    const zs = ["a", "b", "seed"].map((id) => st.cards.get(id)!.z);
    for (const id of ["a", "b", "seed"]) {
      const c = st.cards.get(id)!;
      expect(c.x).toBeCloseTo(sx, 9); // collapsed onto one spot
      expect(c.y).toBeCloseTo(sy, 9);
      expect(c.faceUp).toBe(false);   // shuffle faces all down
    }
    // distinct, contiguous z (a valid stacking order)
    expect(new Set(zs).size).toBe(3);
    const sorted = [...zs].sort((p, q) => p - q);
    expect(sorted[2]! - sorted[0]!).toBe(2); // 3 consecutive z values
    // and the whole pile sits ABOVE the unrelated high-z card, so it is not buried
    expect(Math.min(...zs)).toBeGreaterThan(st.cards.get("other")!.z);
  });
});

describe("straighten phase: align orientation first, without moving cards", () => {
  it("alignRotation squares every card to the target by the shortest path, leaving x/y/face", () => {
    const st = board([
      card("a", 0.40, 0.42, 1, 0, true),
      card("b", 0.62, 0.58, 2, 1, false),  // 90°
      card("c", 0.50, 0.50, 3, 9, true)    // 9 ≡ 1 mod 4, several cumulative turns in
    ]);
    const pos = { a: [0.40, 0.42], b: [0.62, 0.58], c: [0.50, 0.50] } as Record<string, number[]>;
    alignRotation(st, ["a", "b", "c"], 0);
    for (const id of ["a", "b", "c"]) {
      const k = st.cards.get(id)!;
      expect(((k.rot % 4) + 4) % 4).toBe(0);          // all face the same way now
      expect(k.x).toBeCloseTo(pos[id]![0]!, 9);        // NOT moved
      expect(k.y).toBeCloseTo(pos[id]![1]!, 9);
    }
    // c was at rot 9 (≡1); nearest congruent-to-0 is 8 (one quarter-turn), not 0.
    expect(st.cards.get("c")!.rot).toBe(8);
    // faces untouched
    expect(st.cards.get("a")!.faceUp).toBe(true);
    expect(st.cards.get("b")!.faceUp).toBe(false);
  });

  it("rotationsDiffer detects a mixed-angle pile and a tidy one", () => {
    const mixed = board([card("a", 0.5, 0.5, 1, 0), card("b", 0.5, 0.5, 2, 1)]);
    expect(rotationsDiffer(mixed, ["a", "b"], 0)).toBe(true);
    // All congruent to the target (0 and 8 are both ≡ 0 mod 4): no straighten needed.
    const tidy = board([card("a", 0.5, 0.5, 1, 0), card("b", 0.5, 0.5, 2, 8)]);
    expect(rotationsDiffer(tidy, ["a", "b"], 0)).toBe(false);
  });
});

describe("flipVisibleCardId: which card stays visible so the pile turns as one block", () => {
  // Call AFTER flipStackOver (z reversed). The visible card must show a generic back
  // at t=0 so there's no art-swap pop.
  it("opening (toFaceUp=true): keeps the NEW top (highest z after the reversal)", () => {
    // Pre-flip: a(z1,down) b(z2,down) c(z3,down). After flipStackOver z reverses.
    const st = board([card("a", 0.5, 0.5, 1, 0, false), card("b", 0.5, 0.5, 2, 0, false), card("c", 0.5, 0.5, 3, 0, false)]);
    flipStackOver(st, ["a", "b", "c"]); // now all faceUp=true; z: a=3,b=2,c=1
    const vis = flipVisibleCardId(st, ["a", "b", "c"], true);
    // highest z after flip is "a" (was the bottom, now the new top)
    expect(vis).toBe("a");
    expect(st.cards.get("a")!.z).toBe(3);
  });

  it("closing (toFaceUp=false): keeps the OLD top (lowest z after the reversal)", () => {
    // Pre-flip: a(z1,up) b(z2,up) c(z3,up). c is the old top the player was viewing.
    const st = board([card("a", 0.5, 0.5, 1, 0, true), card("b", 0.5, 0.5, 2, 0, true), card("c", 0.5, 0.5, 3, 0, true)]);
    flipStackOver(st, ["a", "b", "c"]); // now all faceUp=false; z: a=3,b=2,c=1
    const vis = flipVisibleCardId(st, ["a", "b", "c"], false);
    // lowest z after flip is "c" (the old top, now at the bottom) — keep it visible
    expect(vis).toBe("c");
    expect(st.cards.get("c")!.z).toBe(1);
  });

  it("single card returns that card; empty set returns null", () => {
    const st = board([card("solo", 0.5, 0.5, 5, 0, true)]);
    expect(flipVisibleCardId(st, ["solo"], true)).toBe("solo");
    expect(flipVisibleCardId(st, ["solo"], false)).toBe("solo");
    expect(flipVisibleCardId(st, [], true)).toBe(null);
  });
});

describe("isTidyStack: detect an already-gathered, squared pile (skip the gather phase)", () => {
  it("true when every card sits on (ax,ay) and is squared to target", () => {
    const st = board([card("a", 0.5, 0.5, 1, 0), card("b", 0.5, 0.5, 2, 8), card("c", 0.5, 0.5, 3, 4)]);
    // rots 0, 8, 4 are all ≡ 0 mod 4; all on (0.5,0.5).
    expect(isTidyStack(st, ["a", "b", "c"], 0.5, 0.5, 0)).toBe(true);
  });
  it("false when a card is offset in position", () => {
    const st = board([card("a", 0.5, 0.5, 1, 0), card("b", 0.62, 0.5, 2, 0)]);
    expect(isTidyStack(st, ["a", "b"], 0.5, 0.5, 0)).toBe(false);
  });
  it("false when a card faces a different way", () => {
    const st = board([card("a", 0.5, 0.5, 1, 0), card("b", 0.5, 0.5, 2, 1)]);
    expect(isTidyStack(st, ["a", "b"], 0.5, 0.5, 0)).toBe(false);
  });
  it("tolerates sub-eps float drift", () => {
    const st = board([card("a", 0.5, 0.5, 1, 0), card("b", 0.5 + 5e-4, 0.5 - 5e-4, 2, 0)]);
    expect(isTidyStack(st, ["a", "b"], 0.5, 0.5, 0)).toBe(true);
  });
});

describe("nearestCongruentRot: shortest angular path (no stray long spin)", () => {
  it("90° (rot 1) straightening to upright 0 goes BACK to 0, not forward to 4", () => {
    expect(nearestCongruentRot(1, 0)).toBe(0);
  });
  it("270° (rot 3) straightening to upright 0 goes FORWARD to 4 (=360°), not back to 0", () => {
    // The congruent value of 0 nearest to 3 is 4 (distance 1), not 0 (distance 3).
    expect(nearestCongruentRot(3, 0)).toBe(4);
  });
  it("180° (rot 2) is equidistant: either ±2 is acceptable, lands congruent to target", () => {
    const r = nearestCongruentRot(2, 0);
    expect(Math.abs(r - 2)).toBeLessThanOrEqual(2); // never a long spin
    expect(((r % 4) + 4) % 4).toBe(0);              // still upright
  });
  it("never changes a card by more than 2 quarter-turns for any start", () => {
    for (let cur = -8; cur <= 8; cur++) {
      for (let tgt = -8; tgt <= 8; tgt++) {
        const r = nearestCongruentRot(cur, tgt);
        expect(Math.abs(r - cur)).toBeLessThanOrEqual(2);
        expect(((r - tgt) % 4 + 4) % 4).toBe(0); // congruent to target
      }
    }
  });
});

describe("rotateStack turn: every card takes the SHORTEST path, none spins the long way", () => {
  // Mirrors rotateStack: gatherStack(unifyRot = anchor.rot + dir). The anchor turns
  // exactly `dir`; every other card squares to the anchor's new angle by the shortest
  // arc (nearestCongruentRot keeps each within ±2 quarter-turns of its OWN angle).
  it("a mixed [0,1,2,3] pile turned +1 about a 0° anchor never moves a card > 180°", () => {
    const st = board([
      card("anchor", 0.5, 0.5, 1, 0), // anchor at 0°, dir +1 → target residue 1 (90°)
      card("b", 0.5, 0.5, 2, 1),      // 90°
      card("c", 0.5, 0.5, 3, 2),      // 180°
      card("d", 0.5, 0.5, 4, 3)       // 270°
    ]);
    const ids = ["anchor", "b", "c", "d"];
    const before: Record<string, number> = {};
    for (const id of ids) before[id] = st.cards.get(id)!.rot;
    gatherStack(st, ids, 0.5, 0.5, before["anchor"]! + 1); // anchor.rot + dir
    // Anchor turns exactly +1 (one quarter-turn).
    expect(st.cards.get("anchor")!.rot).toBe(1);
    // No card travels more than 2 quarter-turns (180°) from where it started.
    for (const id of ids) {
      expect(Math.abs(st.cards.get(id)!.rot - before[id]!)).toBeLessThanOrEqual(2);
    }
    // All end aligned to the anchor's new residue (the pile squares up as it turns).
    const residues = new Set(ids.map((id) => ((st.cards.get(id)!.rot % 4) + 4) % 4));
    expect(residues.size).toBe(1);
    expect([...residues][0]).toBe(1);
  });
});

describe("setStackFace: unify every face to one target, z preserved (no reversal)", () => {
  it("sets all cards to the target face without touching z or position", () => {
    const st = board([
      card("a", 0.5, 0.5, 1, 0, true),
      card("b", 0.5, 0.5, 2, 0, false),
      card("c", 0.5, 0.5, 3, 0, true)
    ]);
    const ids = ["a", "b", "c"];
    const zBefore = ids.map((id) => st.cards.get(id)!.z);
    setStackFace(st, ids, false);
    for (const id of ids) expect(st.cards.get(id)!.faceUp).toBe(false); // all closed now
    expect(ids.map((id) => st.cards.get(id)!.z)).toEqual(zBefore);       // z unchanged
    // Flipping the other way: all open.
    setStackFace(st, ids, true);
    for (const id of ids) expect(st.cards.get(id)!.faceUp).toBe(true);
    expect(ids.map((id) => st.cards.get(id)!.z)).toEqual(zBefore);
  });
});

describe("topVisibleId: the highest-z card stays visible through the turn", () => {
  it("returns the highest-z id regardless of map insertion order", () => {
    const st = board([card("top", 0.5, 0.5, 9), card("bottom", 0.5, 0.5, 1), card("mid", 0.5, 0.5, 5)]);
    expect(topVisibleId(st, ["bottom", "mid", "top"])).toBe("top");
  });
  it("returns null for an empty set and the lone id for a single card", () => {
    const st = board([card("solo", 0.5, 0.5, 3)]);
    expect(topVisibleId(st, [])).toBe(null);
    expect(topVisibleId(st, ["solo"])).toBe("solo");
  });
});

describe("turnStackOver: physical flip — depth reverses AND faces unify to one target", () => {
  it("reverses z (bottom↔top) and squares a MIXED pile to the target face", () => {
    // a(z1, up) b(z2, down) c(z3, up). Top card c is up → flip target = down (closed).
    const st = board([
      card("a", 0.5, 0.5, 1, 0, true),
      card("b", 0.5, 0.5, 2, 0, false),
      card("c", 0.5, 0.5, 3, 0, true)
    ]);
    turnStackOver(st, ["a", "b", "c"], false);
    // Depth reversed: a was bottom (z1) → now top (z3); c was top → now bottom (z1).
    expect(st.cards.get("a")!.z).toBe(3);
    expect(st.cards.get("b")!.z).toBe(2);
    expect(st.cards.get("c")!.z).toBe(1);
    // Every card squared to the SAME target face — the mixed pile is corrected.
    for (const id of ["a", "b", "c"]) expect(st.cards.get(id)!.faceUp).toBe(false);
  });

  it("preserves the exact set of z slots (the pile keeps its layer)", () => {
    const st = board([card("a", 0.5, 0.5, 5, 0, false), card("b", 0.5, 0.5, 8, 0, false), card("c", 0.5, 0.5, 13, 0, false)]);
    turnStackOver(st, ["a", "b", "c"], true);
    expect([st.cards.get("a")!.z, st.cards.get("b")!.z, st.cards.get("c")!.z].sort((x, y) => x - y)).toEqual([5, 8, 13]);
    for (const id of ["a", "b", "c"]) expect(st.cards.get(id)!.faceUp).toBe(true);
  });

  it("a lone card just adopts the target face (reversal is a no-op)", () => {
    const st = board([card("solo", 0.5, 0.5, 4, 0, true)]);
    turnStackOver(st, ["solo"], false);
    expect(st.cards.get("solo")!.z).toBe(4);
    expect(st.cards.get("solo")!.faceUp).toBe(false);
  });

  it("turnStackOver then flipVisibleCardId keeps a continuous (pop-free) visible card", () => {
    // Closing a face-up-topped pile: target=false. The OLD top (was the art we looked
    // at) ends at the bottom and is the card kept visible, turning from its art to back.
    const st = board([card("a", 0.5, 0.5, 1, 0, true), card("b", 0.5, 0.5, 2, 0, true), card("c", 0.5, 0.5, 3, 0, true)]);
    turnStackOver(st, ["a", "b", "c"], false); // z: a=3,b=2,c=1 ; all faceUp=false
    const vis = flipVisibleCardId(st, ["a", "b", "c"], false);
    expect(vis).toBe("c");                    // old top (now lowest z)
    expect(st.cards.get("c")!.z).toBe(1);
  });
});
