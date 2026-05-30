import { ICON_MORE, ICON_RULES, ICON_SUPPORT, ICON_RESET, ICON_RESET_DECK, ICON_SETTINGS, ICON_SHORTCUTS, ICON_TIMER, ICON_ROOM, ICON_JOIN, ICON_COPY } from "./icons.js";
import { t, getLocale, loadLocale, type Locale } from "../i18n/index.js";
import { inviteUrl } from "../net/room.js";

export interface HeaderHooks {
  onRules(): void;
  onSupport(): void;
  onReset(): void;
  onResetDeck(): void;
  onSettings(): void;
  onShortcuts(): void;
  onLangChange(loc: Locale): void;
  /** Connect to a specific room by its 6-char code. */
  onJoinRoom(code: string): void;
}

export class Header {
  el: HTMLElement;
  private moreBtn: HTMLButtonElement;
  private menu: HTMLDivElement;
  private timerVal: HTMLElement;
  private roomVal: HTMLElement;
  private brandLink: HTMLAnchorElement;
  private roomStart = performance.now();
  private roomSlug = "";
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
      <div class="header__menu" role="menu">
        <div class="header__menu-row header__menu-row--static">
          <span class="header__menu-icon">${ICON_ROOM}</span>
          <span class="header__menu-label" data-i18n="ui.roomCode">${esc(t("ui.roomCode"))}</span>
          <button type="button" class="header__secret is-blurred" data-action="reveal" data-role="room" title="${esc(t("ui.reveal"))}">------</button>
          <button type="button" class="icon-btn icon-btn--sm" data-action="room-copy" aria-label="${esc(t("ui.copyLink"))}" title="${esc(t("ui.copyLink"))}">${ICON_COPY}</button>
        </div>
        <div class="header__menu-row header__menu-row--static header__menu-timer">
          <span class="header__menu-icon">${ICON_TIMER}</span>
          <span class="header__menu-label">${esc(t("ui.timer"))}</span>
          <button type="button" class="header__secret is-blurred" data-action="reveal" data-role="timer">00:00</button>
        </div>
        <form class="header__join" data-role="join-form">
          <input class="header__join-input" data-role="join-input" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(t("ui.joinPlaceholder"))}" aria-label="${esc(t("ui.joinAria"))}" />
          <button type="submit" class="header__join-btn" data-action="join" title="${esc(t("ui.join"))}">${ICON_JOIN}<span data-i18n="ui.join">${esc(t("ui.join"))}</span></button>
        </form>
        <div class="header__menu-divider"></div>
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
        <div class="header__menu-divider"></div>
        <button type="button" class="header__menu-row" data-action="reset-deck" role="menuitem">
          <span class="header__menu-icon">${ICON_RESET_DECK}</span>
          <span class="header__menu-label" data-i18n="ui.resetDeck">${esc(t("ui.resetDeck"))}</span>
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
    // Closed menu is `inert`: it removes the children from the focus order
    // AND hides them from assistive tech, so focus can never get stuck inside a
    // hidden subtree (the cause of the "aria-hidden on a focused element" warn).
    this.menu.inert = true;
    this.timerVal = this.menu.querySelector<HTMLElement>('[data-role="timer"]')!;
    this.roomVal = this.menu.querySelector<HTMLElement>('[data-role="room"]')!;
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
    this.menu.querySelector<HTMLButtonElement>('[data-action="reset-deck"]')?.addEventListener("click", wrap(this.hooks.onResetDeck));
    this.menu.querySelector<HTMLButtonElement>('[data-action="reset"]')?.addEventListener("click", wrap(this.hooks.onReset));
    const switchLang = (loc: Locale) => (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (getLocale() === loc) return;
      void loadLocale(loc).then(() => this.hooks.onLangChange(loc));
    };
    this.menu.querySelector<HTMLButtonElement>('[data-lang="en"]')?.addEventListener("click", switchLang("en"));
    this.menu.querySelector<HTMLButtonElement>('[data-lang="tr"]')?.addEventListener("click", switchLang("tr"));

    // Reveal/blur a secret (room code or timer) on click; the menu does not
    // close so you can read it, copy it, then re-blur with another click.
    this.menu.querySelectorAll<HTMLButtonElement>('[data-action="reveal"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.toggle("is-blurred");
      });
    });

    // Copy the invite link for the current room.
    this.menu.querySelector<HTMLButtonElement>('[data-action="room-copy"]')?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.roomSlug) return;
      void navigator.clipboard?.writeText(inviteUrl(this.roomSlug)).catch(() => {});
    });

    // Join a room by code.
    const joinForm = this.menu.querySelector<HTMLFormElement>('[data-role="join-form"]');
    const joinInput = this.menu.querySelector<HTMLInputElement>('[data-role="join-input"]');
    joinForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const code = (joinInput?.value || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        joinInput?.classList.add("is-error");
        window.setTimeout(() => joinInput?.classList.remove("is-error"), 600);
        return;
      }
      if (code === this.roomSlug) { this.closeMenu(); return; }
      if (joinInput) joinInput.value = "";
      this.closeMenu();
      this.hooks.onJoinRoom(code);
    });
    // Keep typing inside the input from bubbling out and closing the menu.
    joinInput?.addEventListener("keydown", (e) => e.stopPropagation());
    joinInput?.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  private toggleMenu(): void {
    if (this.menuOpen) this.closeMenu();
    else this.openMenu();
  }
  private openMenu(): void {
    this.menuOpen = true;
    this.menu.inert = false;
    this.menu.classList.add("is-visible");
    this.moreBtn.setAttribute("aria-expanded", "true");
    // Secrets (room code, timer) always start blurred each time the menu opens.
    this.menu.querySelectorAll<HTMLElement>(".header__secret").forEach((s) => s.classList.add("is-blurred"));
  }
  private closeMenu(): void {
    this.menuOpen = false;
    this.menu.classList.remove("is-visible");
    // Pull focus out of the menu BEFORE making it inert, so we never strand the
    // keyboard focus in a hidden region.
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.menu.contains(active)) this.moreBtn.focus();
    this.menu.inert = true;
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
    for (const code of ["en", "tr"] as const) {
      const pill = this.menu.querySelector<HTMLButtonElement>(`[data-lang="${code}"]`);
      if (!pill) continue;
      const active = loc === code;
      pill.classList.toggle("is-active", active);
      pill.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  setRoom(slug: string): void {
    this.roomSlug = slug;
    this.roomVal.textContent = slug || "------";
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
