import { ICON_CLOSE } from "./icons.js";
import { t } from "../i18n/index.js";

export interface ModalOpts {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  footHtml?: string;
  onClose?: () => void;
}

export class Modal {
  private backdrop: HTMLDivElement | null = null;
  private listeners: Array<() => void> = [];

  open(opts: ModalOpts): void {
    this.close();
    const bd = document.createElement("div");
    bd.className = "modal-backdrop";
    bd.setAttribute("role", "dialog");
    bd.setAttribute("aria-modal", "true");
    bd.innerHTML = `
      <div class="modal">
        <div class="modal__head">
          <div>
            <div class="modal__title">${escape(opts.title)}</div>
            ${opts.subtitle ? `<div class="modal__sub">${escape(opts.subtitle)}</div>` : ""}
          </div>
          <button class="modal__close" type="button" aria-label="${escape(t("ui.close"))}">${ICON_CLOSE}</button>
        </div>
        <div class="modal__body">${opts.bodyHtml}</div>
        ${opts.footHtml ? `<div class="modal__foot">${opts.footHtml}</div>` : ""}
      </div>
    `;
    document.body.appendChild(bd);
    this.backdrop = bd;
    requestAnimationFrame(() => bd.classList.add("is-visible"));

    const closeOn = (cb: () => void) => {
      this.listeners.push(cb);
    };

    const onBackdrop = (e: MouseEvent) => {
      if (e.target === bd) this.close(opts.onClose);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") this.close(opts.onClose);
    };
    const onCloseBtn = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.close(opts.onClose);
    };
    const closeBtn = bd.querySelector<HTMLButtonElement>(".modal__close");
    bd.addEventListener("click", onBackdrop);
    closeBtn?.addEventListener("click", onCloseBtn);
    document.addEventListener("keydown", onEsc);

    closeOn(() => bd.removeEventListener("click", onBackdrop));
    closeOn(() => closeBtn?.removeEventListener("click", onCloseBtn));
    closeOn(() => document.removeEventListener("keydown", onEsc));
  }

  close(after?: () => void): void {
    if (!this.backdrop) return;
    const bd = this.backdrop;
    this.backdrop = null;
    for (const off of this.listeners) off();
    this.listeners = [];
    bd.classList.remove("is-visible");
    window.setTimeout(() => {
      bd.remove();
      after?.();
    }, 220);
  }

  isOpen(): boolean {
    return !!this.backdrop;
  }

  bodyEl(): HTMLDivElement | null {
    return this.backdrop?.querySelector<HTMLDivElement>(".modal__body") ?? null;
  }
}

export function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
