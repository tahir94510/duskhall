import { t } from "../i18n/index.js";
import { CARD_DEFS } from "../game/cards.js";
import { loadManifest } from "../table/Card.js";

const HOVER_DELAY = 320;
const OFFSET = 14;

interface ActiveTip { cardEl: HTMLElement; defId: string; }

export class Tooltip {
  private el: HTMLDivElement;
  private showTimer = 0;
  private active: ActiveTip | null = null;
  private mouseX = 0;
  private mouseY = 0;
  // True while a pointer button is held down anywhere: during a drag/hold we
  // never want the info panel to appear over the card in hand.
  private pressed = false;
  // True when the panel was opened by the touch "info" button (no hover). In that
  // mode it stays put until the player taps elsewhere, and a tap anywhere outside
  // it dismisses it — so it never gets stuck on a phone.
  private sticky = false;
  // Resolved art URLs by card def, shared with the card faces (one cached fetch).
  private artUrls: Map<string, string> | null = null;

  constructor(private host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "tooltip";
    this.el.setAttribute("role", "tooltip");
    document.body.appendChild(this.el);
    void loadManifest().then((m) => { this.artUrls = m; });
    this.bind();
  }

  private bind(): void {
    this.host.addEventListener("pointerover", this.onOver, { passive: true });
    this.host.addEventListener("pointerout", this.onOut, { passive: true });
    this.host.addEventListener("pointermove", this.onMove, { passive: true });
    this.host.addEventListener("pointerdown", this.onDown, { passive: true });
    // Clear the pressed flag on release no matter where the pointer ends up.
    window.addEventListener("pointerup", this.onUp, { passive: true });
    window.addEventListener("pointercancel", this.onUp, { passive: true });
    // Safety net: leaving the board entirely always dismisses the tooltip.
    this.host.addEventListener("pointerleave", this.onHostLeave, { passive: true });
    window.addEventListener("scroll", this.hide, { passive: true });
    window.addEventListener("blur", this.hide);
    // A tap/click anywhere outside the panel dismisses a sticky (touch-opened)
    // tooltip, so it never requires tapping the exact card again to close.
    document.addEventListener("pointerdown", this.onDocDown, true);
  }

  private onDown = (): void => { this.pressed = true; this.hide(); };
  private onUp = (): void => { this.pressed = false; };

  // Leaving the board dismisses a hover tooltip, but NOT a sticky touch one (the
  // finger naturally leaves the board after tapping Info).
  private onHostLeave = (): void => { if (!this.sticky) this.hide(); };

  // Dismiss a sticky (touch) tooltip on any tap outside the panel itself.
  private onDocDown = (e: PointerEvent): void => {
    if (!this.sticky) return;
    if (e.target instanceof Node && this.el.contains(e.target)) return;
    this.hide();
  };

  private resolve(target: Element): { defId: string; cardEl: HTMLElement } | null {
    const cardEl = target.closest<HTMLElement>(".card");
    if (!cardEl) return null;
    if (!cardEl.classList.contains("is-faceup")) return null;
    if (cardEl.classList.contains("is-concealed")) return null;
    // Never show while a card is in hand (being dragged/held).
    if (cardEl.classList.contains("is-held")) return null;
    const defId = cardEl.dataset.def;
    if (!defId) return null;
    return { defId, cardEl };
  }

  private onOver = (e: PointerEvent): void => {
    if (this.pressed) return;
    // Hover is a mouse affordance only. On touch, a synthetic pointerover fires
    // after a tap/drag and would pop the panel up at a stale position; touch users
    // get card info through the action bar's Info button instead.
    if (e.pointerType === "touch") return;
    const data = this.resolve(e.target as Element);
    if (!data) return;
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    window.clearTimeout(this.showTimer);
    this.showTimer = window.setTimeout(() => this.show(data), HOVER_DELAY);
  };

  // Show the panel for a specific card element on demand (touch "info" button,
  // which has no hover). Anchors near the card and stays until dismissed by a tap
  // anywhere outside it. Ignores the pressed flag and the usual hover delay.
  showForCard(cardEl: HTMLElement): void {
    const defId = cardEl.dataset.def;
    if (!defId) return;
    if (!cardEl.classList.contains("is-faceup") || cardEl.classList.contains("is-concealed")) return;
    const r = cardEl.getBoundingClientRect();
    this.mouseX = r.left + r.width / 2;
    this.mouseY = r.top;
    window.clearTimeout(this.showTimer);
    this.sticky = true;
    this.show({ defId, cardEl });
  }

  // Re-arm the hover tooltip at a point WITHOUT a pointerover (used right after a
  // mouse drop, so its info shows without the cursor leaving and re-entering).
  // Touch never auto-probes — info on touch is explicit via the Info button.
  probeAt(x: number, y: number, pointerType?: string): void {
    if (pointerType === "touch") return;
    this.pressed = false;
    const el = document.elementFromPoint(x, y);
    const data = el ? this.resolve(el) : null;
    if (!data) return;
    this.mouseX = x;
    this.mouseY = y;
    window.clearTimeout(this.showTimer);
    this.showTimer = window.setTimeout(() => this.show(data), HOVER_DELAY);
  }

  private onOut = (e: PointerEvent): void => {
    const cardEl = (e.target instanceof Element ? e.target.closest(".card") : null) as HTMLElement | null;
    if (!cardEl) return;
    const related = e.relatedTarget instanceof Element ? e.relatedTarget.closest(".card") : null;
    if (related === cardEl) return;
    window.clearTimeout(this.showTimer);
    this.hide();
  };

  private onMove = (e: PointerEvent): void => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    if (this.active) this.position();
  };

  private show(data: { defId: string; cardEl: HTMLElement }): void {
    const def = CARD_DEFS.find((d) => d.id === data.defId);
    if (!def) return;
    if (!data.cardEl.classList.contains("is-faceup")) return;
    this.active = data;
    // Always start hidden so the first frame after innerHTML cannot leak in
    // at the previous (or default) position.
    this.el.classList.remove("is-visible");
    // A slice of the card's own art above the text makes the panel instantly
    // recognisable. Shown only when art exists for this card; otherwise text-only,
    // so a fresh checkout with no art produces a clean panel and no broken image.
    const artUrl = this.artUrls?.get(def.id);
    const artHtml = artUrl
      ? `<div class="tooltip__art" style="background-image:url('${encodeURI(artUrl)}')" role="img" aria-label=""></div>`
      : "";
    this.el.innerHTML = `
      ${artHtml}
      <div class="tooltip__title">${escapeHtml(t(`cards.${def.id}.name`))}</div>
      <div class="tooltip__type">${escapeHtml(t(`categories.${def.category}.name`))}</div>
      <div class="tooltip__body">${escapeHtml(t(`cards.${def.id}.effect`))}</div>
      <div class="tooltip__flavor">${escapeHtml(t(`cards.${def.id}.flavor`))}</div>
    `;
    this.position();
    void this.el.offsetWidth; // force layout commit so opacity transition starts from the right place
    this.el.classList.add("is-visible");
  }

  private position(): void {
    const margin = 12;
    const w = this.el.offsetWidth || 280;
    const h = this.el.offsetHeight || 120;
    let x = this.mouseX + OFFSET;
    let y = this.mouseY - h - OFFSET;
    if (y < margin) y = this.mouseY + OFFSET;
    if (x + w + margin > window.innerWidth) x = this.mouseX - w - OFFSET;
    if (x < margin) x = margin;
    // Keep the whole panel on-screen vertically too, so on a short phone the
    // bottom (flavour line) never clips below the fold.
    if (y + h + margin > window.innerHeight) y = Math.max(margin, window.innerHeight - h - margin);
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  hide = (): void => {
    window.clearTimeout(this.showTimer);
    this.active = null;
    this.sticky = false;
    this.el.classList.remove("is-visible");
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
