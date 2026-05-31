import { describe, it, expect } from "vitest";
import {
  rotateVec,
  seatRotationDeg,
  localSlotForSeat,
  seatForLocalSlot,
  screenToCanonical,
  canonicalToScreen,
  type Seat,
  type LocalSlot,
  type BoardBox
} from "./rotation.js";

const SEATS: Seat[] = [0, 1, 2, 3];
const SLOTS: LocalSlot[] = ["bottom", "top", "left", "right"];

// The single source of truth for the four physical seats around the table.
// Derived purely from the canonical frame (seat 0 South, 1 North, 2 West,
// 3 East). Each viewer rotates so their own seat is at the bottom. The matrix
// below is what a correct, internally consistent projection MUST produce; if
// this test ever fails the bug is localised to SEAT_DIR / seatRotationDeg.
const EXPECTED: Record<Seat, Record<Seat, LocalSlot>> = {
  0: { 0: "bottom", 1: "top", 2: "left", 3: "right" },
  1: { 0: "top", 1: "bottom", 2: "right", 3: "left" },
  2: { 0: "right", 1: "left", 2: "bottom", 3: "top" },
  3: { 0: "left", 1: "right", 2: "top", 3: "bottom" }
};

describe("seat → local slot mapping", () => {
  it("places the viewer's own seat at the bottom for every seat", () => {
    for (const v of SEATS) expect(localSlotForSeat(v, v)).toBe("bottom");
  });

  it("maps the three other seats to three distinct, non-bottom slots", () => {
    for (const v of SEATS) {
      const slots = SEATS.filter((s) => s !== v).map((s) => localSlotForSeat(v, s));
      expect(new Set(slots).size).toBe(3); // all distinct
      expect(slots).not.toContain("bottom"); // bottom is reserved for self
      // Together with self/bottom they cover all four slots exactly once.
      const all = SEATS.map((s) => localSlotForSeat(v, s));
      expect(new Set(all)).toEqual(new Set(SLOTS));
    }
  });

  it("matches the expected physical seating matrix exactly", () => {
    for (const v of SEATS) {
      for (const s of SEATS) {
        expect(localSlotForSeat(v, s)).toBe(EXPECTED[v][s]);
      }
    }
  });

  it("is mutually consistent: if A sees B at left, B sees A at right (top↔top)", () => {
    const mirror: Record<LocalSlot, LocalSlot> = { left: "right", right: "left", top: "top", bottom: "bottom" };
    for (const a of SEATS) {
      for (const b of SEATS) {
        if (a === b) continue;
        const slotAseesB = localSlotForSeat(a, b);
        const slotBseesA = localSlotForSeat(b, a);
        expect(slotBseesA).toBe(mirror[slotAseesB]);
      }
    }
  });

  it("seatForLocalSlot is the inverse of localSlotForSeat", () => {
    for (const v of SEATS) {
      for (const s of SEATS) {
        const slot = localSlotForSeat(v, s);
        expect(seatForLocalSlot(v, slot)).toBe(s);
      }
    }
  });
});

describe("screen <-> canonical is an exact round-trip for every seat", () => {
  // A deliberately NON-square board (wide desktop) with an off-origin centre, so
  // the test would catch the old square-board assumption bug.
  const box: BoardBox = { cx: 960, cy: 400, width: 1600, height: 820 };
  // Canonical points across the board, including the deck/discard centres.
  const points: Array<[number, number]> = [
    [0.5, 0.5], [0.4, 0.5], [0.6, 0.5], [0.1, 0.9], [0.92, 0.08], [0.0, 0.0], [1.0, 1.0]
  ];

  it("canonical -> screen -> canonical returns the original point for all seats", () => {
    for (const v of SEATS) {
      for (const [nx, ny] of points) {
        const { px, py } = canonicalToScreen(nx, ny, v, box);
        const back = screenToCanonical(px, py, v, box);
        expect(back.nx).toBeCloseTo(nx, 6);
        expect(back.ny).toBeCloseTo(ny, 6);
      }
    }
  });

  it("seat 0 reduces to the plain top-left mapping (no rotation)", () => {
    // For seat 0, canonical (0.5,0.5) is the board centre in pixels.
    const { px, py } = canonicalToScreen(0.5, 0.5, 0, box);
    expect(px).toBeCloseTo(box.cx, 6);
    expect(py).toBeCloseTo(box.cy, 6);
  });

  it("a point in front of the local seat maps to the lower half of the screen", () => {
    // Canonical seat-0 area (y≈0.9, 'south') must appear at the bottom for seat 0
    // and, after rotation, also in the lower half for every other viewer's OWN
    // seat — i.e. each player sees their own front at the bottom.
    for (const v of SEATS) {
      // The canonical anchor of seat v (its own front), pushed toward its edge.
      const anchor: Record<Seat, [number, number]> = {
        0: [0.5, 0.9], 1: [0.5, 0.1], 2: [0.1, 0.5], 3: [0.9, 0.5]
      };
      const [nx, ny] = anchor[v];
      const { py } = canonicalToScreen(nx, ny, v, box);
      expect(py).toBeGreaterThan(box.cy); // below centre = bottom of screen
    }
  });
});

describe("rotateVec is a true inverse on a non-square board", () => {
  // Pixel offsets from the board centre on a wide (non-square) board.
  const offsets: Array<[number, number]> = [
    [800, -450], [-640, 360], [123.5, -987.6], [1600, 900], [-1, 1]
  ];
  it("rotate then un-rotate returns the original offset for every seat angle", () => {
    for (const v of SEATS) {
      const deg = seatRotationDeg(v);
      for (const [dx, dy] of offsets) {
        const [rx, ry] = rotateVec(dx, dy, deg);
        const [bx, by] = rotateVec(rx, ry, -deg);
        expect(bx).toBeCloseTo(dx, 6);
        expect(by).toBeCloseTo(dy, 6);
      }
    }
  });
});
