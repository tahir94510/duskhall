// Central dock geometry, expressed as CENTRE fractions of the board in the
// shared canonical [0,1] frame. These are plain constants, identical on every
// device, so a dealt pile is stored at the exact same spot for all players
// (device-independent sync) and lines up pixel-perfectly with its CSS marker at
// any screen size. The deck sits just left of centre and the discard just right,
// close together as a tidy pair. board.css (.dock__slot--deck / --discard) uses
// these very same fractions, so the pile and its marker can never drift apart.

// Horizontal centres of the two shared piles (canonical fractions). Kept a little closer
// to centre than the edges so the public ring opens a tableau-shelf band in front of every
// seat (incl. side seats) clear of the deck/discard. Their 0.14 separation still exceeds a
// card width, so a dealt deck and discard never overlap. Mirrored by board.css dock left%.
export const DECK_NX = 0.43;
export const DISCARD_NX = 0.57;

// Vertical centre line of the dock (canonical fraction).
export const DECK_NY = 0.5;
export const DISCARD_NY = 0.5;
