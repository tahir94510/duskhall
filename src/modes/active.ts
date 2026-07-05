// The active mode singleton. Mirrors the i18n locale pattern: a module-level "current mode"
// that the engine reads through getActiveMode(), switched by setActiveMode() when the player
// changes games. Keeping it module-level (rather than threading a mode object through every
// call site) matches how t() reads the current locale, and lets deck/tooltip/tidy code read
// the active game's data without a parameter on every function.

import type { ModeDef } from "./types.js";
import { getMode, DEFAULT_MODE_ID, resolveModeId } from "./registry.js";

// The last mode the player used, remembered across visits so returning opens the same game.
const STORED_MODE_KEY = "duskhall:mode";

let active: ModeDef = getMode(DEFAULT_MODE_ID);

type ModeListener = (mode: ModeDef) => void;
const listeners = new Set<ModeListener>();

export function getActiveMode(): ModeDef {
  return active;
}

export function getActiveModeId(): string {
  return active.id;
}

// Switch the active mode by id. Unknown ids fall back to the default. Notifies listeners only
// when the mode actually changes. Returns the resolved mode.
export function setActiveMode(id: string): ModeDef {
  const next = getMode(id);
  if (next.id === active.id) return active;
  active = next;
  for (const fn of listeners) fn(active);
  return active;
}

export function onModeChange(fn: ModeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Read the remembered mode id, or the default when none is stored / storage is blocked.
export function readStoredModeId(): string {
  let stored: string | null = null;
  try { stored = localStorage.getItem(STORED_MODE_KEY); } catch {}
  return resolveModeId(stored);
}

// Remember the mode id for next visit. Silent when storage is blocked.
export function writeStoredModeId(id: string): void {
  try { localStorage.setItem(STORED_MODE_KEY, resolveModeId(id)); } catch {}
}
