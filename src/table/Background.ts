// Table-surface background art. Drop one image into public/background/ and list
// it in public/background/manifest.json (the Vite plugin writes that file for
// you from whatever is in the folder). The image is painted on a layer inside
// the rotating board, so it behaves as the shared table felt: every seat sees
// the same surface, turned to match their own viewpoint. This is intentionally
// separate from the card backs (public/cards/) so the two asset sets never mix.
//
// When the folder is empty no request is made and the board keeps its default
// noble dark surface, so a fresh checkout shows zero 404s in the console.

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

// Paint the resolved background onto the given layer. If no image is configured
// the layer stays empty and the default surface (defined in CSS) shows through.
export function applyTableBackground(layer: HTMLElement): Promise<void> {
  return resolveBackgroundUrl().then((url) => {
    if (!url) return;
    // Preload first so the felt never flashes a half-loaded image.
    const probe = new Image();
    probe.onload = () => {
      layer.style.backgroundImage = `url("${url}")`;
      layer.classList.add("is-loaded");
    };
    probe.onerror = () => {
      // Keep the default surface; stay quiet so the console stays clean.
    };
    probe.src = url;
  });
}
