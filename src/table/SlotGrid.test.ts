import { describe, it, expect } from "vitest";
import { cardZoneOwner, cardZoneOverlap, ZONE_PRIVACY_FRAC, ZONE_DEPTH, zoneRect, pointInZoneCanonical, CARD_CANON_W, CARD_CANON_H } from "./SlotGrid.js";

// Use the REAL production footprint so the test tracks live behaviour: the privacy
// boundary must follow the actual canonical card size (kept in step with board.css
// --card-w). Boundaries are derived from H, not hard-coded, so re-tuning the card size
// never silently invalidates these assertions.
const W = CARD_CANON_W;
const H = CARD_CANON_H;
// Bottom zone (seat 0) top edge, read straight from the production zone so the test
// tracks any depth change. For a card centred at (0.5, ny) with its full width inside,
// the in-fraction is (ny + H/2 - Z0_TOP) / H. Invert it to place a card at a chosen
// overlap, so each case targets an exact fraction regardless of zone depth or card size.
const Z0_TOP = zoneRect(0).y0;
const nyForFrac = (f: number): number => Z0_TOP - H / 2 + f * H;

describe("cardZoneOwner: privacy-first — a sliver in conceals, almost-fully-out reveals", () => {
  it("a card fully inside seat 0's zone is owned by seat 0", () => {
    expect(cardZoneOwner(0.5, 0.9, 0, W, H)).toBe(0);
  });

  it("a card in the central play area belongs to no one (public)", () => {
    expect(cardZoneOwner(0.5, 0.5, 0, W, H)).toBe(null);
  });

  it("only a tiny sliver in (below the privacy threshold) stays public", () => {
    // ~4% in (< ZONE_PRIVACY_FRAC) → almost fully out → public.
    expect(cardZoneOwner(0.5, nyForFrac(0.04), 0, W, H)).toBe(null);
  });

  it("even a small part in (above the threshold) is already concealed/owned", () => {
    // ~20% in — mostly OUT, but more than a sliver → private.
    expect(cardZoneOwner(0.5, nyForFrac(0.2), 0, W, H)).toBe(0);
  });

  it("fully out (toward centre) is public", () => {
    // Footprint top edge sits just below the zone top (0.78) → no overlap at all.
    expect(cardZoneOwner(0.5, Z0_TOP - H / 2 - 0.02, 0, W, H)).toBe(null);
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
    // Seat 2 (left): the x=0 edge band, x[0.0,0.28]. A card rotated 90° presents H x W.
    // Centre near the left edge; with the swapped (wider-than-tall) footprint it sits
    // inside the left band differently than unrotated.
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
    const deepIn = cardZoneOverlap(0.5, nyForFrac(0.7), 0, W, H);
    expect(deepIn?.seat).toBe(0);
    expect(deepIn!.frac).toBeGreaterThan(0.5);
    const sliver = cardZoneOverlap(0.5, nyForFrac(0.25), 0, W, H);
    expect(sliver?.seat).toBe(0);
    expect(sliver!.frac).toBeGreaterThan(0);
    expect(sliver!.frac).toBeLessThan(0.5);
  });
  it("returns null in the central area (no zone touched)", () => {
    expect(cardZoneOverlap(0.5, 0.5, 0, W, H)).toBe(null);
  });
  it("a corner card is owned by the TRAPEZOID holding most of its body (no side-band corner-steal)", () => {
    // Centre inside seat 0's trapezoid near the seat-0/seat-2 diagonal. The old rectangle bands
    // counted seat 2's full-height side band and could steal the corner while the card was still
    // visually in seat 0; the trapezoid overlap keeps it seat 0 — the body is mostly there.
    const o = cardZoneOverlap(0.35, 0.85, 0, W, H);
    expect(o?.seat).toBe(0);
  });
  it("a card whose centre is in the public middle reads public, not concealed by a grazing sliver", () => {
    // Centre past the door in the shared centre, only a hair of the body grazing a band. The
    // trapezoid overlap treats it as public (its body is mostly in the centre), where the old
    // rectangle band kept it privately 'owned' on a sub-1% sliver.
    expect(cardZoneOverlap(0.65, 0.63, 0, W, H)).toBe(null);
  });
  it("reveals only when fully clear of every band", () => {
    // Far enough into the centre that no band is touched on any axis → public.
    expect(cardZoneOverlap(0.5, 1 - ZONE_DEPTH - H / 2 - 0.01, 0, W, H)).toBe(null);
  });
  it("corner ownership goes to the band the card overlaps MOST (backs the rival-zone drop guard)", () => {
    // A card straddling the bottom-right corner. Pushed deep into the bottom band but only
    // grazing the right edge → owned by the bottom seat (0): a player may keep it in their own
    // hand even when it clips a neighbour's corner. Slid deep into the right band instead →
    // owned by the right seat (3), so the drop guard (cardZoneOwner → isRivalOwned) snaps it back.
    const mostlyBottom = cardZoneOverlap(0.66, 0.95, 0, W, H);
    expect(mostlyBottom!.seat).toBe(0);
    const mostlyRight = cardZoneOverlap(0.97, 0.66, 0, W, H);
    expect(mostlyRight!.seat).toBe(3);
  });
  it("cardZoneOwner gates the same overlap at the privacy threshold", () => {
    const ny = nyForFrac(0.2);
    const o = cardZoneOverlap(0.5, ny, 0, W, H)!;
    expect(o.frac).toBeGreaterThan(ZONE_PRIVACY_FRAC);
    expect(cardZoneOwner(0.5, ny, 0, W, H)).toBe(0); // above threshold → owned
  });
});

describe("corner privacy: total in-zone gate, no early/diagonal reveal, no flicker", () => {
  // A card straddling the bottom-left corner diagonal is split between seat 0 (bottom band)
  // and seat 2 (left band). With the OLD max-single-zone gate each half could fall below the
  // privacy threshold while the body is still well inside the corner, so the card flashed
  // public ("revealed diagonally/too quickly"). The total in-zone gate counts both halves, so
  // it stays concealed (owned) until the body is genuinely almost fully out.
  it("a card straddling a shared diagonal stays concealed and does NOT flip-flop owner (dead-band)", () => {
    // Slide a card straight along the bottom-left (seat 0 / seat 2) diagonal, staying near the
    // 50/50 split. Without the dead-band the raw argmax flips between seat 0 and seat 2 on
    // sub-percent jitter — the corner flicker. With it, ownership is pinned to the lower seat
    // index (0) and stays there for the whole near-tied band: one stable owner, never null.
    const owners = new Set<number | null>();
    for (let t = 0; t <= 1; t += 0.05) {
      const nx = 0.12 + t * 0.10; // 0.12 → 0.22, hugging the diagonal
      const ny = 0.88 - t * 0.10; // 0.88 → 0.78
      owners.add(cardZoneOwner(nx, ny, 0, W, H));
    }
    expect(owners.has(null)).toBe(false);   // deep in the corner → always private
    expect([...owners]).toEqual([0]);       // exactly ONE owner the whole way — no flip-flop
  });

  it("reveal is MONOTONIC along an outward corner path — once public it never flips back (no flicker)", () => {
    // Walk a card from deep inside the bottom-left corner straight out to the public centre.
    // Concealment must only ever turn OFF (owned → public), never back ON: a public→owned flip
    // mid-path is exactly the corner flicker the fix removes.
    let wentPublic = false;
    for (let t = 0; t <= 1; t += 0.01) {
      const nx = 0.12 + t * (0.5 - 0.12);
      const ny = 0.88 - t * (0.88 - 0.5);
      const owned = cardZoneOwner(nx, ny, 0, W, H) !== null;
      if (!owned) wentPublic = true;
      else if (wentPublic) {
        throw new Error(`reveal flickered back to concealed at t=${t.toFixed(2)} (${nx.toFixed(3)}, ${ny.toFixed(3)})`);
      }
    }
    expect(wentPublic).toBe(true); // it does become public by the centre
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
