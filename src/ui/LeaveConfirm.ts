import { Modal, escape } from "./Modal.js";
import { t } from "../i18n/index.js";
import { inviteUrl } from "../net/room.js";
import { ICON_COPY } from "./icons.js";
import { toast } from "./Toast.js";

export function openLeaveConfirm(modal: Modal, currentRoom: string, onConfirm: () => void): void {
  const url = inviteUrl(currentRoom);
  const bodyHtml = `
    <p>${escape(t("leaveConfirm.body"))}</p>
    <div class="invite-row">
      <span class="link" title="${escape(url)}">${escape(url)}</span>
      <button class="icon-btn" data-action="copy" type="button" aria-label="${escape(t("ui.copyLink"))}">${ICON_COPY}</button>
    </div>
  `;
  const footHtml = `
    <button class="btn" type="button" data-action="cancel">${escape(t("ui.cancel"))}</button>
    <button class="btn btn--danger" type="button" data-action="reset">${escape(t("leaveConfirm.leave"))}</button>
  `;
  modal.open({ title: t("leaveConfirm.title"), bodyHtml, footHtml });

  const body = modal.bodyEl();
  body?.querySelector<HTMLButtonElement>('[data-action="copy"]')?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      toast(t("ui.linkCopied"));
    } catch {}
  });
  const root = body?.closest(".modal") as HTMLElement | null;
  root?.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    modal.close();
  });
  root?.querySelector<HTMLButtonElement>('[data-action="reset"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    modal.close(onConfirm);
  });
}
