import { ICON_RULES, ICON_SUPPORT, ICON_LEAVE, ICON_LANG } from "./icons.js";
import { t, getLocale, loadLocale, type Locale } from "../i18n/index.js";

export interface HeaderHooks {
  onRules(): void;
  onSupport(): void;
  onLeave(): void;
  onLangChange(loc: Locale): void;
}

export class Header {
  el: HTMLElement;
  private brandMeta: HTMLDivElement;
  private roomCode: HTMLSpanElement;
  private timer: HTMLSpanElement;
  private rulesBtn: HTMLButtonElement;
  private supportBtn: HTMLButtonElement;
  private leaveBtn: HTMLButtonElement;
  private langBtn: HTMLButtonElement;
  private roomStart = performance.now();
  private timerHandle = 0;

  constructor(private hooks: HeaderHooks) {
    this.el = document.createElement("header");
    this.el.className = "header";
    this.el.innerHTML = `
      <a class="brand" href="/" data-role="brand" aria-label="KABAL">
        <span class="brand__mark"><img src="/assets/icon.svg" alt="" width="28" height="28"/></span>
        <span class="brand__meta"><span></span><span></span></span>
      </a>
      <div class="header__center">
        <div class="room-pill" title="${escapeHtml(t("ui.room"))}">
          <span class="room-label">${escapeHtml(t("ui.room"))}</span>
          <span class="room-code"></span>
        </div>
        <div class="timer-pill" title="${escapeHtml(t("ui.timer"))}">
          <span class="timer-label">${escapeHtml(t("ui.timer"))}</span>
          <span class="timer-value">00:00</span>
        </div>
      </div>
      <div class="header__right">
        <button type="button" class="icon-btn icon-btn--lang" data-action="lang" aria-label="${escapeHtml(t("ui.language"))}">${getLocale().toUpperCase()}</button>
        <button type="button" class="icon-btn" data-action="rules" aria-label="${escapeHtml(t("ui.rules"))}">${ICON_RULES}</button>
        <button type="button" class="icon-btn" data-action="support" aria-label="${escapeHtml(t("ui.support"))}">${ICON_SUPPORT}<span class="icon-btn__badge">1</span></button>
        <button type="button" class="icon-btn" data-action="leave" aria-label="${escapeHtml(t("ui.leave"))}">${ICON_LEAVE}</button>
      </div>
    `;
    this.brandMeta = this.el.querySelector(".brand__meta") as HTMLDivElement;
    this.roomCode = this.el.querySelector(".room-code") as HTMLSpanElement;
    this.timer = this.el.querySelector(".timer-value") as HTMLSpanElement;
    this.rulesBtn = this.el.querySelector('[data-action="rules"]') as HTMLButtonElement;
    this.supportBtn = this.el.querySelector('[data-action="support"]') as HTMLButtonElement;
    this.leaveBtn = this.el.querySelector('[data-action="leave"]') as HTMLButtonElement;
    this.langBtn = this.el.querySelector('[data-action="lang"]') as HTMLButtonElement;
    void ICON_LANG;
    this.refreshLocale();
    this.bind();
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
    this.leaveBtn.addEventListener("click", wrap(this.hooks.onLeave));
    this.langBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next: Locale = getLocale() === "en" ? "tr" : "en";
      void loadLocale(next).then(() => this.hooks.onLangChange(next));
    });
    const brand = this.el.querySelector<HTMLAnchorElement>('[data-role="brand"]');
    brand?.addEventListener("click", (e) => {
      e.preventDefault();
    });
  }

  refreshLocale(): void {
    const titleEls = this.brandMeta.querySelectorAll("span");
    if (titleEls.length >= 2) {
      titleEls[0]!.textContent = "KABAL";
      titleEls[1]!.textContent = t("meta.tagline");
    }
    const roomLabel = this.el.querySelector(".room-label");
    if (roomLabel) roomLabel.textContent = t("ui.room");
    const timerLabel = this.el.querySelector(".timer-label");
    if (timerLabel) timerLabel.textContent = t("ui.timer");
    this.rulesBtn.setAttribute("aria-label", t("ui.rules"));
    this.supportBtn.setAttribute("aria-label", t("ui.support"));
    this.leaveBtn.setAttribute("aria-label", t("ui.leave"));
    this.langBtn.textContent = getLocale().toUpperCase();
  }

  setRoom(slug: string): void {
    this.roomCode.textContent = slug.replace(/^KBL-/, "");
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
    const elapsedMs = performance.now() - this.roomStart;
    const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    this.timer.textContent = `${pad(m)}:${pad(s)}`;
  }

  destroy(): void {
    window.clearInterval(this.timerHandle);
  }
}

function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]!);
}
