// Card helpers over the ACTIVE mode's catalogue. Each mode owns its own deck (see
// src/modes/); this module expands and measures whichever deck is active. Text is
// i18n-keyed under the active mode's locale file; this module carries structural data only.

import { getActiveMode } from "../modes/active.js";
import type { CardDef, CategoryMeta, CardCategory, CardInstance } from "../modes/types.js";

export type { CardDef, CategoryMeta, CardCategory, CardInstance };

// The active mode's card definitions and category metadata. Convenience accessors so call
// sites read live data without importing the mode system directly.
export function cardDefs(): CardDef[] {
  return getActiveMode().deck;
}

export function categoryMeta(): Record<string, CategoryMeta> {
  return getActiveMode().categoryMeta;
}

// Sum of every copy in a deck (defaults to the active mode's deck).
export function totalCardCount(deck: CardDef[] = getActiveMode().deck): number {
  return deck.reduce((s, c) => s + c.count, 0);
}

// Expand a deck's definitions into concrete card instances with stable unique ids.
// Defaults to the active mode's deck so existing call sites need no change.
export function buildDeck(deck: CardDef[] = getActiveMode().deck): CardInstance[] {
  const out: CardInstance[] = [];
  for (const def of deck) {
    for (let i = 0; i < def.count; i++) {
      out.push({
        instanceId: `${def.id}-${String(i + 1).padStart(2, "0")}`,
        defId: def.id
      });
    }
  }
  return out;
}
