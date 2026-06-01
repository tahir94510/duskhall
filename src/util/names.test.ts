import { describe, it, expect } from "vitest";
import { pickName, pickNameExcluding } from "./names.js";

describe("pickName", () => {
  it("returns a non-empty handle from the pool", () => {
    for (let i = 0; i < 50; i++) {
      const n = pickName();
      expect(typeof n).toBe("string");
      expect(n.length).toBeGreaterThan(0);
    }
  });
});

describe("pickNameExcluding", () => {
  it("never returns a name already taken (case-insensitive)", () => {
    // Run many draws to make a collision overwhelmingly likely if dedup failed.
    for (let i = 0; i < 200; i++) {
      const first = pickName();
      const next = pickNameExcluding([first.toLocaleUpperCase()]);
      expect(next.toLocaleLowerCase()).not.toBe(first.toLocaleLowerCase());
    }
  });

  it("falls back to a numbered handle when every pool name is taken", () => {
    // Exclude a huge set that certainly covers the whole pool by excluding many
    // draws; then verify the result is still unique against the taken set.
    const taken = new Set<string>();
    for (let i = 0; i < 5000; i++) taken.add(pickName().toLocaleLowerCase());
    const n = pickNameExcluding(taken);
    expect(n.length).toBeGreaterThan(0);
    expect(taken.has(n.toLocaleLowerCase())).toBe(false);
  });
});
