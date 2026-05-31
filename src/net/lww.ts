// Last-write-wins conflict resolution for card patches.
//
// Every client edits a shared board with no server authority, so each card carries
// a monotonic wall-clock stamp (`ts`) and the id of the client that wrote it (`by`).
// A remote update wins over the local copy when it is strictly newer; ties (equal
// `ts`, which a monotonic clock makes rare) break deterministically by writer id so
// every client resolves the same way.
//
// This lives in its own module, and is unit-tested, because a subtle bug here makes
// edits silently fail to converge across clients with no error — exactly the class
// of failure that is invisible until two real devices play together.

export interface Stamped {
  ts: number;
  by?: string;
}

/**
 * Should an incoming update replace the local card?
 * @param incomingTs  the remote edit's stamp
 * @param incomingBy  the remote writer id
 * @param localTs     the local card's stamp
 * @param localBy     the local card's last writer id (may be undefined for a fresh deal)
 */
export function isNewerWrite(incomingTs: number, incomingBy: string, localTs: number, localBy?: string): boolean {
  if (incomingTs > localTs) return true;
  if (incomingTs === localTs) return incomingBy > (localBy ?? "");
  return false;
}
