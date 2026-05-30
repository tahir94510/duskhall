import { Modal, escape } from "./Modal.js";
import { t } from "../i18n/index.js";

export interface ConfirmOpts {
  title: string;
  /** Plain-text body (already localised). Rendered as a single paragraph. */
  body: string;
  /** Label for the confirm button (already localised). */
  confirmLabel: string;
  /** Label for the cancel button (defaults to ui.cancel). */
  cancelLabel?: string;
  /** Render the confirm button in the destructive (red) style. */
  danger?: boolean;
}

/**
 * Generic, consistent confirmation dialog: a title, one explanatory paragraph,
 * and Cancel / Confirm. No links, no copy buttons, nothing but the decision —
 * every destructive action in the app routes through this so they all read and
 * behave the same way.
 */
export function openConfirm(modal: Modal, opts: ConfirmOpts, onConfirm: () => void): void {
  const bodyHtml = `<p class="confirm__text">${escape(opts.body)}</p>`;
  const confirmClass = opts.danger ? "btn btn--danger" : "btn btn--primary";
  const footHtml = `
    <button class="btn" type="button" data-action="cancel">${escape(opts.cancelLabel ?? t("ui.cancel"))}</button>
    <button class="${confirmClass}" type="button" data-action="confirm">${escape(opts.confirmLabel)}</button>
  `;
  modal.open({ title: opts.title, bodyHtml, footHtml });

  const body = modal.bodyEl();
  const root = body?.closest(".modal") as HTMLElement | null;
  root?.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    modal.close();
  });
  root?.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    modal.close(onConfirm);
  });
}
