import "./styles/index.css";
import "./styles/boot.css";
import { detectLocale, loadLocale, t } from "./i18n/index.js";
import { loadConfig } from "./net/config.js";
import { RealtimeBus } from "./net/realtime.js";
import { Game } from "./game/Game.js";

async function boot(): Promise<void> {
  const locale = detectLocale();
  await loadLocale(locale).catch(async () => {
    await loadLocale("en").catch(() => {});
  });
  document.title = t("meta.title");
  const config = await loadConfig();
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
