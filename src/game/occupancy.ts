// Seat-occupancy rules, factored out as pure functions so the "whose area is this,
// and can I touch this card?" decision is unit-tested in one place and reused by
// Game.ts. The distinction that matters for the table:
//   - A seat is OWNED if a player is present on it (active) OR an away player still
//     holds the claim (dropped tab / lost network, not yet left). Its area is that
//     player's private zone.
//   - A seat is EMPTY if nobody ever sat there, or the occupant explicitly left or
//     was kicked. Its area is open public table: drops land, cards there are public.

/** Anything that can answer "is this seat present?" — a Set or a Map's key view.
 *  Lets callers pass their live Set/Map by reference without allocating a copy. */
export interface SeatMembership {
  has(seat: number): boolean;
}

export interface Occupancy {
  /** Seats with a player currently connected. */
  activeSeats: SeatMembership;
  /** Seats with a persistent claim (covers active AND away/dropped players). */
  claimedSeats: SeatMembership;
  seatCount: number;
}

export function seatIsOwned(o: Occupancy, seat: number): boolean {
  if (seat < 0 || seat >= o.seatCount) return false;
  return o.activeSeats.has(seat) || o.claimedSeats.has(seat);
}

/** A seat owned by someone other than the viewer (viewer must be seated, not a
 *  spectator). Used to block drops/interactions in a rival's private area. */
export function seatIsRival(o: Occupancy, seat: number, selfSeat: number, spectator: boolean): boolean {
  if (spectator) return false; // spectators have no "self" rival relationship
  return seat !== selfSeat && seatIsOwned(o, seat);
}

/** Is a card (with the given owner seat) in a rival's still-held private area?
 *  A spectator sees every owned card as untouchable; a card owned by an empty seat
 *  is public (grabbable, visible). ownerSeat null = public table card. */
export function cardIsRivalOwned(
  o: Occupancy,
  ownerSeat: number | null,
  selfSeat: number,
  spectator: boolean
): boolean {
  if (ownerSeat === null) return false;
  if (!seatIsOwned(o, ownerSeat)) return false; // owner gone → public
  return spectator || ownerSeat !== selfSeat;
}

/** A present, seated player for host selection. `joinedAt` is the epoch-ms when this
 *  client first joined the room (fresh on every (re)connect), so a returning player
 *  always has a LATER joinedAt than anyone who stayed. */
export interface HostCandidate {
  id: string;
  joinedAt: number;
  seat: number;
}

/** The host is the present, seated player who has been here the LONGEST — the
 *  smallest `joinedAt`, ties broken by id so every client agrees. Returns "" when
 *  nobody is seated. Keying off continuous presence (not seat number) means the role
 *  transfers to the next-oldest present player the moment the host leaves, AND a
 *  returning ex-host can never steal it back (their reconnect gives them a newer
 *  joinedAt). Drives kick / reset-deck permissions. */
export function hostId(active: Iterable<HostCandidate>): string {
  let best: HostCandidate | null = null;
  for (const c of active) {
    if (c.seat < 0) continue; // spectators never host
    if (!best || c.joinedAt < best.joinedAt || (c.joinedAt === best.joinedAt && c.id < best.id)) {
      best = c;
    }
  }
  return best ? best.id : "";
}

/** Is `selfId` the host? They must be a seated (non-spectator) present player and be
 *  the earliest joiner. */
export function isHost(selfId: string, active: Iterable<HostCandidate>, spectator: boolean): boolean {
  if (spectator) return false;
  return selfId !== "" && hostId(active) === selfId;
}

/** A tombstoned (kicked/left) client that re-appears in presence is genuinely BACK
 *  — not a stale presence echo to keep suppressing — when its current connection
 *  stamp is strictly newer than the one it was tombstoned with. Both stamps come
 *  from that ONE device's clock across successive connects, so the comparison is
 *  monotonic per device and immune to cross-machine clock skew. Returning true means
 *  "drop the tombstone and show them now"; false means "still the old, lingering
 *  presence — keep hiding it until untrack propagates / the hard expiry lapses". */
export function shouldClearTombstone(tombstonedConnAt: number, presenceConnAt: number): boolean {
  return presenceConnAt > tombstonedConnAt;
}

/** Should an authoritative "removed" entry (from a reconcile/snapshot) actually
 *  tombstone the player? Only when they are NOT already back with a newer connection:
 *  if we currently see that id present with a connAt strictly newer than the removal's
 *  connAt, the removal is stale (they left and rejoined) and must be IGNORED, or we'd
 *  wrongly evict a returned player. `presentConnAt` is undefined when the id is not in
 *  our live roster (then the removal stands). Mirrors shouldClearTombstone's per-device
 *  monotonic-connAt rule so the two never disagree. */
export function shouldReTombstone(removedConnAt: number, presentConnAt: number | undefined): boolean {
  if (presentConnAt === undefined) return true;
  return !shouldClearTombstone(removedConnAt, presentConnAt);
}

/** Decide a (re)entering client's seniority (joinedAt). When the stored identity was
 *  active within `recoveryMs` (a refresh or a quick drop), KEEP the stored seniority
 *  so the host keeps host and seats never reshuffle on a reload. Otherwise — a long
 *  absence (the seat was released long ago) or no stored identity at all (a genuine
 *  leave/kick wiped it) — return `now`, a FRESH seniority that ranks last and so can
 *  never reclaim host over players who stayed. Pure + unit-tested. */
export function seniorityOnReturn(
  stored: { joinedAt: number; ts: number } | null,
  now: number,
  recoveryMs: number
): number {
  if (stored && stored.joinedAt > 0 && now - stored.ts <= recoveryMs) return stored.joinedAt;
  return now;
}

// ---- Seat resolution --------------------------------------------------------
// The single, pure, testable rule for "who sits where" each presence sync. It
// fixes the duplicate-on-return and lingering-away bugs and honours the product
// rules: a returning player reclaims their own seat if free else any free seat; a
// kicked/left (tombstoned) id is never seated; an existing spectator is NOT pulled
// into a freed seat (only someone who actually wants a seat takes one).

export interface RosterEntry {
  id: string;
  /** The seat this client published it wants/holds (-1 = none / spectator). */
  seat: number;
  joinedAt: number;
}
export interface SeatClaimEntry { seat: number; id: string; }

export interface SeatingResult {
  /** seat -> id, for the present players who hold a seat this sync. */
  bySeat: Map<number, string>;
  /** id -> seat for everyone present (seat -1 = spectator). */
  resolved: Map<string, number>;
}

/**
 * Resolve seats for one presence sync.
 *  - `roster` is the present clients (already tombstone-filtered by the caller is
 *    fine, but we also skip tombstoned ids defensively).
 *  - `claims` are the persistent seat claims (incl. away players' reserved seats).
 *  - A seat reserved by an AWAY claim (claim id not present) is NOT free.
 *  - Priority per present, non-tombstoned client: (1) the seat it published if free;
 *    (2) its OWN existing claimed seat if free (so a returning dropped player gets
 *    its old spot back); (3) for a client that WANTS a seat (published seat>=0 but it
 *    was taken) the lowest free seat; (4) else spectator. A client that published
 *    seat -1 AND holds no claim stays a spectator (never auto-seated).
 */
export function resolveSeating(
  roster: RosterEntry[],
  claims: SeatClaimEntry[],
  tombstones: { has(id: string): boolean },
  seatCount: number
): SeatingResult {
  const present = roster.filter((p) => !tombstones.has(p.id));
  const presentIds = new Set(present.map((p) => p.id));
  // The seat each id currently claims (if any).
  const claimOf = new Map<string, number>();
  for (const c of claims) if (!claimOf.has(c.id)) claimOf.set(c.id, c.seat);
  const bySeat = new Map<number, string>();

  const seatReservedAway = (s: number): boolean => {
    const c = claims.find((x) => x.seat === s);
    return !!c && !presentIds.has(c.id); // an away owner still reserves it
  };
  const firstFree = (): number => {
    for (let s = 0; s < seatCount; s++) {
      if (bySeat.has(s)) continue;
      if (seatReservedAway(s)) continue;
      return s;
    }
    return -1;
  };

  // Pass 1: honour a published seat that is free.
  const deferred: RosterEntry[] = [];
  for (const p of present) {
    const want = p.seat >= 0 && p.seat < seatCount ? p.seat : -1;
    if (want >= 0 && !bySeat.has(want)) bySeat.set(want, p.id);
    else deferred.push(p);
  }
  // Pass 2: a deferred client takes its OWN claimed seat if free, else (only if it
  // actually wanted a seat) the lowest free seat. A pure spectator (no wanted seat,
  // no claim) is left unseated.
  for (const p of deferred) {
    // A client that did NOT publish a seat is a spectator and stays one — even if a
    // stale claim lingers, we never pull a watcher back into a seat.
    if (p.seat < 0) continue;
    const ownClaim = claimOf.get(p.id);
    if (ownClaim !== undefined && ownClaim >= 0 && ownClaim < seatCount && !bySeat.has(ownClaim)) {
      bySeat.set(ownClaim, p.id); // returning player reclaims their own free seat
      continue;
    }
    const free = firstFree();
    if (free >= 0) bySeat.set(free, p.id);
  }

  const resolved = new Map<string, number>();
  for (const p of present) resolved.set(p.id, -1);
  for (const [seat, id] of bySeat) resolved.set(id, seat);
  return { bySeat, resolved };
}
