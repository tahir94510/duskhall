// ZAN: Kusursuz Suphe (Perfect Doubt). A tight four-player bluffing game: 40 cards, four
// suits of ten. On your turn you slide a card face down to someone and name a suit, truth
// or lie; they challenge or peek-and-pass it on. Collect four penalty cards and you lose;
// the other three win. Easy to learn, all about reading faces. Structural data only; all
// text lives in public/locales/modes/zan.<lang>.json.
//
// Each suit is modelled as its own category with a single ten-copy face, so the existing
// category-aware machinery (tidy-hand grouping, tooltip lookups) works unchanged.

import type { ModeDef, CardDef, CategoryMeta } from "./types.js";

const CATEGORY_META: Record<string, CategoryMeta> = {
  raven: { color: "#d9d4c7", iconId: "zan-raven" },
  skull: { color: "#c9c3b2", iconId: "zan-skull" },
  moon: { color: "#8fb3d9", iconId: "zan-moon" },
  eye: { color: "#9b7fd0", iconId: "zan-eye" }
};

// Four suits, ten copies each = 40 cards. defId equals the suit id: one face per suit.
const DECK: CardDef[] = [
  { id: "raven", category: "raven", count: 10, typeIconId: "zan-raven", nameIconId: "zan-raven", accentColor: "#d9d4c7" },
  { id: "skull", category: "skull", count: 10, typeIconId: "zan-skull", nameIconId: "zan-skull", accentColor: "#c9c3b2" },
  { id: "moon", category: "moon", count: 10, typeIconId: "zan-moon", nameIconId: "zan-moon", accentColor: "#8fb3d9" },
  { id: "eye", category: "eye", count: 10, typeIconId: "zan-eye", nameIconId: "zan-eye", accentColor: "#9b7fd0" }
];

export const zanMode: ModeDef = {
  id: "zan",
  localeId: "zan",
  deck: DECK,
  categoryMeta: CATEGORY_META,
  categoryOrder: ["raven", "skull", "moon", "eye"],
  balance: {
    playerCount: 4,
    startingHand: 10,
    totalCards: 40,
    suitCount: 4,
    copiesPerSuit: 10,
    penaltyToLose: 4,
    maxRounds: 13
  },
  meta: {
    difficulty: 2,
    minPlayers: 4,
    maxPlayers: 4,
    durationMin: 10,
    durationMax: 15
  },
  seatCount: 4,
  hasCardBackImage: true,
  tooltipFields: ["flavor"],
  guide: {
    // Two setup steps (deal ten each, pick who opens), then a single per-opener "round" phase:
    // ZAN's turn is one player opening a round, not a multi-phase turn.
    setupSteps: [
      { id: "deal", kind: "confirm" },
      { id: "chooseFirst", kind: "chooseFirst" }
    ],
    turnPhases: ["round"]
  }
};
