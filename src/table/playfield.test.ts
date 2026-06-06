import { describe, it, expect } from "vitest";
import { clampSeedToField, type ClampCard } from "./playfield.js";

// A typical card footprint as a fraction of the board (board.css: ~0.125 wide, 1.45x tall).
const HW = 0.125 / 2; // 0.0625
const HH = (0.125 * 1.45) / 2; // 0.0906

const single = (rot = 0): ClampCard[] => [{ dx: 0, dy: 0, rot }];

describe("clampSeedToField", () => {
  it("lets an UPRIGHT card reach flush to the left/right edges (uses card WIDTH, not height)", () => {
    // The old bug used the tall side for the X inset, stopping cards ~45% short. The X limit
    // must be the half-WIDTH from the edge, not the half-height.
    const lo = clampSeedToField(-99, 0.5, single(), HW, HH);
    const hi = clampSeedToField(99, 0.5, single(), HW, HH);
    expect(lo.nx).toBeCloseTo(HW, 6); // NOT HH
    expect(hi.nx).toBeCloseTo(1 - HW, 6);
  });

  it("uses card HEIGHT for the vertical inset of an upright card", () => {
    const lo = clampSeedToField(0.5, -99, single(), HW, HH);
    const hi = clampSeedToField(0.5, 99, single(), HW, HH);
    expect(lo.ny).toBeCloseTo(HH, 6);
    expect(hi.ny).toBeCloseTo(1 - HH, 6);
  });

  it("swaps width/height for a sideways (odd quarter-turn) card", () => {
    const hi = clampSeedToField(99, 0.5, single(1), HW, HH);
    expect(hi.nx).toBeCloseTo(1 - HH, 6); // sideways -> X inset is the half-height
  });

  it("treats a negative quarter-turn the same as its positive equivalent", () => {
    const pos = clampSeedToField(99, 0.5, single(1), HW, HH);
    const neg = clampSeedToField(99, 0.5, single(-1), HW, HH);
    expect(neg.nx).toBeCloseTo(pos.nx, 9);
    expect(clampSeedToField(99, 0.5, single(-3), HW, HH).nx).toBeCloseTo(pos.nx, 9);
  });

  it("keeps a card on the board: the body never exceeds [0,1]", () => {
    const r = clampSeedToField(50, 50, single(), HW, HH);
    expect(r.nx + HW).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.ny + HH).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.nx - HW).toBeGreaterThanOrEqual(-1e-9);
  });

  it("leaves an in-range seed untouched", () => {
    const r = clampSeedToField(0.5, 0.5, single(), HW, HH);
    expect(r.nx).toBeCloseTo(0.5, 9);
    expect(r.ny).toBeCloseTo(0.5, 9);
  });

  it("moves a multi-card group as a rigid block (tightest card binds)", () => {
    const cards: ClampCard[] = [{ dx: 0, dy: 0, rot: 0 }, { dx: 0.3, dy: 0, rot: 0 }];
    const hi = clampSeedToField(99, 0.5, cards, HW, HH);
    expect(hi.nx).toBeCloseTo(1 - HW - 0.3, 6);
  });

  it("falls back to [0,1] for a pile wider than the board", () => {
    const cards: ClampCard[] = [{ dx: 0, dy: 0, rot: 0 }, { dx: 5, dy: 0, rot: 0 }];
    const r = clampSeedToField(99, 0.5, cards, HW, HH);
    expect(r.nx).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.nx).toBeGreaterThanOrEqual(-1e-9);
  });
});
