import { t } from "../i18n/index.js";

// Card art convention: drop files into public/cards/ and list them in
// public/cards/manifest.json. The loader fetches the manifest once and only
// requests files that actually exist, so a fresh repo produces zero 404s in
// the browser console.

interface CardManifest { available: Array<{ id: string; ext: string }> | string[]; }

let manifestPromise: Promise<Map<string, string>> | null = null;

// Exported so the card-info tooltip can show a slice of the same art the card
// face uses, sharing this one cached manifest fetch (no second network call).
export function loadManifest(): Promise<Map<string, string>> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch("/cards/manifest.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : { available: [] } as CardManifest))
    .catch(() => ({ available: [] } as CardManifest))
    .then((data: CardManifest) => {
      const map = new Map<string, string>();
      const list = Array.isArray((data as { available?: unknown }).available) ? data.available : [];
      for (const entry of list as Array<string | { id: string; ext?: string }>) {
        if (typeof entry === "string") {
          // assume default ext webp
          map.set(entry, `/cards/${entry}.webp`);
        } else if (entry && typeof entry.id === "string") {
          const ext = (entry.ext || "webp").replace(/^\./, "");
          map.set(entry.id, `/cards/${entry.id}.${ext}`);
        }
      }
      return map;
    });
  return manifestPromise;
}

// Preload the art for a set of card defs and resolve once they have all settled
// (loaded or failed). Used by the loading screen so card faces never pop in
// after the table is shown. A per-image and overall timeout keeps a slow or
// missing asset from ever stalling the loader.
export function preloadCardArt(defIds: Iterable<string>, timeoutMs = 4000): Promise<void> {
  return loadManifest().then((map) => {
    const urls = new Set<string>();
    for (const def of defIds) {
      const url = map.get(def);
      if (url) urls.add(url);
    }
    if (urls.size === 0) return;
    const jobs = Array.from(urls).map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          let settled = false;
          const done = () => { if (!settled) { settled = true; resolve(); } };
          // Resolve only once the bitmap is DECODED, not merely downloaded, so a card
          // face is paint-ready the instant the table is revealed (no decode pop-in on
          // first show). decode() is guarded for older browsers and never rejects the job.
          const decodeThenDone = () => {
            if (typeof img.decode === "function") img.decode().then(done, done);
            else done();
          };
          img.onload = decodeThenDone;
          img.onerror = done;
          img.src = url;
          if (img.complete) decodeThenDone();
        })
    );
    const all = Promise.all(jobs).then(() => undefined);
    const cap = new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs));
    return Promise.race([all, cap]);
  });
}

export function createCardElement(instanceId: string, defId: string): { el: HTMLDivElement } {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = instanceId;
  card.dataset.def = defId;
  card.setAttribute("role", "img");
  card.setAttribute("tabindex", "-1");

  const inner = document.createElement("div");
  inner.className = "card__inner";

  const back = document.createElement("div");
  back.className = "card__face card__face--back";
  // Empty interior; the entire visual identity lives on the card's border.

  const front = document.createElement("div");
  front.className = "card__face card__face--front";
  front.dataset.role = "card-face";
  front.dataset.empty = "true";

  const img = document.createElement("img");
  img.className = "card__art";
  img.alt = "";
  img.draggable = false;
  img.dataset.loaded = "false";

  void loadManifest().then((map) => {
    const url = map.get(defId);
    if (!url) return; // silent, no art for this card yet
    img.onload = () => {
      front.dataset.empty = "false";
      img.dataset.loaded = "true";
    };
    img.onerror = () => {
      // Quietly give up, keep the placeholder, no console noise.
      img.removeAttribute("src");
    };
    img.src = url;
  });

  front.appendChild(img);

  inner.appendChild(back);
  inner.appendChild(front);
  card.appendChild(inner);

  // Stack-count badge: a small number in the card's top-left corner shown only when this card is
  // covering at least one other (its pile has more than one card). It lives OUTSIDE .card__inner so
  // it never flips with the face and is never blurred with a concealed back; the render loop sets
  // its text and toggles .has-stack. aria-hidden: it is a visual aid, not announced.
  const count = document.createElement("div");
  count.className = "card__count";
  count.setAttribute("aria-hidden", "true");
  card.appendChild(count);

  refreshCardLabel(card, defId);
  return { el: card };
}

export function refreshCardLabel(el: HTMLDivElement, defId: string): void {
  el.setAttribute("aria-label", t(`cards.${defId}.name`));
}
