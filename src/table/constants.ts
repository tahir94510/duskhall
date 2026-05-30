// Central dock geometry. The deck and discard sit side-by-side, centred on the
// board, separated by a fixed pixel gutter so they are always visually adjacent
// yet never overlap, from a 320px phone up to 4K. The CSS markers (board.css)
// and the deal/​reset math (Game.ts) both derive from these same numbers so they
// can never drift apart.

// Vertical centre line of the dock (canonical fraction).
export const DECK_NY = 0.5;
export const DISCARD_NY = 0.5;

// Gap in CSS pixels between the deck and discard cards.
export const DOCK_GUTTER_PX = 14;
