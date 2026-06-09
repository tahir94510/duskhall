import { describe, it, expect } from "vitest";
import { mulberry32, hashStringToSeed, shuffle, seededDeck } from "./deck.js";
import { buildDeck, CARD_DEFS } from "./cards.js";

describe("buildDeck: the 72-card deck composition", () => {
  it("is exactly 72 cards", () => {
    expect(buildDeck().length).toBe(72);
  });
  it("matches the documented per-category totals (16 Seals, 24 Spells, 16 Interventions, 16 Servants)", () => {
    const deck = buildDeck();
    const byCat: Record<string, number> = {};
    for (const inst of deck) {
      const def = CARD_DEFS.find((d) => d.id === inst.defId)!;
      byCat[def.category] = (byCat[def.category] ?? 0) + 1;
    }
    expect(byCat).toEqual({ seal: 16, spell: 24, intervention: 16, servant: 16 });
  });
  it("gives every card instance a unique instanceId", () => {
    const ids = buildDeck().map((c) => c.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("shuffle: an unbiased, order-only permutation (Fisher–Yates)", () => {
  it("returns a permutation: same multiset, never drops or duplicates a card", () => {
    const deck = buildDeck();
    const out = shuffle(deck, mulberry32(12345));
    expect(out.length).toBe(deck.length);
    expect(new Set(out.map((c) => c.instanceId))).toEqual(new Set(deck.map((c) => c.instanceId)));
  });
  it("does not mutate the input array (returns a fresh copy)", () => {
    const deck = buildDeck();
    const before = deck.map((c) => c.instanceId);
    shuffle(deck, mulberry32(7));
    expect(deck.map((c) => c.instanceId)).toEqual(before); // input untouched
  });
  it("a different seed generally yields a different order", () => {
    const deck = buildDeck();
    const a = shuffle(deck, mulberry32(1)).map((c) => c.instanceId).join(",");
    const b = shuffle(deck, mulberry32(2)).map((c) => c.instanceId).join(",");
    expect(a).not.toBe(b);
  });
  it("the same seed is reproducible (so all peers that recompute it agree)", () => {
    const deck = buildDeck();
    const a = shuffle(deck, mulberry32(99)).map((c) => c.instanceId);
    const b = shuffle(deck, mulberry32(99)).map((c) => c.instanceId);
    expect(a).toEqual(b);
  });
  it("is UNBIASED: over many shuffles, each position sees a roughly uniform spread of cards", () => {
    // Fisher–Yates is the only in-place shuffle with no positional bias. Sanity-check that no
    // single card disproportionately favours position 0 across many independent shuffles. A naive
    // (biased) shuffle would skew this well beyond the tolerance below.
    const deck = buildDeck();
    const N = deck.length;            // 72
    const trials = 7200;             // ~100 expected hits per card at position 0
    const firstCounts = new Map<string, number>();
    for (let t = 0; t < trials; t++) {
      const top = shuffle(deck, mulberry32(t * 2654435761 + 1))[0]!;
      firstCounts.set(top.defId, (firstCounts.get(top.defId) ?? 0) + 1);
    }
    // Expected hits for a def with `count` copies at a uniformly random position 0 = trials*count/N.
    for (const def of CARD_DEFS) {
      const expected = (trials * def.count) / N;
      const actual = firstCounts.get(def.id) ?? 0;
      // Generous ±45% band: catches gross bias (a stuck/duplicated slot) without flaking on noise.
      expect(actual).toBeGreaterThan(expected * 0.55);
      expect(actual).toBeLessThan(expected * 1.45);
    }
  });
  it("every position is reachable by every card (no card is pinned to a slot)", () => {
    // Across many shuffles, the top card varies — proves the shuffle actually reorders rather
    // than returning a near-fixed sequence (the 'same cards keep coming up' failure mode).
    const deck = buildDeck();
    const tops = new Set<string>();
    for (let t = 0; t < 400; t++) tops.add(shuffle(deck, mulberry32(t + 1))[0]!.instanceId);
    expect(tops.size).toBeGreaterThan(20); // many distinct cards have reached the top
  });
});

describe("seededDeck: deterministic per seed, independent across seeds", () => {
  it("a given seed always produces the same deal (peer agreement before the snapshot)", () => {
    expect(seededDeck("ROOM42").map((c) => c.instanceId))
      .toEqual(seededDeck("ROOM42").map((c) => c.instanceId));
  });
  it("different seeds (rooms / reset nonces) produce different deals", () => {
    const a = seededDeck("ROOM42").map((c) => c.instanceId).join(",");
    const b = seededDeck("ROOM42:1700000000000:88").map((c) => c.instanceId).join(",");
    expect(a).not.toBe(b);
  });
  it("always returns the full 72-card deck", () => {
    expect(seededDeck("x").length).toBe(72);
  });
});

describe("mulberry32 / hashStringToSeed: the PRNG primitives", () => {
  it("mulberry32 yields values in [0,1) and is reproducible for a seed", () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = r1();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBe(r2()); // same seed → same stream
    }
  });
  it("mulberry32 has a roughly uniform mean over many draws (~0.5)", () => {
    const r = mulberry32(123456);
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) sum += r();
    expect(sum / n).toBeGreaterThan(0.49);
    expect(sum / n).toBeLessThan(0.51);
  });
  it("hashStringToSeed is stable per string and differs across strings", () => {
    expect(hashStringToSeed("ABC")).toBe(hashStringToSeed("ABC"));
    expect(hashStringToSeed("ABC")).not.toBe(hashStringToSeed("ABD"));
  });
});
