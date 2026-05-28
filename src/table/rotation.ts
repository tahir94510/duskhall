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

function rotate01(x: number, y: number, deg: number): [number, number] {
  // Rotate around the centre (0.5, 0.5)
  const rad = (deg * Math.PI) / 180;
  const dx = x - 0.5;
  const dy = y - 0.5;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [0.5 + dx * cos - dy * sin, 0.5 + dx * sin + dy * cos];
}

export function canonicalToLocal(nx: number, ny: number, mySeat: Seat): [number, number] {
  return rotate01(nx, ny, seatRotationDeg(mySeat));
}

export function localToCanonical(nx: number, ny: number, mySeat: Seat): [number, number] {
  return rotate01(nx, ny, -seatRotationDeg(mySeat));
}
