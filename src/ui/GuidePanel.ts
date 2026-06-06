import { t } from "../i18n/index.js";
import { viewOf, type GuideState, type GuideView } from "../game/guide.js";

// The Guide is a draggable, dismissible "chatbox" that narrates the rulebook flow.
// It NEVER enforces anything — players stay free to move/flip/shuffle cards. It only
// tells the table what the rulebook says to do next and lets everyone advance
// together via a per-seat "everyone ready" control. Its position survives hide/show
// (stored in localStorage); only an explicit restart resets the walkthrough.

const POS_KEY = "kabal:guide:pos";
const VIS_KEY = "kabal:guide:vis";

export interface GuideSeatInfo {
  seat: number;
  name: string;
  color: string;
  ready: boolean;
  isSelf: boolean;
}

/** Everything the panel needs to render, computed by Game so the panel and the
 *  corner indicator always agree (both read the same GuideState via viewOf). */
export interface GuideVM {
  state: GuideState;
  /** Seated players (active), with per-seat ready flags for the current step. */
  seats: GuideSeatInfo[];
  /** This client's seat, or -1 if spectating. */
  selfSeat: number;
  spectator: boolean;
  isHost: boolean;
}

export interface GuideHooks {
  /** Toggle THIS client's confirmation for the current step. */
  onToggleReady(on: boolean): void;
  /** Pick the first player (chooseFirst step). */
  onChooseFirst(seat: number): void;
  /** Host: restart the walkthrough from the first step (Game shows the confirm). */
  onRestart(): void;
  /** Hide the panel (state is preserved). */
  onClose(): void;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]!);
}

export class GuidePanel {
  el: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private footEl: HTMLElement;
  private headEl: HTMLElement;
  private visible = false;
  private vm: GuideVM | null = null;
  private dragging = false;
  private dragDX = 0;
  private dragDY = 0;
  private posX = -1;
  private posY = -1;

  constructor(private hooks: GuideHooks) {
    this.el = document.createElement("section");
    this.el.className = "guide";
    this.el.hidden = true;
    this.el.setAttribute("aria-label", t("guide.title"));
    this.el.innerHTML = `
      <header class="guide__head" data-role="head">
        <span class="guide__grip" aria-hidden="true"></span>
        <span class="guide__title" data-role="title">${esc(t("guide.title"))}</span>
        <button type="button" class="guide__close" data-action="close" aria-label="${esc(t("guide.close"))}">×</button>
      </header>
      <div class="guide__body" data-role="body"></div>
      <footer class="guide__foot" data-role="foot"></footer>
    `;
    this.headEl = this.el.querySelector('[data-role="head"]')!;
    this.titleEl = this.el.querySelector('[data-role="title"]')!;
    this.bodyEl = this.el.querySelector('[data-role="body"]')!;
    this.footEl = this.el.querySelector('[data-role="foot"]')!;
    this.bindClose();
    this.bindDrag();
    this.restorePos();
    this.restoreVis();
  }

  private bindClose(): void {
    this.el.querySelector('[data-action="close"]')?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      this.hooks.onClose();
    });
  }

  // Drag by the header only, in screen space, clamped so the panel can never be
  // dragged fully off-screen (its grab handle always stays reachable).
  private bindDrag(): void {
    this.headEl.addEventListener("pointerdown", (e) => {
      if (e.target instanceof Element && e.target.closest('[data-action="close"]')) return;
      this.dragging = true;
      const r = this.el.getBoundingClientRect();
      this.dragDX = e.clientX - r.left;
      this.dragDY = e.clientY - r.top;
      this.headEl.setPointerCapture(e.pointerId);
      this.el.classList.add("is-dragging");
    });
    this.headEl.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.moveTo(e.clientX - this.dragDX, e.clientY - this.dragDY);
    });
    const end = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.el.classList.remove("is-dragging");
      try { this.headEl.releasePointerCapture(e.pointerId); } catch {}
      this.savePos();
    };
    this.headEl.addEventListener("pointerup", end);
    this.headEl.addEventListener("pointercancel", end);
    // Keep the panel on-screen across viewport resizes/rotations.
    window.addEventListener("resize", () => { if (this.posX >= 0) this.moveTo(this.posX, this.posY); });
  }

  private moveTo(x: number, y: number): void {
    const r = this.el.getBoundingClientRect();
    const maxX = window.innerWidth - Math.min(r.width, window.innerWidth) - 8;
    const maxY = window.innerHeight - 44; // keep the header grabbable
    this.posX = Math.max(8, Math.min(x, Math.max(8, maxX)));
    this.posY = Math.max(8, Math.min(y, Math.max(8, maxY)));
    this.el.style.left = `${this.posX}px`;
    this.el.style.top = `${this.posY}px`;
    this.el.style.right = "auto";
    this.el.style.bottom = "auto";
  }

  private savePos(): void {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: this.posX, y: this.posY })); } catch {}
  }
  private restorePos(): void {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { x: number; y: number };
      if (typeof p.x === "number" && typeof p.y === "number") { this.posX = p.x; this.posY = p.y; }
    } catch {}
  }
  private restoreVis(): void {
    try { this.visible = localStorage.getItem(VIS_KEY) === "1"; } catch {}
    this.el.hidden = !this.visible;
  }
  private saveVis(): void {
    try { localStorage.setItem(VIS_KEY, this.visible ? "1" : "0"); } catch {}
  }

  isVisible(): boolean { return this.visible; }

  toggle(): void { this.visible ? this.hide() : this.show(); }

  show(): void {
    this.visible = true;
    this.el.hidden = false;
    this.saveVis();
    // Place at the stored spot, or a sensible default near the top-left of the board.
    if (this.posX >= 0) this.moveTo(this.posX, this.posY);
    else this.moveTo(16, 96);
    this.render();
  }
  hide(): void {
    this.visible = false;
    this.el.hidden = true;
    this.saveVis();
  }

  refreshLocale(): void {
    this.el.setAttribute("aria-label", t("guide.title"));
    this.titleEl.textContent = t("guide.title");
    this.el.querySelector('[data-action="close"]')?.setAttribute("aria-label", t("guide.close"));
    this.render();
  }

  update(vm: GuideVM): void {
    this.vm = vm;
    if (this.visible) this.render();
  }

  private seatName(seat: number): string {
    return this.vm?.seats.find((s) => s.seat === seat)?.name ?? t("guide.aPlayer");
  }

  private render(): void {
    const vm = this.vm;
    if (!vm) return;
    const view = viewOf(vm.state, vm.seats.map((s) => s.seat));
    this.bodyEl.innerHTML = this.renderBody(vm, view);
    this.footEl.innerHTML = this.renderFoot(vm, view);
    this.wireFoot(vm, view);
  }

  private renderBody(vm: GuideVM, view: GuideView): string {
    if (view.phase === "intro") {
      const hint = vm.isHost ? t("guide.introHostHint") : t("guide.introWaiting");
      return `
        <p class="guide__lead">${esc(t("guide.introBody"))}</p>
        <p class="guide__hint">${esc(hint)}</p>`;
    }
    if (view.phase === "setup" && view.step) {
      const id = view.step.id;
      return `
        <h3 class="guide__step-title">${esc(t(`guide.steps.${id}.title`))}</h3>
        <p class="guide__step-body">${esc(t(`guide.steps.${id}.body`))}</p>`;
    }
    // turn loop
    const turnName = view.turnSeat >= 0 ? this.seatName(view.turnSeat) : t("guide.aPlayer");
    const phase = view.turnPhase ?? "focus";
    const first = vm.state.firstSeat >= 0 ? this.seatName(vm.state.firstSeat) : null;
    const firstLine = first ? `<p class="guide__hint">${esc(t("guide.firstChosen", { name: first }))}</p>` : "";
    return `
      <p class="guide__turn">${esc(t("guide.turnHeading", { name: turnName }))}
        <span class="guide__round">${esc(t("guide.roundLabel", { n: view.round }))}</span></p>
      <h3 class="guide__step-title">${esc(t(`guide.phase.${phase}.title`))}</h3>
      <p class="guide__step-body">${esc(t(`guide.phase.${phase}.body`))}</p>
      ${firstLine}`;
  }

  private renderFoot(vm: GuideVM, view: GuideView): string {
    if (view.phase === "intro") {
      return vm.isHost ? "" : `<span class="guide__muted">${esc(t("guide.introWaiting"))}</span>`;
    }
    const reset = vm.isHost
      ? `<button type="button" class="guide__restart" data-action="restart">${esc(t("guide.restart"))}</button>`
      : "";

    // chooseFirst step: a button per seated player; anyone seated may pick.
    if (view.phase === "setup" && view.step?.kind === "chooseFirst") {
      const picks = vm.seats
        .map((s) => `<button type="button" class="guide__pick" data-pick="${s.seat}" style="--seat:${esc(s.color)}">${esc(s.name)}${s.isSelf ? ` <em>${esc(t("guide.youTag"))}</em>` : ""}</button>`)
        .join("");
      return `
        <div class="guide__picks" role="group" aria-label="${esc(t("guide.pickPrompt"))}">${picks}</div>
        <div class="guide__foot-row">${reset}</div>`;
    }

    // confirm / turn-phase: the per-seat "everyone ready" control.
    const total = vm.seats.length;
    const done = vm.seats.filter((s) => s.ready).length;
    const segs = vm.seats
      .map((s) => `<span class="guide__seg${s.ready ? " is-on" : ""}" style="--seat:${esc(s.color)}" title="${esc(s.name)}"></span>`)
      .join("");
    const selfReady = vm.seats.find((s) => s.isSelf)?.ready ?? false;
    let cta = "";
    if (vm.spectator) {
      cta = `<span class="guide__muted">${esc(t("guide.spectatorNote"))}</span>`;
    } else {
      const label = selfReady ? t("guide.notYet") : t("guide.imReady");
      cta = `<button type="button" class="guide__ready${selfReady ? " is-on" : ""}" data-action="ready">${esc(label)}</button>`;
    }
    return `
      <div class="guide__segs" role="img" aria-label="${esc(t("guide.readyCount", { done, total }))}">${segs}</div>
      <div class="guide__foot-row">
        ${cta}
        <span class="guide__count">${esc(t("guide.readyCount", { done, total }))}</span>
        ${reset}
      </div>`;
  }

  private wireFoot(vm: GuideVM, view: GuideView): void {
    this.footEl.querySelector('[data-action="restart"]')?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      this.hooks.onRestart();
    });
    const readyBtn = this.footEl.querySelector('[data-action="ready"]');
    if (readyBtn) {
      readyBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const selfReady = vm.seats.find((s) => s.isSelf)?.ready ?? false;
        this.hooks.onToggleReady(!selfReady);
      });
    }
    this.footEl.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const seat = Number(btn.dataset.pick);
        if (Number.isFinite(seat)) this.hooks.onChooseFirst(seat);
      });
    });
    void view;
  }
}

/** A small, auto-driven corner badge showing whose turn it is and the current
 *  phase. It is read-only (no manual upkeep) and is hidden entirely during free
 *  play — it only appears once the walkthrough reaches the turn loop. Sits just left
 *  of the header menu button. */
export class GuideIndicator {
  el: HTMLElement;
  constructor() {
    this.el = document.createElement("div");
    this.el.className = "phase-ind";
    this.el.hidden = true;
    this.el.setAttribute("role", "status");
    this.el.setAttribute("aria-live", "polite");
    this.el.innerHTML = `
      <span class="phase-ind__turn" data-role="turn"></span>
      <span class="phase-ind__phase" data-role="phase"></span>`;
  }

  update(vm: GuideVM): void {
    const view = viewOf(vm.state, vm.seats.map((s) => s.seat));
    if (view.phase !== "turn" || view.turnSeat < 0 || !view.turnPhase) {
      this.el.hidden = true;
      return;
    }
    const name = vm.seats.find((s) => s.seat === view.turnSeat)?.name ?? t("guide.aPlayer");
    const turnEl = this.el.querySelector<HTMLElement>('[data-role="turn"]')!;
    const phaseEl = this.el.querySelector<HTMLElement>('[data-role="phase"]')!;
    turnEl.textContent = t("guide.turnHeading", { name });
    phaseEl.textContent = t(`guide.phase.${view.turnPhase}.title`);
    phaseEl.dataset.phase = view.turnPhase;
    this.el.hidden = false;
  }

  refreshLocale(vm: GuideVM | null): void {
    if (vm) this.update(vm);
  }
}
