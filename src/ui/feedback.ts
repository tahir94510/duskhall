import { ICON_CHECK } from "./icons.js";

// Project-wide confirmation feedback: when a button performs a copy / paste /
// confirm action, its icon briefly turns into a check mark and then restores to
// its original content. Used so every "it worked" moment reads identically.

const FLASH_MS = 1100;
const restoreTimers = new WeakMap<HTMLElement, number>();

/**
 * Flash a check mark inside `btn` for `durationMs`, then restore the original
 * markup. Re-entrant: a second call before the first restores resets the timer
 * but never loses the original content.
 */
export function flashConfirm(btn: HTMLElement, durationMs = FLASH_MS): void {
  const prev = restoreTimers.get(btn);
  if (prev) {
    window.clearTimeout(prev);
  } else {
    // First flash for this button: stash the original markup so we can restore
    // it even after repeated rapid clicks.
    btn.dataset.flashHtml = btn.innerHTML;
  }
  btn.classList.add("is-confirmed");
  btn.innerHTML = ICON_CHECK;
  const handle = window.setTimeout(() => {
    btn.classList.remove("is-confirmed");
    if (btn.dataset.flashHtml !== undefined) {
      btn.innerHTML = btn.dataset.flashHtml;
      delete btn.dataset.flashHtml;
    }
    restoreTimers.delete(btn);
  }, durationMs);
  restoreTimers.set(btn, handle);
}
