// Full-bleed table background art. Drop one image into public/background/ and
// list it in public/background/manifest.json (the Vite plugin writes that file
// for you from whatever is in the folder). The image is painted on a fixed,
// viewport-filling layer behind everything, so it covers the whole screen at any
// seat with no black bars and never clips. It is intentionally separate from the
// card art (public/cards/) and the card back, so the two asset sets never mix.
//
// When the folder is empty no request is made and an elegant built-in gradient
// surface (defined in CSS) shows through, so a fresh checkout shows zero 404s.

interface BackgroundManifest {
  available: Array<{ id: string; ext: string }> | string[];
}

let urlPromise: Promise<string | null> | null = null;

function resolveBackgroundUrl(): Promise<string | null> {
  if (urlPromise) return urlPromise;
  urlPromise = fetch("/background/manifest.json", { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<BackgroundManifest>) : { available: [] }))
    .catch(() => ({ available: [] } as BackgroundManifest))
    .then((data) => {
      const list = Array.isArray(data?.available) ? data.available : [];
      const first = list[0];
      if (!first) return null;
      if (typeof first === "string") return `/background/${first}`;
      const ext = (first.ext || "webp").replace(/^\./, "");
      return `/background/${first.id}.${ext}`;
    });
  return urlPromise;
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
