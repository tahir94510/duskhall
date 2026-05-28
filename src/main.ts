import "./styles/index.css";
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

boot().catch((err) => {
  console.error("KABAL boot failed", err);
  const host = document.getElementById("app");
  if (host) {
    host.innerHTML = `
      <div style="position:fixed;inset:0;display:grid;place-items:center;color:#f3efe5;font-family:Inter,sans-serif;text-align:center;padding:32px;">
        <div>
          <h1 style="font-family:Cinzel,serif;letter-spacing:.18em;">KABAL</h1>
          <p>An unexpected error has occurred. Please refresh the page.</p>
        </div>
      </div>
    `;
  }
});
