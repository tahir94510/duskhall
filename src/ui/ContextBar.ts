// Mobile / long-press context bar. Inline icons so we don't depend on the
// shrinking icons module.

const ICON_FLIP = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 8 A 8 8 0 0 1 18 6 M20 16 A 8 8 0 0 1 6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 3 V7 H14 M6 21 V17 H10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
const ICON_STACK_FLIP = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="3" y="6" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="8" y="3" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".55"/><path d="M11 13 L13 15 L17 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_GATHER = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 3 V6 M15 3 V6 M9 18 V21 M15 18 V21 M3 9 H6 M3 15 H6 M18 9 H21 M18 15 H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICON_MIX = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 7 H7 L17 17 H21 M3 17 H7 L17 7 H21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 4 L21 7 L18 10 M18 14 L21 17 L18 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;

export interface ContextHooks {
  onFlip(id: string): void;
  onGather(id: string): void;
  onMix(id: string): void;
  onStackToggleFlip(id: string): void;
}

export class ContextBar {
  el: HTMLDivElement;
  private cardId: string | null = null;

  constructor(private hooks: ContextHooks) {
    this.el = document.createElement("div");
    this.el.className = "context-bar";
    this.el.innerHTML = `
      <button type="button" class="context-bar__btn" data-act="flip" aria-label="Flip">${ICON_FLIP}</button>
      <button type="button" class="context-bar__btn" data-act="stack-flip" aria-label="Flip stack">${ICON_STACK_FLIP}</button>
      <button type="button" class="context-bar__btn" data-act="gather" aria-label="Gather">${ICON_GATHER}</button>
      <button type="button" class="context-bar__btn" data-act="mix" aria-label="Shuffle">${ICON_MIX}</button>
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
        const act = btn.dataset.act;
        if (act === "flip") this.hooks.onFlip(id);
        else if (act === "stack-flip") this.hooks.onStackToggleFlip(id);
        else if (act === "gather") this.hooks.onGather(id);
        else if (act === "mix") this.hooks.onMix(id);
        this.hide();
      });
    });
    document.addEventListener("pointerdown", this.onOutside, true);
  }

  private onOutside = (e: PointerEvent): void => {
    if (!this.cardId) return;
    if (e.target instanceof Element && !this.el.contains(e.target)) this.hide();
  };

  show(id: string, clientX: number, clientY: number): void {
    this.cardId = id;
    this.el.classList.add("is-visible");
    const margin = 12;
    const w = this.el.offsetWidth || 200;
    const h = this.el.offsetHeight || 56;
    let x = clientX - w / 2;
    let y = clientY - h - 18;
    if (y < margin) y = clientY + 24;
    if (x + w + margin > window.innerWidth) x = window.innerWidth - w - margin;
    if (x < margin) x = margin;
    this.el.style.transform = `translate(${x}px, ${y}px)`;
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
