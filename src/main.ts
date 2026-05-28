import "./styles/index.css";
import "./styles/boot.css";
import { detectLocale, loadLocale, t } from "./i18n/index.js";
import { loadConfig, type RuntimeConfig } from "./net/config.js";
import { RealtimeBus } from "./net/realtime.js";
import { Game } from "./game/Game.js";

function setMeta(name: string, content: string, attr: "name" | "property" = "name"): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function applyMeta(config: RuntimeConfig): void {
  const title = config.appName || t("meta.title");
  const description = t("meta.description") || t("rulesDoc.subtitle") || title;
  const origin = config.siteUrl || window.location.origin;
  const ogImage = config.socialOgImage || `${origin}/assets/og.svg`;
  const canonical = `${origin}${window.location.pathname}`;

  document.title = title;
  document.documentElement.setAttribute("lang", document.documentElement.getAttribute("lang") || "en");
  setMeta("description", description);
  setMeta("og:title", title, "property");
  setMeta("og:description", description, "property");
  setMeta("og:image", ogImage, "property");
  setMeta("og:url", canonical, "property");
  setMeta("og:type", "website", "property");
  setCanonical(canonical);
}

async function boot(): Promise<void> {
  const locale = detectLocale();
  await loadLocale(locale).catch(async () => {
    await loadLocale("en").catch(() => {});
  });
  const config = await loadConfig();
  applyMeta(config);
  const bus = new RealtimeBus(config);
  const host = document.getElementById("app");
  if (!host) return;
  const game = new Game({ host, bus, config });
  await game.mount();
}

function showBootFail(err: unknown): void {
  console.error("KABAL boot failed", err);
  const fail = document.getElementById("boot-fail");
  if (!fail) return;
  fail.removeAttribute("hidden");
  const btn = fail.querySelector<HTMLButtonElement>("[data-reload]");
  btn?.addEventListener("click", () => window.location.reload());
}

boot().catch(showBootFail);
