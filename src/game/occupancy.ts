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

/** The host is the present player on the LOWEST active seat (the room creator
 *  while they're here). Returns -1 when nobody is seated. Because it keys off the
 *  lowest ACTIVE seat, the role transfers automatically the moment the current
 *  host leaves (their seat drops out of activeSeats), and a late joiner who lands
 *  on a higher seat is never host. Drives kick/reset-deck permissions. */
export function hostSeat(activeSeats: Iterable<number>): number {
  let min = Infinity;
  for (const s of activeSeats) min = Math.min(min, s);
  return Number.isFinite(min) ? min : -1;
}

/** Is the viewer the host? They must hold a real seat and it must be the host seat
 *  (a spectator, seat < 0, is never host). */
export function isHostSeat(claimSeat: number, activeSeats: Iterable<number>, spectator: boolean): boolean {
  return !spectator && claimSeat >= 0 && claimSeat === hostSeat(activeSeats);
}
