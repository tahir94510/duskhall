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

// The platform sigil baked into index.html, captured once so a failed mode-logo
// swap can fall straight back to it (never an empty veil).
let defaultMarkHtml: string | null = null;

// Swap the loading veil's mark to the ACTIVE mode's brand logo, so the screen
// shown while a game boots or a mode switch runs carries THAT game's identity
// instead of a generic platform sigil. Called from branding on boot + every
// switch. A missing/broken file degrades to the platform sigil with no console
// error. The image inherits the mark's pulse + drop-shadow via `.app-loader__mark img`.
export function setLoaderMark(iconUrl: string): void {
  const mark = document.querySelector<HTMLElement>(".app-loader__mark");
  if (!mark) return;
  if (defaultMarkHtml === null) defaultMarkHtml = mark.innerHTML;
  const img = new Image();
  img.decoding = "async";
  img.alt = "";
  img.addEventListener("error", () => {
    // Restore the platform sigil rather than leaving a blank mark.
    if (defaultMarkHtml !== null) mark.innerHTML = defaultMarkHtml;
  });
  img.src = iconUrl;
  mark.replaceChildren(img);
}
