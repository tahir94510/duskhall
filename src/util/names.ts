// Vaerum-themed single-word player handles. Picked once per session and stored
// in sessionStorage so a refresh keeps the same handle; only a room reset clears
// it and rolls a fresh one. The pool is deliberately large and de-duplicated so a
// fresh room rarely repeats a name, and the table layer (Game) also avoids
// collisions with the players already seated.

const NAMES = [
  // Ether / arcana
  "Sigil", "Aether", "Rune", "Ether", "Veil", "Echo", "Cinder", "Ash",
  "Verse", "Quill", "Mark", "Sable", "Star", "Ember", "Onyx", "Pale",
  "Storm", "Tide", "Hollow", "Wisp", "Quiet", "Brass", "Vessel", "Crown",
  "Vow", "Riddle", "Shroud", "Nox", "Vesper", "Glass", "Mirror", "Shade",
  "Cender", "Mor", "Wraith", "Relic", "Cipher", "Omen", "Ledger", "Gloom",
  "Pyre", "Lantern", "Hex", "Thorn", "Frost", "Gale", "Murk", "Dusk",
  "Dawn", "Knell", "Tome", "Sigh", "Crypt", "Husk", "Talon", "Reverie",
  "Solace", "Fable", "Cairn", "Brume", "Vellum", "Aria", "Ferrum", "Cobalt",
  "Ivory", "Umbra", "Lumen", "Pallor", "Specter", "Mirth", "Drift", "Hush",
  "Ravel", "Quench", "Sever", "Wane", "Wax", "Cleft", "Rift", "Spire",
  "Vault", "Warden", "Herald", "Cantor", "Augur", "Scribe", "Mason", "Marrow",
  "Lichen", "Bramble", "Cobweb", "Ashen", "Sallow", "Wither", "Gilt", "Sojourn",
  // Türkçe-temalı mistik kelimeler (mevcut tonla uyumlu)
  "Vârem", "Tılsım", "Rûn", "Eter", "Mühür", "Gölge", "Sır", "Yâd",
  "Tören", "Ayaz", "Köz", "Sis", "Düş", "Fal", "Naz", "Tan",
  "Yek", "Zühre", "Çağ", "Mavera", "Hece", "Kül", "Mum", "Ulak"
];

// Build a de-duplicated, order-stable pool (some thematic words repeat above).
const POOL: string[] = Array.from(new Set(NAMES));

const LS_NAME = "kabal:player-name";

export function pickName(): string {
  const idx = Math.floor(Math.random() * POOL.length);
  return POOL[idx] ?? "Player";
}

// Pick a handle that is NOT already in `taken` (case-insensitive). When every
// pool name is taken (more players than names, which never happens at 4 seats but
// is handled for safety), fall back to a numbered handle so a name is never empty
// and never collides.
export function pickNameExcluding(taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const t of taken) used.add(t.toLocaleLowerCase());
  const free = POOL.filter((n) => !used.has(n.toLocaleLowerCase()));
  if (free.length) return free[Math.floor(Math.random() * free.length)]!;
  // Pool exhausted: append the smallest free numeric suffix to a base name.
  const base = pickName();
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} ${i}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return base;
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

// Persist a specific handle (used when the table layer reassigns a unique name to
// avoid a collision with another seated player). Keeps the session in sync.
export function setName(name: string): void {
  try { sessionStorage.setItem(LS_NAME, name); } catch {}
}

export function resetName(): void {
  try { sessionStorage.removeItem(LS_NAME); } catch {}
}
