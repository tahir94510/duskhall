import { Modal, escape } from "./Modal.js";
import { t } from "../i18n/index.js";
import { toast } from "./Toast.js";
import { parseRoomInput } from "../net/room.js";

export interface JoinByCodeOpts {
  /** The room we're currently in, so "join the room you're already in" is a no-op. */
  currentRoom: string;
  /** Optional value to pre-fill the field with (e.g. a code read from the clipboard). */
  prefill?: string;
}

// Join-a-room dialog with a TEXT INPUT the player pastes a code or invite link
// into. This replaces the old "read the clipboard on click" affordance, which
// Firefox gates behind its own native "Paste" button (navigator.clipboard.readText
// is blocked outside a user gesture / rejected for web content), so the app modal
// never appeared. An input the user pastes into with Ctrl+V works in every browser.
// As a convenience we ALSO try to pre-fill from the clipboard where the API allows
// it (Chrome), but the flow never DEPENDS on it.
export function openJoinByCode(
  modal: Modal,
  opts: JoinByCodeOpts,
  onJoin: (code: string) => void
): void {
  const inputId = "joincode-input";
  const errId = "joincode-error";
  const bodyHtml = `
    <p class="joincode__note">${escape(t("joinByCode.body"))}</p>
    <label class="joincode__label" for="${inputId}">${escape(t("joinByCode.label"))}</label>
    <input
      id="${inputId}"
      class="joincode__input"
      type="text"
      inputmode="text"
      autocomplete="off"
      autocapitalize="characters"
      spellcheck="false"
      placeholder="${escape(t("joinByCode.placeholder"))}"
      aria-describedby="${errId}"
      data-role="code"
    />
    <p class="joincode__error" id="${errId}" data-role="error" role="alert" hidden></p>
  `;
  const footHtml = `
    <button class="btn" type="button" data-action="cancel">${escape(t("ui.cancel"))}</button>
    <button class="btn btn--primary" type="button" data-action="confirm" disabled>${escape(t("joinByCode.confirm"))}</button>
  `;
  modal.open({ title: t("joinByCode.title"), bodyHtml, footHtml });

  const body = modal.bodyEl();
  const root = body?.closest(".modal") as HTMLElement | null;
  const input = root?.querySelector<HTMLInputElement>('[data-role="code"]') ?? null;
  const error = root?.querySelector<HTMLElement>('[data-role="error"]') ?? null;
  const joinBtn = root?.querySelector<HTMLButtonElement>('[data-action="confirm"]') ?? null;
  const cancelBtn = root?.querySelector<HTMLButtonElement>('[data-action="cancel"]') ?? null;
  if (!input || !joinBtn) return;

  const showError = (msg: string): void => {
    if (!error) return;
    error.textContent = msg;
    error.hidden = false;
    input.setAttribute("aria-invalid", "true");
  };
  const clearError = (): void => {
    if (!error) return;
    error.hidden = true;
    input.removeAttribute("aria-invalid");
  };

  // Live-validate: enable Join only when the field resolves to a real code.
  input.addEventListener("input", () => {
    clearError();
    joinBtn.disabled = !parseRoomInput(input.value);
  });

  const submit = (): void => {
    const code = parseRoomInput(input.value);
    if (!code) { showError(t("ui.invalidCode")); return; }
    if (code === opts.currentRoom) { modal.close(); toast(t("ui.joined")); return; }
    modal.close(() => onJoin(code));
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  });
  joinBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); submit(); });
  cancelBtn?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); modal.close(); });

  // Pre-fill from an explicit value, else best-effort from the clipboard (Chrome).
  // Never block on it: in Firefox readText rejects and the field simply stays empty.
  const prefill = (val: string): void => {
    // The clipboard read is async, so the dialog may have been closed by the time
    // it resolves — never write to a detached input.
    if (!input.isConnected) return;
    const code = parseRoomInput(val);
    if (!code || code === opts.currentRoom) return;
    input.value = code;
    joinBtn.disabled = false;
    input.select();
  };
  if (opts.prefill) {
    prefill(opts.prefill);
  } else {
    try {
      void navigator.clipboard?.readText().then((txt) => prefill(txt || "")).catch(() => {});
    } catch { /* clipboard unavailable — user pastes manually */ }
  }
}
