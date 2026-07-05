// One-time storage namespace migration. The app was a single game ("vaerum:") and is now the
// Duskhall platform ("duskhall:"). This copies every old-namespace key to the new namespace
// (same suffix) when the new key is absent, then removes the old one, so a returning player
// keeps their language, volumes and one-shot flags without noticing. Best-effort and
// idempotent: safe to run on every boot, does nothing once the old namespace is empty.
//
// Ephemeral room-scoped keys (board snapshots, per-room identity) are migrated verbatim; they
// no longer match the new mode-scoped key shape, so they simply expire on their normal TTL. No
// board state is corrupted, at worst a board open during the upgrade is re-synced from peers.

const OLD = "vaerum:";
const NEW = "duskhall:";

export function migrateStorageNamespace(): void {
  for (const store of storesSafe()) {
    try {
      const moves: Array<[string, string]> = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && key.startsWith(OLD)) moves.push([key, NEW + key.slice(OLD.length)]);
      }
      for (const [oldKey, newKey] of moves) {
        try {
          const val = store.getItem(oldKey);
          if (val !== null && store.getItem(newKey) === null) store.setItem(newKey, val);
          store.removeItem(oldKey);
        } catch {}
      }
    } catch {}
  }
}

function storesSafe(): Storage[] {
  const out: Storage[] = [];
  try { out.push(localStorage); } catch {}
  try { out.push(sessionStorage); } catch {}
  return out;
}
