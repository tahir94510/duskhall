import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { TokenBucket, withinByteCap, safeNumber, safeString } from "../security/inputGuard.js";
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

export interface CardPatch {
  v: number;
  by: string;
  cards: PatchCard[];
  /** Only populated on snapshots: the authoritative peer's known seat claims. */
  claims?: SeatClaim[];
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
      x: safeNumber(c.x),
      y: safeNumber(c.y),
      z: safeNumber(c.z, 0),
      rot: typeof c.rot === "number" ? Math.max(-999, Math.min(999, Math.round(c.rot))) : 0,
      faceUp: c.faceUp === true,
      ownerSeat: typeof c.ownerSeat === "number" ? Math.max(-1, Math.min(3, c.ownerSeat)) : null,
      ts: safeNumber(c.ts, 0)
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
      const sanitized: CardPatch = { v: safeNumber(p.v), by, cards: this.sanitizeCards(p.cards) };
      if (msg.type === "snapshot" && p.claims) sanitized.claims = this.sanitizeClaims(p.claims);
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
        until: safeNumber(h.until, 0),
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
