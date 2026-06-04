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
  private prevFocus: HTMLElement | null = null;
  private inerted: HTMLElement[] = [];
  // The current modal's onClose, remembered so it still fires when the dialog is
  // closed by an OUTSIDE caller that passes no callback (e.g. the global Escape
  // handler in Game calls modal.close() with no argument and can win the race
  // against this modal's own Escape listener). Without this, that path would skip
  // onClose and leak the "this panel is open" state.
  private onCloseCb: (() => void) | null = null;
  // Per-instance counter for unique title ids (aria-labelledby wiring).
  private static titleSeq = 0;

  open(opts: ModalOpts): void {
    this.close();
    this.onCloseCb = opts.onClose ?? null;
    this.prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bd = document.createElement("div");
    bd.className = "modal-backdrop";
    // The dialog semantics belong on the PANEL that receives focus, not the backdrop,
    // and the panel needs an accessible name. Point aria-labelledby at the title so a
    // screen reader announces "&lt;title&gt; dialog" when focus lands on the panel.
    const titleId = `modal-title-${++Modal.titleSeq}`;
    bd.innerHTML = `
      <div class="modal" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <div class="modal__head">
          <div>
            <div class="modal__title" id="${titleId}">${escape(opts.title)}</div>
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
    // Make everything behind the dialog inert: removes the background from the
    // tab order AND hides it from assistive tech (proper modal semantics, and
    // no "aria-hidden on a focused element" pitfalls).
    for (const node of Array.from(document.body.children)) {
      if (node !== bd && node instanceof HTMLElement && !node.inert) {
        node.inert = true;
        this.inerted.push(node);
      }
    }
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
    // Trap Tab within the dialog so keyboard focus can't wander off-modal.
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = this.focusable(bd);
      if (!focusables.length) { e.preventDefault(); return; }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    const closeBtn = bd.querySelector<HTMLButtonElement>(".modal__close");
    bd.addEventListener("click", onBackdrop);
    closeBtn?.addEventListener("click", onCloseBtn);
    document.addEventListener("keydown", onEsc);
    bd.addEventListener("keydown", onKeydown);

    closeOn(() => bd.removeEventListener("click", onBackdrop));
    closeOn(() => closeBtn?.removeEventListener("click", onCloseBtn));
    closeOn(() => document.removeEventListener("keydown", onEsc));
    closeOn(() => bd.removeEventListener("keydown", onKeydown));

    // Move focus to the dialog PANEL itself (tabindex=-1), not the close button or the
    // first link/input — so opening a modal (e.g. the first-visit About panel) never
    // paints a stray :focus-visible ring on a control the user didn't choose. The Tab
    // trap and Escape handler still work, so keyboard users keep full access.
    const panel = bd.querySelector<HTMLElement>(".modal");
    (panel ?? closeBtn)?.focus();
  }

  private focusable(root: HTMLElement): HTMLElement[] {
    const sel = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  close(after?: () => void): void {
    if (!this.backdrop) return;
    const bd = this.backdrop;
    this.backdrop = null;
    // Fire the remembered onClose even if the caller passed nothing, but never
    // twice: the explicit handlers pass opts.onClose, which is the same callback,
    // so prefer the argument and always clear the stored one.
    const onClose = after ?? this.onCloseCb ?? undefined;
    this.onCloseCb = null;
    for (const off of this.listeners) off();
    this.listeners = [];
    // Restore background interactivity and return focus to the trigger.
    for (const node of this.inerted) node.inert = false;
    this.inerted = [];
    const restore = this.prevFocus;
    this.prevFocus = null;
    bd.classList.remove("is-visible");
    window.setTimeout(() => {
      bd.remove();
      onClose?.();
    }, 220);
    if (restore && document.contains(restore)) restore.focus();
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
