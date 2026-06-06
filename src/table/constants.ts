// Central dock geometry, expressed as CENTRE fractions of the board in the
// shared canonical [0,1] frame. These are plain constants, identical on every
// device, so a dealt pile is stored at the exact same spot for all players
// (device-independent sync) and lines up pixel-perfectly with its CSS marker at
// any screen size. The deck sits just left of centre and the discard just right,
// close together as a tidy pair. board.css (.dock__slot--deck / --discard) uses
// these very same fractions, so the pile and its marker can never drift apart.

// Horizontal centres of the two shared piles (canonical fractions). A tidy pair just off the
// board centre. Their 0.20 separation clears the WIDEST card fraction at every breakpoint
// (mobile bumps the card to ~0.145 of the field, which met the old 0.14 gap and made the deck
// and discard touch), so a dealt deck and discard never overlap on any screen, while both stay
// inside the reserved central band (0.28-0.72). Mirrored by board.css dock left%.
export const DECK_NX = 0.40;
export const DISCARD_NX = 0.60;

// Vertical centre line of the dock (canonical fraction).
export const DECK_NY = 0.5;
export const DISCARD_NY = 0.5;
