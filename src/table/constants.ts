// Canonical normalised positions for the central dock. Slot DOM and snap
// math both read from this single source of truth so they can never drift.

// Deck and discard sit symmetrically either side of centre with a real gap.
// (They were 0.48 / 0.52 — only 4% apart — which makes the two slots overlap at
//  every realistic board size, worst of all on phones. 0.40 / 0.60 keeps them
//  central but visually distinct from 320px up to 4K.)
export const DECK_NX = 0.40;
export const DECK_NY = 0.5;
export const DISCARD_NX = 0.60;
export const DISCARD_NY = 0.5;

export const DOCK_SNAP_RADIUS = 0.09;
