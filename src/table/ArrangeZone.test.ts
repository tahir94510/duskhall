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
    const targets = arrangeZone(cards, 0, optsFor(0));
    const xs = [...new Set(targets.map((t) => t.x))];
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeCloseTo(0.5, 6); // symmetric about the bottom zone's centre line
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

  it("returns nothing for fewer than two cards", () => {
    expect(arrangeZone(makeCards([["timeRift", 1]]), 0, optsFor(0))).toEqual([]);
    expect(isZoneArranged(makeCards([["timeRift", 1]]), 0, optsFor(0))).toBe(true);
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
