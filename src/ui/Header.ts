import { ICON_MORE, ICON_RULES, ICON_SUPPORT, ICON_RESET_DECK, ICON_SETTINGS, ICON_SHORTCUTS, ICON_TIMER, ICON_ROOM, ICON_COPY, ICON_PASTE, ICON_EYE, ICON_EXIT, ICON_FEEDBACK, ICON_INFO } from "./icons.js";
import { t } from "../i18n/index.js";
import { inviteUrl, parseRoomInput } from "../net/room.js";
import { flashConfirm } from "./feedback.js";
import { toast } from "./Toast.js";

export interface HeaderHooks {
  onRules(): void;
  onSupport(): void;
  onFeedback(): void;
  onLegal(): void;
  onReset(): void;
  onResetDeck(): void;
  onSettings(): void;
  onShortcuts(): void;
  /** Connect to a specific room by its 6-char code. */
  onJoinRoom(code: string): void;
  /** A pasted code/link resolved to `code`: ask the player to confirm the switch
   *  (owns the modal in Game), then join. */
  onPasteJoin(code: string): void;
  /** Run the Supabase connection self-test. */
  onDiagnose(): void;
}

export class Header {
  el: HTMLElement;
  private moreBtn: HTMLButtonElement;
  private menu: HTMLDivElement;
  private timerVal: HTMLElement;
  private roomVal: HTMLElement;
  private spectatorRow: HTMLElement;
  private spectatorVal: HTMLElement;
  private connRow: HTMLElement;
  private connVal: HTMLElement;
  private conn: "online" | "connecting" | "offline" = "connecting";
  private roomStart = performance.now();
  private roomSlug = "";
  private timerHandle = 0;
  private menuOpen = false;
  private spectator = false;
  private host = true;

  constructor(private hooks: HeaderHooks) {
    this.el = document.createElement("header");
    this.el.className = "header";
    this.el.innerHTML = `
      <span class="brand" data-role="brand" role="img" aria-label="Vaerum">
        <img src="/assets/icon.svg" alt="" width="28" height="37"/>
      </span>
      <button type="button" class="icon-btn header__more" data-action="more" aria-label="${esc(t("ui.menu"))}" aria-haspopup="true" aria-expanded="false">
        ${ICON_MORE}
        <span class="icon-btn__badge" data-role="more-badge" aria-hidden="true">1</span>
      </button>
      <div class="header__menu" role="menu">
        <div class="header__menu-row header__menu-row--static">
          <span class="header__menu-icon">${ICON_ROOM}</span>
          <span class="header__menu-label" data-i18n="ui.roomCode">${esc(t("ui.roomCode"))}</span>
          <button type="button" class="header__code header__code--secret is-blurred" data-role="room" data-action="room-reveal" title="${esc(t("ui.reveal"))}" aria-label="${esc(t("ui.reveal"))}">------</button>
          <button type="button" class="icon-btn icon-btn--sm" data-action="room-copy" aria-label="${esc(t("ui.copyLink"))}" title="${esc(t("ui.copyLink"))}">${ICON_COPY}</button>
          <button type="button" class="icon-btn icon-btn--sm" data-action="room-paste" aria-label="${esc(t("ui.pasteJoin"))}" title="${esc(t("ui.pasteJoin"))}">${ICON_PASTE}</button>
        </div>
        <div class="header__menu-row header__menu-row--static header__menu-timer">
          <span class="header__menu-icon">${ICON_TIMER}</span>
          <span class="header__menu-label">${esc(t("ui.timer"))}</span>
          <span class="header__code" data-role="timer">00:00</span>
        </div>
        <div class="header__menu-row header__menu-row--static header__menu-spectators" data-role="spectator-row" hidden>
          <span class="header__menu-icon">${ICON_EYE}</span>
          <span class="header__menu-label" data-i18n="ui.spectators">${esc(t("ui.spectators"))}</span>
          <span class="header__code" data-role="spectators">0</span>
        </div>
        <button type="button" class="header__menu-row header__menu-row--conn" data-role="conn-row" data-action="diagnose" data-conn="connecting" title="${esc(t("diag.run"))}">
          <span class="header__menu-icon"><span class="conn-dot" aria-hidden="true"></span></span>
          <span class="header__menu-label" data-i18n="ui.connection">${esc(t("ui.connection"))}</span>
          <span class="header__code header__code--plain" data-role="conn">${esc(t("ui.connConnecting"))}</span>
        </button>
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
          <span class="header__row-badge" aria-hidden="true">1</span>
        </button>
        <button type="button" class="header__menu-row" data-action="shortcuts" role="menuitem">
          <span class="header__menu-icon">${ICON_SHORTCUTS}</span>
          <span class="header__menu-label" data-i18n="ui.shortcuts">${esc(t("ui.shortcuts"))}</span>
        </button>
        <button type="button" class="header__menu-row" data-action="legal" role="menuitem">
          <span class="header__menu-icon">${ICON_INFO}</span>
          <span class="header__menu-label" data-i18n="ui.legal">${esc(t("ui.legal"))}</span>
        </button>
        <button type="button" class="header__menu-row" data-action="feedback" role="menuitem" data-role="feedback" hidden>
          <span class="header__menu-icon">${ICON_FEEDBACK}</span>
          <span class="header__menu-label" data-i18n="ui.feedback">${esc(t("ui.feedback"))}</span>
        </button>
        <div class="header__menu-divider" data-role="play-divider"></div>
        <button type="button" class="header__menu-row" data-action="reset-deck" role="menuitem" data-role="reset-deck">
          <span class="header__menu-icon">${ICON_RESET_DECK}</span>
          <span class="header__menu-label" data-i18n="ui.resetDeck">${esc(t("ui.resetDeck"))}</span>
        </button>
        <button type="button" class="header__menu-row header__menu-row--danger" data-action="reset" role="menuitem" data-role="reset-room">
          <span class="header__menu-icon">${ICON_EXIT}</span>
          <span class="header__menu-label" data-i18n="ui.exit">${esc(t("ui.exit"))}</span>
        </button>
      </div>
    `;
    this.moreBtn = this.el.querySelector<HTMLButtonElement>('[data-action="more"]')!;
    this.menu = this.el.querySelector<HTMLDivElement>(".header__menu")!;
    // Closed menu is `inert`: removed from focus order AND hidden from assistive
    // tech so focus can never get stuck inside a hidden subtree.
    this.menu.inert = true;
    this.timerVal = this.menu.querySelector<HTMLElement>('[data-role="timer"]')!;
    this.roomVal = this.menu.querySelector<HTMLElement>('[data-role="room"]')!;
    this.spectatorRow = this.menu.querySelector<HTMLElement>('[data-role="spectator-row"]')!;
    this.spectatorVal = this.menu.querySelector<HTMLElement>('[data-role="spectators"]')!;
    this.connRow = this.menu.querySelector<HTMLElement>('[data-role="conn-row"]')!;
    this.connVal = this.menu.querySelector<HTMLElement>('[data-role="conn"]')!;
    this.bind();
    this.refreshLocale();
    this.startTimer();
  }

  private bind(): void {
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
    document.addEventListener("wheel", () => { if (this.menuOpen) this.closeMenu(); }, { passive: true });
    document.addEventListener("keydown", (e) => {
      if (!this.menuOpen) return;
      // Esc is a keyboard action, so it returns focus to the trigger; a keydown
      // outside the menu (e.g. a game shortcut) just closes it without grabbing
      // focus (which would otherwise flash a focus-visible outline).
      if (e.key === "Escape") this.closeMenu(true);
      else if (e.target instanceof Element && !this.menu.contains(e.target)) this.closeMenu();
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
    this.menu.querySelector<HTMLButtonElement>('[data-action="feedback"]')?.addEventListener("click", wrap(this.hooks.onFeedback));
    this.menu.querySelector<HTMLButtonElement>('[data-action="shortcuts"]')?.addEventListener("click", wrap(this.hooks.onShortcuts));
    this.menu.querySelector<HTMLButtonElement>('[data-action="legal"]')?.addEventListener("click", wrap(this.hooks.onLegal));
    this.menu.querySelector<HTMLButtonElement>('[data-action="reset-deck"]')?.addEventListener("click", wrap(this.hooks.onResetDeck));
    this.menu.querySelector<HTMLButtonElement>('[data-action="reset"]')?.addEventListener("click", wrap(this.hooks.onReset));
    // Connection row doubles as the "run the self-test" button. It does NOT close
    // the menu — the test opens its own modal on top.
    this.menu.querySelector<HTMLButtonElement>('[data-action="diagnose"]')?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hooks.onDiagnose();
    });

    // Copy the invite link for the current room (icon briefly turns to a check).
    this.menu.querySelector<HTMLButtonElement>('[data-action="room-copy"]')?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.roomSlug) return;
      const btn = e.currentTarget as HTMLElement;
      void navigator.clipboard?.writeText(inviteUrl(this.roomSlug)).then(() => {
        flashConfirm(btn);
        toast(t("ui.linkCopied"));
      }).catch(() => {});
    });

    // Paste a code OR an invite link from the clipboard and join that room.
    this.menu.querySelector<HTMLButtonElement>('[data-action="room-paste"]')?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget as HTMLElement;
      let text = "";
      try { text = (await navigator.clipboard?.readText()) || ""; } catch { text = ""; }
      const code = parseRoomInput(text);
      if (!code) {
        btn.classList.add("is-error");
        window.setTimeout(() => btn.classList.remove("is-error"), 600);
        toast(t("ui.invalidCode"));
        return;
      }
      // Already in this room: nothing to do (no modal, no spurious second control).
      if (code === this.roomSlug) { toast(t("ui.joined")); return; }
      // Ask for a clear confirmation ("Switch to room <CODE>?") before leaving the
      // current table — Game owns the modal. The menu closes so no extra paste
      // affordance lingers behind the dialog.
      this.closeMenu();
      this.hooks.onPasteJoin(code);
    });

    // Room code is blurred by default; clicking it reveals, clicking again hides.
    // It re-blurs every time the menu (re)opens (see openMenu).
    this.roomVal.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.roomVal.classList.toggle("is-blurred");
    });
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
    // Without exception, the room code is blurred on every open; the user taps it
    // to reveal. This keeps the code from being exposed at a glance to onlookers.
    this.roomVal.classList.add("is-blurred");
  }
  // `returnFocus` is only true for keyboard-driven closes (Esc). For pointer /
  // wheel / outside closes we must NOT programmatically focus the more-button:
  // doing so while keyboard modality is briefly active (e.g. right after a
  // Shift/Ctrl keydown) makes :focus-visible paint a stray white outline on the
  // button. Instead we just drop focus out of the (about-to-be-inert) menu.
  private closeMenu(returnFocus = false): void {
    this.menuOpen = false;
    this.menu.classList.remove("is-visible");
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.menu.contains(active)) {
      if (returnFocus) this.moreBtn.focus();
      else active.blur();
    }
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
    this.menu.querySelector<HTMLButtonElement>('[data-action="room-copy"]')?.setAttribute("title", t("ui.copyLink"));
    this.menu.querySelector<HTMLButtonElement>('[data-action="room-paste"]')?.setAttribute("title", t("ui.pasteJoin"));
    this.setConnection(this.conn);
  }

  /** Reflect the realtime connection state (green online / amber connecting /
   *  red offline) so a player can tell at a glance whether live sync is active. */
  setConnection(s: "online" | "connecting" | "offline"): void {
    this.conn = s;
    this.connRow.dataset.conn = s;
    const key = s === "online" ? "ui.connOnline" : s === "offline" ? "ui.connOffline" : "ui.connConnecting";
    this.connVal.textContent = t(key);
  }

  setRoom(slug: string): void {
    this.roomSlug = slug;
    this.roomVal.textContent = slug || "------";
    this.roomStart = performance.now();
    this.tick();
  }

  /** Show the Feedback row only when at least one feedback channel is configured. */
  setFeedbackAvailable(on: boolean): void {
    const row = this.menu.querySelector<HTMLElement>('[data-role="feedback"]');
    if (row) row.hidden = !on;
  }

  /** Update the live spectator count shown in the menu (row hidden at zero for
   *  seated players; spectators always see it). */
  setSpectators(n: number): void {
    this.spectatorVal.textContent = String(Math.max(0, n));
    this.spectatorRow.hidden = n <= 0 && !this.spectator;
  }

  /** Mark this client as a spectator so the menu hides controls it must not use
   *  (reset deck / reset room) and always shows the spectator row. */
  setSpectatorMode(on: boolean): void {
    this.spectator = on;
    this.el.classList.toggle("is-spectator", on);
    this.applyPlayControls();
    this.spectatorRow.hidden = !on && this.spectatorVal.textContent === "0";
  }

  /** Reflect host status: only the host may reset the shared deck, so that row is
   *  hidden for non-hosts (everyone can still leave the room). */
  setHostMode(isHost: boolean): void {
    this.host = isHost;
    this.applyPlayControls();
  }

  // Reset deck is host-only and never shown to spectators; Exit room is shown to
  // every seated player (spectators can leave too, but they have no deck to reset).
  private applyPlayControls(): void {
    const resetDeck = this.menu.querySelector<HTMLElement>('[data-role="reset-deck"]');
    const resetRoom = this.menu.querySelector<HTMLElement>('[data-role="reset-room"]');
    const divider = this.menu.querySelector<HTMLElement>('[data-role="play-divider"]');
    if (resetDeck) resetDeck.hidden = this.spectator || !this.host;
    if (resetRoom) resetRoom.hidden = this.spectator;
    if (divider) divider.hidden = this.spectator;
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
