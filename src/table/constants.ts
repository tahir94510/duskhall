// Central dock geometry, expressed as CENTRE fractions of the board in the
// shared canonical [0,1] frame. These are plain constants, identical on every
// device, so a dealt pile is stored at the exact same spot for all players
// (device-independent sync) and lines up pixel-perfectly with its CSS marker at
// any screen size. The deck sits just left of centre and the discard just right,
// close together as a tidy pair. board.css (.dock__slot--deck / --discard) uses
// these very same fractions, so the pile and its marker can never drift apart.

// Horizontal centres of the two shared piles (canonical fractions). A tidy pair just off the
// board centre; with the Seal/Servant tableaus on the off-board ledges, the centre is otherwise
// clear. Their 0.14 separation still exceeds a card width, so a dealt deck and discard never
// overlap. Mirrored by board.css dock left%.
export const DECK_NX = 0.43;
export const DISCARD_NX = 0.57;

// Vertical centre line of the dock (canonical fraction).
export const DECK_NY = 0.5;
export const DISCARD_NY = 0.5;

// Depth of the off-board "ledge" band on each side of the inner board, as a fraction of the
// inner board (canonical units). Each player's Seal/Servant ledge sits in the apron just
// OUTSIDE their own board edge, rotating with the view so it is always in front of them and
// symmetric for every seat. The inner board is sized so the whole extended square
// (inner + 2 aprons) still fits the viewport, so a card clamped to [-APRON_FRAC, 1+APRON_FRAC]
// can never leave the visible page on any device. ~0.18 ≈ one card height, so a ledge holds a
// full card with its inner edge at the board boundary (keeping face-up Seals/Servants public,
// out of the private hand zone). board.css mirrors this as the --field divisor (1 + 2*0.18 =
// 1.36) and the --apron size — keep them in step.
export const APRON_FRAC = 0.18;
