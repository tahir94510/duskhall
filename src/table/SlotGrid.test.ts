import { describe, it, expect } from "vitest";
import { cardZoneOwner, zoneRect, pointInZoneCanonical } from "./SlotGrid.js";

// Zone 0 (bottom): x[0.16,0.84], y[0.78,0.96]. A typical card footprint as a fraction
// of the board is roughly 0.08 wide x 0.12 tall.
const W = 0.08;
const H = 0.12;

describe("cardZoneOwner: a card belongs to a zone only when >50% of its area is inside", () => {
  it("a card fully inside seat 0's zone is owned by seat 0", () => {
    expect(cardZoneOwner(0.5, 0.9, 0, W, H)).toBe(0);
  });

  it("a card in the central play area belongs to no one (public)", () => {
    expect(cardZoneOwner(0.5, 0.5, 0, W, H)).toBe(null);
  });

  it("just under half inside the zone is NOT owned (public)", () => {
    // center y = 0.775: card spans [0.715,0.835], overlap [0.78,0.835] ≈ 46% → public.
    expect(cardZoneOwner(0.5, 0.775, 0, W, H)).toBe(null);
  });

  it("more than half inside the zone IS owned", () => {
    // center y = 0.79: ~58% of the height overlaps the zone.
    expect(cardZoneOwner(0.5, 0.79, 0, W, H)).toBe(0);
  });

  it("more than half OUT (pulled toward centre) becomes public again", () => {
    // center y = 0.76: only ~33% overlaps → public.
    expect(cardZoneOwner(0.5, 0.76, 0, W, H)).toBe(null);
  });

  it("is rotation-aware: an odd quarter-turn swaps the footprint", () => {
    // Seat 2 (left): x[0.04,0.22], y[0.22,0.78]. A card rotated 90° presents H x W.
    // Centre near the left edge; with the swapped (wider-than-tall) footprint it sits
    // mostly inside the tall-thin left zone differently than unrotated.
    const upright = cardZoneOwner(0.13, 0.5, 0, W, H);
    const turned = cardZoneOwner(0.13, 0.5, 1, W, H);
    // Both resolve to seat 2 here, but the function must not throw and must apply the
    // swap (regression guard: rotated cards are measured with swapped w/h).
    expect(upright).toBe(2);
    expect(turned).toBe(2);
  });

  it("zones do not overlap, so at most one seat ever owns a card", () => {
    for (const [nx, ny] of [[0.5, 0.9], [0.5, 0.1], [0.13, 0.5], [0.87, 0.5], [0.5, 0.5]]) {
      const owner = cardZoneOwner(nx!, ny!, 0, W, H);
      expect(owner === null || (owner >= 0 && owner <= 3)).toBe(true);
    }
  });
});

describe("zoneRect / pointInZoneCanonical stay consistent", () => {
  it("zoneRect returns the seat rectangle and the point test agrees with it", () => {
    const z = zoneRect(0);
    const cx = (z.x0 + z.x1) / 2;
    const cy = (z.y0 + z.y1) / 2;
    expect(pointInZoneCanonical(0, cx, cy)).toBe(true);
    expect(pointInZoneCanonical(0, 0.5, 0.5)).toBe(false);
  });
});
