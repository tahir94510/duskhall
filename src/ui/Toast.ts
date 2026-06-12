let el: HTMLDivElement | null = null;
let hideTimer = 0;

// Status flavours: "success" and "error" carry a small coloured dot (the same
// visual language as the offline banner's amber dot); "info" is the plain pill.
export type ToastKind = "info" | "success" | "error";

export interface ToastOptions {
  durationMs?: number;
  kind?: ToastKind;
}

function ensure(): HTMLDivElement {
  if (el) return el;
  el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  document.body.appendChild(el);
  return el;
}

// Show a transient message. When no explicit duration is given the visible time
// scales with the message length (so longer notices stay long enough to read),
// clamped to a comfortable range. A minimum floor guarantees even a one-word
// toast is never gone before the eye lands on it. The message is always set via
// textContent (it can embed player names), never as HTML.
export function toast(message: string, opts?: ToastOptions): void {
  const node = ensure();
  node.textContent = message;
  // Reset the kind classes each show: the single reusable element must not carry
  // the previous toast's tint into an unrelated message.
  node.className = "toast";
  const kind = opts?.kind ?? "info";
  if (kind !== "info") node.classList.add(`toast--${kind}`);
  node.classList.add("is-visible");
  window.clearTimeout(hideTimer);
  const dur = opts?.durationMs ?? Math.min(7000, Math.max(3200, 1400 + message.length * 55));
  hideTimer = window.setTimeout(() => node.classList.remove("is-visible"), dur);
}
