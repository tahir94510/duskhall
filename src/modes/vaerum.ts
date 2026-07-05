// Vaerum: Heirs of the Ether. The original Duskhall mode: a 72-card dark-fantasy deck
// across four card types, 2-4 players, deeper strategy. Structural data only; all text is
// in public/locales/modes/vaerum.<lang>.json.

import type { ModeDef, CardDef, CategoryMeta } from "./types.js";

const CATEGORY_META: Record<string, CategoryMeta> = {
  seal: { color: "#7a4ed1", iconId: "cat-seal" },
  spell: { color: "#c8444a", iconId: "cat-spell" },
  intervention: { color: "#3c7fc8", iconId: "cat-intervention" },
  servant: { color: "#3c9a6a", iconId: "cat-servant" }
};

const DECK: CardDef[] = [
  // Seals: 4 types x 4 copies = 16
  { id: "timeRift", category: "seal", count: 4, typeIconId: "cat-seal", nameIconId: "name-timeRift", accentColor: "#7fb2e8" },
  { id: "veilOfVoid", category: "seal", count: 4, typeIconId: "cat-seal", nameIconId: "name-veilOfVoid", accentColor: "#d5d2cb" },
  { id: "crimsonMonolith", category: "seal", count: 4, typeIconId: "cat-seal", nameIconId: "name-crimsonMonolith", accentColor: "#e07a5a" },
  { id: "necromancersEye", category: "seal", count: 4, typeIconId: "cat-seal", nameIconId: "name-necromancersEye", accentColor: "#9bd17b" },

  // Spells: 7 + 5 + 4 + 4 + 4 = 24 (V8.2 retune: Twist of Fate 2 -> 4 so the deck's
  // wildest swing actually shows up in most games, paid for by one Ether Strike and
  // one Shadow Theft so raw removal/theft stops crowding the spell suite).
  { id: "etherStrike", category: "spell", count: 7, typeIconId: "cat-spell", nameIconId: "name-etherStrike", accentColor: "#f0c068" },
  { id: "shadowTheft", category: "spell", count: 5, typeIconId: "cat-spell", nameIconId: "name-shadowTheft", accentColor: "#7a6cc7" },
  { id: "ancientSight", category: "spell", count: 4, typeIconId: "cat-spell", nameIconId: "name-ancientSight", accentColor: "#5fc6c0" },
  { id: "mindParasite", category: "spell", count: 4, typeIconId: "cat-spell", nameIconId: "name-mindParasite", accentColor: "#c87fb2" },
  { id: "twistOfFate", category: "spell", count: 4, typeIconId: "cat-spell", nameIconId: "name-twistOfFate", accentColor: "#e5c578" },

  // Interventions: 8 + 4 + 4 = 16
  { id: "silence", category: "intervention", count: 8, typeIconId: "cat-intervention", nameIconId: "name-silence", accentColor: "#d5d2cb" },
  { id: "karmicReflection", category: "intervention", count: 4, typeIconId: "cat-intervention", nameIconId: "name-karmicReflection", accentColor: "#5fc6c0" },
  { id: "bloodAtonement", category: "intervention", count: 4, typeIconId: "cat-intervention", nameIconId: "name-bloodAtonement", accentColor: "#c8444a" },

  // Servants: 8 + 4 + 4 = 16
  { id: "runicWarden", category: "servant", count: 8, typeIconId: "cat-servant", nameIconId: "name-runicWarden", accentColor: "#e5c578" },
  { id: "glacialAberration", category: "servant", count: 4, typeIconId: "cat-servant", nameIconId: "name-glacialAberration", accentColor: "#7fb2e8" },
  { id: "shadowSlayer", category: "servant", count: 4, typeIconId: "cat-servant", nameIconId: "name-shadowSlayer", accentColor: "#7a6cc7" }
];

export const vaerumMode: ModeDef = {
  id: "vaerum",
  localeId: "vaerum",
  deck: DECK,
  categoryMeta: CATEGORY_META,
  categoryOrder: ["seal", "spell", "intervention", "servant"],
  balance: {
    playerCount: 4,
    startingHand: 5,
    handLimit: 7,
    maxSealsInPlay: 4,
    maxServantsInPlay: 3,
    hpBase: 2,
    hpCap: 5,
    focusDrawBase: 2,
    ascensionSealThreshold: 3,
    totalCards: 72
  },
  meta: {
    difficulty: 4,
    minPlayers: 2,
    maxPlayers: 4,
    durationMin: 20,
    durationMax: 40
  },
  seatCount: 4,
  hasCardBackImage: false,
  tooltipFields: ["type", "effect", "flavor"],
  guide: {
    setupSteps: [
      { id: "shuffle", kind: "confirm" },
      { id: "reveal", kind: "confirm" },
      { id: "chooseFirst", kind: "chooseFirst" }
    ],
    turnPhases: ["focus", "action", "closing"]
  }
};
