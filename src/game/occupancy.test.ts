import { describe, it, expect } from "vitest";
import { seatIsOwned, seatIsRival, cardIsRivalOwned, hostId, isHost, hostCandidatesWithAway, resolveSeating, shouldClearTombstone, shouldReTombstone, seniorityOnReturn, type Occupancy, type HostCandidate, type RosterEntry } from "./occupancy.js";

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
    expect(seatIsRival(o, 2, 0)).toBe(true);
  });
  it("my own seat is never a rival zone", () => {
    expect(seatIsRival(o, 0, 0)).toBe(false);
  });
  it("an empty seat is never a rival zone (open public table)", () => {
    expect(seatIsRival(o, 1, 0)).toBe(false);
    expect(seatIsRival(o, 3, 0)).toBe(false);
  });
  it("a not-seated viewer (selfSeat -1) treats every held seat as a rival (it can touch nothing anyway)", () => {
    expect(seatIsRival(o, 2, -1)).toBe(true);
    expect(seatIsRival(o, 0, -1)).toBe(true);
  });
});

describe("cardIsRivalOwned", () => {
  const o = occ([0, 1], [0, 1]); // seats 0 and 1 held; 2 and 3 empty
  it("a public (unowned) card is never rival-owned", () => {
    expect(cardIsRivalOwned(o, null, 0)).toBe(false);
  });
  it("my own card is not rival-owned", () => {
    expect(cardIsRivalOwned(o, 0, 0)).toBe(false);
  });
  it("a rival's card on a held seat IS rival-owned (blocked/concealed)", () => {
    expect(cardIsRivalOwned(o, 1, 0)).toBe(true);
  });
  it("a card stranded on an EMPTY seat is public, not rival-owned (orphan release)", () => {
    // seat 2 is empty: a card still tagged ownerSeat=2 must become grabbable/visible
    expect(cardIsRivalOwned(o, 2, 0)).toBe(false);
  });
  it("a not-seated viewer (selfSeat -1) sees every held-seat card as untouchable", () => {
    expect(cardIsRivalOwned(o, 0, -1)).toBe(true);
    expect(cardIsRivalOwned(o, 1, -1)).toBe(true);
    // but a card on an empty seat is still public even to a not-seated viewer
    expect(cardIsRivalOwned(o, 3, -1)).toBe(false);
  });
});

describe("kick/leave transition: a left seat releases its cards to the table", () => {
  it("before leave the rival card is owned; after the seat empties it is public", () => {
    const before = occ([0, 1], [0, 1]);
    expect(cardIsRivalOwned(before, 1, 0)).toBe(true);
    // Player on seat 1 leaves/kicked → seat 1 no longer active or claimed.
    const after = occ([0], [0]);
    expect(cardIsRivalOwned(after, 1, 0)).toBe(false); // now public
    expect(seatIsRival(after, 1, 0)).toBe(false);      // area now open table
  });

  it("a dropped (away) player keeps their seat owned so cards stay private", () => {
    // seat 1 active player drops: still claimed, just not active.
    const dropped = occ([0], [0, 1]);
    expect(cardIsRivalOwned(dropped, 1, 0)).toBe(true); // still private
    expect(seatIsOwned(dropped, 1)).toBe(true);
  });

  it("full presence lifecycle: a card is freed ONLY when its owner is truly gone", () => {
    // Seat 1 is a rival. Walk the states a player passes through and assert that the owner's
    // card stays concealed/owned through every transient state, and turns public only when the
    // seat is neither active nor claimed (i.e. exit, kick, or away-grace expiry removed it).
    const active = occ([0, 1], [0, 1]);    // playing normally
    const away = occ([0], [0, 1]);         // dropped / refresh / tab-hidden — claim persists
    const gone = occ([0], [0]);            // exited / kicked / grace expired — claim removed
    expect(cardIsRivalOwned(active, 1, 0)).toBe(true);  // concealed while active
    expect(cardIsRivalOwned(away, 1, 0)).toBe(true);    // STILL concealed while away
    expect(cardIsRivalOwned(gone, 1, 0)).toBe(false);   // public only once truly gone
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
    expect(hostId([C("seatless", 1000, -1)])).toBe(""); // a lone seatless client hosts nothing
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
  it("isHost: only the earliest seated joiner is host (a seatless client isn't in the candidate list)", () => {
    const active = [C("a", 1000, 0), C("b", 2000, 1)];
    expect(isHost("a", active)).toBe(true);
    expect(isHost("b", active)).toBe(false);
    expect(isHost("", active)).toBe(false);
  });
});

describe("seniorityOnReturn: refresh keeps host, long absence / leave does not", () => {
  const RECOVERY = 40000; // SENIORITY_RECOVERY_MS
  const NOW = 1_000_000;
  const C = (id: string, joinedAt: number, seat: number): HostCandidate => ({ id, joinedAt, seat });

  it("a refresh recovers the original seniority (so the host keeps host)", () => {
    // Host joined at 1000, was active 2s ago (a quick refresh).
    const sen = seniorityOnReturn({ joinedAt: 1000, ts: NOW - 2000 }, NOW, RECOVERY);
    expect(sen).toBe(1000);
    // With the recovered seniority they are still the earliest of everyone present.
    expect(hostId([C("host", sen, 0), C("other", 5000, 1)])).toBe("host");
  });

  it("an absence longer than the window yields FRESH seniority (cannot reclaim host)", () => {
    // Identity last active 60s ago — beyond the 40s window: treated as a new joiner.
    const sen = seniorityOnReturn({ joinedAt: 1000, ts: NOW - 60000 }, NOW, RECOVERY);
    expect(sen).toBe(NOW);
    // A peer who stayed (joined at 5000) outranks the now-fresh returnee.
    expect(hostId([C("returnee", sen, 0), C("stayed", 5000, 1)])).toBe("stayed");
  });

  it("no stored identity (a genuine leave/kick wiped it) → fresh seniority", () => {
    expect(seniorityOnReturn(null, NOW, RECOVERY)).toBe(NOW);
    // joinedAt 0 (corrupt / never set) is also treated as fresh.
    expect(seniorityOnReturn({ joinedAt: 0, ts: NOW }, NOW, RECOVERY)).toBe(NOW);
  });
});

describe("shouldReTombstone: an authoritative removal ignores a returned player", () => {
  it("re-tombstones when the id is not present (no live connAt)", () => {
    expect(shouldReTombstone(1000, undefined)).toBe(true);
  });
  it("re-tombstones when the present connAt is NOT newer than the removal", () => {
    expect(shouldReTombstone(2000, 2000)).toBe(true);  // same connection
    expect(shouldReTombstone(2000, 1500)).toBe(true);  // stale echo
  });
  it("does NOT re-tombstone a genuine return (present connAt strictly newer)", () => {
    expect(shouldReTombstone(1000, 2000)).toBe(false);
  });
});

describe("shouldClearTombstone: a returnee with a newer connAt is shown at once", () => {
  it("a strictly newer connAt clears the tombstone (genuine reconnect)", () => {
    expect(shouldClearTombstone(1000, 2000)).toBe(true);
  });
  it("the same or older connAt is a stale presence echo — stays suppressed", () => {
    expect(shouldClearTombstone(2000, 2000)).toBe(false);
    expect(shouldClearTombstone(2000, 1500)).toBe(false);
  });
});

describe("resolveSeating: dedupe, own-seat reclaim, tombstone, no auto-seat for a non-asking client", () => {
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

  it("a client that ISN'T asking (no wanted seat, no claim) is NOT auto-seated when a seat is free", () => {
    // 'idle' published seat -1 and holds no claim; seats 1-3 are free, but it stays out.
    const roster: RosterEntry[] = [R("a", 0), R("idle", -1)];
    const claims = [{ seat: 0, id: "a" }];
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("idle")).toBe(-1); // still unseated
  });

  it("a NOT-ASKING client holding a STALE claim stays unseated (no auto-reseat)", () => {
    // 'idle' published seat -1 but a stale claim on seat 2 lingers; must NOT be reseated.
    const roster: RosterEntry[] = [R("a", 0), R("idle", -1)];
    const claims = [{ seat: 0, id: "a" }, { seat: 2, id: "idle" }];
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("idle")).toBe(-1); // own-claim ignored when not asking for a seat
  });

  it("a seat reserved by an AWAY player is not handed to someone else", () => {
    // 'away' is claimed on seat 0 but not present; 'join' wants any seat → gets 1, not 0.
    const roster: RosterEntry[] = [R("join", 9 /*overflow→any free*/)];
    const claims = [{ seat: 0, id: "away" }];
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("join")).toBe(1); // seat 0 stays reserved for the away owner
  });

  it("a newcomer PUBLISHING an away player's exact seat cannot steal it", () => {
    // 'away' holds seat 0 but is not present; 'join' publishes seat 0 directly (its local
    // guess). The away reservation must still win: join is bumped to a free seat, not 0.
    const roster: RosterEntry[] = [R("join", 0)];
    const claims = [{ seat: 0, id: "away" }];
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("join")).toBe(1); // seat 0 stays reserved for the away owner
  });

  it("the away owner still reclaims its own seat when it returns", () => {
    // 'away' returns (now present) publishing seat 0; its own claim makes it reclaim 0,
    // and a newcomer also publishing 0 the same sync is bumped elsewhere.
    const roster: RosterEntry[] = [R("away", 0, 100), R("join", 0, 500)];
    const claims = [{ seat: 0, id: "away" }];
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("away")).toBe(0); // owner reclaims
    expect(resolved.get("join")).toBe(1); // newcomer bumped
  });

  it("a joiner who wants a TAKEN seat still gets a free one (overflow)", () => {
    const roster: RosterEntry[] = [R("a", 0), R("b", 0)];
    const { resolved } = resolveSeating(roster, [], noTomb, 4);
    expect(resolved.get("a")).toBe(0);
    expect(resolved.get("b")).toBe(1);
  });

  it("a RETURNING visitor who now WANTS a seat (publishes >=0) gets seated", () => {
    // 'a' holds seat 0; seats 1-3 are free. The returning visitor re-enters publishing a
    // wanted seat (entry intent), so they take a free seat — not left unseated.
    const roster: RosterEntry[] = [R("a", 0), R("back", 0)]; // 'back' wants a seat (>=0)
    const claims = [{ seat: 0, id: "a" }]; // back's old claim was cleared on leave
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("a")).toBe(0);
    expect(resolved.get("back")).toBeGreaterThanOrEqual(1); // seated (overflow), not -1
  });

  it("a client that keeps publishing -1 is NOT auto-seated when a seat frees", () => {
    // Only 'a' is seated; seats 1-3 free (others left). 'idle' published -1 (not asking) and
    // keeps doing so → stays out (no mid-session auto-seat for a client that isn't asking).
    const roster: RosterEntry[] = [R("a", 0), R("idle", -1)];
    const claims = [{ seat: 0, id: "a" }];
    const { resolved } = resolveSeating(roster, claims, noTomb, 4);
    expect(resolved.get("idle")).toBe(-1);
  });
});

describe("hostCandidatesWithAway: a dropped host keeps host during the away grace", () => {
  it("keeps the away (earliest) host ranked above present players", () => {
    // Host A (joined first) dropped → away claim; B and C are present and newer.
    const active: HostCandidate[] = [
      { id: "B", joinedAt: 200, seat: 1 },
      { id: "C", joinedAt: 300, seat: 2 }
    ];
    const away = [{ id: "A", joinedAt: 100, seat: 0 }];
    const cand = hostCandidatesWithAway(active, away);
    expect(hostId(cand)).toBe("A"); // host does NOT transfer while A is merely away
  });

  it("transfers to the oldest active player once the away claim is gone", () => {
    const active: HostCandidate[] = [
      { id: "B", joinedAt: 200, seat: 1 },
      { id: "C", joinedAt: 300, seat: 2 }
    ];
    expect(hostId(hostCandidatesWithAway(active, []))).toBe("B");
  });

  it("ignores an away claim with unknown seniority (joinedAt<=0) so it can't seize host", () => {
    const active: HostCandidate[] = [{ id: "B", joinedAt: 200, seat: 1 }];
    const away = [{ id: "ghost", joinedAt: 0, seat: 0 }];
    expect(hostId(hostCandidatesWithAway(active, away))).toBe("B");
  });

  it("does not duplicate an id that is both active and (stale) away-claimed", () => {
    const active: HostCandidate[] = [{ id: "A", joinedAt: 100, seat: 0 }];
    const away = [{ id: "A", joinedAt: 100, seat: 0 }];
    const cand = hostCandidatesWithAway(active, away);
    expect(cand.filter((c) => c.id === "A").length).toBe(1);
  });
})
