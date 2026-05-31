// Seat-occupancy rules, factored out as pure functions so the "whose area is this,
// and can I touch this card?" decision is unit-tested in one place and reused by
// Game.ts. The distinction that matters for the table:
//   - A seat is OWNED if a player is present on it (active) OR an away player still
//     holds the claim (dropped tab / lost network, not yet left). Its area is that
//     player's private zone.
//   - A seat is EMPTY if nobody ever sat there, or the occupant explicitly left or
//     was kicked. Its area is open public table: drops land, cards there are public.

export interface Occupancy {
  /** Seats with a player currently connected. */
  activeSeats: ReadonlySet<number>;
  /** Seats with a persistent claim (covers active AND away/dropped players). */
  claimedSeats: ReadonlySet<number>;
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
