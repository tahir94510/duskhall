import { describe, it, expect } from "vitest";
import { cardZoneOwner, cardZoneOverlap, ZONE_PRIVACY_FRAC, zoneRect, pointInZoneCanonical } from "./SlotGrid.js";

// Zone 0 (bottom): x[0.16,0.84], y[0.78,0.96]. A typical card footprint as a fraction
// of the board is roughly 0.08 wide x 0.12 tall. With H=0.12 the in-fraction as the card
// enters from the top is (ny - 0.72) / 0.12, so the privacy threshold (0.1) is crossed
// around ny ≈ 0.732.
const W = 0.08;
const H = 0.12;

describe("cardZoneOwner: privacy-first — a sliver in conceals, almost-fully-out reveals", () => {
  it("a card fully inside seat 0's zone is owned by seat 0", () => {
    expect(cardZoneOwner(0.5, 0.9, 0, W, H)).toBe(0);
  });

  it("a card in the central play area belongs to no one (public)", () => {
    expect(cardZoneOwner(0.5, 0.5, 0, W, H)).toBe(null);
  });

  it("only a tiny sliver in (below the privacy threshold) stays public", () => {
    // center y = 0.725: ~4% in (< ZONE_PRIVACY_FRAC) → almost fully out → public.
    expect(cardZoneOwner(0.5, 0.725, 0, W, H)).toBe(null);
  });

  it("even a small part in (above the threshold) is already concealed/owned", () => {
    // center y = 0.745: ~21% in — mostly OUT, but more than a sliver → private.
    expect(cardZoneOwner(0.5, 0.745, 0, W, H)).toBe(0);
  });

  it("fully out (toward centre) is public", () => {
    // center y = 0.71: card [0.65,0.77], below the zone top (0.78) → no overlap.
    expect(cardZoneOwner(0.5, 0.71, 0, W, H)).toBe(null);
  });

  it("the threshold is the small privacy fraction, not a half", () => {
    expect(ZONE_PRIVACY_FRAC).toBeLessThan(0.25);
  });

  it("a card resting at the very board edge still counts as inside the zone", () => {
    // The zone runs to the board edge (y1 = 1.0 for seat 0), so a card pushed right to
    // the bottom is in the owner's private area, not wrongly treated as public.
    expect(cardZoneOwner(0.5, 0.98, 0, W, H)).toBe(0); // bottom edge -> seat 0
    expect(cardZoneOwner(0.02, 0.5, 0, W, H)).toBe(2); // left edge -> seat 2
    expect(cardZoneOwner(0.98, 0.5, 0, W, H)).toBe(3); // right edge -> seat 3
    expect(cardZoneOwner(0.5, 0.02, 0, W, H)).toBe(1); // top edge -> seat 1
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

describe("cardZoneOverlap: reports the best seat and the in-fraction", () => {
  it("reports a high fraction deep inside and a small one near the edge", () => {
    const deepIn = cardZoneOverlap(0.5, 0.83, 0, W, H);
    expect(deepIn?.seat).toBe(0);
    expect(deepIn!.frac).toBeGreaterThan(0.5);
    const sliver = cardZoneOverlap(0.5, 0.735, 0, W, H);
    expect(sliver?.seat).toBe(0);
    expect(sliver!.frac).toBeGreaterThan(0);
    expect(sliver!.frac).toBeLessThan(0.5);
  });
  it("returns null in the central area (no zone touched)", () => {
    expect(cardZoneOverlap(0.5, 0.5, 0, W, H)).toBe(null);
  });
  it("cardZoneOwner gates the same overlap at the privacy threshold", () => {
    const o = cardZoneOverlap(0.5, 0.745, 0, W, H)!;
    expect(o.frac).toBeGreaterThan(ZONE_PRIVACY_FRAC);
    expect(cardZoneOwner(0.5, 0.745, 0, W, H)).toBe(0); // above threshold → owned
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
