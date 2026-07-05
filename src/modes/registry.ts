// The mode registry: the ordered list of games Duskhall hosts and helpers to resolve a
// mode id from a URL segment or storage. To add a game, define its ModeDef and add it here;
// nothing else in the engine references a specific mode by name.

import type { ModeDef } from "./types.js";
import { zanMode } from "./zan.js";
import { vaerumMode } from "./vaerum.js";

// Order controls the mode-picker listing. ZAN is first and is the default for a first-time
// visitor: it is the easier game to pick up.
export const MODES: readonly ModeDef[] = [zanMode, vaerumMode];

export const DEFAULT_MODE_ID = "zan";

const BY_ID = new Map<string, ModeDef>(MODES.map((m) => [m.id, m]));

export const MODE_IDS: ReadonlySet<string> = new Set(BY_ID.keys());

export function isModeId(value: string | null | undefined): boolean {
  return !!value && BY_ID.has(value);
}

// Look up a mode by id, or the default mode if the id is unknown. Never throws, so a bad
// stored/URL value degrades to the default instead of a crash.
export function getMode(id: string | null | undefined): ModeDef {
  return (id && BY_ID.get(id)) || BY_ID.get(DEFAULT_MODE_ID)!;
}

// Normalise any raw id (from URL, storage, config) to a known mode id.
export function resolveModeId(raw: string | null | undefined): string {
  return isModeId(raw) ? raw! : DEFAULT_MODE_ID;
}
