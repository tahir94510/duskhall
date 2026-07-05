import { describe, it, expect, beforeAll } from "vitest";
import {
  initialGuide, setOpen, startGuide, stopGuide, clockwiseOrder,
  viewOf, confirmerOf, canAdvance, advance, chooseFirst, adoptGuide, type GuideState
} from "./guide.js";
import { setActiveMode } from "../modes/active.js";
import { vaerumMode } from "../modes/vaerum.js";

// The Guide reducer is host-authoritative and pure. These tests pin the exact advancement maths
// so every device walks the same step/turn/phase, and the right person (host in setup, the active
// player in a turn) is the only one who can advance. Setup steps and phases come from the active
// mode, so pin Vaerum (3 setup steps, focus/action/closing phases) for these cases.
beforeAll(() => { setActiveMode("vaerum"); });
const SETUP_STEPS = vaerumMode.guide.setupSteps;
const TURN_PHASES = vaerumMode.guide.turnPhases;

const seats = (s: number[]) => s;

describe("initial / open / start / stop", () => {
  it("starts closed and in free play", () => {
    const g = initialGuide();
    expect(g.open).toBe(false);
    expect(g.started).toBe(false);
    expect(g.progress).toBe(0);
    expect(g.firstSeat).toBe(-1);
  });
  it("setOpen toggles visibility and bumps version", () => {
    const g = setOpen(initialGuide(), true);
    expect(g.open).toBe(true);
    expect(g.v).toBe(1);
    expect(setOpen(g, true)).toBe(g); // no-op keeps identity
  });
  it("start opens the panel and begins setup at step 0", () => {
    const g = startGuide(initialGuide());
    expect(g.open).toBe(true);
    expect(g.started).toBe(true);
    expect(g.progress).toBe(0);
    expect(g.v).toBe(1);
  });
  it("restart from mid-flow returns to step 0", () => {
    const mid: GuideState = { open: true, started: true, firstSeat: 2, progress: 5, v: 9 };
    const r = startGuide(mid);
    expect(r.progress).toBe(0);
    expect(r.firstSeat).toBe(-1);
    expect(r.v).toBe(10);
  });
  it("stop returns to free play but keeps the panel open state", () => {
    const g = stopGuide({ open: true, started: true, firstSeat: 1, progress: 4, v: 7 });
    expect(g.started).toBe(false);
    expect(g.open).toBe(true);
    expect(g.progress).toBe(0);
    expect(g.v).toBe(8);
  });
});

describe("confirmerOf — who advances each step", () => {
  it("nobody in the intro", () => {
    expect(confirmerOf(viewOf(initialGuide(), seats([0, 1])))).toBe("none");
  });
  it("the host on a setup confirm step", () => {
    const g = startGuide(initialGuide()); // step 0 = shuffle (confirm)
    expect(confirmerOf(viewOf(g, seats([0, 1])))).toBe("host");
  });
  it("nobody on the chooseFirst step (it advances via a pick)", () => {
    const g: GuideState = { open: true, started: true, firstSeat: -1, progress: 2, v: 1 };
    expect(SETUP_STEPS[2]!.kind).toBe("chooseFirst");
    expect(confirmerOf(viewOf(g, seats([0, 1])))).toBe("none");
  });
  it("the active player during the turn loop", () => {
    const g: GuideState = { open: true, started: true, firstSeat: 0, progress: SETUP_STEPS.length, v: 1 };
    expect(confirmerOf(viewOf(g, seats([0, 1])))).toBe("turn");
  });
});

describe("canAdvance / advance", () => {
  it("only the host can advance a setup confirm step", () => {
    const g = startGuide(initialGuide());
    expect(canAdvance(g, 0, seats([0, 1]), true)).toBe(true);   // host
    expect(canAdvance(g, 0, seats([0, 1]), false)).toBe(false); // non-host seat 0
    expect(advance(g, 0, seats([0, 1]), false)).toBe(g);        // unchanged
    expect(advance(g, 0, seats([0, 1]), true).progress).toBe(1);
  });
  it("the chooseFirst step never advances via the tick", () => {
    const g: GuideState = { open: true, started: true, firstSeat: -1, progress: 2, v: 1 };
    expect(canAdvance(g, 0, seats([0, 1]), true)).toBe(false);
    expect(advance(g, 0, seats([0, 1]), true)).toBe(g);
  });
  it("only the player whose turn it is can advance a phase", () => {
    // first = seat 1, seated [0,1,2]; loop start: turn seat is 1.
    const g: GuideState = { open: true, started: true, firstSeat: 1, progress: SETUP_STEPS.length, v: 1 };
    expect(viewOf(g, seats([0, 1, 2])).turnSeat).toBe(1);
    expect(canAdvance(g, 1, seats([0, 1, 2]), false)).toBe(true);  // active player
    expect(canAdvance(g, 0, seats([0, 1, 2]), false)).toBe(false); // not their turn
    expect(canAdvance(g, 0, seats([0, 1, 2]), true)).toBe(false);  // host but not their turn
    expect(advance(g, 1, seats([0, 1, 2]), false).progress).toBe(SETUP_STEPS.length + 1);
  });
  it("nothing advances before the guide starts", () => {
    expect(canAdvance(initialGuide(), 0, seats([0]), true)).toBe(false);
  });
});

describe("chooseFirst", () => {
  it("records the first seat and advances past the chooseFirst step", () => {
    const g: GuideState = { open: true, started: true, firstSeat: -1, progress: 2, v: 3 };
    const r = chooseFirst(g, 2);
    expect(r.firstSeat).toBe(2);
    expect(r.progress).toBe(3);
  });
  it("is ignored when not on the chooseFirst step", () => {
    const g: GuideState = { open: true, started: true, firstSeat: -1, progress: 0, v: 1 };
    expect(chooseFirst(g, 1)).toBe(g);
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

describe("viewOf — the projection that drives the panel", () => {
  it("intro before start", () => {
    expect(viewOf(initialGuide(), seats([0, 1])).phase).toBe("intro");
  });
  it("setup step while in the setup range", () => {
    const v = viewOf(startGuide(initialGuide()), seats([0, 1]));
    expect(v.phase).toBe("setup");
    expect(v.step!.id).toBe("shuffle");
  });
  it("turn loop derives turn seat and phase deterministically", () => {
    const base: GuideState = { open: true, started: true, firstSeat: 1, progress: SETUP_STEPS.length, v: 1 };
    const order = clockwiseOrder(1, seats([0, 1, 2])); // [1, 2, 0]
    expect(viewOf({ ...base, progress: 3 }, seats([0, 1, 2])).turnSeat).toBe(order[0]);
    expect(viewOf({ ...base, progress: 3 }, seats([0, 1, 2])).turnPhase).toBe("focus");
    expect(viewOf({ ...base, progress: 4 }, seats([0, 1, 2])).turnPhase).toBe("action");
    expect(viewOf({ ...base, progress: 5 }, seats([0, 1, 2])).turnPhase).toBe("closing");
    expect(viewOf({ ...base, progress: 6 }, seats([0, 1, 2])).turnSeat).toBe(order[1]);
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
    const a: GuideState = { open: true, started: true, firstSeat: 0, progress: 1, v: 2 };
    const b: GuideState = { open: true, started: true, firstSeat: 0, progress: 2, v: 3 };
    expect(adoptGuide(a, b)).toBe(b);
    expect(adoptGuide(b, a)).toBe(b); // older incoming rejected
  });
});
