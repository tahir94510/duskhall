import { t, tArr } from "../i18n/index.js";
import { escape } from "./Modal.js";

export interface WelcomeHintOpts {
  // The gesture list to show: touch devices get the long-press set, mouse the full set.
  touch: boolean;
  // Escape dismisses the hint only while nothing else owns the key (e.g. an open modal).
  canEscapeDismiss?: () => boolean;
  onDismiss?: () => void;
}

// One-time first-visit hint: a small, NON-blocking card above the player's own edge
// that teaches the three or four core gestures and points at the Guide and the invite
// link. Deliberately not a Modal (no backdrop, no focus trap, table stays playable);
// it leaves through its own dismiss button, Escape, or not at all — it never returns
// once the caller marks it seen. Returns false when the copy is unavailable (stale
// locale cache), so the caller can retry on a later visit.
export function showWelcomeHint(opts: WelcomeHintOpts): boolean {
  const title = t("welcome.title");
  if (title === "welcome.title") return false; // locale cache predates the key
  const items = tArr<string>(opts.touch ? "welcome.touchItems" : "welcome.desktopItems");
  if (!items.length) return false;

  const el = document.createElement("div");
  el.className = "welcome-hint";
  el.setAttribute("role", "note");
  el.innerHTML = `
    <div class="welcome-hint__head">
      <span class="welcome-hint__title">${escape(title)}</span>
      <button class="welcome-hint__dismiss" type="button">${escape(t("welcome.dismiss"))}</button>
    </div>
    <ul class="welcome-hint__list">
      ${items.map((line) => `<li>${escape(line)}</li>`).join("")}
    </ul>
    <p class="welcome-hint__pointer">${escape(t("welcome.guidePointer"))}</p>
  `;

  let onKey: ((e: KeyboardEvent) => void) | null = null;
  const dismiss = (): void => {
    if (onKey) document.removeEventListener("keydown", onKey);
    el.classList.remove("is-visible");
    window.setTimeout(() => el.remove(), 260);
    opts.onDismiss?.();
  };
  onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (opts.canEscapeDismiss && !opts.canEscapeDismiss()) return;
    dismiss();
  };
  el.querySelector<HTMLButtonElement>(".welcome-hint__dismiss")?.addEventListener("click", dismiss);
  document.addEventListener("keydown", onKey);

  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));
  return true;
}
