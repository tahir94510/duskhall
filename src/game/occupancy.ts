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

/** A seat owned by someone other than the viewer. `selfSeat` is the viewer's own seat, or -1 if
 *  they are not seated (a full-room visitor before they open their own room): with -1 no seat is
 *  "self", so every owned seat reads as a rival. Used to block drops/interactions in a rival area. */
export function seatIsRival(o: Occupancy, seat: number, selfSeat: number): boolean {
  return seat !== selfSeat && seatIsOwned(o, seat);
}

/** Is a card (with the given owner seat) in a rival's still-held private area? A card owned by an
 *  empty seat is public (grabbable, visible); ownerSeat null = public table card. With selfSeat -1
 *  (viewer not seated) every owned card reads as a rival's, so nothing leaks before they leave. */
export function cardIsRivalOwned(
  o: Occupancy,
  ownerSeat: number | null,
  selfSeat: number
): boolean {
  if (ownerSeat === null) return false;
  if (!seatIsOwned(o, ownerSeat)) return false; // owner gone → public
  return ownerSeat !== selfSeat;
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
    if (c.seat < 0) continue; // a seatless client never hosts
    if (!best || c.joinedAt < best.joinedAt || (c.joinedAt === best.joinedAt && c.id < best.id)) {
      best = c;
    }
  }
  return best ? best.id : "";
}

/** Is `selfId` the host? They must be a present, seated player (so a not-seated viewer is never
 *  host — they are not in `active`) and the earliest joiner. */
export function isHost(selfId: string, active: Iterable<HostCandidate>): boolean {
  return selfId !== "" && hostId(active) === selfId;
}

/** An away seat claim (owner not currently present but the seat is still reserved). */
export interface AwayHostClaim {
  id: string;
  joinedAt: number;
  seat: number;
}

/** Build the host-candidate list from the present, seated players PLUS the away seat
 *  claims, so a host who merely DROPPED (network blip / tab hidden) keeps the host role
 *  for the whole away-grace window instead of it bouncing to another player the instant
 *  their presence vanishes. An away claim only counts when its `joinedAt` is known
 *  (> 0): a claim learned with no seniority (e.g. an old snapshot) must never outrank a
 *  real, present player and wrongly seize host. Active players always take precedence
 *  over an away claim for the same id (no duplicates). The result is fed to `hostId`,
 *  which still picks the earliest joiner — so the dropped host (earliest) stays host;
 *  when their claim is finally released (real leave/kick or grace expiry) the role
 *  transfers to the next-oldest ACTIVE player. */
export function hostCandidatesWithAway(active: HostCandidate[], awayClaims: AwayHostClaim[]): HostCandidate[] {
  const out: HostCandidate[] = active.slice();
  const seen = new Set(active.map((c) => c.id));
  for (const a of awayClaims) {
    if (a.seat < 0) continue;
    if (a.joinedAt <= 0) continue; // unknown seniority — never let it win host
    if (seen.has(a.id)) continue;  // an active copy already counts
    out.push({ id: a.id, joinedAt: a.joinedAt, seat: a.seat });
    seen.add(a.id);
  }
  return out;
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
// kicked/left (tombstoned) id is never seated. A client that gets no seat (a full
// room) resolves to -1 — the caller turns that into the "room is full" gate, NOT a
// persistent watcher; there is no spectator role.

export interface RosterEntry {
  id: string;
  /** The seat this client published it wants/holds (-1 = none / not asking). */
  seat: number;
  joinedAt: number;
}
export interface SeatClaimEntry { seat: number; id: string; }

export interface SeatingResult {
  /** seat -> id, for the present players who hold a seat this sync. */
  bySeat: Map<number, string>;
  /** id -> seat for everyone present (seat -1 = got no seat / room full). */
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
 *    was taken) the lowest free seat; (4) else -1 (no seat — a full room). A client
 *    that published seat -1 AND holds no claim is not asking for a seat and stays -1.
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

  // Pass 1: honour a published seat that is free AND not reserved by an away owner. The
  // away check matters: a brand-new client can publish a specific seat number (its local
  // guess before it has the authoritative claims), and without this guard that published
  // seat would be granted even when an AWAY player still holds it — letting a newcomer
  // STEAL a dropped player's seat. A returning away owner is `present` this sync, so its
  // own seat no longer reads as away-reserved and it reclaims it normally below.
  const deferred: RosterEntry[] = [];
  for (const p of present) {
    const want = p.seat >= 0 && p.seat < seatCount ? p.seat : -1;
    if (want >= 0 && !bySeat.has(want) && !seatReservedAway(want)) bySeat.set(want, p.id);
    else deferred.push(p);
  }
  // Pass 2: a deferred client takes its OWN claimed seat if free, else (only if it
  // actually wanted a seat) the lowest free seat. A client that asked for no seat (no
  // wanted seat, no claim) is left unseated (-1).
  for (const p of deferred) {
    // A client that did NOT publish a seat is not asking for one — even if a stale claim
    // lingers, we never pull it back into a seat.
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
