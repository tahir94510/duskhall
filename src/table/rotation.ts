// Convert between the shared canonical [0,1] frame (seat 0's POV) and the
// local view of each client (always sees self at the bottom).
//
// Canonical frame:
//   seat 0 (bottom):  y -> 1
//   seat 1 (top):     y -> 0
//   seat 2 (left):    x -> 0
//   seat 3 (right):   x -> 1
//
// A client with mySeat = s rotates the entire board so their own seat sits at
// the bottom of their screen. That rotation in degrees:
//   mySeat 0 ->   0
//   mySeat 1 -> 180
//   mySeat 2 -> -90  (visually: canonical left rotated to bottom)
//   mySeat 3 ->  90  (visually: canonical right rotated to bottom)

export type Seat = 0 | 1 | 2 | 3;

export function seatRotationDeg(mySeat: Seat): number {
  switch (mySeat) {
    case 0: return 0;
    case 1: return 180;
    case 2: return -90;
    case 3: return 90;
    default: return 0;
  }
}

// The seat whose board angle is one clockwise quarter-turn (+90°) from `from`.
// Because the four seats cover the four right-angle rotations, stepping by +90°
// always lands on another seat and returns to `from` after exactly four steps —
// so the perspective toggle (V key / button) walks every side once and back home,
// never an endless spin and never a dead step. Pure, so it is unit-tested directly.
export function nextQuarterSeat(from: Seat): Seat {
  const norm = (d: number) => ((d % 360) + 360) % 360;
  const target = norm(seatRotationDeg(from) + 90);
  const found = ([0, 1, 2, 3] as Seat[]).find((s) => norm(seatRotationDeg(s)) === target);
  return found ?? from;
}

// Rotate a pixel vector (dx, dy) by `deg` degrees, in real pixel space. The
// board is rotated by CSS about the cards-layer centre, so screen<->canonical
// mapping must rotate the pixel offset from that centre. (An earlier version
// rotated the [0,1] fraction about (0.5, 0.5), which silently assumed a SQUARE
// board and skewed cursors/drops on the ±90° side seats, that is removed.)
export function rotateVec(dx: number, dy: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}

// The four physical zone slots on screen, fixed for every viewer.
export type LocalSlot = "bottom" | "top" | "left" | "right";

// Physical zone div order built in Board.ts: [bottom, top, left, right].
export const SLOT_INDEX: Record<LocalSlot, number> = { bottom: 0, top: 1, left: 2, right: 3 };

// Direction (screen space, +y downward) of each seat's canonical anchor from the
// board centre, before any viewer rotation.
const SEAT_DIR: Record<Seat, [number, number]> = {
  0: [0, 1],   // bottom
  1: [0, -1],  // top
  2: [-1, 0],  // left
  3: [1, 0]    // right
};

// Where an absolute seat lands on the local viewer's screen. The viewer rotates
// the whole board by seatRotationDeg(viewerSeat) so their own seat is always at
// the bottom; this rotates each seat's anchor the same way and snaps it to the
// dominant compass slot. This is the single source of truth that keeps zone
// labels, colours, hit-testing and ownership consistent for all four seats.
export function localSlotForSeat(viewerSeat: Seat, seat: Seat): LocalSlot {
  const [dx, dy] = SEAT_DIR[seat];
  const [rx, ry] = rotateVec(dx, dy, seatRotationDeg(viewerSeat));
  if (Math.abs(rx) > Math.abs(ry)) return rx > 0 ? "right" : "left";
  return ry > 0 ? "bottom" : "top";
}

// Inverse of localSlotForSeat: which absolute seat occupies a given screen slot
// for this viewer.
export function seatForLocalSlot(viewerSeat: Seat, slot: LocalSlot): Seat {
  for (const s of [0, 1, 2, 3] as Seat[]) {
    if (localSlotForSeat(viewerSeat, s) === slot) return s;
  }
  return 0;
}

// ---- Screen <-> canonical coordinate transforms (pure, unit-testable) --------
//
// The board is rotated by CSS about the cards-layer centre. A card's canonical
// position is its CENTRE in the shared [0,1] frame. These two helpers convert
// between a viewport pixel and that canonical centre, inverting the rotation in
// real pixel space so they stay exact on a NON-square board for every seat.
// They are exact inverses of each other (see rotation.test.ts).

export interface BoardBox {
  /** cards-layer centre in viewport pixels */
  cx: number;
  cy: number;
  /** unrotated cards-layer size in pixels */
  width: number;
  height: number;
}

// Viewport pixel -> canonical [0,1] fraction.
export function screenToCanonical(clientX: number, clientY: number, seat: Seat, box: BoardBox): { nx: number; ny: number } {
  const [ux, uy] = rotateVec(clientX - box.cx, clientY - box.cy, -seatRotationDeg(seat));
  return {
    nx: (ux + box.width / 2) / box.width,
    ny: (uy + box.height / 2) / box.height
  };
}

// Canonical [0,1] fraction -> viewport pixel (matches exactly where CSS paints a
// card centre at that canonical position).
export function canonicalToScreen(nx: number, ny: number, seat: Seat, box: BoardBox): { px: number; py: number } {
  const lx = nx * box.width - box.width / 2;
  const ly = ny * box.height - box.height / 2;
  const [sx, sy] = rotateVec(lx, ly, seatRotationDeg(seat));
  return { px: box.cx + sx, py: box.cy + sy };
}
