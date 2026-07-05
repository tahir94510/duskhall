// Mode system types. A "mode" is one game hosted on the shared Duskhall table engine
// (Vaerum, ZAN, and any future game). Everything a game needs to differ from another,
// its deck, its numbers, its metadata, lives in a ModeDef data object; the engine reads
// the active mode and never hardcodes a single game. Adding a game is adding a ModeDef
// plus its assets and locale file, never touching engine code.

// A card category is a free-form string per mode (Vaerum uses seal/spell/intervention/
// servant; ZAN uses its four suits). It is never a fixed union so a new mode invents its
// own categories without editing shared types.
export type CardCategory = string;

export interface CategoryMeta {
  color: string;
  iconId: string;
}

// Structural card data only. All human text (name, type, effect, flavor) is i18n-keyed
// under the mode's locale file as cards.<id>.* and categories.<category>.* so a single
// card definition serves every language.
export interface CardDef {
  id: string;
  category: CardCategory;
  count: number;
  typeIconId: string;
  nameIconId: string;
  accentColor: string;
}

export interface CardInstance {
  instanceId: string;
  defId: string;
}

// Game-balance numbers for a mode. playerCount and totalCards are required (the engine and
// tests read them); a mode may carry any extra tuning keys it documents in its rulebook.
export interface ModeBalance {
  playerCount: number;
  startingHand: number;
  totalCards: number;
  [key: string]: number;
}

// Mode metadata shown in the mode picker (localized name/description come from i18n).
export interface ModeMeta {
  // 1..5, how hard the game is to grasp/play; rendered as filled dots in the picker.
  difficulty: 1 | 2 | 3 | 4 | 5;
  minPlayers: number;
  maxPlayers: number;
  durationMin: number; // minutes
  durationMax: number; // minutes
}

// Which card-info fields a mode's tooltip shows. Vaerum shows all; ZAN shows only the name
// and flavor (its cards have no per-card effect text).
export type TooltipField = "type" | "effect" | "flavor";

// The optional guided walkthrough's shape for a mode. Setup steps run once before the loop; a
// "confirm" step is advanced by the host, a "chooseFirst" step by the host picking a starter.
// Turn phases cycle per seat once setup is done. Text for each id/phase lives in the mode's
// locale under guide.steps.<id> and guide.phase.<phase>.
export type GuideStepKind = "confirm" | "chooseFirst";
export interface GuideSetupStep {
  id: string;
  kind: GuideStepKind;
}
export interface GuideConfig {
  setupSteps: GuideSetupStep[];
  turnPhases: string[];
}

export interface ModeDef {
  // Stable identifier: used in the URL path (/{id}/{slug}), the realtime channel topic,
  // the asset root (public/modes/{id}/), and localStorage scoping. Lowercase, no spaces.
  id: string;
  // Locale file base name under public/locales/modes/ (usually equals id).
  localeId: string;
  // The mode's card catalogue (structural). Expanded into a full deck by buildDeck().
  deck: CardDef[];
  // Category color/icon metadata, keyed by category id.
  categoryMeta: Record<string, CategoryMeta>;
  // Category display order for the tidy-hand (D) layout: piles group in this order.
  categoryOrder: string[];
  // Balance numbers (single source of truth for rulebook cross-checks).
  balance: ModeBalance;
  // Picker metadata.
  meta: ModeMeta;
  // Table seats. Both launch modes use 4; kept per-mode so a future mode can differ.
  seatCount: number;
  // When true the mode ships a card-back image at {assetRoot}/cards/back.*; otherwise the
  // engine renders the built-in CSS card back.
  hasCardBackImage: boolean;
  // Card-info tooltip fields to render for this mode.
  tooltipFields: TooltipField[];
  // The guided-walkthrough step/phase shape for this mode (see src/game/guide.ts).
  guide: GuideConfig;
}

// The public asset root for a mode's cards/background/audio/brand folders.
export function assetRoot(mode: ModeDef): string {
  return `/modes/${mode.id}`;
}
