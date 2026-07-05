// The Guide is an OPTIONAL, NON-ENFORCING walkthrough that narrates the rulebook
// flow one step at a time. It never touches the card state or restricts any action:
// players stay free to drag, flip and shuffle as they like. Its only job is to tell
// the table, in plain language, what to do next and to let the right person advance
// the step when they are done.
//
// The state is HOST-AUTHORITATIVE: the host holds the canonical GuideState and is the
// only client that mutates it. The host opens and closes the panel for everyone and
// runs the setup steps; during the turn loop the player whose turn it is advances
// their own phases. A non-host asks to advance with a small "advance" intent that the
// host validates against whose turn it actually is. Everything here is a pure function
// of (state, actor, seated seats), so it is fully unit tested and behaves the same on
// every device. Since the guide is informational, a bad actor can at worst nudge the
// shared narration, never the card state.

import { getActiveMode } from "../modes/active.js";
import type { GuideSetupStep, GuideStepKind } from "../modes/types.js";

export type SetupStepKind = GuideStepKind;
export type SetupStepDef = GuideSetupStep;
export type TurnPhase = string;

// The setup walkthrough and turn phases come from the ACTIVE mode (see ModeDef.guide): each game
// defines its own steps and phase names. Text for each id/phase lives in the mode's locale under
// guide.steps.<id> and guide.phase.<phase>; only the flow structure lives in the mode data.
function setupSteps(): readonly SetupStepDef[] {
  return getActiveMode().guide.setupSteps;
}
function turnPhases(): readonly string[] {
  return getActiveMode().guide.turnPhases;
}

export interface GuideState {
  /** Whether the panel is shown to the table. Host controls this for everyone. */
  open: boolean;
  /** false = the walkthrough has not begun (intro); true = it is running. */
  started: boolean;
  /** Seat that goes first, chosen during setup. -1 until the chooseFirst step. */
  firstSeat: number;
  /** Single source of truth. 0..SETUP_STEPS.length-1 = setup; beyond = turn loop. */
  progress: number;
  /** Monotonic host version, so a stale broadcast never overwrites a fresher one. */
  v: number;
}

/** A client to host request. The host is the only one that mutates GuideState. The
 *  only intent a non-host ever sends is a request to advance their own turn phase;
 *  the host resolves the sender's real seat and validates it. */
export type GuideIntent = { kind: "advance" };

export function initialGuide(): GuideState {
  return { open: false, started: false, firstSeat: -1, progress: 0, v: 0 };
}

/** Host action: open or close the panel for the whole table. */
export function setOpen(prev: GuideState, open: boolean): GuideState {
  if (prev.open === open) return prev;
  return { ...prev, open, v: prev.v + 1 };
}

/** Host action: begin (or restart) the walkthrough from the first setup step. Opening
 *  the panel comes with it so the table sees the walkthrough at once. */
export function startGuide(prev: GuideState): GuideState {
  return { open: true, started: true, firstSeat: -1, progress: 0, v: prev.v + 1 };
}

/** Host action: stop the walkthrough and return to free play (panel stays as is). */
export function stopGuide(prev: GuideState): GuideState {
  return { ...prev, started: false, firstSeat: -1, progress: 0, v: prev.v + 1 };
}

function uniqSorted(seats: number[]): number[] {
  return Array.from(new Set(seats.filter((s) => s >= 0 && s <= 3))).sort((a, b) => a - b);
}

/** Seats ordered clockwise starting at `firstSeat`, restricted to seated players.
 *  Seat indices map to fixed table positions; clockwise is ascending seat index mod 4. */
export function clockwiseOrder(firstSeat: number, seatedSeats: number[]): number[] {
  const seated = uniqSorted(seatedSeats);
  if (seated.length === 0) return [];
  const start = firstSeat >= 0 ? firstSeat : seated[0]!;
  const order: number[] = [];
  for (let i = 0; i < 4; i++) {
    const seat = (start + i) % 4;
    if (seated.includes(seat)) order.push(seat);
  }
  return order;
}

export interface GuideView {
  /** "intro" before start, a setup step, or "turn" once the loop begins. */
  phase: "intro" | "setup" | "turn";
  /** Setup step descriptor when phase is "setup". */
  step?: SetupStepDef;
  /** Whose turn it is (seat) when phase is "turn"; -1 otherwise. */
  turnSeat: number;
  /** Current turn phase when phase is "turn". */
  turnPhase: TurnPhase | null;
  /** 1-based round number once in the loop. */
  round: number;
}

/** Derive everything the panel needs from the raw state. Pure projection. */
export function viewOf(state: GuideState, seatedSeats: number[]): GuideView {
  const steps = setupSteps();
  if (!state.started) return { phase: "intro", turnSeat: -1, turnPhase: null, round: 0 };
  if (state.progress < steps.length) {
    return { phase: "setup", step: steps[state.progress], turnSeat: -1, turnPhase: null, round: 0 };
  }
  const order = clockwiseOrder(state.firstSeat, seatedSeats);
  if (order.length === 0) return { phase: "turn", turnSeat: -1, turnPhase: null, round: 1 };
  const phases = turnPhases();
  const nPhases = Math.max(1, phases.length);
  const loopN = state.progress - steps.length;
  const phaseIndex = ((loopN % nPhases) + nPhases) % nPhases;
  const turnCount = Math.floor(loopN / nPhases);
  const turnSeat = order[turnCount % order.length]!;
  const round = Math.floor(turnCount / order.length) + 1;
  return { phase: "turn", turnSeat, turnPhase: phases[phaseIndex]!, round };
}

/** Who may complete the current step:
 *  - "host": a setup confirm step (shuffle, reveal) is advanced by the host.
 *  - "turn": a turn phase is advanced by the player whose turn it is.
 *  - "none": the intro and the chooseFirst step (which advances via a pick).
 */
export type Confirmer = "host" | "turn" | "none";
export function confirmerOf(view: GuideView): Confirmer {
  if (view.phase === "intro") return "none";
  if (view.phase === "setup") return view.step?.kind === "confirm" ? "host" : "none";
  return "turn";
}

/** Pure gate: may this actor advance the current step right now? */
export function canAdvance(state: GuideState, actorSeat: number, seatedSeats: number[], actorIsHost: boolean): boolean {
  if (!state.started) return false;
  const view = viewOf(state, seatedSeats);
  const who = confirmerOf(view);
  if (who === "host") return actorIsHost;
  if (who === "turn") return view.turnSeat >= 0 && actorSeat === view.turnSeat;
  return false;
}

/** Host reducer: advance one step if the actor is allowed to. Returns prev unchanged
 *  when the gate is not met. */
export function advance(state: GuideState, actorSeat: number, seatedSeats: number[], actorIsHost: boolean): GuideState {
  if (!canAdvance(state, actorSeat, seatedSeats, actorIsHost)) return state;
  return { ...state, progress: state.progress + 1, v: state.v + 1 };
}

/** Host action: record the chosen first player and move past the chooseFirst step.
 *  Ignored unless the walkthrough is on the chooseFirst step. Host only. */
export function chooseFirst(prev: GuideState, seat: number): GuideState {
  if (!prev.started) return prev;
  const step = setupSteps()[prev.progress];
  if (!step || step.kind !== "chooseFirst") return prev;
  if (seat < 0 || seat > 3) return prev;
  return { ...prev, firstSeat: seat, progress: prev.progress + 1, v: prev.v + 1 };
}

/** Pick the fresher of two guide states by version. Used when a client adopts a host
 *  broadcast (ties keep the incoming one so a re-broadcast still settles). */
export function adoptGuide(local: GuideState, incoming: GuideState): GuideState {
  return incoming.v >= local.v ? incoming : local;
}
