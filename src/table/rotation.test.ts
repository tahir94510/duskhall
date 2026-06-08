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

describe("perspective toggle target: the LEFT-hand neighbour", () => {
  const norm = (d: number) => ((d % 360) + 360) % 360;

  it("each seat's left-slot neighbour is a distinct seat, one quarter-turn away", () => {
    // The V key toggles between home and seatForLocalSlot(home, "left"); verify that
    // target is well-defined, never the viewer itself, and exactly a 90° board turn.
    for (const home of SEATS) {
      const left = seatForLocalSlot(home, "left");
      expect(left).not.toBe(home);                       // a real other side
      expect(localSlotForSeat(home, left)).toBe("left"); // it really sits on our left
      const delta = norm(seatRotationDeg(left) - seatRotationDeg(home));
      expect(delta === 90 || delta === 270).toBe(true);  // a single quarter-turn either way
    }
  });
});

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

describe("SQUARE field: all four seats agree on where a card is (the keystone)", () => {
  // The play field is a centered square (board.css), so boardSize.width === height.
  // On a square, each seat's ±90°/180° board rotation maps the field onto itself
  // exactly, so a canonical point projected by seat A and by seat B must be the
  // same physical point rotated by (rotB - rotA) about the shared centre. This is
  // what makes a card placed by any player land in the same logical spot for all.
  const sq: BoardBox = { cx: 500, cy: 500, width: 900, height: 900 };
  const points: Array<[number, number]> = [
    [0.5, 0.5], [0.4, 0.5], [0.6, 0.5], [0.2, 0.8], [0.85, 0.15], [0.1, 0.1]
  ];

  function rot(px: number, py: number, cx: number, cy: number, deg: number): [number, number] {
    const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    const dx = px - cx, dy = py - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  }

  it("seat 2 and seat 3 see a point exactly where seats 0/1 do, rotated by the seat delta", () => {
    for (const [nx, ny] of points) {
      const p0 = canonicalToScreen(nx, ny, 0, sq);
      for (const v of [1, 2, 3] as Seat[]) {
        const pv = canonicalToScreen(nx, ny, v, sq);
        // pv must equal p0 rotated by (seatRot(v) - seatRot(0)) about the centre.
        const delta = seatRotationDeg(v) - seatRotationDeg(0);
        const [ex, ey] = rot(p0.px, p0.py, sq.cx, sq.cy, delta);
        expect(pv.px).toBeCloseTo(ex, 6);
        expect(pv.py).toBeCloseTo(ey, 6);
      }
    }
  });

  it("on a square, every seat's projection stays within the field bounds", () => {
    // A non-square field used to push ±90° seats' points outside the short edge;
    // on the square they always land inside [0, side].
    for (const [nx, ny] of points) {
      for (const v of SEATS) {
        const { px, py } = canonicalToScreen(nx, ny, v, sq);
        expect(px).toBeGreaterThanOrEqual(sq.cx - sq.width / 2 - 1e-6);
        expect(px).toBeLessThanOrEqual(sq.cx + sq.width / 2 + 1e-6);
        expect(py).toBeGreaterThanOrEqual(sq.cy - sq.height / 2 - 1e-6);
        expect(py).toBeLessThanOrEqual(sq.cy + sq.height / 2 + 1e-6);
      }
    }
  });
});

describe("four-player table reads consistently for every seat (regression)", () => {
  // The reported bug: when seats 2 and 3 fill the sides, the third player saw the
  // other seats mirrored. This pins the physically-correct reading for all four.
  // Seat 0 South, 1 North, 2 West, 3 East; each viewer puts their own seat at the
  // bottom and must see the other three where the rotated table actually places
  // them, with no left/right swap.
  it("every seat sees its own area at the bottom and the rest unmirrored", () => {
    // For the LEFT-seat player (2): 0 is to their right, 1 to their left, 3 across.
    expect(localSlotForSeat(2, 0)).toBe("right");
    expect(localSlotForSeat(2, 1)).toBe("left");
    expect(localSlotForSeat(2, 3)).toBe("top");
    expect(localSlotForSeat(2, 2)).toBe("bottom");
    // For the RIGHT-seat player (3): the exact mirror of the above.
    expect(localSlotForSeat(3, 0)).toBe("left");
    expect(localSlotForSeat(3, 1)).toBe("right");
    expect(localSlotForSeat(3, 2)).toBe("top");
    expect(localSlotForSeat(3, 3)).toBe("bottom");
  });

  it("no two seats ever collide in one viewer's layout (a 4-way bijection)", () => {
    for (const v of SEATS) {
      const slots = SEATS.map((s) => localSlotForSeat(v, s));
      expect(new Set(slots).size).toBe(4); // all four screen slots used exactly once
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
