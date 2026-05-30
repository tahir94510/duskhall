import { t } from "../i18n/index.js";

// Card art convention: drop files into public/cards/ and list them in
// public/cards/manifest.json. The loader fetches the manifest once and only
// requests files that actually exist, so a fresh repo produces zero 404s in
// the browser console.

interface CardManifest { available: Array<{ id: string; ext: string }> | string[]; }

let manifestPromise: Promise<Map<string, string>> | null = null;

function loadManifest(): Promise<Map<string, string>> {
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

  refreshCardLabel(card, defId);
  return { el: card };
}

export function refreshCardLabel(el: HTMLDivElement, defId: string): void {
  el.setAttribute("aria-label", t(`cards.${defId}.name`));
}
