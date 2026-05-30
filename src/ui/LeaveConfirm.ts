import { Modal } from "./Modal.js";
import { t } from "../i18n/index.js";
import { openConfirm } from "./ConfirmModal.js";

// Reset/leave room confirmation. Just the decision — no invite link, no copy
// button — so it reads the same as every other confirm dialog in the app.
export function openLeaveConfirm(modal: Modal, _currentRoom: string, onConfirm: () => void): void {
  openConfirm(modal, {
    title: t("leaveConfirm.title"),
    body: t("leaveConfirm.body"),
    confirmLabel: t("leaveConfirm.leave"),
    danger: true
  }, onConfirm);
}
