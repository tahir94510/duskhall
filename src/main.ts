import "./styles/index.css";
import "./styles/boot.css";
import { migrateStorageNamespace } from "./util/storageMigrate.js";
import { detectLocale, loadLocale } from "./i18n/index.js";
import { loadConfig } from "./net/config.js";
import { RealtimeBus } from "./net/realtime.js";
import { Game } from "./game/Game.js";
import { hideLoader } from "./ui/loader.js";
import { resolveLocation } from "./net/room.js";
import { setActiveMode, writeStoredModeId } from "./modes/active.js";
import { applyBranding } from "./ui/branding.js";

async function boot(): Promise<void> {
  // Bring any pre-Duskhall storage (language, volumes, one-shot flags) into the new namespace
  // before anything reads a preference.
  migrateStorageNamespace();

  // Decide which game (mode) and room this URL opens, and migrate legacy links.
  const loc = resolveLocation();
  if (loc.redirect) {
    window.location.replace(loc.redirect);
    return;
  }
  setActiveMode(loc.mode);
  writeStoredModeId(loc.mode);

  const locale = detectLocale();
  await loadLocale(locale, loc.mode).catch(async () => {
    await loadLocale("en", loc.mode).catch(() => {});
  });
  const config = await loadConfig();
  applyBranding(config);
  const bus = new RealtimeBus(config);
  const host = document.getElementById("app");
  if (!host) return;
  const game = new Game({ host, bus, config, slug: loc.slug });
  await game.mount();
  hideLoader();
  // First-ever visit on this device: auto-open the About panel once, then the one-time welcome
  // hint with the core gestures (each a one-shot flag).
  game.showFirstRunHints();
}

function showBootFail(err: unknown): void {
  console.error("Duskhall boot failed", err);
  // Drop the loader so the failure card is visible.
  document.getElementById("app-loader")?.remove();
  const fail = document.getElementById("boot-fail");
  if (!fail) return;
  fail.removeAttribute("hidden");
  const btn = fail.querySelector<HTMLButtonElement>("[data-reload]");
  btn?.addEventListener("click", () => window.location.reload());
}

boot().catch(showBootFail);
