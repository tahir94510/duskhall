// The Guide is an OPTIONAL, NON-ENFORCING walkthrough that narrates the rulebook
// flow step by step. It never touches the card LWW state or restricts any action:
// players remain free to drag, flip and shuffle as they like. Its only job is to
// tell everyone, in plain language, what the rulebook says to do next, and to let
// the table advance together once everyone confirms.
//
// The state is HOST-AUTHORITATIVE: the host holds the canonical GuideState and is
// the only client that advances it. Other clients send small "intent" messages
// (I'm ready / I picked the first player); the host folds them in with the pure
// reducers below and re-broadcasts the result. Because everything here is a pure
// function of (state, intent, seated seats), it is fully unit-tested and behaves
// identically on every device — no divergence, no "some players see a different
// step". Since the guide is informational, a misbehaving peer can at worst nudge
// the shared narration; the authoritative CARD state is untouched.

/** The fixed, ordered SETUP walkthrough that precedes the turn loop. The text for
 *  each id lives in i18n under `guide.steps.<id>`; only the STRUCTURE lives here so
 *  the flow logic stays testable and translation-agnostic. */
export type SetupStepKind = "confirm" | "chooseFirst";
export interface SetupStepDef {
  id: string;
  kind: SetupStepKind;
}

export const SETUP_STEPS: readonly SetupStepDef[] = [
  { id: "shuffle", kind: "confirm" },
  { id: "reveal", kind: "confirm" },
  { id: "chooseFirst", kind: "chooseFirst" }
];

/** The three turn phases of the rulebook, cycled per player once setup is done. */
export const TURN_PHASES = ["focus", "action", "closing"] as const;
export type TurnPhase = (typeof TURN_PHASES)[number];

export interface GuideState {
  /** false = free play (panel shows "host can start"); true = walkthrough running. */
  started: boolean;
  /** Seat that goes first, chosen during setup. -1 until the chooseFirst step. */
  firstSeat: number;
  /** Single source of truth. 0..SETUP_STEPS.length-1 = setup; beyond = turn loop. */
  progress: number;
  /** Seats that have confirmed the CURRENT step (sorted, unique). Cleared on advance. */
  ready: number[];
  /** Monotonic host version, so a stale broadcast never overwrites a fresher one. */
  v: number;
}

/** A client→host request. The host is the only one that mutates GuideState. */
export type GuideIntent =
  | { kind: "ready"; seat: number; on: boolean }
  | { kind: "chooseFirst"; seat: number };

export function initialGuide(): GuideState {
  return { started: false, firstSeat: -1, progress: 0, ready: [], v: 0 };
}

/** Host action: begin (or restart) the walkthrough from the very first setup step. */
export function startGuide(prev: GuideState): GuideState {
  return { started: true, firstSeat: -1, progress: 0, ready: [], v: prev.v + 1 };
}

/** Host action: stop the walkthrough and return to free play. */
export function stopGuide(prev: GuideState): GuideState {
  return { ...initialGuide(), v: prev.v + 1 };
}

function uniqSorted(seats: number[]): number[] {
  return Array.from(new Set(seats.filter((s) => s >= 0 && s <= 3))).sort((a, b) => a - b);
}

/** Are all currently-seated players present in the ready set? Empty seating never
 *  counts as "all ready" (nothing to confirm yet). */
export function allReady(ready: number[], seatedSeats: number[]): boolean {
  const seated = uniqSorted(seatedSeats);
  if (seated.length === 0) return false;
  const set = new Set(ready);
  return seated.every((s) => set.has(s));
}

/** Toggle one seat's confirmation for the current step. Pure; returns a new state. */
export function setReady(prev: GuideState, seat: number, on: boolean): GuideState {
  if (seat < 0 || seat > 3) return prev;
  const has = prev.ready.includes(seat);
  if (on === has) return prev;
  const ready = on ? uniqSorted([...prev.ready, seat]) : prev.ready.filter((s) => s !== seat);
  return { ...prev, ready, v: prev.v + 1 };
}

/** Host action: record the chosen first player and move past the chooseFirst step.
 *  Ignored unless the walkthrough is on the chooseFirst step. */
export function chooseFirst(prev: GuideState, seat: number): GuideState {
  if (!prev.started) return prev;
  const step = SETUP_STEPS[prev.progress];
  if (!step || step.kind !== "chooseFirst") return prev;
  if (seat < 0 || seat > 3) return prev;
  return { ...prev, firstSeat: seat, progress: prev.progress + 1, ready: [], v: prev.v + 1 };
}

/** Host reducer: advance to the next step IF every seated player has confirmed the
 *  current one. The chooseFirst step never auto-advances (it needs a pick, handled
 *  by chooseFirst). Returns prev unchanged when the gate is not met. */
export function tryAdvance(prev: GuideState, seatedSeats: number[]): GuideState {
  if (!prev.started) return prev;
  const step = SETUP_STEPS[prev.progress];
  if (step && step.kind === "chooseFirst") return prev;
  if (!allReady(prev.ready, seatedSeats)) return prev;
  return { ...prev, progress: prev.progress + 1, ready: [], v: prev.v + 1 };
}

/** Host helper: fold a client intent into the state and auto-advance if it completes
 *  the current step. Single entry point used by the network layer. */
export function applyIntent(prev: GuideState, intent: GuideIntent, seatedSeats: number[]): GuideState {
  if (!prev.started) return prev;
  if (intent.kind === "chooseFirst") return chooseFirst(prev, intent.seat);
  // ready toggle, then see if the step is now complete
  const next = setReady(prev, intent.seat, intent.on);
  return tryAdvance(next, seatedSeats);
}

/** Seats ordered clockwise starting AT `firstSeat`, restricted to seated players.
 *  Seat indices map to fixed table positions; clockwise = ascending seat index mod 4.
 *  Used to walk the turn loop deterministically on every client. */
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
  /** "intro" before start, a setup step id, or "turn" once the loop begins. */
  phase: "intro" | "setup" | "turn";
  /** Setup step descriptor when phase === "setup". */
  step?: SetupStepDef;
  /** Whose turn it is (seat), when phase === "turn"; -1 otherwise. */
  turnSeat: number;
  /** Current turn phase, when phase === "turn". */
  turnPhase: TurnPhase | null;
  /** 1-based round number (how many full cycles completed + 1), when in the loop. */
  round: number;
}

/** Derive everything the UI and the corner indicator need from the raw state — a
 *  pure projection so the panel and the indicator can never disagree. */
export function viewOf(state: GuideState, seatedSeats: number[]): GuideView {
  if (!state.started) return { phase: "intro", turnSeat: -1, turnPhase: null, round: 0 };
  if (state.progress < SETUP_STEPS.length) {
    return { phase: "setup", step: SETUP_STEPS[state.progress], turnSeat: -1, turnPhase: null, round: 0 };
  }
  const order = clockwiseOrder(state.firstSeat, seatedSeats);
  if (order.length === 0) return { phase: "turn", turnSeat: -1, turnPhase: null, round: 1 };
  const loopN = state.progress - SETUP_STEPS.length;
  const phaseIndex = ((loopN % 3) + 3) % 3;
  const turnCount = Math.floor(loopN / 3);
  const turnSeat = order[turnCount % order.length]!;
  const round = Math.floor(turnCount / order.length) + 1;
  return { phase: "turn", turnSeat, turnPhase: TURN_PHASES[phaseIndex]!, round };
}

/** Pick the fresher of two guide states by version (ties keep the incoming one so a
 *  host re-broadcast of the same version still settles). Used when a client adopts a
 *  host broadcast. */
export function adoptGuide(local: GuideState, incoming: GuideState): GuideState {
  return incoming.v >= local.v ? incoming : local;
}
