import { describe, it, expect } from "vitest";
import {
  SETUP_STEPS, TURN_PHASES, initialGuide, startGuide, stopGuide, allReady, setReady,
  chooseFirst, tryAdvance, applyIntent, clockwiseOrder, viewOf, adoptGuide, type GuideState
} from "./guide.js";

// The Guide reducer is host-authoritative and pure. These tests pin the exact
// advancement maths so every device walks the same step/turn/phase: a misbehaving
// peer can never desync the table, and the turn loop is deterministic.

const seats = (s: number[]) => s;

describe("initial / start / stop", () => {
  it("starts in free-play (not started)", () => {
    const g = initialGuide();
    expect(g.started).toBe(false);
    expect(g.progress).toBe(0);
    expect(g.firstSeat).toBe(-1);
  });
  it("start begins the setup walkthrough and bumps version", () => {
    const g = startGuide(initialGuide());
    expect(g.started).toBe(true);
    expect(g.progress).toBe(0);
    expect(g.ready).toEqual([]);
    expect(g.v).toBe(1);
  });
  it("restart from mid-flow returns to step 0 and clears ready", () => {
    let g = startGuide(initialGuide());
    g = setReady(g, 1, true);
    g = { ...g, progress: 5, firstSeat: 2 };
    const r = startGuide(g);
    expect(r.progress).toBe(0);
    expect(r.firstSeat).toBe(-1);
    expect(r.ready).toEqual([]);
    expect(r.v).toBe(g.v + 1);
  });
  it("stop returns to free play with a fresh version", () => {
    const g = stopGuide({ started: true, firstSeat: 1, progress: 4, ready: [0, 1], v: 7 });
    expect(g.started).toBe(false);
    expect(g.v).toBe(8);
  });
});

describe("ready toggles", () => {
  it("adds and removes a seat, keeping it sorted/unique", () => {
    let g = startGuide(initialGuide());
    g = setReady(g, 2, true);
    g = setReady(g, 0, true);
    g = setReady(g, 2, true); // no-op (already on)
    expect(g.ready).toEqual([0, 2]);
    g = setReady(g, 0, false);
    expect(g.ready).toEqual([2]);
  });
  it("ignores out-of-range seats", () => {
    let g = startGuide(initialGuide());
    g = setReady(g, 9, true);
    g = setReady(g, -1, true);
    expect(g.ready).toEqual([]);
  });
});

describe("allReady gate", () => {
  it("false when no one is seated", () => {
    expect(allReady([], [])).toBe(false);
    expect(allReady([0, 1], [])).toBe(false);
  });
  it("true only when every seated player confirmed", () => {
    expect(allReady([0, 2], seats([0, 2]))).toBe(true);
    expect(allReady([0], seats([0, 2]))).toBe(false);
    expect(allReady([0, 1, 2, 3], seats([0, 2]))).toBe(true); // extra ready is fine
  });
});

describe("tryAdvance", () => {
  it("advances a confirm step once all seated are ready, clearing ready", () => {
    let g = startGuide(initialGuide()); // step 0 = shuffle (confirm)
    g = setReady(g, 0, true);
    g = setReady(g, 1, true);
    const before = g.progress;
    g = tryAdvance(g, seats([0, 1]));
    expect(g.progress).toBe(before + 1);
    expect(g.ready).toEqual([]);
  });
  it("does not advance while a seated player has not confirmed", () => {
    let g = startGuide(initialGuide());
    g = setReady(g, 0, true);
    g = tryAdvance(g, seats([0, 1]));
    expect(g.progress).toBe(0);
  });
  it("never auto-advances the chooseFirst step", () => {
    let g: GuideState = { started: true, firstSeat: -1, progress: 2, ready: [0, 1], v: 1 };
    expect(SETUP_STEPS[2]!.kind).toBe("chooseFirst");
    g = tryAdvance(g, seats([0, 1]));
    expect(g.progress).toBe(2);
  });
});

describe("chooseFirst", () => {
  it("records the first seat and advances past the chooseFirst step", () => {
    const g: GuideState = { started: true, firstSeat: -1, progress: 2, ready: [0], v: 3 };
    const r = chooseFirst(g, 2);
    expect(r.firstSeat).toBe(2);
    expect(r.progress).toBe(3);
    expect(r.ready).toEqual([]);
  });
  it("is ignored when not on the chooseFirst step", () => {
    const g: GuideState = { started: true, firstSeat: -1, progress: 0, ready: [], v: 1 };
    expect(chooseFirst(g, 1)).toBe(g);
  });
});

describe("applyIntent (host folding a client message)", () => {
  it("a ready intent that completes the step advances atomically", () => {
    let g = startGuide(initialGuide());
    g = applyIntent(g, { kind: "ready", seat: 0, on: true }, seats([0, 1]));
    expect(g.progress).toBe(0);
    g = applyIntent(g, { kind: "ready", seat: 1, on: true }, seats([0, 1]));
    expect(g.progress).toBe(1); // both ready → advanced
  });
  it("a chooseFirst intent sets the first seat", () => {
    const g: GuideState = { started: true, firstSeat: -1, progress: 2, ready: [], v: 1 };
    const r = applyIntent(g, { kind: "chooseFirst", seat: 3 }, seats([0, 3]));
    expect(r.firstSeat).toBe(3);
    expect(r.progress).toBe(3);
  });
  it("intents are ignored before the guide starts", () => {
    const g = initialGuide();
    expect(applyIntent(g, { kind: "ready", seat: 0, on: true }, seats([0]))).toBe(g);
  });
});

describe("clockwiseOrder", () => {
  it("orders seated seats clockwise from the first seat", () => {
    expect(clockwiseOrder(2, seats([0, 1, 2, 3]))).toEqual([2, 3, 0, 1]);
    expect(clockwiseOrder(1, seats([0, 1, 3]))).toEqual([1, 3, 0]);
  });
  it("falls back to the lowest seated seat when firstSeat is unset", () => {
    expect(clockwiseOrder(-1, seats([2, 3]))).toEqual([2, 3]);
  });
  it("empty seating yields no order", () => {
    expect(clockwiseOrder(0, [])).toEqual([]);
  });
});

describe("viewOf — the projection that drives the panel and the indicator", () => {
  it("intro before start", () => {
    expect(viewOf(initialGuide(), seats([0, 1])).phase).toBe("intro");
  });
  it("setup step while in the setup range", () => {
    const g = startGuide(initialGuide());
    const v = viewOf(g, seats([0, 1]));
    expect(v.phase).toBe("setup");
    expect(v.step!.id).toBe("shuffle");
  });
  it("turn loop derives turn seat and phase deterministically", () => {
    // 3 seated players, first = seat 1, just entered the loop (progress = 3).
    const base: GuideState = { started: true, firstSeat: 1, progress: SETUP_STEPS.length, ready: [], v: 1 };
    const order = clockwiseOrder(1, seats([0, 1, 2])); // [1, 2, 0]
    // FOCUS/ACTION/CLOSING of the first player (seat 1)
    expect(viewOf({ ...base, progress: 3 }, seats([0, 1, 2])).turnSeat).toBe(order[0]);
    expect(viewOf({ ...base, progress: 3 }, seats([0, 1, 2])).turnPhase).toBe("focus");
    expect(viewOf({ ...base, progress: 4 }, seats([0, 1, 2])).turnPhase).toBe("action");
    expect(viewOf({ ...base, progress: 5 }, seats([0, 1, 2])).turnPhase).toBe("closing");
    // next player's FOCUS
    expect(viewOf({ ...base, progress: 6 }, seats([0, 1, 2])).turnSeat).toBe(order[1]);
    expect(viewOf({ ...base, progress: 6 }, seats([0, 1, 2])).turnPhase).toBe("focus");
    // wraps back to the first player on a new round
    const wrap = viewOf({ ...base, progress: 3 + 3 * 3 }, seats([0, 1, 2]));
    expect(wrap.turnSeat).toBe(order[0]);
    expect(wrap.round).toBe(2);
  });
  it("covers all three phases in order", () => {
    expect(TURN_PHASES).toEqual(["focus", "action", "closing"]);
  });
});

describe("adoptGuide", () => {
  it("adopts an incoming state with a newer or equal version", () => {
    const a: GuideState = { started: true, firstSeat: 0, progress: 1, ready: [], v: 2 };
    const b: GuideState = { started: true, firstSeat: 0, progress: 2, ready: [], v: 3 };
    expect(adoptGuide(a, b)).toBe(b);
    expect(adoptGuide(b, a)).toBe(b); // older incoming rejected
  });
});
