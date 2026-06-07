import { describe, it, expect } from "vitest";
import { clampSeedToPage, clampSeedToOwnZone, type ClampCard, type PageBounds } from "./playfield.js";
import { seatDepthLateral, ZONE_DEPTH } from "./SlotGrid.js";
import type { BoardBox, Seat } from "./rotation.js";

// An 800x800 board centred at (500, 400) in a 1000x800 viewport. For seat 0 (no rotation):
//   px = nx*800 + (500 - 400) = nx*800 + 100   ->  board spans screen x [100, 900]
//   py = ny*800 + (400 - 400) = ny*800         ->  board spans screen y [0, 800]
// The viewport is wider than the board, so there is left/right MARGIN but no top/bottom margin.
const box: BoardBox = { cx: 500, cy: 400, width: 800, height: 800 };
const bounds: PageBounds = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
const cardW = 100;
const cardH = 145;
const single = (rot = 0): ClampCard[] => [{ dx: 0, dy: 0, rot }];

describe("clampSeedToPage", () => {
  it("lets a card leave the board into the page margin (right), stopping at the page edge", () => {
    const r = clampSeedToPage(99, 0.5, single(), box, 0, cardW, cardH, bounds);
    // Card centre clamps so its right edge sits at maxX: px = 1000 - 50 = 950 -> nx = (950-100)/800.
    expect(r.nx).toBeCloseTo((950 - 100) / 800, 6); // ~1.0625 -> OFF the board (nx > 1), ON the page
    expect(r.nx).toBeGreaterThan(1);
  });

  it("lets a card leave the board into the page margin (left)", () => {
    const r = clampSeedToPage(-99, 0.5, single(), box, 0, cardW, cardH, bounds);
    expect(r.nx).toBeCloseTo((50 - 100) / 800, 6); // ~-0.0625 -> off the board left
    expect(r.nx).toBeLessThan(0);
  });

  it("does NOT let a card leave the page on the tight axis (top/bottom here)", () => {
    const top = clampSeedToPage(0.5, -99, single(), box, 0, cardW, cardH, bounds);
    const bot = clampSeedToPage(0.5, 99, single(), box, 0, cardW, cardH, bounds);
    // Board fills the viewport vertically, so the card stops with its body inside [0,800]:
    expect(top.ny).toBeCloseTo((cardH / 2) / 800, 6);
    expect(bot.ny).toBeCloseTo((800 - cardH / 2) / 800, 6);
  });

  it("never pushes any part of the card past the page bounds", () => {
    const r = clampSeedToPage(99, 99, single(), box, 0, cardW, cardH, bounds);
    const px = r.nx * 800 + 100;
    const py = r.ny * 800;
    expect(px + cardW / 2).toBeLessThanOrEqual(bounds.maxX + 1e-6);
    expect(py + cardH / 2).toBeLessThanOrEqual(bounds.maxY + 1e-6);
  });

  it("uses the swapped extent for a sideways (odd quarter-turn) card", () => {
    // rot=1 -> on-screen the card is cardH wide, so the right-edge limit uses cardH/2.
    const r = clampSeedToPage(99, 0.5, single(1), box, 0, cardW, cardH, bounds);
    expect(r.nx).toBeCloseTo((1000 - cardH / 2 - 100) / 800, 6);
  });

  it("leaves an in-bounds seed untouched", () => {
    const r = clampSeedToPage(0.5, 0.5, single(), box, 0, cardW, cardH, bounds);
    expect(r.nx).toBeCloseTo(0.5, 9);
    expect(r.ny).toBeCloseTo(0.5, 9);
  });

  it("moves a multi-card group as a rigid block (tightest card binds the page edge)", () => {
    const cards: ClampCard[] = [{ dx: 0, dy: 0, rot: 0 }, { dx: 0.25, dy: 0, rot: 0 }];
    const r = clampSeedToPage(99, 0.5, cards, box, 0, cardW, cardH, bounds);
    // The +0.25 card is 0.25*800 = 200px right of the seed; it hits the right edge first.
    const seedPx = r.nx * 800 + 100;
    expect(seedPx + 200 + cardW / 2).toBeCloseTo(bounds.maxX, 4);
  });

  it("handles a rotated board (seat 2): canonical x maps to the screen vertical", () => {
    // seat 2 rotates -90deg; just assert the result keeps the card on the page.
    const r = clampSeedToPage(99, 99, single(), box, 2 as Seat, cardW, cardH, bounds);
    const scr = canonical(r.nx, r.ny, 2, box);
    expect(scr.px).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
    expect(scr.px).toBeLessThanOrEqual(bounds.maxX + 1e-6);
    expect(scr.py).toBeGreaterThanOrEqual(bounds.minY - 1e-6);
    expect(scr.py).toBeLessThanOrEqual(bounds.maxY + 1e-6);
  });
});

describe("clampSeedToOwnZone (sliding one-way pocket)", () => {
  // Canonical card footprint fractions (board is square). For seat 0/1 the depth axis is Y, so
  // hd = cardHFrac/2 = 0.09 and hu = cardWFrac/2 = 0.0625; inset (diagonal leg) = hd + hu = 0.1525.
  const cw = 0.125;
  const ch = 0.18;
  const hd = ch / 2; // 0.09
  const inset = ch / 2 + cw / 2; // 0.1525
  const one = (rot = 0): ClampCard[] => [{ dx: 0, dy: 0, rot }];
  const eps = 0.012;

  it("SLIDES along the left leg without crossing it or locking (seat 0)", () => {
    // prev inside (d=0.2, u=0.5). Drag hard left/down into the left leg.
    const r = clampSeedToOwnZone({ nx: 0.5, ny: 0.8 }, { nx: 0.1, ny: 0.8 }, one(), 0, cw, ch);
    const { d, u } = seatDepthLateral(0, r.nx, r.ny);
    expect(u - d).toBeGreaterThanOrEqual(inset - eps); // never crossed the wall
    expect(d).toBeGreaterThanOrEqual(hd - eps);          // never crossed the outer edge
    expect(d).toBeLessThanOrEqual(ZONE_DEPTH + eps);     // still in the pocket
    expect(r.nx).toBeLessThan(0.5 - 0.02);               // it MOVED (did not lock at prev)
  });

  it("stops at the outer board edge but keeps sliding laterally (seat 0)", () => {
    const r = clampSeedToOwnZone({ nx: 0.5, ny: 0.8 }, { nx: 0.5, ny: 0.99 }, one(), 0, cw, ch);
    const { d } = seatDepthLateral(0, r.nx, r.ny);
    expect(d).toBeCloseTo(hd, 2); // pinned at the card's near edge
    expect(r.nx).toBeCloseTo(0.5, 2);
  });

  it("leaves freely through the front door (centred, within the opening)", () => {
    const r = clampSeedToOwnZone({ nx: 0.5, ny: 0.8 }, { nx: 0.5, ny: 0.5 }, one(), 0, cw, ch);
    expect(r.nx).toBeCloseTo(0.5, 9);
    expect(r.ny).toBeCloseTo(0.5, 9);
  });

  it("does NOT teleport out a diagonal past the door (must funnel to the door)", () => {
    // next is past the door (d>ZONE_DEPTH) but laterally outside the opening -> must be clamped
    // back into the pocket, never returned as-is.
    const r = clampSeedToOwnZone({ nx: 0.5, ny: 0.8 }, { nx: 0.1, ny: 0.5 }, one(), 0, cw, ch);
    const { d, u } = seatDepthLateral(0, r.nx, r.ny);
    expect(d).toBeLessThanOrEqual(ZONE_DEPTH + eps);  // did not escape to the centre
    expect(u - d).toBeGreaterThanOrEqual(inset - eps); // did not cross the left leg
  });

  it("lets a card enter from the side (outside -> inside is never blocked)", () => {
    const r = clampSeedToOwnZone({ nx: 0.1, ny: 0.8 }, { nx: 0.5, ny: 0.8 }, one(), 0, cw, ch);
    expect(r.nx).toBeCloseTo(0.5, 9);
    expect(r.ny).toBeCloseTo(0.8, 9);
  });

  it("group: the LEFT card's body never crosses the leg, and the group still moves", () => {
    const cards: ClampCard[] = [{ dx: 0, dy: 0, rot: 0 }, { dx: -0.2, dy: 0, rot: 0 }];
    const r = clampSeedToOwnZone({ nx: 0.6, ny: 0.8 }, { nx: 0.4, ny: 0.8 }, cards, 0, cw, ch);
    const left = seatDepthLateral(0, r.nx - 0.2, r.ny); // the trailing (left) card
    expect(left.u - left.d).toBeGreaterThanOrEqual(inset - eps);
    expect(r.nx).toBeLessThan(0.6 - 0.01); // moved
  });

  it("does NOT snag a card dragged through the open centre across a rival corner (regression)", () => {
    const r = clampSeedToOwnZone({ nx: 0.3, ny: 0.6 }, { nx: 0.1, ny: 0.85 }, one(), 0, cw, ch);
    expect(r.nx).toBeCloseTo(0.1, 9);
    expect(r.ny).toBeCloseTo(0.85, 9);
  });

  it("lets a card enter from the front-side without freezing (regression)", () => {
    const r = clampSeedToOwnZone({ nx: 0.3, ny: 0.65 }, { nx: 0.25, ny: 0.85 }, one(), 0, cw, ch);
    expect(r.nx).toBeCloseTo(0.25, 9);
    expect(r.ny).toBeCloseTo(0.85, 9);
  });

  it("is a no-op for a spectator (seat < 0)", () => {
    const r = clampSeedToOwnZone({ nx: 0.5, ny: 0.8 }, { nx: 0.1, ny: 0.99 }, one(), -1 as Seat, cw, ch);
    expect(r.nx).toBeCloseTo(0.1, 9);
    expect(r.ny).toBeCloseTo(0.99, 9);
  });

  it("confines symmetrically for all four seats (outward push stops at the board edge)", () => {
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const inside = depthLateralToCanon(seat, 0.2, 0.5);
      const out = depthLateralToCanon(seat, 0.005, 0.5);
      const r = clampSeedToOwnZone(inside, out, one(), seat, cw, ch);
      const { d } = seatDepthLateral(seat, r.nx, r.ny);
      const seatHd = seat === 0 || seat === 1 ? ch / 2 : cw / 2;
      expect(d).toBeCloseTo(seatHd, 2);
    }
  });
});

// Inverse of seatDepthLateral for the symmetry test (axis-aligned per seat).
function depthLateralToCanon(seat: Seat, d: number, u: number): { nx: number; ny: number } {
  switch (seat) {
    case 0: return { nx: u, ny: 1 - d };
    case 1: return { nx: u, ny: d };
    case 2: return { nx: d, ny: u };
    default: return { nx: 1 - d, ny: u };
  }
}

// local mirror of canonicalToScreen for the seat-2 assertion (avoids importing the impl detail)
function canonical(nx: number, ny: number, seat: Seat, b: BoardBox): { px: number; py: number } {
  const deg = seat === 0 ? 0 : seat === 1 ? 180 : seat === 2 ? -90 : 90;
  const lx = nx * b.width - b.width / 2;
  const ly = ny * b.height - b.height / 2;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return { px: b.cx + (lx * cos - ly * sin), py: b.cy + (lx * sin + ly * cos) };
}
