import { describe, it, expect } from "vitest";
import { pickName, pickNameExcluding, nameKey } from "./names.js";

describe("nameKey: case-insensitive AND Turkish dotted/dotless I safe", () => {
  it("folds the lossy Turkish I round-trip so variants share one key", () => {
    // "Tılsım" upper-cased then lower-cased becomes "tilsim" (dotted) under en locale —
    // a plain lowercase would NOT match the original "tılsım" (dotless). nameKey does.
    expect(nameKey("Tılsım")).toBe(nameKey("TILSIM"));
    expect(nameKey("Tılsım")).toBe(nameKey("tılsım"));
    expect(nameKey("Sır")).toBe(nameKey("SIR"));
    expect(nameKey("İstanbul")).toBe(nameKey("istanbul"));
  });
  it("still distinguishes genuinely different names", () => {
    expect(nameKey("Ash") === nameKey("Ember")).toBe(false);
  });
});

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
