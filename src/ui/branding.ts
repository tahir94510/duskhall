// Per-mode branding for the document head. Duskhall hosts several games; the tab title, share
// preview, favicon, and theme colour all follow the ACTIVE mode so the browser always reflects
// the game the player is looking at, while the platform name (config.appName, e.g. "Duskhall")
// frames it. Called at boot and again on every mode or locale change; social crawlers read the
// per-mode static HTML shell (see the Vite plugin), this keeps the live document in step.

import { t } from "../i18n/index.js";
import { getActiveMode } from "../modes/active.js";
import { assetRoot } from "../modes/types.js";
import { setLoaderMark } from "./loader.js";
import type { RuntimeConfig } from "../net/config.js";

function setMeta(name: string, content: string, attr: "name" | "property" = "name"): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string, extra?: Record<string, string>): void {
  const selector = extra?.media
    ? `link[rel="${rel}"][media="${extra.media}"]`
    : `link[rel="${rel}"]:not([media])`;
  let el = document.head.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    if (extra?.media) el.setAttribute("media", extra.media);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  if (extra?.type) el.setAttribute("type", extra.type);
}

// The system (platform) name, from runtime config, defaulting to Duskhall.
export function systemName(config: RuntimeConfig): string {
  return config.appName || "Duskhall";
}

// The browser tab / share title for the active mode: "<game> · <platform>". The game name is
// the mode's own localized meta.title; the platform name frames it.
export function brandTitle(config: RuntimeConfig): string {
  const system = systemName(config);
  const modeTitle = t("meta.title");
  const hasMode = modeTitle && modeTitle !== "meta.title";
  return hasMode ? `${modeTitle} · ${system}` : system;
}

// Apply the full branding surface for the active mode + locale. Idempotent.
export function applyBranding(config: RuntimeConfig): void {
  const mode = getActiveMode();
  const root = assetRoot(mode);
  const system = systemName(config);
  const title = brandTitle(config);
  const description = t("meta.description") || t("rulesDoc.subtitle") || title;
  const origin = config.siteUrl || window.location.origin;
  // Social scrapers reliably render PNG and mostly reject SVG, so the preview is the mode's PNG.
  const ogImage = config.socialOgImage || `${origin}${root}/brand/og.png`;
  const canonical = `${origin}${window.location.pathname}`;

  document.title = title;
  setMeta("description", description);
  setMeta("og:site_name", system, "property");
  setMeta("og:title", title, "property");
  setMeta("og:description", description, "property");
  setMeta("og:image", ogImage, "property");
  setMeta("twitter:image", ogImage);
  setMeta("og:url", canonical, "property");
  setMeta("og:type", "website", "property");

  // Canonical link.
  let canon = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canon) {
    canon = document.createElement("link");
    canon.setAttribute("rel", "canonical");
    document.head.appendChild(canon);
  }
  canon.setAttribute("href", canonical);

  // Favicons: swap to the mode's own brand mark. Missing files degrade to the browser default
  // (no console error), so a mode whose art is not dropped in yet still boots cleanly.
  setLink("icon", `${root}/brand/icon-dark.svg`, { media: "(prefers-color-scheme: dark)", type: "image/svg+xml" });
  setLink("icon", `${root}/brand/icon-light.svg`, { media: "(prefers-color-scheme: light)", type: "image/svg+xml" });
  setLink("icon", `${root}/brand/icon.svg`, { type: "image/svg+xml" });
  setLink("apple-touch-icon", `${root}/brand/icon.svg`);

  // The loading veil carries the active game's logo (falls back to the platform sigil if the
  // mode has no icon dropped in yet), so a boot or mode switch never shows a generic mark.
  setLoaderMark(`${root}/brand/icon.svg`);
}
