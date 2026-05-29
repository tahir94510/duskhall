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

// Rotate a pixel vector (dx, dy) by `deg` degrees, in real pixel space. The
// board is rotated by CSS about the cards-layer centre, so screen<->canonical
// mapping must rotate the pixel offset from that centre. (An earlier version
// rotated the [0,1] fraction about (0.5, 0.5), which silently assumed a SQUARE
// board and skewed cursors/drops on the ±90° side seats — that is removed.)
export function rotateVec(dx: number, dy: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}
