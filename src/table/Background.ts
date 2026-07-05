// Full-bleed table background art. Drop one image into public/modes/<mode>/background/ and the
// Vite plugin writes that folder's manifest.json from whatever is there. The image is painted on a
// fixed, viewport-filling layer behind everything, so it covers the whole screen at any seat with
// no black bars and never clips. It is intentionally separate from the card art and card back, so
// the asset sets never mix.
//
// When the folder is empty no request is made and an elegant built-in gradient surface (defined in
// CSS) shows through, so a fresh checkout shows zero 404s. Cached per mode asset root so switching
// games loads the new surface.

import { getActiveMode } from "../modes/active.js";
import { assetRoot } from "../modes/types.js";

interface BackgroundManifest {
  available: Array<{ id: string; ext: string }> | string[];
}

const urlByRoot = new Map<string, Promise<string | null>>();

function backgroundBase(): string {
  return `${assetRoot(getActiveMode())}/background`;
}

function resolveBackgroundUrl(): Promise<string | null> {
  const base = backgroundBase();
  const cached = urlByRoot.get(base);
  if (cached) return cached;
  const p = fetch(`${base}/manifest.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<BackgroundManifest>) : { available: [] }))
    .catch(() => ({ available: [] } as BackgroundManifest))
    .then((data) => {
      const list = Array.isArray(data?.available) ? data.available : [];
      const first = list[0];
      if (!first) return null;
      if (typeof first === "string") return `${base}/${first}`;
      const ext = (first.ext || "webp").replace(/^\./, "");
      return `${base}/${first.id}.${ext}`;
    });
  urlByRoot.set(base, p);
  return p;
}

// Clear the painted surface (used on a mode switch before the new one loads) so the previous
// game's table never lingers behind the new deck.
export function clearTableBackground(layer: HTMLElement): void {
  layer.style.backgroundImage = "";
  layer.classList.remove("is-loaded");
}

// Resolve, preload and paint the background onto the given layer. The returned
// promise settles once the image has loaded (or once we know there is none), so
// the loading screen can wait on it and the surface never flashes in half-drawn.
// If no image is configured, the built-in CSS gradient stays in place.
export function applyTableBackground(layer: HTMLElement): Promise<void> {
  return resolveBackgroundUrl().then(
    (url) =>
      new Promise<void>((resolve) => {
        if (!url) { resolve(); return; }
        const probe = new Image();
        let settled = false;
        const paint = () => {
          if (settled) return;
          settled = true;
          layer.style.backgroundImage = `url("${url}")`;
          layer.classList.add("is-loaded");
          resolve();
        };
        // Decode before painting so the surface never flashes in half-drawn on first
        // reveal (guarded for older browsers; decode failure falls back to a plain paint).
        probe.onload = () => {
          if (typeof probe.decode === "function") probe.decode().then(paint, paint);
          else paint();
        };
        // Keep the default gradient surface on error; stay quiet for a clean console.
        probe.onerror = () => resolve();
        probe.src = url;
      })
  );
}
