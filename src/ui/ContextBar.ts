import { t } from "../i18n/index.js";
import { escape as esc } from "./Modal.js";

// Mobile / long-press context bar. Buttons disable themselves when the
// action does not apply to the current stack (e.g. you cannot shuffle a
// single card), so the touch UI never offers something that does nothing.

// A single flip icon: the touch bar offers ONE "flip" that turns the whole pile
// under the finger (or a lone card), matching desktop right-click. No separate
// stack-flip button — it was a frequent source of "the flip didn't turn my pile".
const ICON_FLIP = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 8 A 8 8 0 0 1 18 6 M20 16 A 8 8 0 0 1 6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 3 V7 H14 M6 21 V17 H10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
const ICON_ROTATE = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 13 A 9 9 0 0 0 12 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3 13 L6 10 M3 13 L6 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_GATHER = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 3 V6 M15 3 V6 M9 18 V21 M15 18 V21 M3 9 H6 M3 15 H6 M18 9 H21 M18 15 H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICON_MIX = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 7 H7 L17 17 H21 M3 17 H7 L17 7 H21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 4 L21 7 L18 10 M18 14 L21 17 L18 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
// Info "i": shows the face-up card's details on touch, where there is no hover.
const ICON_INFO = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 11 V16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.1" fill="currentColor"/></svg>`;
// Perspective (camera-turn): the touch path to the V shortcut. A table (rounded square) with a
// circular arrow sweeping around it — "turn the view". Mirrors the icon in Game.installPerspectiveButton.
const ICON_PERSPECTIVE = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="8" y="8" width="8" height="8" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 9 A 8 8 0 0 1 19 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19 15 A 8 8 0 0 1 5 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19 3 V7 H15 M5 21 V17 H9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
// Arrange (tidy your hand): three cards squared into a neat, grouped row — "lay my area out as a
// deck". Only ever shown on a card sitting in YOUR own zone (see canArrange), so it reads as the
// hand-area action it is. Mirrors the perspective/info stroke style.
const ICON_ARRANGE = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3.5" y="7" width="6" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11.5" y="7" width="6" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M20.5 8 V16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

export interface ContextHooks {
  /** Flip the whole pile under the finger, or a lone card if that's all there is. */
  onFlip(id: string): void;
  onGather(id: string): void;
  onMix(id: string): void;
  onRotate(id: string): void;
  /** Turn the local camera a quarter (the touch path to the V key). Card-independent. */
  onPerspective(): void;
  /** Tidy the local player's own hidden-zone cards into a grouped, deck-like layout. Zone-wide;
   *  `id` is the tapped card, only used to confirm the gesture started in our own area. */
  onArrange(id: string): void;
  /** Show the card's details (touch has no hover); only when it reads face-up. */
  onInfo(id: string): void;
  /** Returns the stack containing `id` so the bar can disable irrelevant actions. */
  stackFor(id: string): string[];
  /** True when the pile is already gathered & squared, so Gather would do nothing and
   *  greys out (gather is idempotent on a tidy pile — offering it is misleading). */
  isPileTidy(id: string): boolean;
  /** True when the card currently reads face-up to the local player, so the
   *  Info button can disable itself on a face-down card (nothing to show). */
  canShowInfo(id: string): boolean;
  /** True when the tapped card is in the local player's OWN zone. Gates the Arrange button's
   *  VISIBILITY (it is hidden on any other card), so the action only ever offers itself on your
   *  own hand area. */
  canArrange(id: string): boolean;
  /** True when there is nothing to tidy (fewer than two of your own cards, or the area is already
   *  laid out), so the Arrange button greys out like Gather on an already-collected pile instead
   *  of sitting there as a dead tap. Re-enables once the layout is disturbed or a card is added. */
  isAreaTidy(id: string): boolean;
}

export class ContextBar {
  el: HTMLDivElement;
  private cardId: string | null = null;

  constructor(private hooks: ContextHooks) {
    this.el = document.createElement("div");
    this.el.className = "context-bar";
    this.el.innerHTML = `
      <button type="button" class="context-bar__btn" data-act="flip" aria-label="${esc(t("actions.flip"))}">${ICON_FLIP}</button>
      <button type="button" class="context-bar__btn" data-act="rotate" aria-label="${esc(t("actions.rotate"))}">${ICON_ROTATE}</button>
      <button type="button" class="context-bar__btn" data-act="gather" aria-label="${esc(t("actions.gather"))}">${ICON_GATHER}</button>
      <button type="button" class="context-bar__btn" data-act="mix" aria-label="${esc(t("actions.shuffle"))}">${ICON_MIX}</button>
      <button type="button" class="context-bar__btn" data-act="arrange" aria-label="${esc(t("actions.arrange"))}">${ICON_ARRANGE}</button>
      <button type="button" class="context-bar__btn" data-act="info" aria-label="${esc(t("actions.info"))}">${ICON_INFO}</button>
      <button type="button" class="context-bar__btn" data-act="perspective" aria-label="${esc(t("actions.perspective"))}">${ICON_PERSPECTIVE}</button>
    `;
    document.body.appendChild(this.el);
    this.bind();
  }

  private bind(): void {
    this.el.querySelectorAll<HTMLButtonElement>(".context-bar__btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = this.cardId;
        if (!id) return;
        if (btn.classList.contains("is-disabled")) return;
        const act = btn.dataset.act;
        if (act === "flip") this.hooks.onFlip(id);
        else if (act === "rotate") this.hooks.onRotate(id);
        else if (act === "gather") this.hooks.onGather(id);
        else if (act === "mix") this.hooks.onMix(id);
        else if (act === "arrange") this.hooks.onArrange(id);
        else if (act === "info") this.hooks.onInfo(id);
        else if (act === "perspective") this.hooks.onPerspective();
        this.hide();
      });
    });
    document.addEventListener("pointerdown", this.onOutside, true);
  }

  private onOutside = (e: PointerEvent): void => {
    if (!this.cardId) return;
    if (e.target instanceof Element && !this.el.contains(e.target)) this.hide();
  };

  private refreshButtonStates(id: string): void {
    const stack = this.hooks.stackFor(id);
    const isStack = stack.length >= 2;
    const setDisabled = (act: string, disabled: boolean) => {
      const btn = this.el.querySelector<HTMLButtonElement>(`[data-act="${act}"]`);
      if (!btn) return;
      btn.classList.toggle("is-disabled", disabled);
      if (disabled) btn.setAttribute("aria-disabled", "true");
      else btn.removeAttribute("aria-disabled");
    };
    // Gather and shuffle are multi-card actions: a lone card has nothing to
    // gather or mix, so they grey out. Gather ALSO greys out on a pile that is
    // already gathered & squared (it would do nothing), so the control never looks
    // tappable-but-dead. Shuffle stays available on any pile (it is repeatable).
    setDisabled("gather", !isStack || this.hooks.isPileTidy(id));
    setDisabled("mix", !isStack);
    // Info only makes sense for a card that currently reads face-up.
    setDisabled("info", !this.hooks.canShowInfo(id));
    // Arrange is HIDDEN on any card outside our own zone (a whole-zone action would be misleading
    // on a public or rival card), and on our own cards it greys out when there is nothing to tidy —
    // so it is never a dead tap and the common tap on a shared card keeps the original six buttons.
    const arrangeBtn = this.el.querySelector<HTMLButtonElement>(`[data-act="arrange"]`);
    if (arrangeBtn) {
      const showArrange = this.hooks.canArrange(id);
      arrangeBtn.style.display = showArrange ? "" : "none";
      if (showArrange) setDisabled("arrange", this.hooks.isAreaTidy(id));
    }
  }

  show(id: string, clientX: number, clientY: number): void {
    this.cardId = id;
    this.refreshButtonStates(id);
    this.el.classList.add("is-visible");
    const margin = 12;
    const w = this.el.offsetWidth || 240;
    const h = this.el.offsetHeight || 56;
    let x = clientX - w / 2;
    let y = clientY - h - 18;
    if (y < margin) y = clientY + 24;
    if (x + w + margin > window.innerWidth) x = window.innerWidth - w - margin;
    if (x < margin) x = margin;
    // Always keep the whole bar on-screen, including the bottom safe-area, so a
    // long-press near a screen edge never opens a partly-clipped bar.
    if (y + h + margin > window.innerHeight) y = window.innerHeight - h - margin;
    if (y < margin) y = margin;
    // Position with left/top (instant), NOT transform: the CSS keeps `transform` for the
    // scale pop-in (scale .94 -> 1) and transitions it, so writing the position into
    // transform would (a) override the scale and (b) make the bar SLIDE across the screen
    // from its previous spot. left/top are not transitioned, so it appears exactly where
    // the finger is and only the scale/opacity animate in.
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  hide = (): void => {
    this.cardId = null;
    this.el.classList.remove("is-visible");
  };

  destroy(): void {
    document.removeEventListener("pointerdown", this.onOutside, true);
    this.el.remove();
  }
}
