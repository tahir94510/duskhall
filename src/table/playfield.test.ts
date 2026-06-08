import { describe, it, expect } from "vitest";
import { clampSeedToPage, type ClampCard, type PageBounds } from "./playfield.js";
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

  it("clamps each axis independently so a card slides along the edge it is pressed to", () => {
    // Pushed hard past the right edge AND moved vertically: x pins at the edge, y is free to track.
    const a = clampSeedToPage(99, 0.25, single(), box, 0, cardW, cardH, bounds);
    const b = clampSeedToPage(99, 0.75, single(), box, 0, cardW, cardH, bounds);
    expect(a.nx).toBeCloseTo(b.nx, 9);          // same clamped x edge
    expect(a.ny).not.toBeCloseTo(b.ny, 3);      // y slid freely (not locked)
    expect(a.ny).toBeCloseTo(0.25, 6);
    expect(b.ny).toBeCloseTo(0.75, 6);
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

  it("handles a rotated board (-90deg, the seat-2 view): canonical x maps to the screen vertical", () => {
    // -90deg is the seat-2 / left-neighbour camera angle; assert the result keeps the card on the page.
    const r = clampSeedToPage(99, 99, single(), box, -90, cardW, cardH, bounds);
    const scr = canonical(r.nx, r.ny, 2, box);
    expect(scr.px).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
    expect(scr.px).toBeLessThanOrEqual(bounds.maxX + 1e-6);
    expect(scr.py).toBeGreaterThanOrEqual(bounds.minY - 1e-6);
    expect(scr.py).toBeLessThanOrEqual(bounds.maxY + 1e-6);
  });

  it("keeps the card on the page at every INTERMEDIATE angle of a live turn", () => {
    // Mid-turn the board passes through angles between two seats (e.g. -45deg). The clamp must hold
    // the card on the page at each of them, so a held card never pokes off-screen while it spins.
    for (const deg of [-15, -30, -45, -60, -75, 30, 120, 200]) {
      const r = clampSeedToPage(99, 99, single(1), box, deg, cardW, cardH, bounds);
      const scr = canonicalDeg(r.nx, r.ny, deg, box);
      // The sideways card (rot=1) is cardH wide, cardW tall on the un-turned axis; assert the full
      // body, rotated by deg, stays within the page on both axes.
      const halfX = Math.abs(Math.cos((deg * Math.PI) / 180)) * (cardH / 2) + Math.abs(Math.sin((deg * Math.PI) / 180)) * (cardW / 2);
      const halfY = Math.abs(Math.sin((deg * Math.PI) / 180)) * (cardH / 2) + Math.abs(Math.cos((deg * Math.PI) / 180)) * (cardW / 2);
      expect(scr.px - halfX).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
      expect(scr.px + halfX).toBeLessThanOrEqual(bounds.maxX + 1e-6);
      expect(scr.py - halfY).toBeGreaterThanOrEqual(bounds.minY - 1e-6);
      expect(scr.py + halfY).toBeLessThanOrEqual(bounds.maxY + 1e-6);
    }
  });
});

// canonicalToScreen at an arbitrary angle, mirroring rotation.canonicalToScreenDeg.
function canonicalDeg(nx: number, ny: number, deg: number, b: BoardBox): { px: number; py: number } {
  const lx = nx * b.width - b.width / 2;
  const ly = ny * b.height - b.height / 2;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return { px: b.cx + (lx * cos - ly * sin), py: b.cy + (lx * sin + ly * cos) };
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
