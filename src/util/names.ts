// Vaerum-themed single-word player names. Picked once per session and stored
// in sessionStorage so a refresh keeps the same handle; only a room reset
// clears it and rolls a fresh one.

const NAMES = [
  "Sigil", "Aether", "Rune", "Ether", "Veil", "Echo", "Cinder", "Ash",
  "Verse", "Quill", "Mark", "Sable", "Star", "Ember", "Onyx", "Pale",
  "Storm", "Tide", "Hollow", "Wisp", "Quiet", "Brass", "Vessel", "Crown",
  "Vow", "Riddle", "Shroud", "Mor", "Vârem", "Tılsım", "Rûn", "Eter",
  "Cender", "Ash", "Nox", "Vesper", "Sable", "Glass", "Mirror", "Shade"
];

const LS_NAME = "kabal:player-name";

export function pickName(): string {
  const idx = Math.floor(Math.random() * NAMES.length);
  return NAMES[idx] ?? "Player";
}

export function getOrAssignName(): string {
  try {
    const existing = sessionStorage.getItem(LS_NAME);
    if (existing) return existing;
  } catch {}
  const fresh = pickName();
  try { sessionStorage.setItem(LS_NAME, fresh); } catch {}
  return fresh;
}

export function resetName(): void {
  try { sessionStorage.removeItem(LS_NAME); } catch {}
}
