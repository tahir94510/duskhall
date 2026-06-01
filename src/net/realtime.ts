import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { TokenBucket, withinByteCap, safeNumber, safeStamp, safeInt, safeString } from "../security/inputGuard.js";
import { LocalBus } from "./localBus.js";
import type { RuntimeConfig } from "./config.js";

export interface PresencePlayer {
  id: string;
  name: string;
  seat: number;
  color: string;
  /** Local epoch ms when this client first joined; used to seat newcomers in
   *  join order so a departure never reshuffles existing seats. */
  joinedAt: number;
}

export interface CursorMsg {
  id: string;
  x: number;
  y: number;
  seat: number;
}

export interface PatchCard {
  id: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  faceUp: boolean;
  ownerSeat: number | null;
  /** Last-write-wins stamp (wall-clock ms), receivers reject stale updates. */
  ts: number;
}

/** A persistent seat ownership: which stable client id holds a seat. Taught to
 *  newcomers on snapshots so a player who dropped (but did not leave) is still
 *  shown as a dimmed, reserved seat rather than vanishing. */
export interface SeatClaim {
  seat: number;
  id: string;
  name: string;
}

/** Cosmetic-only hint attached to a patch so REMOTE peers replay the same flourish
 *  the actor saw (a solid-block flip or a riffle shuffle) instead of snapping the
 *  state. It never affects the authoritative state — the receiver still applies the
 *  card values via LWW and reads only the direction (`toFaceUp`) from here. Old
 *  clients ignore the field entirely. */
export interface PatchAnim {
  kind: "flip" | "shuffle";
  ids: string[];
  /** Flip direction (the final face), so the receiver stages old → new correctly. */
  toFaceUp?: boolean;
}

export interface CardPatch {
  v: number;
  by: string;
  cards: PatchCard[];
  /** Only populated on snapshots: the authoritative peer's known seat claims. */
  claims?: SeatClaim[];
  /** Optional cosmetic animation hint (patches only, never snapshots). */
  anim?: PatchAnim;
}

/** Broadcast when a player INTENTIONALLY leaves (reset/leave or hops rooms), as
 *  opposed to merely dropping. Receivers free the seat and release every card
 *  that seat owned so the table becomes interactable again. */
export interface LeftMsg {
  id: string;
  seat: number;
}

/** Ephemeral "this card is being held by seat N until `until`" lock. Broadcast
 *  on grab, released on drop, and auto-expiring so a crashed holder never locks
 *  a card forever. */
export interface HoldMsg {
  ids: string[];
  by: string;
  seat: number;
  until: number;
  release: boolean;
}

/** Host-only "kick": only the targeted client acts on it, leaving to a fresh
 *  empty room. Everyone else just sees them depart via the resulting `left`. */
export interface KickMsg {
  target: string;
  by: string;
}

export type GameMsg =
  | { type: "patch"; payload: CardPatch }
  | { type: "snapshot"; payload: CardPatch }
  | { type: "hold"; payload: HoldMsg }
  | { type: "left"; payload: LeftMsg }
  | { type: "kick"; payload: KickMsg }
  | { type: "hello"; payload: { id: string } };

type Listener<T> = (msg: T) => void;
type Status = "offline" | "connecting" | "online";

/** One ordered check in the connection self-test. */
export interface DiagnosticStep {
  id: "config" | "url" | "rest" | "realtime";
  ok: boolean;
  detail: string;
}
export interface DiagnosticsReport {
  ok: boolean;
  steps: DiagnosticStep[];
  summary: "ok" | "config-missing" | "url-bad" | "rest-failed" | "realtime-failed";
}

/** Reject a promise (here, a fetch) if it outlives `ms`, so a hung network call
 *  can never freeze the diagnostics. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

/** Mask a Supabase URL's project ref for display, e.g.
 *  `https://unizxindpodcvrdynlrl.supabase.co` → `unizx….supabase.co`. Keeps enough
 *  to confirm a URL arrived without exposing the full project ref on screen. */
export function maskHost(url: string): string {
  try {
    const host = new URL(url).host; // e.g. unizxindpodcvrdynlrl.supabase.co
    const dot = host.indexOf(".");
    if (dot <= 0) return "••••";
    const ref = host.slice(0, dot);
    const rest = host.slice(dot); // ".supabase.co"
    const head = ref.slice(0, Math.min(5, ref.length));
    return `${head}…${rest}`;
  } catch {
    return "••••";
  }
}

/** Validate a cosmetic `anim` hint off the wire (pure, unit-tested). Returns null —
 *  hint dropped, the card STATE still applies — on anything malformed: unknown kind,
 *  missing/empty/oversize ids, or non-string ids. `toFaceUp` is kept only if boolean. */
export function sanitizeAnim(raw: unknown): PatchAnim | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Partial<PatchAnim>;
  if (a.kind !== "flip" && a.kind !== "shuffle") return null;
  if (!Array.isArray(a.ids) || a.ids.length === 0 || a.ids.length > 200) return null;
  const ids = a.ids.map((id) => safeString(id, 32)).filter((id) => !!id);
  if (!ids.length) return null;
  const out: PatchAnim = { kind: a.kind, ids };
  if (typeof a.toFaceUp === "boolean") out.toFaceUp = a.toFaceUp;
  return out;
}

export type KeyKind = "anon" | "publishable" | "service_role" | "secret" | "unknown";

/** Classify a Supabase client key by shape, with no network or signature check —
 *  just enough to tell the player whether they pasted a browser-safe key. Both the
 *  legacy `anon` JWT and the newer `sb_publishable_…` key are valid in a browser;
 *  the `service_role` JWT and `sb_secret_…` keys must never ship to one. */
export function classifyKey(token: string): KeyKind {
  const t = token.trim();
  if (t.startsWith("sb_publishable_")) return "publishable";
  if (t.startsWith("sb_secret_")) return "secret";
  const role = decodeJwtRole(t);
  if (role === "anon") return "anon";
  if (role === "service_role") return "service_role";
  return "unknown";
}

/** Read the `role` claim from a Supabase JWT (anon keys carry role "anon",
 *  service keys "service_role"). Returns null if the string is not a JWT we can
 *  decode. Pure local base64 decode — no signature check, just a shape sniff. */
function decodeJwtRole(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { role?: string };
    return typeof claims.role === "string" ? claims.role : null;
  } catch {
    return null;
  }
}

const CONNECT_TIMEOUT_MS = 9000;
const RECONNECT_MAX_MS = 16000;

export class RealtimeBus {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private gameListeners = new Set<Listener<GameMsg>>();
  private cursorListeners = new Set<Listener<CursorMsg>>();
  private presenceListeners = new Set<Listener<PresencePlayer[]>>();
  private statusListeners = new Set<Listener<Status>>();
  private status: Status = "offline";
  private cursorBucket = new TokenBucket(40, 40);
  // Card ops (patches): drag previews fire ~30/s plus commits, so a 10/s cap was
  // silently dropping most movement/flip packets. Sized to comfortably carry a
  // live drag without throttling, while still capping a runaway sender.
  private opsBucket = new TokenBucket(60, 45);
  private holdBucket = new TokenBucket(20, 20);
  private patchVersion = 0;

  // Reconnection state. `wantConnected` is the desired state; the bus keeps
  // trying to reach it with exponential backoff until disconnect() is called.
  private desiredRoom: string | null = null;
  private desiredMe: PresencePlayer | null = null;
  private wantConnected = false;
  private reconnectTimer = 0;
  private reconnectAttempt = 0;
  private connectivityBound = false;

  // Per-sender receive-rate limiters: a flooding/buggy peer can't pin the CPU
  // because excess messages from a single id are dropped before dispatch.
  private recvBuckets = new Map<string, { patch: TokenBucket; cursor: TokenBucket }>();

  // Same-device fallback transport (BroadcastChannel). It runs ALONGSIDE Supabase
  // so two tabs/windows on one machine always sync, even when the websocket is
  // unconfigured or blocked. Its inbound messages are fanned out to the very same
  // listeners, and presence from both sources is merged by id, so Game.ts treats
  // a local peer exactly like a remote one.
  private local = new LocalBus();
  // Latest presence rosters from each transport, merged on every emit.
  private remotePresence: PresencePlayer[] = [];
  private localPresence: PresencePlayer[] = [];

  constructor(private readonly config: RuntimeConfig) {
    // Wire the local transport once; it only does anything after connect().
    this.local.onGame((msg) => { for (const l of this.gameListeners) l(msg); });
    this.local.onCursor((c) => { for (const l of this.cursorListeners) l(c); });
    this.local.onPresence((players) => { this.localPresence = players; this.emitMergedPresence(); });
  }

  isAvailable(): boolean {
    return !!(this.config.supabaseUrl && this.config.supabaseAnonKey);
  }

  /** Live connection state, for callers that want to read it on demand. */
  getStatus(): Status { return this.status; }

  /** Actively probe the configured Supabase so a player can verify their setup
   *  without a second device. Runs four ordered checks and returns a concrete,
   *  human-readable report. Pure diagnostics: it opens (and tears down) its own
   *  throwaway channel and never disturbs the live game channel. */
  async diagnose(): Promise<DiagnosticsReport> {
    const steps: DiagnosticStep[] = [];
    const url = (this.config.supabaseUrl || "").trim();
    const key = (this.config.supabaseAnonKey || "").trim();

    // 1) Are the values even present?
    if (!url || !key) {
      steps.push({
        id: "config", ok: false,
        detail: !url && !key ? "Neither SUPABASE_URL nor SUPABASE_ANON_KEY reached the app."
          : !url ? "SUPABASE_URL is missing." : "SUPABASE_ANON_KEY is missing."
      });
      return { ok: false, steps, summary: "config-missing" };
    }
    // Echo back WHAT arrived so the player can eyeball it: the URL and the key kind.
    // Supabase issues two valid browser keys — the legacy `anon` JWT and the newer
    // `sb_publishable_…` key — and accepts either. We flag only the genuinely wrong
    // ones: a service_role JWT (must never ship to a browser) or unreadable garbage.
    const kind = classifyKey(key);
    const keyNote =
      kind === "anon" ? "anon key looks valid"
      : kind === "publishable" ? "publishable key looks valid"
      : kind === "service_role" ? "WARNING: this is the secret service_role key. Use the anon or publishable key instead."
      : kind === "secret" ? "WARNING: this looks like a secret key. Use the anon or publishable key instead."
      : "key is not a recognised Supabase browser key. Re-copy the anon or publishable key.";
    const keyOk = kind === "anon" || kind === "publishable";
    // Show a MASKED host, not the full project URL: enough for the player to see
    // "yes, a Supabase URL arrived" without exposing the project ref to anyone
    // glancing at the screen or a shared recording.
    steps.push({ id: "config", ok: keyOk, detail: `URL: ${maskHost(url)} · ${keyNote}.` });

    // 2) Is the URL the expected Supabase project URL shape?
    let urlOk = false;
    try {
      const u = new URL(url);
      urlOk = u.protocol === "https:" && /\.supabase\.(co|in|net)$/.test(u.host) && u.pathname.replace(/\/$/, "") === "";
    } catch { urlOk = false; }
    steps.push({
      id: "url", ok: urlOk,
      detail: urlOk ? `Project URL looks right (${maskHost(url)}).`
        : "URL should be exactly https://<project-ref>.supabase.co with no path or trailing segment."
    });
    if (!urlOk) return { ok: false, steps, summary: "url-bad" };

    // 3) Does the project answer with this key? A 200/401/403 all prove the host
    //    and key pair reached a real Supabase project; only a network error or
    //    404-style failure means the URL itself is wrong/unreachable.
    let restOk = false;
    let restDetail = "";
    try {
      const res = await withTimeout(
        fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, { headers: { apikey: key }, cache: "no-store" }),
        7000
      );
      if (res.status === 200) { restOk = true; restDetail = "Project reachable and the anon key is accepted."; }
      else if (res.status === 401 || res.status === 403) { restOk = false; restDetail = `Project reachable but the anon key was rejected (HTTP ${res.status}). Re-copy the anon/public key.`; }
      else { restOk = true; restDetail = `Project reachable (HTTP ${res.status}).`; }
    } catch {
      restOk = false;
      restDetail = "Could not reach the project over HTTPS. Check the URL, that the project is not paused, and your network.";
    }
    steps.push({ id: "rest", ok: restOk, detail: restDetail });
    if (!restOk) return { ok: false, steps, summary: "rest-failed" };

    // 4) Does Realtime actually subscribe? This is the real test — it proves the
    //    websocket connects and Realtime is enabled. Uses a private throwaway
    //    channel so the live game channel is untouched.
    const rtOk = await this.probeRealtime(url, key);
    steps.push({
      id: "realtime", ok: rtOk,
      detail: rtOk ? "Realtime connected. Multiplayer sync is working."
        : "Realtime did not connect. Confirm Realtime is enabled for the project and that no proxy is blocking the websocket."
    });
    return { ok: rtOk, steps, summary: rtOk ? "ok" : "realtime-failed" };
  }

  private async probeRealtime(url: string, key: string): Promise<boolean> {
    let probeClient: SupabaseClient | null = null;
    try {
      probeClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: "kabal-diag" },
        realtime: { params: { eventsPerSecond: 1 } }
      });
      const ch = probeClient.channel(`kabal-diag:${Math.random().toString(36).slice(2, 8)}`);
      const ok = await new Promise<boolean>((resolve) => {
        let settled = false;
        const done = (v: boolean) => { if (!settled) { settled = true; resolve(v); } };
        const timer = setTimeout(() => done(false), 8000);
        ch.subscribe((s: string) => {
          if (s === "SUBSCRIBED") { clearTimeout(timer); done(true); }
          else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") { clearTimeout(timer); done(false); }
        });
      });
      try { await probeClient.removeChannel(ch); } catch { /* ignore */ }
      return ok;
    } catch {
      return false;
    } finally {
      // Drop the throwaway client so it never lingers or double-subscribes.
      probeClient = null;
    }
  }

  onGame(cb: Listener<GameMsg>) { this.gameListeners.add(cb); return () => this.gameListeners.delete(cb); }
  onCursor(cb: Listener<CursorMsg>) { this.cursorListeners.add(cb); return () => this.cursorListeners.delete(cb); }
  onPresence(cb: Listener<PresencePlayer[]>) { this.presenceListeners.add(cb); return () => this.presenceListeners.delete(cb); }
  onStatus(cb: Listener<Status>) { this.statusListeners.add(cb); return () => this.statusListeners.delete(cb); }

  private setStatus(s: Status) {
    if (this.status === s) return;
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  async connect(roomSlug: string, me: PresencePlayer): Promise<void> {
    this.desiredRoom = roomSlug;
    this.desiredMe = me;
    this.wantConnected = true;
    this.reconnectAttempt = 0;
    this.bindConnectivity();
    // Always bring up the same-device channel so two local tabs sync immediately,
    // independent of whether Supabase is configured/reachable.
    this.local.connect(roomSlug, me);
    if (!this.isAvailable()) {
      this.setStatus("offline");
      return;
    }
    await this.openChannel();
  }

  /** Update the presence payload used on (re)connections, e.g. after a reseat
   *  or rename, without forcing an immediate rejoin. */
  updateMe(me: PresencePlayer): void {
    this.desiredMe = me;
    this.local.updateMe(me);
    if (this.channel && this.status === "online") void this.channel.track(me).catch(() => {});
  }

  /** Re-broadcast a `hello` so an authoritative peer (re)sends a snapshot. Used
   *  when a joiner discovers peers via presence but the hello it sent on connect
   *  arrived before anyone had it in their roster, so no one answered. Safe to
   *  call repeatedly; the responder de-dupes by being the single lowest seat. */
  requestSync(): void {
    if (!this.desiredMe) return;
    // Always ask local tabs too, so a second tab gets the authoritative board even
    // with Supabase offline.
    this.local.sendGame({ type: "hello", payload: { id: this.desiredMe.id } });
    if (!this.channel || this.status !== "online") return;
    void this.channel.send({ type: "broadcast", event: "game", payload: { type: "hello", payload: { id: this.desiredMe.id } } });
  }

  private async openChannel(): Promise<void> {
    if (!this.wantConnected || !this.desiredRoom || !this.desiredMe) return;
    if (!this.isAvailable()) { this.setStatus("offline"); return; }
    this.setStatus("connecting");
    const room = this.desiredRoom;
    const me = this.desiredMe;
    try {
      // Reuse a single Supabase client across reconnects so we don't trigger
      // "Multiple GoTrueClient instances" warnings.
      if (!this.client) {
        this.client = createClient(this.config.supabaseUrl, this.config.supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false, storageKey: "kabal-rt" },
          realtime: { params: { eventsPerSecond: 60 } }
        });
      }
      this.teardownChannel();
      const ch = this.client.channel(`kabal:${room}`, {
        config: { presence: { key: me.id }, broadcast: { ack: false, self: false } }
      });
      this.channel = ch;
      ch.on("presence", { event: "sync" }, () => this.emitPresence());
      ch.on("broadcast", { event: "game" }, ({ payload }) => this.handleGame(payload));
      ch.on("broadcast", { event: "cursor" }, ({ payload }) => this.handleCursor(payload));

      // A one-shot guard so the connect-timeout fallback fires reconnect only
      // once per attempt; later status callbacks still drive live transitions.
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled || this.channel !== ch) return;
        settled = true;
        this.handleConnectFailure(ch);
      }, CONNECT_TIMEOUT_MS);

      // Persistent callback: handles the INITIAL subscribe AND every later
      // transition (CHANNEL_ERROR / TIMED_OUT / CLOSED) so a mid-session drop
      // is detected and triggers a reconnect instead of silently dying.
      ch.subscribe((s: string) => {
        if (this.channel !== ch) return;
        if (s === "SUBSCRIBED") {
          settled = true;
          window.clearTimeout(timer);
          this.reconnectAttempt = 0;
          void ch.track(me).catch(() => {});
          void ch.send({ type: "broadcast", event: "game", payload: { type: "hello", payload: { id: me.id } } });
          this.setStatus("online");
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          window.clearTimeout(timer);
          settled = true;
          this.handleConnectFailure(ch);
        }
      });
    } catch {
      this.handleConnectFailure(this.channel);
    }
  }

  private handleConnectFailure(ch: RealtimeChannel | null): void {
    if (this.channel === ch) this.teardownChannel();
    this.setStatus("offline");
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.wantConnected || this.reconnectTimer) return;
    const delay = Math.min(RECONNECT_MAX_MS, 1000 * 2 ** this.reconnectAttempt) + Math.random() * 400;
    this.reconnectAttempt++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = 0;
      void this.openChannel();
    }, delay);
  }

  /** Force an immediate reconnect attempt (connectivity/visibility regained). */
  private kickReconnect(): void {
    if (!this.wantConnected || this.status === "online") return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = 0;
    this.reconnectAttempt = 0;
    void this.openChannel();
  }

  private bindConnectivity(): void {
    if (this.connectivityBound) return;
    this.connectivityBound = true;
    window.addEventListener("online", () => this.kickReconnect());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.kickReconnect(); });
  }

  private teardownChannel(): void {
    const ch = this.channel;
    this.channel = null;
    if (ch && this.client) {
      try { void this.client.removeChannel(ch); } catch { /* ignore */ }
    }
  }

  async disconnect(): Promise<void> {
    this.wantConnected = false;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = 0;
    this.reconnectAttempt = 0;
    this.local.disconnect();
    this.localPresence = [];
    try {
      if (this.channel) {
        await this.channel.untrack().catch(() => {});
        await this.channel.unsubscribe().catch(() => {});
      }
    } finally {
      this.teardownChannel();
      this.recvBuckets.clear();
      // keep this.client alive so reconnects reuse the same Supabase instance
      this.setStatus("offline");
      for (const l of this.presenceListeners) l([]);
    }
  }

  // Every send mirrors over the same-device channel FIRST (so two local tabs sync
  // even while Supabase is offline), then goes out over Supabase when online.

  sendPatch(patch: CardPatch): void {
    if (patch.cards.length > 200 || !withinByteCap(patch)) return;
    this.patchVersion = Math.max(this.patchVersion, patch.v);
    this.local.sendGame({ type: "patch", payload: patch });
    if (!this.channel || this.status !== "online") return;
    if (!this.opsBucket.consume()) return;
    this.channel.send({ type: "broadcast", event: "game", payload: { type: "patch", payload: patch } as GameMsg });
  }

  sendSnapshot(snap: CardPatch): void {
    if (snap.cards.length > 200 || !withinByteCap(snap)) return;
    this.local.sendGame({ type: "snapshot", payload: snap });
    if (!this.channel || this.status !== "online") return;
    this.channel.send({ type: "broadcast", event: "game", payload: { type: "snapshot", payload: snap } });
  }

  sendCursor(c: CursorMsg): void {
    this.local.sendCursor(c);
    if (!this.channel || this.status !== "online") return;
    if (!this.cursorBucket.consume()) return;
    this.channel.send({ type: "broadcast", event: "cursor", payload: c });
  }

  sendHold(h: HoldMsg): void {
    if (!withinByteCap(h)) return;
    this.local.sendGame({ type: "hold", payload: h });
    if (!this.channel || this.status !== "online") return;
    if (!this.holdBucket.consume()) return;
    this.channel.send({ type: "broadcast", event: "game", payload: { type: "hold", payload: h } as GameMsg });
  }

  /** Announce an intentional departure so peers free the seat and release its
   *  cards. Not rate-limited (one-shot, rare) but still byte-capped. */
  sendLeft(l: LeftMsg): void {
    if (!withinByteCap(l)) return;
    this.local.sendGame({ type: "left", payload: l });
    if (!this.channel || this.status !== "online") return;
    this.channel.send({ type: "broadcast", event: "game", payload: { type: "left", payload: l } as GameMsg });
  }

  /** Like sendLeft, but AWAITS the broadcast so it actually flushes before the
   *  caller tears the channel down (disconnect on exit / room-hop). A bare
   *  sendLeft races disconnect() — the channel is removed before the websocket
   *  flushes the frame, so peers never get the `left` and wrongly show the
   *  leaver "away" for the whole grace window. The local mirror is synchronous
   *  (same-machine tabs); the remote send is raced against a short timeout so a
   *  slow/hung socket can never freeze the exit. */
  async sendLeftAndWait(l: LeftMsg): Promise<void> {
    if (!withinByteCap(l)) return;
    this.local.sendGame({ type: "left", payload: l });
    if (!this.channel || this.status !== "online") return;
    const send = Promise.resolve(
      this.channel.send({ type: "broadcast", event: "game", payload: { type: "left", payload: l } as GameMsg })
    ).catch(() => {});
    await Promise.race([send, new Promise<void>((r) => setTimeout(r, 700))]);
  }

  /** Host-only: ask a player to leave. Only the target acts on it. */
  sendKick(target: string, by: string): void {
    this.local.sendGame({ type: "kick", payload: { target, by } });
    if (!this.channel || this.status !== "online") return;
    this.channel.send({ type: "broadcast", event: "game", payload: { type: "kick", payload: { target, by } } as GameMsg });
  }

  private bucketFor(id: string): { patch: TokenBucket; cursor: TokenBucket } {
    let b = this.recvBuckets.get(id);
    if (!b) {
      // Generous ceilings (well above legitimate send rates) that still cap a
      // hostile peer. The patch ceiling must clear a live drag (~30/s previews
      // plus commits) or peers would see stuttering, half-applied movement.
      b = { patch: new TokenBucket(90, 60), cursor: new TokenBucket(80, 60) };
      this.recvBuckets.set(id, b);
    }
    return b;
  }

  private sanitizeCards(raw: unknown): PatchCard[] {
    if (!Array.isArray(raw)) return [];
    return (raw as Array<Partial<PatchCard>>).slice(0, 200).map((c) => ({
      id: safeString(c.id, 32),
      // x,y are canonical [0,1] fractions: clamp to a near-board range.
      x: safeNumber(c.x),
      y: safeNumber(c.y),
      // z-order grows without bound over a session: validate as a wide-range int,
      // never the coordinate clamp (which would collapse deep stacks to a ceiling).
      z: safeInt(c.z, 0),
      rot: typeof c.rot === "number" ? Math.max(-999, Math.min(999, Math.round(c.rot))) : 0,
      faceUp: c.faceUp === true,
      ownerSeat: typeof c.ownerSeat === "number" ? Math.max(-1, Math.min(3, c.ownerSeat)) : null,
      // ts is a wall-clock last-write-wins stamp (~1.7e12). It MUST keep its real
      // magnitude or the LWW gate in applyPatch rejects every remote edit — the bug
      // that made all card operations fail to sync. Never run it through safeNumber.
      ts: safeStamp(c.ts, 0)
    }));
  }

  private sanitizeClaims(raw: unknown): SeatClaim[] {
    if (!Array.isArray(raw)) return [];
    return (raw as Array<Partial<SeatClaim>>).slice(0, 4).map((c) => ({
      seat: typeof c.seat === "number" ? Math.max(0, Math.min(3, Math.round(c.seat))) : 0,
      id: safeString(c.id, 40),
      name: safeString(c.name, 24) || "Player"
    })).filter((c) => !!c.id);
  }

  private sanitizeAnim(raw: unknown): PatchAnim | null {
    return sanitizeAnim(raw);
  }

  private handleGame(payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const msg = payload as { type?: string; payload?: unknown };
    if (msg.type === "patch" || msg.type === "snapshot") {
      const p = msg.payload as Partial<CardPatch> | undefined;
      if (!p || !Array.isArray(p.cards) || typeof p.v !== "number") return;
      if (p.cards.length > 200) return;
      const by = safeString(p.by, 40);
      // Patches are rate-limited per sender; snapshots are rare/authoritative
      // and exempt so a reconnect resync is never throttled away.
      if (msg.type === "patch" && by && !this.bucketFor(by).patch.consume()) return;
      // v is a monotonic patch-version counter (grows without bound), not a
      // coordinate — validate as a wide int so it is never clamped to the board range.
      const sanitized: CardPatch = { v: safeInt(p.v, 0), by, cards: this.sanitizeCards(p.cards) };
      if (msg.type === "snapshot" && p.claims) sanitized.claims = this.sanitizeClaims(p.claims);
      // The cosmetic anim hint rides on patches only (never snapshots, which apply
      // wholesale). Sanitised so a malformed/oversize hint can never reach Game.
      if (msg.type === "patch" && p.anim) {
        const a = this.sanitizeAnim(p.anim);
        if (a) sanitized.anim = a;
      }
      for (const l of this.gameListeners) l({ type: msg.type, payload: sanitized });
    } else if (msg.type === "left") {
      const l0 = msg.payload as Partial<LeftMsg> | undefined;
      if (!l0 || typeof l0.id !== "string") return;
      const safe: LeftMsg = {
        id: safeString(l0.id, 40),
        seat: typeof l0.seat === "number" ? Math.max(-1, Math.min(3, Math.round(l0.seat))) : -1
      };
      if (!safe.id) return;
      for (const l of this.gameListeners) l({ type: "left", payload: safe });
    } else if (msg.type === "kick") {
      const k = msg.payload as Partial<KickMsg> | undefined;
      if (!k || typeof k.target !== "string") return;
      const safe: KickMsg = { target: safeString(k.target, 40), by: safeString(k.by, 40) };
      if (!safe.target) return;
      for (const l of this.gameListeners) l({ type: "kick", payload: safe });
    } else if (msg.type === "hold") {
      const h = msg.payload as Partial<HoldMsg> | undefined;
      if (!h || !Array.isArray(h.ids)) return;
      const ids = h.ids.slice(0, 200).map((x) => safeString(x, 32)).filter(Boolean);
      if (!ids.length) return;
      const safe: HoldMsg = {
        ids,
        by: safeString(h.by, 40),
        seat: typeof h.seat === "number" ? Math.max(-1, Math.min(3, h.seat)) : -1,
        // until is a wall-clock expiry (Date.now() + ms), not a coordinate — keep
        // its real magnitude or the hold-lock would look permanently expired.
        until: safeStamp(h.until, 0),
        release: h.release === true
      };
      for (const l of this.gameListeners) l({ type: "hold", payload: safe });
    } else if (msg.type === "hello") {
      const p = msg.payload as { id?: string } | undefined;
      if (p && typeof p.id === "string") {
        for (const l of this.gameListeners) l({ type: "hello", payload: { id: safeString(p.id, 40) } });
      }
    }
  }

  private handleCursor(payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const c = payload as Partial<CursorMsg>;
    if (typeof c.id !== "string") return;
    const id = safeString(c.id, 40);
    if (!this.bucketFor(id).cursor.consume()) return;
    const safe: CursorMsg = {
      id,
      x: safeNumber(c.x),
      y: safeNumber(c.y),
      // Allow -1 (spectator) through; render trusts the presence seat anyway.
      seat: typeof c.seat === "number" ? Math.max(-1, Math.min(3, c.seat)) : -1
    };
    for (const l of this.cursorListeners) l(safe);
  }

  private emitPresence(): void {
    if (!this.channel) return;
    const state = this.channel.presenceState() as Record<string, Array<Partial<PresencePlayer>>>;
    const players: PresencePlayer[] = [];
    const present = new Set<string>();
    for (const key of Object.keys(state)) {
      const entry = state[key]?.[0];
      if (!entry) continue;
      const id = safeString(entry.id || key, 40);
      present.add(id);
      players.push({
        id,
        name: safeString(entry.name, 24) || "Player",
        seat: typeof entry.seat === "number" ? Math.max(-1, Math.min(3, entry.seat)) : 0,
        color: safeString(entry.color, 16) || "#c8a45a",
        joinedAt: typeof entry.joinedAt === "number" && Number.isFinite(entry.joinedAt) ? entry.joinedAt : Date.now()
      });
    }
    // Prune receive-buckets for senders no longer present (bounded memory).
    for (const id of this.recvBuckets.keys()) if (!present.has(id)) this.recvBuckets.delete(id);
    this.remotePresence = players;
    this.emitMergedPresence();
  }

  // Union the Supabase and local-tab rosters by client id (Supabase wins on a tie
  // since it carries the authoritative seat for cross-device play), then publish
  // one combined roster. Same-machine tabs and remote peers thus seat together.
  private emitMergedPresence(): void {
    const byId = new Map<string, PresencePlayer>();
    for (const p of this.localPresence) byId.set(p.id, p);
    for (const p of this.remotePresence) byId.set(p.id, p);
    const merged = Array.from(byId.values());
    for (const l of this.presenceListeners) l(merged);
  }
}
