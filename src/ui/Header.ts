import { ICON_MORE, ICON_RULES, ICON_SUPPORT, ICON_RESET, ICON_SETTINGS, ICON_SHORTCUTS, ICON_TIMER } from "./icons.js";
import { t, getLocale, loadLocale, type Locale } from "../i18n/index.js";

export interface HeaderHooks {
  onRules(): void;
  onSupport(): void;
  onReset(): void;
  onSettings(): void;
  onShortcuts(): void;
  onLangChange(loc: Locale): void;
}

export class Header {
  el: HTMLElement;
  private moreBtn: HTMLButtonElement;
  private menu: HTMLDivElement;
  private timerVal: HTMLSpanElement;
  private brandLink: HTMLAnchorElement;
  private roomStart = performance.now();
  private timerHandle = 0;
  private menuOpen = false;

  constructor(private hooks: HeaderHooks) {
    this.el = document.createElement("header");
    this.el.className = "header";
    this.el.innerHTML = `
      <a class="brand" href="/" data-role="brand" aria-label="KABAL">
        <img src="/assets/icon.svg" alt="" width="30" height="30"/>
      </a>
      <button type="button" class="icon-btn header__more" data-action="more" aria-label="${esc(t("ui.menu"))}" aria-haspopup="true" aria-expanded="false">
        ${ICON_MORE}
        <span class="icon-btn__badge">1</span>
      </button>
      <div class="header__menu" role="menu" aria-hidden="true">
        <div class="header__menu-row header__menu-timer">
          <span class="header__menu-icon">${ICON_TIMER}</span>
          <span class="header__menu-label">${esc(t("ui.timer"))}</span>
          <span class="header__menu-value" data-role="timer">00:00</span>
        </div>
        <button type="button" class="header__menu-row" data-action="settings" role="menuitem">
          <span class="header__menu-icon">${ICON_SETTINGS}</span>
          <span class="header__menu-label" data-i18n="ui.settings">${esc(t("ui.settings"))}</span>
        </button>
        <button type="button" class="header__menu-row" data-action="rules" role="menuitem">
          <span class="header__menu-icon">${ICON_RULES}</span>
          <span class="header__menu-label" data-i18n="ui.rules">${esc(t("ui.rules"))}</span>
        </button>
        <button type="button" class="header__menu-row header__menu-row--badge" data-action="support" role="menuitem">
          <span class="header__menu-icon">${ICON_SUPPORT}</span>
          <span class="header__menu-label" data-i18n="ui.support">${esc(t("ui.support"))}</span>
          <span class="header__menu-pill">1</span>
        </button>
        <button type="button" class="header__menu-row" data-action="shortcuts" role="menuitem">
          <span class="header__menu-icon">${ICON_SHORTCUTS}</span>
          <span class="header__menu-label" data-i18n="ui.shortcuts">${esc(t("ui.shortcuts"))}</span>
        </button>
        <button type="button" class="header__menu-row header__menu-row--danger" data-action="reset" role="menuitem">
          <span class="header__menu-icon">${ICON_RESET}</span>
          <span class="header__menu-label" data-i18n="ui.reset">${esc(t("ui.reset"))}</span>
        </button>
        <div class="header__menu-divider"></div>
        <div class="header__menu-lang" role="group" aria-label="${esc(t("ui.language"))}">
          <button type="button" class="lang-pill" data-lang="en">EN</button>
          <button type="button" class="lang-pill" data-lang="tr">TR</button>
        </div>
      </div>
    `;
    this.brandLink = this.el.querySelector<HTMLAnchorElement>('[data-role="brand"]')!;
    this.moreBtn = this.el.querySelector<HTMLButtonElement>('[data-action="more"]')!;
    this.menu = this.el.querySelector<HTMLDivElement>(".header__menu")!;
    this.timerVal = this.menu.querySelector<HTMLSpanElement>('[data-role="timer"]')!;
    this.bind();
    this.refreshLocale();
    this.startTimer();
  }

  private bind(): void {
    this.brandLink.addEventListener("click", (e) => e.preventDefault());
    this.moreBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMenu();
    });
    document.addEventListener("pointerdown", (e) => {
      if (!this.menuOpen) return;
      const t = e.target;
      if (t instanceof Element && (this.menu.contains(t) || this.moreBtn.contains(t))) return;
      this.closeMenu();
    });
    // Any wheel scroll or key press outside the menu collapses it so the
    // table interaction never fights an open popover.
    document.addEventListener("wheel", () => { if (this.menuOpen) this.closeMenu(); }, { passive: true });
    document.addEventListener("keydown", (e) => {
      if (!this.menuOpen) return;
      if (e.key === "Escape" || (e.target instanceof Element && !this.menu.contains(e.target))) this.closeMenu();
    });
    const wrap = (cb: () => void) => (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.closeMenu();
      cb();
    };
    this.menu.querySelector<HTMLButtonElement>('[data-action="settings"]')?.addEventListener("click", wrap(this.hooks.onSettings));
    this.menu.querySelector<HTMLButtonElement>('[data-action="rules"]')?.addEventListener("click", wrap(this.hooks.onRules));
    this.menu.querySelector<HTMLButtonElement>('[data-action="support"]')?.addEventListener("click", wrap(this.hooks.onSupport));
    this.menu.querySelector<HTMLButtonElement>('[data-action="shortcuts"]')?.addEventListener("click", wrap(this.hooks.onShortcuts));
    this.menu.querySelector<HTMLButtonElement>('[data-action="reset"]')?.addEventListener("click", wrap(this.hooks.onReset));
    const switchLang = (loc: Locale) => (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (getLocale() === loc) return;
      void loadLocale(loc).then(() => this.hooks.onLangChange(loc));
    };
    this.menu.querySelector<HTMLButtonElement>('[data-lang="en"]')?.addEventListener("click", switchLang("en"));
    this.menu.querySelector<HTMLButtonElement>('[data-lang="tr"]')?.addEventListener("click", switchLang("tr"));
  }

  private toggleMenu(): void {
    if (this.menuOpen) this.closeMenu();
    else this.openMenu();
  }
  private openMenu(): void {
    this.menuOpen = true;
    this.menu.classList.add("is-visible");
    this.menu.setAttribute("aria-hidden", "false");
    this.moreBtn.setAttribute("aria-expanded", "true");
  }
  private closeMenu(): void {
    this.menuOpen = false;
    this.menu.classList.remove("is-visible");
    this.menu.setAttribute("aria-hidden", "true");
    this.moreBtn.setAttribute("aria-expanded", "false");
  }

  refreshLocale(): void {
    this.moreBtn.setAttribute("aria-label", t("ui.menu"));
    this.menu.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (key) el.textContent = t(key);
    });
    const tLabel = this.menu.querySelector<HTMLElement>(".header__menu-timer .header__menu-label");
    if (tLabel) tLabel.textContent = t("ui.timer");
    const loc = getLocale();
    this.menu.querySelector<HTMLButtonElement>('[data-lang="en"]')?.classList.toggle("is-active", loc === "en");
    this.menu.querySelector<HTMLButtonElement>('[data-lang="tr"]')?.classList.toggle("is-active", loc === "tr");
  }

  setRoom(_slug: string): void {
    this.roomStart = performance.now();
    this.tick();
  }

  resetTimer(): void { this.roomStart = performance.now(); this.tick(); }

  private startTimer(): void {
    this.tick();
    this.timerHandle = window.setInterval(() => this.tick(), 1000);
  }
  private tick(): void {
    const totalSec = Math.max(0, Math.floor((performance.now() - this.roomStart) / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    this.timerVal.textContent = `${pad(m)}:${pad(s)}`;
  }

  destroy(): void { window.clearInterval(this.timerHandle); }
}

function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]!);
}
