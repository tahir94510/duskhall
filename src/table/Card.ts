import { t } from "../i18n/index.js";
import { getActiveMode } from "../modes/active.js";
import { assetRoot } from "../modes/types.js";

// Card art convention: drop files into public/modes/<mode>/cards/ and the Vite plugin lists them
// in that folder's manifest.json. The loader fetches the active mode's manifest once (cached per
// mode) and only requests files that actually exist, so a fresh repo produces zero 404s. An
// optional back.<ext> in the same folder becomes the card-back image for modes that ship one.

interface CardManifest { available: Array<{ id: string; ext: string }> | string[]; }

// One cached manifest promise per mode asset root, so switching games re-fetches the new deck's
// art instead of serving the previous mode's paths.
const manifestByRoot = new Map<string, Promise<Map<string, string>>>();

function cardsBase(): string {
  return `${assetRoot(getActiveMode())}/cards`;
}

// Exported so the card-info tooltip can show a slice of the same art the card face uses, sharing
// this one cached manifest fetch (no second network call). Reads the ACTIVE mode's manifest.
export function loadManifest(): Promise<Map<string, string>> {
  const base = cardsBase();
  const cached = manifestByRoot.get(base);
  if (cached) return cached;
  const p = fetch(`${base}/manifest.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : { available: [] } as CardManifest))
    .catch(() => ({ available: [] } as CardManifest))
    .then((data: CardManifest) => {
      const map = new Map<string, string>();
      const list = Array.isArray((data as { available?: unknown }).available) ? data.available : [];
      for (const entry of list as Array<string | { id: string; ext?: string }>) {
        if (typeof entry === "string") {
          map.set(entry, `${base}/${entry}.webp`);
        } else if (entry && typeof entry.id === "string") {
          const ext = (entry.ext || "webp").replace(/^\./, "");
          map.set(entry.id, `${base}/${entry.id}.${ext}`);
        }
      }
      return map;
    });
  manifestByRoot.set(base, p);
  return p;
}

// Apply (or clear) the active mode's card-back image. A mode that declares hasCardBackImage and
// ships a back.<ext> paints it over the whole back face; otherwise the built-in CSS card back
// shows. Sets a CSS custom property + a root class so card.css can switch cleanly. Never 404s:
// only applied when the manifest actually lists a back.
export function applyCardBack(): Promise<void> {
  const mode = getActiveMode();
  const root = document.documentElement;
  return loadManifest().then((map) => {
    const url = mode.hasCardBackImage ? map.get("back") : undefined;
    if (url) {
      root.style.setProperty("--card-back-image", `url("${encodeURI(url)}")`);
      root.classList.add("has-card-back");
    } else {
      root.style.removeProperty("--card-back-image");
      root.classList.remove("has-card-back");
    }
  });
}

// Preload the art for a set of card defs and resolve once they have all settled (loaded or
// failed). Used by the loading screen so card faces never pop in after the table is shown. A
// per-image and overall timeout keeps a slow or missing asset from ever stalling the loader.
export function preloadCardArt(defIds: Iterable<string>, timeoutMs = 4000): Promise<void> {
  return loadManifest().then((map) => {
    const urls = new Set<string>();
    for (const def of defIds) {
      const url = map.get(def);
      if (url) urls.add(url);
    }
    const back = map.get("back");
    if (back && getActiveMode().hasCardBackImage) urls.add(back);
    if (urls.size === 0) return;
    const jobs = Array.from(urls).map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          let settled = false;
          const done = () => { if (!settled) { settled = true; resolve(); } };
          // Resolve only once the bitmap is DECODED, not merely downloaded, so a card face is
          // paint-ready the instant the table is revealed (no decode pop-in on first show).
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
  // Interior is empty by default; the visual identity lives on the card's border (CSS back) or on
  // the mode's back image (applied via the --card-back-image custom property, see applyCardBack).

  const front = document.createElement("div");
  front.className = "card__face card__face--front";
  front.dataset.role = "card-face";
  front.dataset.empty = "true";

  const img = document.createElement("img");
  img.className = "card__art";
  img.alt = "";
  img.draggable = false;
  img.dataset.loaded = "false";

  // A quality placeholder for a card whose art is not dropped in yet: the card's own name,
  // centered on the mode's dark ground, so an art-less deck reads clearly (never a blank or
  // broken image). It is covered the instant real art loads.
  const ph = document.createElement("span");
  ph.className = "card__ph";
  ph.setAttribute("aria-hidden", "true");
  ph.textContent = t(`cards.${defId}.name`);

  void loadManifest().then((map) => {
    const url = map.get(defId);
    if (!url) return; // silent, no art for this card yet: the name placeholder stays
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

  front.appendChild(ph);
  front.appendChild(img);

  inner.appendChild(back);
  inner.appendChild(front);
  card.appendChild(inner);

  refreshCardLabel(card, defId);
  return { el: card };
}

export function refreshCardLabel(el: HTMLDivElement, defId: string): void {
  el.setAttribute("aria-label", t(`cards.${defId}.name`));
  const ph = el.querySelector<HTMLElement>(".card__ph");
  if (ph) ph.textContent = t(`cards.${defId}.name`);
}
