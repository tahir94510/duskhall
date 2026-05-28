// Single source of truth for game-balance numbers.
// All UI, tooltips, and rulebook copy must read from here so changes propagate.

export const BALANCE = {
  PLAYER_COUNT: 4,
  STARTING_HAND: 5,
  HAND_LIMIT: 7,
  MAX_SEALS_IN_PLAY: 4,
  MAX_SERVANTS_IN_PLAY: 3,
  HP_BASE: 2,
  HP_CAP: 5,
  FOCUS_DRAW_BASE: 2,
  ASCENSION_SEAL_THRESHOLD: 3,
  TOTAL_CARDS: 72
} as const;

export type BalanceKey = keyof typeof BALANCE;
