import { t } from "../i18n/index.js";
import { CARD_DEFS, CATEGORY_META } from "../game/cards.js";

const HOVER_DELAY = 800;
const OFFSET = 14;

interface ActiveTip { cardEl: HTMLElement; defId: string; }

export class Tooltip {
  private el: HTMLDivElement;
  private showTimer = 0;
  private active: ActiveTip | null = null;
  private mouseX = 0;
  private mouseY = 0;

  constructor(private host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "tooltip";
    this.el.setAttribute("role", "tooltip");
    document.body.appendChild(this.el);
    this.bind();
  }

  private bind(): void {
    this.host.addEventListener("pointerover", this.onOver, { passive: true });
    this.host.addEventListener("pointerout", this.onOut, { passive: true });
    this.host.addEventListener("pointermove", this.onMove, { passive: true });
    this.host.addEventListener("pointerdown", this.hide, { passive: true });
    window.addEventListener("scroll", this.hide, { passive: true });
    window.addEventListener("blur", this.hide);
  }

  private resolve(target: Element): { defId: string; cardEl: HTMLElement } | null {
    const cardEl = target.closest<HTMLElement>(".card");
    if (!cardEl) return null;
    if (!cardEl.classList.contains("is-faceup")) return null;
    if (cardEl.classList.contains("is-concealed")) return null;
    const defId = cardEl.dataset.def;
    if (!defId) return null;
    return { defId, cardEl };
  }

  private onOver = (e: PointerEvent): void => {
    const data = this.resolve(e.target as Element);
    if (!data) return;
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    window.clearTimeout(this.showTimer);
    this.showTimer = window.setTimeout(() => this.show(data), HOVER_DELAY);
  };

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
    const cat = CATEGORY_META[def.category];
    this.el.innerHTML = `
      <div class="tooltip__title">${escapeHtml(t(`cards.${def.id}.name`))}</div>
      <div class="tooltip__type" style="color:${cat.color}">${escapeHtml(t(`categories.${def.category}.name`))}</div>
      <div class="tooltip__body">${escapeHtml(t(`cards.${def.id}.effect`))}</div>
      <div class="tooltip__flavor">${escapeHtml(t(`cards.${def.id}.flavor`))}</div>
    `;
    this.position();
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
    if (y + h + margin > window.innerHeight) y = window.innerHeight - h - margin;
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  hide = (): void => {
    window.clearTimeout(this.showTimer);
    this.active = null;
    this.el.classList.remove("is-visible");
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
