// A tiny, opt-in diagnostics overlay so a player can SEE realtime working without
// a second device. Enable with `?debug=1` in the URL or localStorage
// `kabal:debug = "1"`. It shows the live connection state and counters that tick
// up as packets flow: when another player acts, "in" climbs and "last in" resets
// to ~0s — concrete proof that live sync is active. Zero cost when disabled.
export class DebugHud {
  status: "online" | "connecting" | "offline" = "connecting";
  peers = 0;
  seat = -1;
  spectator = false;
  sent = 0;        // patches/snapshots we broadcast
  recvPatch = 0;   // patches received from peers
  recvSnap = 0;    // snapshots received
  recvCursor = 0;  // cursor packets received
  private lastIn = 0; // performance.now() of the last inbound game/cursor event
  private el: HTMLDivElement;
  private timer = 0;

  static enabled(): boolean {
    try {
      if (new URLSearchParams(location.search).get("debug") === "1") return true;
      return localStorage.getItem("kabal:debug") === "1";
    } catch {
      return false;
    }
  }

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "debug-hud";
    document.body.appendChild(this.el);
    this.timer = window.setInterval(() => this.render(), 250);
    this.render();
  }

  /** Call on any inbound realtime event to refresh the "last in" freshness clock. */
  markIn(): void { this.lastIn = performance.now(); }

  private render(): void {
    const ago = this.lastIn ? ((performance.now() - this.lastIn) / 1000).toFixed(1) + "s" : "—";
    const role = this.spectator ? "spectator" : this.seat >= 0 ? `seat ${this.seat}` : "—";
    this.el.innerHTML =
      `<b>${this.status.toUpperCase()}</b> · ${role} · peers ${this.peers}` +
      `<br>out ${this.sent} · in p${this.recvPatch}/s${this.recvSnap}/c${this.recvCursor}` +
      `<br>last in ${ago}`;
    this.el.dataset.status = this.status;
  }

  destroy(): void {
    window.clearInterval(this.timer);
    this.el.remove();
  }
}
