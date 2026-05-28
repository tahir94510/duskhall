import { ICON_FLIP, ICON_GATHER, ICON_MIX, ICON_OPEN, ICON_CLOSED } from "./icons.js";

export interface ContextHooks {
  onFlip(id: string): void;
  onGather(id: string): void;
  onMix(id: string): void;
  onOpenAll(id: string): void;
  onCloseAll(id: string): void;
}

export class ContextBar {
  el: HTMLDivElement;
  private cardId: string | null = null;

  constructor(private hooks: ContextHooks) {
    this.el = document.createElement("div");
    this.el.className = "context-bar";
    this.el.innerHTML = `
      <button type="button" class="context-bar__btn" data-act="flip" aria-label="Flip">${ICON_FLIP}</button>
      <button type="button" class="context-bar__btn" data-act="gather" aria-label="Gather">${ICON_GATHER}</button>
      <button type="button" class="context-bar__btn" data-act="mix" aria-label="Shuffle">${ICON_MIX}</button>
      <button type="button" class="context-bar__btn" data-act="open" aria-label="Reveal">${ICON_OPEN}</button>
      <button type="button" class="context-bar__btn" data-act="close" aria-label="Conceal">${ICON_CLOSED}</button>
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
        if (act === "gather") this.hooks.onGather(id);
        if (act === "mix") this.hooks.onMix(id);
        if (act === "open") this.hooks.onOpenAll(id);
        if (act === "close") this.hooks.onCloseAll(id);
        this.hide();
      });
    });
    document.addEventListener("pointerdown", this.onOutside, true);
  }

  private onOutside = (e: PointerEvent): void => {
    if (!this.cardId) return;
    if (e.target instanceof Element && !this.el.contains(e.target)) {
      this.hide();
    }
  };

  show(id: string, clientX: number, clientY: number): void {
    this.cardId = id;
    this.el.classList.add("is-visible");
    const margin = 12;
    const w = this.el.offsetWidth || 240;
    const h = this.el.offsetHeight || 56;
    let x = clientX - w / 2;
    let y = clientY - h - 16;
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
