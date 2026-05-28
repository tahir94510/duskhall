import { ICON_RULES, ICON_SUPPORT, ICON_RESET, ICON_SETTINGS } from "./icons.js";
import { t, getLocale, loadLocale, type Locale } from "../i18n/index.js";

export interface HeaderHooks {
  onRules(): void;
  onSupport(): void;
  onReset(): void;
  onSettings(): void;
  onLangChange(loc: Locale): void;
}

export class Header {
  el: HTMLElement;
  private brandLink: HTMLAnchorElement;
  private timer: HTMLSpanElement;
  private rulesBtn: HTMLButtonElement;
  private supportBtn: HTMLButtonElement;
  private resetBtn: HTMLButtonElement;
  private settingsBtn: HTMLButtonElement;
  private langEn: HTMLButtonElement;
  private langTr: HTMLButtonElement;
  private roomStart = performance.now();
  private timerHandle = 0;

  constructor(private hooks: HeaderHooks) {
    this.el = document.createElement("header");
    this.el.className = "header";
    this.el.innerHTML = `
      <a class="brand" href="/" data-role="brand" aria-label="KABAL">
        <img src="/assets/icon.svg" alt="" width="32" height="32"/>
      </a>
      <div class="header__center">
        <div class="timer-pill" title="${escapeHtml(t("ui.timer"))}">
          <span class="timer-value">00:00</span>
        </div>
      </div>
      <div class="header__right">
        <div class="lang-toggle" role="group" aria-label="${escapeHtml(t("ui.language"))}">
          <button type="button" class="lang-toggle__btn" data-lang="en">EN</button>
          <button type="button" class="lang-toggle__btn" data-lang="tr">TR</button>
        </div>
        <button type="button" class="icon-btn" data-action="settings" aria-label="${escapeHtml(t("ui.settings"))}">${ICON_SETTINGS}</button>
        <button type="button" class="icon-btn" data-action="rules" aria-label="${escapeHtml(t("ui.rules"))}">${ICON_RULES}</button>
        <button type="button" class="icon-btn" data-action="support" aria-label="${escapeHtml(t("ui.support"))}">${ICON_SUPPORT}<span class="icon-btn__badge">1</span></button>
        <button type="button" class="icon-btn" data-action="reset" aria-label="${escapeHtml(t("ui.reset"))}">${ICON_RESET}</button>
      </div>
    `;
    this.brandLink = this.el.querySelector<HTMLAnchorElement>('[data-role="brand"]')!;
    this.timer = this.el.querySelector(".timer-value") as HTMLSpanElement;
    this.rulesBtn = this.el.querySelector('[data-action="rules"]') as HTMLButtonElement;
    this.supportBtn = this.el.querySelector('[data-action="support"]') as HTMLButtonElement;
    this.resetBtn = this.el.querySelector('[data-action="reset"]') as HTMLButtonElement;
    this.settingsBtn = this.el.querySelector('[data-action="settings"]') as HTMLButtonElement;
    this.langEn = this.el.querySelector('[data-lang="en"]') as HTMLButtonElement;
    this.langTr = this.el.querySelector('[data-lang="tr"]') as HTMLButtonElement;
    this.bind();
    this.refreshLocale();
    this.startTimer();
  }

  private bind(): void {
    const wrap = (cb: () => void) => (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cb();
    };
    this.rulesBtn.addEventListener("click", wrap(this.hooks.onRules));
    this.supportBtn.addEventListener("click", wrap(this.hooks.onSupport));
    this.resetBtn.addEventListener("click", wrap(this.hooks.onReset));
    this.settingsBtn.addEventListener("click", wrap(this.hooks.onSettings));
    this.brandLink.addEventListener("click", (e) => e.preventDefault());
    const switchLang = (loc: Locale) => (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (getLocale() === loc) return;
      void loadLocale(loc).then(() => this.hooks.onLangChange(loc));
    };
    this.langEn.addEventListener("click", switchLang("en"));
    this.langTr.addEventListener("click", switchLang("tr"));
  }

  refreshLocale(): void {
    this.rulesBtn.setAttribute("aria-label", t("ui.rules"));
    this.supportBtn.setAttribute("aria-label", t("ui.support"));
    this.resetBtn.setAttribute("aria-label", t("ui.reset"));
    this.settingsBtn.setAttribute("aria-label", t("ui.settings"));
    const loc = getLocale();
    this.langEn.classList.toggle("is-active", loc === "en");
    this.langTr.classList.toggle("is-active", loc === "tr");
  }

  setRoom(_slug: string): void {
    this.roomStart = performance.now();
    this.tick();
  }

  resetTimer(): void {
    this.roomStart = performance.now();
    this.tick();
  }

  private startTimer(): void {
    this.tick();
    this.timerHandle = window.setInterval(() => this.tick(), 1000);
  }

  private tick(): void {
    const totalSec = Math.max(0, Math.floor((performance.now() - this.roomStart) / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    this.timer.textContent = `${pad(m)}:${pad(s)}`;
  }

  destroy(): void { window.clearInterval(this.timerHandle); }
}

function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]!);
}
