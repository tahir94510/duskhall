import { describe, it, expect } from "vitest";
import { seatIsOwned, seatIsRival, cardIsRivalOwned, type Occupancy } from "./occupancy.js";

// These rules decide whether a seat's on-screen area is a player's private zone or
// open public table, and whether a card can be touched. The bugs they fix: empty
// seats wrongly blocking drops/concealing cards, and a kicked/left player's cards
// staying locked instead of going public.

function occ(active: number[], claimed: number[]): Occupancy {
  return { activeSeats: new Set(active), claimedSeats: new Set(claimed), seatCount: 4 };
}

describe("Occupancy accepts a live Map as claimedSeats (no per-call allocation)", () => {
  it("a Map's .has works just like a Set for claim lookups", () => {
    const claims = new Map<number, { id: string }>([[2, { id: "x" }]]);
    const o: Occupancy = { activeSeats: new Set([0]), claimedSeats: claims, seatCount: 4 };
    expect(seatIsOwned(o, 2)).toBe(true);  // away player (claimed, not active)
    expect(seatIsOwned(o, 0)).toBe(true);  // active
    expect(seatIsOwned(o, 1)).toBe(false); // empty
  });
});

describe("seatIsOwned", () => {
  it("an active seat is owned", () => {
    expect(seatIsOwned(occ([1], [1]), 1)).toBe(true);
  });
  it("an away seat (claimed, not active) is still owned", () => {
    expect(seatIsOwned(occ([], [2]), 2)).toBe(true);
  });
  it("an empty seat (no claim) is NOT owned", () => {
    expect(seatIsOwned(occ([0], [0]), 3)).toBe(false);
  });
  it("out-of-range seats are not owned", () => {
    expect(seatIsOwned(occ([], []), -1)).toBe(false);
    expect(seatIsOwned(occ([], []), 4)).toBe(false);
  });
});

describe("seatIsRival", () => {
  const o = occ([0, 2], [0, 2]); // seats 0 and 2 held
  it("a held seat that is not mine is a rival zone", () => {
    expect(seatIsRival(o, 2, 0, false)).toBe(true);
  });
  it("my own seat is never a rival zone", () => {
    expect(seatIsRival(o, 0, 0, false)).toBe(false);
  });
  it("an empty seat is never a rival zone (open public table)", () => {
    expect(seatIsRival(o, 1, 0, false)).toBe(false);
    expect(seatIsRival(o, 3, 0, false)).toBe(false);
  });
  it("a spectator has no rival relationship (can touch nothing anyway)", () => {
    expect(seatIsRival(o, 2, 0, true)).toBe(false);
  });
});

describe("cardIsRivalOwned", () => {
  const o = occ([0, 1], [0, 1]); // seats 0 and 1 held; 2 and 3 empty
  it("a public (unowned) card is never rival-owned", () => {
    expect(cardIsRivalOwned(o, null, 0, false)).toBe(false);
  });
  it("my own card is not rival-owned", () => {
    expect(cardIsRivalOwned(o, 0, 0, false)).toBe(false);
  });
  it("a rival's card on a held seat IS rival-owned (blocked/concealed)", () => {
    expect(cardIsRivalOwned(o, 1, 0, false)).toBe(true);
  });
  it("a card stranded on an EMPTY seat is public, not rival-owned (orphan release)", () => {
    // seat 2 is empty: a card still tagged ownerSeat=2 must become grabbable/visible
    expect(cardIsRivalOwned(o, 2, 0, false)).toBe(false);
  });
  it("a spectator sees every held-seat card as untouchable", () => {
    expect(cardIsRivalOwned(o, 0, -1, true)).toBe(true);
    expect(cardIsRivalOwned(o, 1, -1, true)).toBe(true);
    // but a card on an empty seat is still public even for spectators
    expect(cardIsRivalOwned(o, 3, -1, true)).toBe(false);
  });
});

describe("kick/leave transition: a left seat releases its cards to the table", () => {
  it("before leave the rival card is owned; after the seat empties it is public", () => {
    const before = occ([0, 1], [0, 1]);
    expect(cardIsRivalOwned(before, 1, 0, false)).toBe(true);
    // Player on seat 1 leaves/kicked → seat 1 no longer active or claimed.
    const after = occ([0], [0]);
    expect(cardIsRivalOwned(after, 1, 0, false)).toBe(false); // now public
    expect(seatIsRival(after, 1, 0, false)).toBe(false);      // area now open table
  });

  it("a dropped (away) player keeps their seat owned so cards stay private", () => {
    // seat 1 active player drops: still claimed, just not active.
    const dropped = occ([0], [0, 1]);
    expect(cardIsRivalOwned(dropped, 1, 0, false)).toBe(true); // still private
    expect(seatIsOwned(dropped, 1)).toBe(true);
  });
});
