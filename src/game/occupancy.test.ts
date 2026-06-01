import { describe, it, expect } from "vitest";
import { seatIsOwned, seatIsRival, cardIsRivalOwned, hostId, isHost, resolveSeating, type Occupancy, type HostCandidate, type RosterEntry } from "./occupancy.js";

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

describe("host = earliest active joiner; transfers on leave; returnee never steals it", () => {
  const C = (id: string, joinedAt: number, seat: number): HostCandidate => ({ id, joinedAt, seat });

  it("the earliest joiner is the host (NOT the lowest seat)", () => {
    // Creator joined first but sits on seat 2; a later joiner holds seat 0.
    const active = [C("creator", 1000, 2), C("late", 2000, 0)];
    expect(hostId(active)).toBe("creator"); // earliest, regardless of seat number
  });
  it("returns '' when nobody is seated", () => {
    expect(hostId([])).toBe("");
    expect(hostId([C("spec", 1000, -1)])).toBe(""); // a lone spectator hosts nothing
  });
  it("transfers to the next-oldest present player when the host leaves", () => {
    let active = [C("a", 1000, 0), C("b", 1500, 1), C("c", 2000, 2)];
    expect(hostId(active)).toBe("a");
    active = active.filter((c) => c.id !== "a"); // host a leaves
    expect(hostId(active)).toBe("b"); // role moves to the next-oldest, no handoff
  });
  it("a returning ex-host does NOT regain host (their reconnect = newer joinedAt)", () => {
    // a (oldest) leaves → b is host. a returns with a FRESH joinedAt (now the latest).
    const afterReturn = [C("b", 1500, 1), C("c", 2000, 2), C("a", 9000, 0)];
    expect(hostId(afterReturn)).toBe("b"); // b keeps host; a sitting on seat 0 can't steal it
  });
  it("ties on joinedAt break by id so all clients agree", () => {
    expect(hostId([C("zeta", 1000, 0), C("alpha", 1000, 1)])).toBe("alpha");
  });
  it("isHost: only the earliest joiner is host; spectators never are", () => {
    const active = [C("a", 1000, 0), C("b", 2000, 1)];
    expect(isHost("a", active, false)).toBe(true);
    expect(isHost("b", active, false)).toBe(false);
    expect(isHost("a", active, true)).toBe(false); // spectator flag wins
    expect(isHost("", active, false)).toBe(false);
  });
});

describe("resolveSeating: dedupe, own-seat reclaim, tombstone, no spectator auto-seat", () => {
  const R = (id: string, seat: number, joinedAt = 1000): RosterEntry => ({ id, seat, joinedAt });
  const noTomb = { has: () => false };

  it("a returning DROPPED player reclaims their OWN seat when it's free", () => {
    // 'ret' published seat 0 (their old seat); it's free → they get it back.
    const roster: RosterEntry[] = [R("a", 1), R("ret", 0)];
    const claims = [{ seat: 1, id: "a" }, { seat: 0, id: "ret" }];
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("ret")).toBe(0);
    expect(resolved.get("a")).toBe(1);
  });

  it("when the old seat is TAKEN, the returner gets another free seat — NO duplicate id", () => {
    // 'ret' wants seat 0 but 'new' already holds it; ret falls to a free seat (2 or 3).
    const roster: RosterEntry[] = [R("new", 0), R("a", 1), R("ret", 0)];
    const claims = [{ seat: 0, id: "new" }, { seat: 1, id: "a" }, { seat: 0, id: "ret" }];
    const { resolved, bySeat } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("new")).toBe(0);
    const retSeat = resolved.get("ret")!;
    expect(retSeat).toBeGreaterThanOrEqual(2); // a fresh free seat, not 0
    // ret appears on exactly ONE seat (no away-ghost duplicate of the same id)
    const seatsForRet = [...bySeat.entries()].filter(([, id]) => id === "ret").map(([s]) => s);
    expect(seatsForRet).toEqual([retSeat]);
  });

  it("a tombstoned (kicked/left) id is never seated", () => {
    const roster: RosterEntry[] = [R("a", 0), R("ghost", 1)];
    const claims = [{ seat: 0, id: "a" }, { seat: 1, id: "ghost" }];
    const { resolved, bySeat } = resolveSeating(roster, claims, { has: (id) => id === "ghost" }, 4);
    expect(resolved.has("ghost")).toBe(false);
    expect([...bySeat.values()]).not.toContain("ghost");
  });

  it("an existing SPECTATOR (no wanted seat, no claim) is NOT auto-seated when a seat is free", () => {
    // 'spec' published seat -1 and holds no claim; seats 1-3 are free, but spec stays out.
    const roster: RosterEntry[] = [R("a", 0), R("spec", -1)];
    const claims = [{ seat: 0, id: "a" }];
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("spec")).toBe(-1); // still a spectator
  });

  it("a SPECTATOR holding a STALE claim still stays a spectator (no auto-reseat)", () => {
    // 'spec' published seat -1 but a stale claim on seat 2 lingers; must NOT be reseated.
    const roster: RosterEntry[] = [R("a", 0), R("spec", -1)];
    const claims = [{ seat: 0, id: "a" }, { seat: 2, id: "spec" }];
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("spec")).toBe(-1); // own-claim ignored when not seated
  });

  it("a seat reserved by an AWAY player is not handed to someone else", () => {
    // 'away' is claimed on seat 0 but not present; 'join' wants any seat → gets 1, not 0.
    const roster: RosterEntry[] = [R("join", 9 /*overflow→any free*/)];
    const claims = [{ seat: 0, id: "away" }];
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("join")).toBe(1); // seat 0 stays reserved for the away owner
  });

  it("a joiner who wants a TAKEN seat still gets a free one (overflow)", () => {
    const roster: RosterEntry[] = [R("a", 0), R("b", 0)];
    const { resolved } = resolveSeating(roster, [], noTomb, 4);
    expect(resolved.get("a")).toBe(0);
    expect(resolved.get("b")).toBe(1);
  });

  it("a RETURNING ex-spectator who now WANTS a seat (publishes >=0) gets seated", () => {
    // 'a' holds seat 0; seats 1-3 are free. The ex-spectator re-enters publishing a
    // wanted seat (entry intent), so they take a free seat — NOT kept a spectator.
    const roster: RosterEntry[] = [R("a", 0), R("back", 0)]; // 'back' wants a seat (>=0)
    const claims = [{ seat: 0, id: "a" }]; // back's old claim was cleared on leave
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("a")).toBe(0);
    expect(resolved.get("back")).toBeGreaterThanOrEqual(1); // seated (overflow), not -1
  });

  it("an ESTABLISHED spectator (publishes -1) is NOT auto-seated when a seat frees", () => {
    // Only 'a' is seated; seats 1-3 free (others left). 'spec' was resolved a spectator
    // earlier this session and keeps publishing -1 → stays out (no mid-session auto-seat).
    const roster: RosterEntry[] = [R("a", 0), R("spec", -1)];
    const claims = [{ seat: 0, id: "a" }];
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("spec")).toBe(-1);
  });
});
