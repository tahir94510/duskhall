import { describe, it, expect } from "vitest";
import { MODES, DEFAULT_MODE_ID, getMode, isModeId, resolveModeId, MODE_IDS } from "./registry.js";
import { buildDeck, totalCardCount } from "../game/cards.js";

// Structural integrity of every registered mode. A malformed ModeDef (deck totals that
// disagree with balance, an id referenced nowhere, a category without a place in the tidy
// order) fails here rather than shipping a broken game.

describe("mode registry", () => {
  it("has a default that is a real, registered mode", () => {
    expect(MODE_IDS.has(DEFAULT_MODE_ID)).toBe(true);
    expect(getMode(DEFAULT_MODE_ID).id).toBe(DEFAULT_MODE_ID);
  });

  it("resolves unknown ids to the default, known ids to themselves", () => {
    expect(resolveModeId("nope")).toBe(DEFAULT_MODE_ID);
    expect(resolveModeId(null)).toBe(DEFAULT_MODE_ID);
    for (const m of MODES) expect(resolveModeId(m.id)).toBe(m.id);
    expect(isModeId("nope")).toBe(false);
    expect(isModeId(DEFAULT_MODE_ID)).toBe(true);
  });

  it("has unique mode ids", () => {
    const ids = MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const mode of MODES) {
    describe(`mode: ${mode.id}`, () => {
      it("id is a lowercase, slug-safe token (never collides with a room code)", () => {
        expect(mode.id).toMatch(/^[a-z][a-z0-9-]*$/);
      });

      it("deck totals agree with balance.totalCards", () => {
        expect(totalCardCount(mode.deck)).toBe(mode.balance.totalCards);
        expect(buildDeck(mode.deck).length).toBe(mode.balance.totalCards);
      });

      it("every deck face has a positive count and a known category", () => {
        for (const def of mode.deck) {
          expect(def.count).toBeGreaterThan(0);
          expect(mode.categoryOrder).toContain(def.category);
          expect(mode.categoryMeta[def.category]).toBeTruthy();
        }
      });

      it("every category in the order is used by at least one face and has metadata", () => {
        const used = new Set(mode.deck.map((d) => d.category));
        for (const cat of mode.categoryOrder) {
          expect(used.has(cat)).toBe(true);
          expect(mode.categoryMeta[cat]).toBeTruthy();
        }
      });

      it("face ids are unique within the mode", () => {
        const ids = mode.deck.map((d) => d.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("player count and seat count are consistent", () => {
        expect(mode.balance.playerCount).toBeLessThanOrEqual(mode.seatCount);
        expect(mode.meta.maxPlayers).toBeLessThanOrEqual(mode.seatCount);
        expect(mode.meta.minPlayers).toBeLessThanOrEqual(mode.meta.maxPlayers);
      });

      it("difficulty is 1..5 and duration is a sane range", () => {
        expect(mode.meta.difficulty).toBeGreaterThanOrEqual(1);
        expect(mode.meta.difficulty).toBeLessThanOrEqual(5);
        expect(mode.meta.durationMin).toBeGreaterThan(0);
        expect(mode.meta.durationMax).toBeGreaterThanOrEqual(mode.meta.durationMin);
      });
    });
  }
});
