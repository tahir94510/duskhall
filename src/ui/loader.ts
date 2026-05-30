// The loading screen lives in index.html so it paints on the first frame. We
// never remove it: hiding is a CSS fade (body.is-ready) and the node stays in
// the DOM so it can be shown again for a room switch without re-creating it.
// It is aria-hidden and has no focusable children, so leaving it in place is
// safe for assistive tech.

export function hideLoader(): void {
  document.body.classList.add("is-ready");
}

export function showLoader(): void {
  document.body.classList.remove("is-ready");
}
