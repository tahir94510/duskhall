import { describe, it, expect } from "vitest";
import type { CardState } from "./types.js";
import { arrangeZone, isZoneArranged, type ArrangeOpts } from "./ArrangeZone.js";
import { cardZoneOwner, CARD_CANON_W, CARD_CANON_H, ZONE_DEPTH } from "./SlotGrid.js";
import { seatRotationDeg, type Seat } from "./rotation.js";

const W = CARD_CANON_W;
const H = CARD_CANON_H;
const SEATS: Seat[] = [0, 1, 2, 3];

// Build loose cards from (defId, count) pairs. Initial position is irrelevant — arrangeZone
// repositions everything — so they all start piled at the centre with rot 0.
function makeCards(spec: Array<[string, number]>): CardState[] {
  const out: CardState[] = [];
  let z = 0;
  for (const [defId, count] of spec) {
    for (let i = 0; i < count; i++) {
      out.push({ id: `${defId}-${i}`, defId, x: 0.5, y: 0.5, z: z++, rot: 0, faceUp: false, ownerSeat: null, ts: 0 });
    }
  }
  return out;
}

// The canonical rot that reads upright for a player seated at `seat` (their own camera). Side
// seats turn the board a quarter, so their upright card carries an ODD canonical rot — exactly
// what cardZoneOwner needs to swap the footprint for the containment check.
function uprightForSeat(seat: Seat): number {
  const boardRot = seatRotationDeg(seat);
  return (((-boardRot / 90) % 4) + 4) % 4;
}

function optsFor(seat: Seat): ArrangeOpts {
  return { uprightRot: uprightForSeat(seat), cardW: W, cardH: H };
}

// Apply targets onto a fresh copy so we can re-test idempotency from the arranged state.
function applied(cards: CardState[], seat: Seat): CardState[] {
  const opts = optsFor(seat);
  const targets = arrangeZone(cards, seat, opts);
  const byId = new Map<string, CardState>(cards.map((c) => [c.id, { ...c }]));
  for (const t of targets) {
    const c = byId.get(t.id)!;
    c.x = t.x; c.y = t.y; c.rot = t.rot; c.z = t.z;
  }
  return [...byId.values()];
}

// Realistic shapes: a couple of types, a full medium hand, and the whole catalogue (15 types,
// some with many copies → 32 cards), spanning few / medium / many.
const FEW: Array<[string, number]> = [["timeRift", 2]];
const SMALL: Array<[string, number]> = [["timeRift", 1], ["etherStrike", 1]];
const MEDIUM: Array<[string, number]> = [
  ["timeRift", 2], ["veilOfVoid", 1], ["etherStrike", 3], ["silence", 1], ["runicWarden", 2]
];
const ALL_TYPES: Array<[string, number]> = [
  ["timeRift", 4], ["veilOfVoid", 4], ["crimsonMonolith", 4], ["necromancersEye", 4],
  ["etherStrike", 8], ["shadowTheft", 6], ["ancientSight", 4], ["mindParasite", 4], ["twistOfFate", 2],
  ["silence", 8], ["karmicReflection", 4], ["bloodAtonement", 4],
  ["runicWarden", 8], ["glacialAberration", 4], ["shadowSlayer", 4]
];

describe("arrangeZone: every card stays inside its own trapezoid (no spill to neighbours)", () => {
  for (const spec of [FEW, SMALL, MEDIUM, ALL_TYPES]) {
    const total = spec.reduce((s, [, n]) => s + n, 0);
    for (const seat of SEATS) {
      it(`${total} cards in seat ${seat}'s zone are all owned by seat ${seat}`, () => {
        const cards = makeCards(spec);
        const targets = arrangeZone(cards, seat, optsFor(seat));
        expect(targets.length).toBe(cards.length);
        for (const t of targets) {
          // The production owner test: a target is in-bounds iff seat owns its full footprint.
          expect(cardZoneOwner(t.x, t.y, t.rot, W, H)).toBe(seat);
        }
      });
    }
  }
});

describe("arrangeZone: grouping & stacking", () => {
  it("collects identical cards into one stack (shared x,y,rot, distinct z)", () => {
    const cards = makeCards([["etherStrike", 8], ["timeRift", 1]]);
    const targets = arrangeZone(cards, 0, optsFor(0));
    const ether = targets.filter((t) => t.id.startsWith("etherStrike-"));
    expect(ether.length).toBe(8);
    const x0 = ether[0]!.x, y0 = ether[0]!.y, r0 = ether[0]!.rot;
    for (const t of ether) {
      expect(t.x).toBeCloseTo(x0, 9);
      expect(t.y).toBeCloseTo(y0, 9);
      expect(t.rot).toBe(r0);
    }
    expect(new Set(ether.map((t) => t.z)).size).toBe(8); // distinct depths within the stack
  });

  it("orders stacks by category (seal → spell → intervention → servant) regardless of input order", () => {
    // Authored deliberately out of category order.
    const cards = makeCards([["runicWarden", 1], ["silence", 1], ["etherStrike", 1], ["timeRift", 1]]);
    const targets = arrangeZone(cards, 0, optsFor(0)).slice().sort((a, b) => a.z - b.z);
    const rankOf: Record<string, number> = { timeRift: 0, etherStrike: 1, silence: 2, runicWarden: 3 };
    const seq = targets.map((t) => rankOf[t.id.split("-")[0]!]!);
    // Non-decreasing category rank by z-order means the stacks are grouped by type.
    for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeGreaterThanOrEqual(seq[i - 1]!);
  });
});

describe("arrangeZone: centering", () => {
  it("centres the row horizontally about the zone mid-line (seat 0)", () => {
    const cards = makeCards([["timeRift", 1], ["etherStrike", 1], ["silence", 1]]);
    const xs = arrangeZone(cards, 0, optsFor(0)).map((t) => t.x);
    const extentCentre = (Math.min(...xs) + Math.max(...xs)) / 2;
    expect(extentCentre).toBeCloseTo(0.5, 6); // the block of stacks sits centred on the mid-line
  });
});

describe("arrangeZone: idempotency & determinism", () => {
  it("an already-arranged zone reports arranged and re-arranges to the same spots", () => {
    for (const seat of SEATS) {
      const cards = makeCards(MEDIUM);
      const once = applied(cards, seat);
      expect(isZoneArranged(once, seat, optsFor(seat))).toBe(true);
      // Re-running on the arranged set yields identical placements.
      const a = arrangeZone(cards, seat, optsFor(seat));
      const b = arrangeZone(once, seat, optsFor(seat));
      const byId = new Map(b.map((t) => [t.id, t] as const));
      for (const t of a) {
        const u = byId.get(t.id)!;
        expect(u.x).toBeCloseTo(t.x, 9);
        expect(u.y).toBeCloseTo(t.y, 9);
        expect(u.rot).toBe(t.rot);
      }
    }
  });

  it("is order-independent: shuffled input yields the same targets", () => {
    const a = makeCards(MEDIUM);
    const b = [...a].reverse();
    const ta = arrangeZone(a, 0, optsFor(0));
    const tb = arrangeZone(b, 0, optsFor(0));
    const mapB = new Map(tb.map((t) => [t.id, t] as const));
    for (const t of ta) {
      const u = mapB.get(t.id)!;
      expect(u.x).toBeCloseTo(t.x, 9);
      expect(u.y).toBeCloseTo(t.y, 9);
      expect(u.rot).toBe(t.rot);
    }
  });

  it("arranges a single card to the centred spot; an empty zone yields nothing", () => {
    expect(arrangeZone([], 0, optsFor(0))).toEqual([]);
    const one = makeCards([["timeRift", 1]]); // starts loose at (0.5, 0.5)
    const targets = arrangeZone(one, 0, optsFor(0));
    expect(targets.length).toBe(1);
    expect(targets[0]!.x).toBeCloseTo(0.5, 9); // centred along the edge
    expect(cardZoneOwner(targets[0]!.x, targets[0]!.y, targets[0]!.rot, W, H)).toBe(0); // in bounds
    // The loose card is not yet at its target, so the zone is not arranged; once placed, it is.
    expect(isZoneArranged(one, 0, optsFor(0))).toBe(false);
    const placed = one.map((c) => ({ ...c, x: targets[0]!.x, y: targets[0]!.y, rot: targets[0]!.rot }));
    expect(isZoneArranged(placed, 0, optsFor(0))).toBe(true);
  });
});

describe("arrangeZone: centering holds for every seat", () => {
  // The coordinate that runs ALONG each seat's edge (the one the layout centres on u=0).
  const alongEdge = (seat: Seat, t: { x: number; y: number }): number =>
    (seat === 0 || seat === 1) ? t.x : t.y;

  it("centres a single all-identical stack on the zone mid-line, every seat", () => {
    for (const seat of SEATS) {
      const targets = arrangeZone(makeCards([["etherStrike", 5]]), seat, optsFor(seat));
      // One pile → every copy shares the centred spot.
      for (const t of targets) expect(alongEdge(seat, t)).toBeCloseTo(0.5, 9);
      for (const t of targets) expect(cardZoneOwner(t.x, t.y, t.rot, W, H)).toBe(seat);
    }
  });

  it("keeps the row's extent symmetric about the mid-line for a medium hand, every seat", () => {
    // "Centred" means the BLOCK of stacks is centred: its leftmost and rightmost stacks sit an
    // equal distance from the zone's mid-line. (Uneven gaps between type groups can shift the
    // centroid slightly, but the extent stays centred — what the eye reads as centred.)
    for (const seat of SEATS) {
      const targets = arrangeZone(makeCards(MEDIUM), seat, optsFor(seat));
      const along = targets.map((t) => alongEdge(seat, t));
      const extentCentre = (Math.min(...along) + Math.max(...along)) / 2;
      expect(extentCentre).toBeCloseTo(0.5, 6);
    }
  });
});

describe("arrangeZone: row count tracks the stack count", () => {
  const depthsFor = (seat: Seat, spec: Array<[string, number]>): number[] => {
    const targets = arrangeZone(makeCards(spec), seat, optsFor(seat));
    const depthOf = (t: { x: number; y: number }): number =>
      seat === 0 ? 1 - t.y : seat === 1 ? t.y : seat === 2 ? t.x : 1 - t.x;
    return [...new Set(targets.map((t) => +depthOf(t).toFixed(4)))];
  };
  const EIGHT: Array<[string, number]> = [
    ["timeRift", 1], ["veilOfVoid", 1], ["crimsonMonolith", 1], ["necromancersEye", 1],
    ["etherStrike", 1], ["shadowTheft", 1], ["ancientSight", 1], ["mindParasite", 1]
  ];
  const NINE: Array<[string, number]> = [...EIGHT, ["twistOfFate", 1]];

  it("lays eight stacks (the threshold) in a single centred row", () => {
    expect(depthsFor(0, EIGHT).length).toBe(1);
  });

  it("splits nine stacks into two rows, nearer-edge row on top, all in-bounds", () => {
    const depthOf = (seat: Seat, t: { x: number; y: number }): number =>
      seat === 0 ? 1 - t.y : seat === 1 ? t.y : seat === 2 ? t.x : 1 - t.x;
    for (const seat of SEATS) {
      const targets = arrangeZone(makeCards(NINE), seat, optsFor(seat));
      const depths = [...new Set(targets.map((t) => +depthOf(seat, t).toFixed(4)))].sort((a, b) => a - b);
      expect(depths.length).toBe(2);
      const shallow = depths[0]!; // nearer the player's edge → the back row, which sits ON TOP
      const deep = depths[1]!;
      const shallowZ = targets.filter((t) => +depthOf(seat, t).toFixed(4) === shallow).map((t) => t.z);
      const deepZ = targets.filter((t) => +depthOf(seat, t).toFixed(4) === deep).map((t) => t.z);
      // The row nearer the player overlaps on top: every one of its z is above the far row's.
      expect(Math.min(...shallowZ)).toBeGreaterThan(Math.max(...deepZ));
      for (const t of targets) expect(cardZoneOwner(t.x, t.y, t.rot, W, H)).toBe(seat);
    }
  });
});

describe("isZoneArranged: re-enables when the layout changes", () => {
  it("reports tidy right after arranging, then untidy once a card is nudged or added", () => {
    const arranged = applied(makeCards(MEDIUM), 0);
    expect(isZoneArranged(arranged, 0, optsFor(0))).toBe(true);

    // Nudge one card off its spot → no longer arranged (a fresh tidy is allowed).
    const nudged = arranged.map((c) => ({ ...c }));
    nudged[0]!.x += 0.05;
    expect(isZoneArranged(nudged, 0, optsFor(0))).toBe(false);

    // A new card entering the zone changes the target layout → no longer arranged.
    const withNew: CardState[] = [
      ...arranged.map((c) => ({ ...c })),
      { id: "bloodAtonement-0", defId: "bloodAtonement", x: 0.5, y: 0.86, z: 99, rot: 0, faceUp: false, ownerSeat: 0, ts: 0 }
    ];
    expect(isZoneArranged(withNew, 0, optsFor(0))).toBe(false);
  });
});

describe("arrangeZone: two-row fallback for many stacks", () => {
  it("splits the 15 distinct types into two depth bands, all still in-bounds (every seat)", () => {
    for (const seat of SEATS) {
      const cards = makeCards(ALL_TYPES);
      const targets = arrangeZone(cards, seat, optsFor(seat));
      // Two distinct depths (the back/front rows). Depth is the perpendicular distance to the
      // seat's edge; read it off whichever axis the seat's zone runs along.
      const depthOf = (t: { x: number; y: number }): number =>
        seat === 0 ? 1 - t.y : seat === 1 ? t.y : seat === 2 ? t.x : 1 - t.x;
      const depths = [...new Set(targets.map((t) => +depthOf(t).toFixed(4)))];
      expect(depths.length).toBe(2);
      for (const d of depths) {
        expect(d - H / 2).toBeGreaterThanOrEqual(0);
        expect(d + H / 2).toBeLessThanOrEqual(ZONE_DEPTH + 1e-9);
      }
      for (const t of targets) expect(cardZoneOwner(t.x, t.y, t.rot, W, H)).toBe(seat);
    }
  });
});
