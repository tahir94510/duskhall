let el: HTMLDivElement | null = null;
let hideTimer = 0;

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
// toast is never gone before the eye lands on it.
export function toast(message: string, durationMs?: number): void {
  const node = ensure();
  node.textContent = message;
  node.classList.add("is-visible");
  window.clearTimeout(hideTimer);
  const dur = durationMs ?? Math.min(7000, Math.max(3200, 1400 + message.length * 55));
  hideTimer = window.setTimeout(() => node.classList.remove("is-visible"), dur);
}
