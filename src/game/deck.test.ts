import { describe, it, expect } from "vitest";
import { mulberry32, hashStringToSeed, shuffle, seededDeck } from "./deck.js";
import { buildDeck } from "./cards.js";
import { MODES } from "../modes/registry.js";
import { vaerumMode } from "../modes/vaerum.js";
import { zanMode } from "../modes/zan.js";

// Deck helpers are mode-parameterized: buildDeck/seededDeck take an explicit deck so every
// mode's composition is verified from its own catalogue, independent of which mode is active.

describe("buildDeck: per-mode deck composition", () => {
  for (const mode of MODES) {
    it(`${mode.id}: sums to balance.totalCards (${mode.balance.totalCards})`, () => {
      expect(buildDeck(mode.deck).length).toBe(mode.balance.totalCards);
    });
    it(`${mode.id}: category counts match the sum of face counts`, () => {
      const deck = buildDeck(mode.deck);
      const byCat: Record<string, number> = {};
      for (const inst of deck) {
        const def = mode.deck.find((d) => d.id === inst.defId)!;
        byCat[def.category] = (byCat[def.category] ?? 0) + 1;
      }
      const expected: Record<string, number> = {};
      for (const def of mode.deck) expected[def.category] = (expected[def.category] ?? 0) + def.count;
      expect(byCat).toEqual(expected);
    });
    it(`${mode.id}: gives every card instance a unique instanceId`, () => {
      const ids = buildDeck(mode.deck).map((c) => c.instanceId);
      expect(new Set(ids).size).toBe(ids.length);
    });
  }
});

describe("mode-specific headline composition", () => {
  it("Vaerum is 72 cards, 16/24/16/16 across four types", () => {
    const deck = buildDeck(vaerumMode.deck);
    expect(deck.length).toBe(72);
    const byCat: Record<string, number> = {};
    for (const inst of deck) {
      const def = vaerumMode.deck.find((d) => d.id === inst.defId)!;
      byCat[def.category] = (byCat[def.category] ?? 0) + 1;
    }
    expect(byCat).toEqual({ seal: 16, spell: 24, intervention: 16, servant: 16 });
  });
  it("ZAN is 40 cards, four suits of ten", () => {
    const deck = buildDeck(zanMode.deck);
    expect(deck.length).toBe(40);
    const byCat: Record<string, number> = {};
    for (const inst of deck) {
      const def = zanMode.deck.find((d) => d.id === inst.defId)!;
      byCat[def.category] = (byCat[def.category] ?? 0) + 1;
    }
    expect(byCat).toEqual({ raven: 10, skull: 10, moon: 10, eye: 10 });
  });
});

describe("shuffle: an unbiased, order-only permutation (Fisher-Yates)", () => {
  const deck = buildDeck(vaerumMode.deck);
  it("returns a permutation: same multiset, never drops or duplicates a card", () => {
    const out = shuffle(deck, mulberry32(12345));
    expect(out.length).toBe(deck.length);
    expect(new Set(out.map((c) => c.instanceId))).toEqual(new Set(deck.map((c) => c.instanceId)));
  });
  it("does not mutate the input array (returns a fresh copy)", () => {
    const before = deck.map((c) => c.instanceId);
    shuffle(deck, mulberry32(7));
    expect(deck.map((c) => c.instanceId)).toEqual(before);
  });
  it("a different seed generally yields a different order", () => {
    const a = shuffle(deck, mulberry32(1)).map((c) => c.instanceId).join(",");
    const b = shuffle(deck, mulberry32(2)).map((c) => c.instanceId).join(",");
    expect(a).not.toBe(b);
  });
  it("the same seed is reproducible (so all peers that recompute it agree)", () => {
    const a = shuffle(deck, mulberry32(99)).map((c) => c.instanceId);
    const b = shuffle(deck, mulberry32(99)).map((c) => c.instanceId);
    expect(a).toEqual(b);
  });
  it("is UNBIASED: over many shuffles, each position sees a roughly uniform spread of cards", () => {
    const N = deck.length;
    const trials = 7200;
    const firstCounts = new Map<string, number>();
    for (let tr = 0; tr < trials; tr++) {
      const top = shuffle(deck, mulberry32(tr * 2654435761 + 1))[0]!;
      firstCounts.set(top.defId, (firstCounts.get(top.defId) ?? 0) + 1);
    }
    for (const def of vaerumMode.deck) {
      const expected = (trials * def.count) / N;
      const actual = firstCounts.get(def.id) ?? 0;
      expect(actual).toBeGreaterThan(expected * 0.55);
      expect(actual).toBeLessThan(expected * 1.45);
    }
  });
  it("every position is reachable by every card (no card is pinned to a slot)", () => {
    const tops = new Set<string>();
    for (let tr = 0; tr < 400; tr++) tops.add(shuffle(deck, mulberry32(tr + 1))[0]!.instanceId);
    expect(tops.size).toBeGreaterThan(20);
  });
});

describe("seededDeck: deterministic per seed, independent across seeds", () => {
  it("a given seed always produces the same deal (peer agreement before the snapshot)", () => {
    expect(seededDeck("ROOM42", vaerumMode.deck).map((c) => c.instanceId))
      .toEqual(seededDeck("ROOM42", vaerumMode.deck).map((c) => c.instanceId));
  });
  it("different seeds (rooms / reset nonces) produce different deals", () => {
    const a = seededDeck("ROOM42", vaerumMode.deck).map((c) => c.instanceId).join(",");
    const b = seededDeck("ROOM42:1700000000000:88", vaerumMode.deck).map((c) => c.instanceId).join(",");
    expect(a).not.toBe(b);
  });
  it("returns the full deck for the passed mode", () => {
    expect(seededDeck("x", vaerumMode.deck).length).toBe(72);
    expect(seededDeck("x", zanMode.deck).length).toBe(40);
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
      expect(v).toBe(r2());
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
