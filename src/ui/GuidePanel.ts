import { t } from "../i18n/index.js";
import { ICON_CLOSE } from "./icons.js";
import { viewOf, confirmerOf, type GuideState, type GuideView } from "../game/guide.js";

// The Guide is a fixed, collapsible panel that narrates the rulebook flow. It never
// enforces anything: players stay free to move, flip and shuffle cards. It only tells
// the table what to do next and lets the right person advance the step.
//
// Visibility (open/closed) is host-controlled and arrives through GuideState, so the
// whole table sees the same panel. Minimize/maximize is a LOCAL view preference and is
// available in every phase: the minimized form is just the top bar (status, the confirm
// tick, the resize and close buttons); maximizing drops the full body below it. The
// confirm tick lives in the bar, so a setup step can still be confirmed while minimized.

export interface GuideSeatInfo {
  seat: number;
  name: string;
  color: string;
  isSelf: boolean;
}

/** Everything the panel needs to render, computed by Game. */
export interface GuideVM {
  state: GuideState;
  /** Seated players (active). */
  seats: GuideSeatInfo[];
  /** This client's seat, or -1 if spectating. */
  selfSeat: number;
  spectator: boolean;
  isHost: boolean;
}

export interface GuideHooks {
  /** Complete the current step (the tick). Game decides if this client is allowed. */
  onAdvance(): void;
  /** Host: pick the first player on the chooseFirst step. */
  onChooseFirst(seat: number): void;
  /** Host: start the walkthrough from the intro. Begins the narration only — it does
   *  not gather or reshuffle the cards. */
  onStartRestart(): void;
  /** Host: restart the walkthrough from its first step. Game asks for confirmation and
   *  resets ONLY the guide — the cards on the table are untouched. */
  onRestart(): void;
  /** Host: close the panel for everyone (the × button). */
  onClose(): void;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]!);
}

export class GuidePanel {
  el: HTMLElement;
  private barTextEl: HTMLElement;
  private bodyEl: HTMLElement;
  private tickBtn: HTMLButtonElement;
  private restartBtn: HTMLButtonElement;
  private resizeBtn: HTMLButtonElement;
  private closeBtn: HTMLButtonElement;
  private vm: GuideVM | null = null;
  private minimized = false;

  constructor(private hooks: GuideHooks) {
    this.el = document.createElement("section");
    this.el.className = "guide";
    this.el.hidden = true;
    this.el.setAttribute("aria-label", t("guide.title"));
    this.el.innerHTML = `
      <header class="guide__bar">
        <div class="guide__status" data-role="status"></div>
        <div class="guide__controls">
          <button type="button" class="guide__btn guide__tick" data-action="tick" hidden></button>
          <button type="button" class="guide__btn guide__restart" data-action="restart" hidden></button>
          <button type="button" class="guide__btn guide__resize" data-action="resize" hidden></button>
          <button type="button" class="guide__btn guide__close" data-action="close" hidden aria-label="${esc(t("guide.close"))}">${ICON_CLOSE}</button>
        </div>
      </header>
      <div class="guide__body" data-role="body"></div>
    `;
    this.barTextEl = this.el.querySelector('[data-role="status"]')!;
    this.bodyEl = this.el.querySelector('[data-role="body"]')!;
    this.tickBtn = this.el.querySelector('[data-action="tick"]')!;
    this.restartBtn = this.el.querySelector('[data-action="restart"]')!;
    this.resizeBtn = this.el.querySelector('[data-action="resize"]')!;
    this.closeBtn = this.el.querySelector('[data-action="close"]')!;
    this.bind();
  }

  private bind(): void {
    this.tickBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this.hooks.onAdvance(); });
    this.restartBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this.hooks.onRestart(); });
    this.closeBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this.hooks.onClose(); });
    this.resizeBtn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      this.minimized = !this.minimized;
      this.render();
    });
  }

  refreshLocale(): void {
    this.el.setAttribute("aria-label", t("guide.title"));
    this.closeBtn.setAttribute("aria-label", t("guide.close"));
    this.render();
  }

  update(vm: GuideVM): void {
    this.vm = vm;
    this.render();
  }

  private seatName(seat: number): string {
    return this.vm?.seats.find((s) => s.seat === seat)?.name ?? t("guide.aPlayer");
  }

  private render(): void {
    const vm = this.vm;
    if (!vm) return;

    // Visibility is host-controlled via state.open.
    this.el.hidden = !vm.state.open;
    if (!vm.state.open) return;

    const view = viewOf(vm.state, vm.seats.map((s) => s.seat));
    // Minimize is a TURN-PHASE feature: the button is shown in every phase so it is
    // discoverable, but it only becomes interactive once the turn loop begins (the
    // intro and setup keep their guidance visible). The bar still carries the confirm
    // tick, so even a minimized turn step stays completable.
    const canMinimize = view.phase === "turn";
    const minimized = canMinimize && this.minimized;
    this.el.classList.toggle("is-min", minimized);

    this.renderBar(vm, view, canMinimize);
    if (minimized) {
      this.bodyEl.hidden = true;
    } else {
      this.bodyEl.hidden = false;
      this.bodyEl.innerHTML = this.renderBody(vm, view);
      this.wireBody(vm);
    }
  }

  private renderBar(vm: GuideVM, view: GuideView, canMinimize: boolean): void {
    // Status text: title in the intro, the step title in setup, name + phase in a turn.
    if (view.phase === "intro") {
      this.barTextEl.innerHTML = `<span class="guide__bar-title">${esc(t("guide.title"))}</span>`;
    } else if (view.phase === "setup" && view.step) {
      this.barTextEl.innerHTML = `<span class="guide__bar-title">${esc(t(`guide.steps.${view.step.id}.title`))}</span>`;
    } else {
      const name = view.turnSeat >= 0 ? this.seatName(view.turnSeat) : t("guide.aPlayer");
      const phase = view.turnPhase ?? "focus";
      this.barTextEl.innerHTML =
        `<span class="guide__bar-title">${esc(t("guide.turnHeading", { name }))}</span>` +
        `<span class="guide__bar-phase" data-phase="${esc(phase)}">${esc(t(`guide.phase.${phase}.title`))}</span>`;
    }

    // The confirm tick: shown for confirmable steps, enabled only for the responsible
    // party (the host in setup, the active player in a turn).
    const who = confirmerOf(view);
    if (who === "none") {
      this.tickBtn.hidden = true;
    } else {
      this.tickBtn.hidden = false;
      const allowed = who === "host" ? vm.isHost : (view.turnSeat >= 0 && vm.selfSeat === view.turnSeat);
      this.tickBtn.disabled = !allowed;
      this.tickBtn.innerHTML = ICON_CHECK;
      this.tickBtn.setAttribute("aria-label", t("guide.confirm"));
      this.tickBtn.title = allowed ? t("guide.confirm") : (who === "host" ? t("guide.hostConfirms") : t("guide.waitYourTurn"));
    }

    // Restart: host-only, and only once the walkthrough is running (there is nothing to
    // restart in the intro). It re-runs the guide from the first step and never touches
    // the cards — Game shows a confirmation before applying it.
    this.restartBtn.hidden = !(vm.isHost && vm.state.started);
    if (!this.restartBtn.hidden) {
      this.restartBtn.innerHTML = ICON_RESTART;
      this.restartBtn.setAttribute("aria-label", t("guide.restart"));
      this.restartBtn.title = t("guide.restart");
    }

    // Minimize/maximize toggle: always shown, but interactive only in the turn loop.
    // Disabled buttons emit no click, so no extra guard is needed before then.
    this.resizeBtn.hidden = false;
    this.resizeBtn.disabled = !canMinimize;
    const min = canMinimize && this.minimized;
    this.resizeBtn.innerHTML = min ? ICON_EXPAND : ICON_COLLAPSE;
    const resizeLabel = !canMinimize ? "guide.minimizeTurnOnly" : (min ? "guide.maximize" : "guide.minimize");
    this.resizeBtn.setAttribute("aria-label", t(resizeLabel));
    this.resizeBtn.title = t(resizeLabel);

    // Close is host-only (the host opens and closes the panel for the table).
    this.closeBtn.hidden = !vm.isHost;
  }

  private renderBody(vm: GuideVM, view: GuideView): string {
    if (view.phase === "intro") {
      const action = vm.isHost
        ? `<button type="button" class="guide__primary" data-action="start">${esc(t("guide.start"))}</button>`
        : `<p class="guide__muted">${esc(t("guide.introWaiting"))}</p>`;
      return `<p class="guide__lead">${esc(t("guide.introBody"))}</p>${action}`;
    }

    if (view.phase === "setup" && view.step) {
      const id = view.step.id;
      const text = `<p class="guide__step-body">${esc(t(`guide.steps.${id}.body`))}</p>`;
      if (view.step.kind === "chooseFirst") {
        if (vm.isHost) {
          const picks = vm.seats
            .map((s) => `<button type="button" class="guide__pick" data-pick="${s.seat}" style="--seat:${esc(s.color)}">${esc(s.name)}${s.isSelf ? ` <em>${esc(t("guide.youTag"))}</em>` : ""}</button>`)
            .join("");
          return `${text}<div class="guide__picks">${picks}</div>`;
        }
        return `${text}<p class="guide__muted">${esc(t("guide.pickWait"))}</p>`;
      }
      // confirm step: a hint about who advances it
      const hint = vm.isHost ? "" : `<p class="guide__muted">${esc(t("guide.hostConfirms"))}</p>`;
      return `${text}${hint}`;
    }

    // turn loop
    const phase = view.turnPhase ?? "focus";
    const yours = view.turnSeat >= 0 && vm.selfSeat === view.turnSeat;
    // The "X goes first / Round N" line is only meaningful on the opening round; once the
    // loop is rolling the top bar already names whose turn it is, so later rounds drop it to
    // keep the body focused on the current phase.
    const first = view.round === 1 && vm.state.firstSeat >= 0 ? this.seatName(vm.state.firstSeat) : null;
    const firstLine = first ? `<p class="guide__hint">${esc(t("guide.firstChosen", { name: first }))} ${esc(t("guide.roundLabel", { n: view.round }))}</p>` : "";
    const turnHint = vm.spectator ? `<p class="guide__muted">${esc(t("guide.spectatorNote"))}</p>`
      : yours ? `<p class="guide__hint">${esc(t("guide.yourTurn"))}</p>`
      : `<p class="guide__muted">${esc(t("guide.waitYourTurn"))}</p>`;
    // Restart now lives in the header as a host-only control (it re-runs the guide
    // without touching the cards), so the body carries no restart button.
    return `
      <p class="guide__step-body">${esc(t(`guide.phase.${phase}.body`))}</p>
      ${firstLine}
      ${turnHint}`;
  }

  private wireBody(vm: GuideVM): void {
    this.bodyEl.querySelector('[data-action="start"]')?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      this.hooks.onStartRestart();
    });
    if (vm.isHost) {
      this.bodyEl.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          const seat = Number(btn.dataset.pick);
          if (Number.isFinite(seat)) this.hooks.onChooseFirst(seat);
        });
      });
    }
  }
}

// Small inline icons, single-weight strokes to match the rest of the UI.
const ICON_CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_COLLAPSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14 H18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_EXPAND = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9 L12 15 L18 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// Restart: a circular refresh arrow, matching the header's reset glyph family.
const ICON_RESTART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12 A 7 7 0 1 1 12 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M2 9 L5 12 L8 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
