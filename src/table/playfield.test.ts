import { describe, it, expect } from "vitest";
import { clampSeedToField, snapSeed, type ClampCard, type SnapTarget } from "./playfield.js";
import { APRON_FRAC } from "./constants.js";

// A typical card footprint as a fraction of the inner board (board.css: ~0.125 wide, 1.45x tall).
const HW = 0.125 / 2; // 0.0625
const HH = (0.125 * 1.45) / 2; // 0.0906
const A = APRON_FRAC;

const single = (rot = 0): ClampCard[] => [{ dx: 0, dy: 0, rot }];

describe("clampSeedToField", () => {
  it("lets an UPRIGHT card reach flush to the left/right edges (uses card WIDTH, not height)", () => {
    // The old bug used the tall side for the X inset, stopping cards ~45% short. The X limit
    // must be the half-WIDTH from the extended edge, not the half-height.
    const lo = clampSeedToField(-99, 0.5, single(), HW, HH);
    const hi = clampSeedToField(99, 0.5, single(), HW, HH);
    expect(lo.nx).toBeCloseTo(-A + HW, 6); // NOT -A + HH
    expect(hi.nx).toBeCloseTo(1 + A - HW, 6);
  });

  it("uses card HEIGHT for the vertical inset of an upright card", () => {
    const lo = clampSeedToField(0.5, -99, single(), HW, HH);
    const hi = clampSeedToField(0.5, 99, single(), HW, HH);
    expect(lo.ny).toBeCloseTo(-A + HH, 6);
    expect(hi.ny).toBeCloseTo(1 + A - HH, 6);
  });

  it("swaps width/height for a sideways (odd quarter-turn) card", () => {
    const hi = clampSeedToField(99, 0.5, single(1), HW, HH);
    expect(hi.nx).toBeCloseTo(1 + A - HH, 6); // sideways -> X inset is the half-height
  });

  it("treats a negative quarter-turn the same as its positive equivalent", () => {
    const pos = clampSeedToField(99, 0.5, single(1), HW, HH);
    const neg = clampSeedToField(99, 0.5, single(-1), HW, HH);
    expect(neg.nx).toBeCloseTo(pos.nx, 9);
    expect(clampSeedToField(99, 0.5, single(-3), HW, HH).nx).toBeCloseTo(pos.nx, 9);
  });

  it("keeps a card on the visible page: the body never exceeds the extended square", () => {
    const r = clampSeedToField(50, 50, single(), HW, HH);
    expect(r.nx + HW).toBeLessThanOrEqual(1 + A + 1e-9);
    expect(r.ny + HH).toBeLessThanOrEqual(1 + A + 1e-9);
  });

  it("leaves an in-range seed untouched", () => {
    const r = clampSeedToField(0.5, 0.5, single(), HW, HH);
    expect(r.nx).toBeCloseTo(0.5, 9);
    expect(r.ny).toBeCloseTo(0.5, 9);
  });

  it("moves a multi-card group as a rigid block (tightest card binds)", () => {
    // Two cards offset by +0.3 in x; the right one binds the right edge.
    const cards: ClampCard[] = [{ dx: 0, dy: 0, rot: 0 }, { dx: 0.3, dy: 0, rot: 0 }];
    const hi = clampSeedToField(99, 0.5, cards, HW, HH);
    expect(hi.nx).toBeCloseTo(1 + A - HW - 0.3, 6);
  });

  it("falls back to the extended range for a pile wider than the field", () => {
    // A pile spanning more than the whole field on x: lo > hi, clamp to [-A, 1+A].
    const cards: ClampCard[] = [{ dx: 0, dy: 0, rot: 0 }, { dx: 5, dy: 0, rot: 0 }];
    const r = clampSeedToField(99, 0.5, cards, HW, HH);
    expect(r.nx).toBeLessThanOrEqual(1 + A + 1e-9);
    expect(r.nx).toBeGreaterThanOrEqual(-A - 1e-9);
  });
});

describe("snapSeed (sticky magnet)", () => {
  const targets: SnapTarget[] = [
    { key: "deck", nx: 0.43, ny: 0.5 },
    { key: "discard", nx: 0.57, ny: 0.5 }
  ];
  const SNAP = 0.035;
  const BREAK = 0.06;

  it("engages the nearest target within the snap radius and reports its key", () => {
    const r = snapSeed(0.44, 0.5, targets, null, SNAP, BREAK);
    expect(r.snapKey).toBe("deck");
    expect(r.nx).toBeCloseTo(0.43, 9);
    expect(r.ny).toBeCloseTo(0.5, 9);
  });

  it("does not snap when no target is within the snap radius", () => {
    const r = snapSeed(0.5, 0.5, targets, null, SNAP, BREAK);
    expect(r.snapKey).toBeNull();
    expect(r.nx).toBeCloseTo(0.5, 9);
  });

  it("stays stuck within the looser break radius (hysteresis)", () => {
    // 0.48 is >SNAP from deck (0.05) but <BREAK, so a card already stuck to deck holds.
    const r = snapSeed(0.48, 0.5, targets, "deck", SNAP, BREAK);
    expect(r.snapKey).toBe("deck");
    expect(r.nx).toBeCloseTo(0.43, 9);
  });

  it("releases once the seed pulls beyond the break radius", () => {
    const r = snapSeed(0.5, 0.5, targets, "deck", SNAP, BREAK);
    expect(r.snapKey).toBeNull();
    expect(r.nx).toBeCloseTo(0.5, 9);
  });
});
