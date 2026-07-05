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
  // More ether / arcana / relic / nature, same calm monochrome tone
  "Aegis", "Augury", "Beacon", "Censer", "Chalice", "Coil", "Covenant", "Crucible",
  "Dirge", "Ebon", "Effigy", "Filament", "Flint", "Gossamer", "Grimoire", "Hallow",
  "Harrow", "Henge", "Inkwell", "Kestrel", "Lattice", "Lodestar", "Loom", "Mantle",
  "Mire", "Moor", "Myrrh", "Nadir", "Nebula", "Nettle", "Obol", "Oracle",
  "Pendant", "Plume", "Quartz", "Quire", "Raven", "Rime", "Sanctum", "Scarab",
  "Sconce", "Seraph", "Slate", "Sleet", "Solstice", "Spindle", "Talisman", "Tallow",
  "Tarn", "Tessera", "Thistle", "Threnody", "Tincture", "Trinket", "Vigil", "Votive",
  "Welkin", "Whetstone", "Willow", "Wyrm", "Zephyr", "Halcyon", "Marigold", "Nightjar",
  // Türkçe-temalı mistik kelimeler (mevcut tonla uyumlu)
  "Vârem", "Tılsım", "Rûn", "Eter", "Mühür", "Gölge", "Sır", "Yâd",
  "Tören", "Ayaz", "Köz", "Sis", "Düş", "Fal", "Naz", "Tan",
  "Yek", "Zühre", "Çağ", "Mavera", "Hece", "Kül", "Mum", "Ulak",
  "Efsun", "Muska", "Yıldız", "Şafak", "Alaca", "Yakamoz", "Hülya", "Rüya",
  "Efsane", "Masal", "Gizem", "Sırdaş", "Yâdigâr", "Tütsü", "Pusula", "Fanus",
  "Kandil", "Ozan", "Kâhin", "Yelda", "Alev", "Duman", "Zümrüt", "Mehtap",
  "Sema", "Tomar", "Fısıltı", "Çağrı", "Hayalet", "Nilüfer", "Gümüş", "Tunç",
  "Mercan", "Yakut", "Lacivert", "Simya", "Pervane", "Şule", "Niyaz", "Bârika"
];

// Build a de-duplicated, order-stable pool (some thematic words repeat above).
const POOL: string[] = Array.from(new Set(NAMES));

const LS_NAME = "duskhall:player-name";

export function pickName(): string {
  const idx = Math.floor(Math.random() * POOL.length);
  return POOL[idx] ?? "Player";
}

// A stable, case-insensitive key for comparing two handles. Plain toLowerCase is NOT
// enough: the pool has Turkish names with the dotless ı ("Tılsım", "Sır"), and the
// uppercase↔lowercase round-trip of the Turkish I is lossy ("Tılsım"→"TILSIM"→"tilsim"
// ≠ "tılsım"), so a name typed/echoed in a different case would dodge de-duplication and
// two players could share it. We lowercase with a fixed locale and fold every I-variant
// (ı, i, İ with its combining dot) to a single "i" so the key is direction-independent.
export function nameKey(s: string): string {
  return s
    .toLocaleLowerCase("en")
    .replace(/̇/g, "") // strip the combining dot above (from İ → i̇)
    .replace(/[ıi]/g, "i"); // fold dotless ı and dotted i to one key
}

// Pick a handle that is NOT already in `taken` (case-insensitive). When every
// pool name is taken (more players than names, which never happens at 4 seats but
// is handled for safety), fall back to a numbered handle so a name is never empty
// and never collides.
export function pickNameExcluding(taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const t of taken) used.add(nameKey(t));
  const free = POOL.filter((n) => !used.has(nameKey(n)));
  if (free.length) return free[Math.floor(Math.random() * free.length)]!;
  // Pool exhausted: append the smallest free numeric suffix to a base name.
  const base = pickName();
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} ${i}`;
    if (!used.has(nameKey(candidate))) return candidate;
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
