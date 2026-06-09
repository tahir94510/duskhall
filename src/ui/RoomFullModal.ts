import { Modal, escape } from "./Modal.js";
import { t } from "../i18n/index.js";

// Shown to a visitor who opened a FULL room (4/4): there is no seat for them and the table has
// no spectating, so the only way forward is to open their own room. The single action — and ANY
// dismissal (Esc / backdrop) — funnels to onNewRoom, so a visitor can never be stranded on a
// hidden, dead table. Reads like every other dialog in the app (one title, one paragraph).
export function openRoomFull(modal: Modal, onNewRoom: () => void): void {
  let fired = false;
  const go = (): void => { if (fired) return; fired = true; onNewRoom(); };
  const bodyHtml = `<p class="confirm__text">${escape(t("roomFull.body"))}</p>`;
  const footHtml = `<button class="btn btn--primary" type="button" data-action="confirm">${escape(t("roomFull.newRoom"))}</button>`;
  // onClose covers Esc / backdrop; the button calls modal.close() which also fires onClose.
  modal.open({ title: t("roomFull.title"), bodyHtml, footHtml, onClose: go });

  const body = modal.bodyEl();
  const root = body?.closest(".modal") as HTMLElement | null;
  root?.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    modal.close();
  });
}
