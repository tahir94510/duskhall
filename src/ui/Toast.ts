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

export function toast(message: string, durationMs = 2200): void {
  const node = ensure();
  node.textContent = message;
  node.classList.add("is-visible");
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => node.classList.remove("is-visible"), durationMs);
}
