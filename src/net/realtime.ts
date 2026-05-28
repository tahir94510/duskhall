import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { TokenBucket, withinByteCap, safeNumber, safeString } from "../security/inputGuard.js";
import type { RuntimeConfig } from "./config.js";

export interface PresencePlayer {
  id: string;
  name: string;
  seat: number;
  color: string;
}

export interface CursorMsg {
  id: string;
  x: number;
  y: number;
  seat: number;
}

export interface CardPatch {
  v: number;
  by: string;
  cards: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    rot: 0 | 1 | 2 | 3;
    faceUp: boolean;
    ownerSeat: number | null;
  }>;
}

export type GameMsg =
  | { type: "patch"; payload: CardPatch }
  | { type: "snapshot"; payload: CardPatch }
  | { type: "hello"; payload: { id: string } };

type Listener<T> = (msg: T) => void;

export class RealtimeBus {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private gameListeners = new Set<Listener<GameMsg>>();
  private cursorListeners = new Set<Listener<CursorMsg>>();
  private presenceListeners = new Set<Listener<PresencePlayer[]>>();
  private statusListeners = new Set<Listener<"offline" | "connecting" | "online">>();
  private status: "offline" | "connecting" | "online" = "offline";
  private cursorBucket = new TokenBucket(30, 30);
  private opsBucket = new TokenBucket(10, 10);
  private patchVersion = 0;

  constructor(private readonly config: RuntimeConfig) {}

  isAvailable(): boolean {
    return !!(this.config.supabaseUrl && this.config.supabaseAnonKey);
  }

  onGame(cb: Listener<GameMsg>) { this.gameListeners.add(cb); return () => this.gameListeners.delete(cb); }
  onCursor(cb: Listener<CursorMsg>) { this.cursorListeners.add(cb); return () => this.cursorListeners.delete(cb); }
  onPresence(cb: Listener<PresencePlayer[]>) { this.presenceListeners.add(cb); return () => this.presenceListeners.delete(cb); }
  onStatus(cb: Listener<"offline" | "connecting" | "online">) { this.statusListeners.add(cb); return () => this.statusListeners.delete(cb); }

  private setStatus(s: "offline" | "connecting" | "online") {
    if (this.status === s) return;
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  async connect(roomSlug: string, me: PresencePlayer): Promise<void> {
    if (!this.isAvailable()) {
      this.setStatus("offline");
      return;
    }
    this.setStatus("connecting");
    try {
      // Reuse a single Supabase client across reconnects so we don't trigger
      // "Multiple GoTrueClient instances" warnings.
      if (!this.client) {
        this.client = createClient(this.config.supabaseUrl, this.config.supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false, storageKey: "kabal-rt" },
          realtime: { params: { eventsPerSecond: 20 } }
        });
      }
      const ch = this.client.channel(`kabal:${roomSlug}`, {
        config: { presence: { key: me.id }, broadcast: { ack: false, self: false } }
      });
      this.channel = ch;

      ch.on("presence", { event: "sync" }, () => this.emitPresence());
      ch.on("broadcast", { event: "game" }, ({ payload }) => this.handleGame(payload));
      ch.on("broadcast", { event: "cursor" }, ({ payload }) => this.handleCursor(payload));

      const status = await new Promise<string>((resolve) => {
        const timer = window.setTimeout(() => resolve("TIMED_OUT"), 9000);
        ch.subscribe((s) => {
          window.clearTimeout(timer);
          resolve(s);
        });
      });
      if (status === "SUBSCRIBED") {
        await ch.track(me);
        await ch.send({ type: "broadcast", event: "game", payload: { type: "hello", payload: { id: me.id } } });
        this.setStatus("online");
      } else {
        this.setStatus("offline");
      }
    } catch {
      this.setStatus("offline");
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.untrack().catch(() => {});
        await this.channel.unsubscribe().catch(() => {});
      }
    } finally {
      this.channel = null;
      // keep this.client alive so reconnects reuse the same Supabase instance
      this.setStatus("offline");
      for (const l of this.presenceListeners) l([]);
    }
  }

  sendPatch(patch: CardPatch): void {
    if (!this.channel || this.status !== "online") return;
    if (!this.opsBucket.consume()) return;
    if (patch.cards.length > 200) return;
    if (!withinByteCap(patch)) return;
    this.patchVersion = Math.max(this.patchVersion, patch.v);
    this.channel.send({ type: "broadcast", event: "game", payload: { type: "patch", payload: patch } as GameMsg });
  }

  sendSnapshot(snap: CardPatch): void {
    if (!this.channel || this.status !== "online") return;
    if (snap.cards.length > 200) return;
    if (!withinByteCap(snap)) return;
    this.channel.send({ type: "broadcast", event: "game", payload: { type: "snapshot", payload: snap } });
  }

  sendCursor(c: CursorMsg): void {
    if (!this.channel || this.status !== "online") return;
    if (!this.cursorBucket.consume()) return;
    this.channel.send({ type: "broadcast", event: "cursor", payload: c });
  }

  private handleGame(payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const msg = payload as { type?: string; payload?: unknown };
    if (msg.type === "patch" || msg.type === "snapshot") {
      const p = msg.payload as Partial<CardPatch> | undefined;
      if (!p || !Array.isArray(p.cards) || typeof p.v !== "number") return;
      if (p.cards.length > 200) return;
      const sanitized: CardPatch = {
        v: safeNumber(p.v),
        by: safeString(p.by, 40),
        cards: p.cards.slice(0, 200).map((c) => ({
          id: safeString(c.id, 32),
          x: safeNumber(c.x),
          y: safeNumber(c.y),
          z: safeNumber(c.z, 0),
          rot: ((typeof c.rot === "number" ? Math.max(0, Math.min(3, Math.round(c.rot))) : 0) as 0 | 1 | 2 | 3),
          faceUp: c.faceUp === true,
          ownerSeat: typeof c.ownerSeat === "number" ? Math.max(-1, Math.min(3, c.ownerSeat)) : null
        }))
      };
      for (const l of this.gameListeners) l({ type: msg.type, payload: sanitized });
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
    const safe: CursorMsg = {
      id: safeString(c.id, 40),
      x: safeNumber(c.x),
      y: safeNumber(c.y),
      seat: typeof c.seat === "number" ? Math.max(0, Math.min(3, c.seat)) : 0
    };
    for (const l of this.cursorListeners) l(safe);
  }

  private emitPresence(): void {
    if (!this.channel) return;
    const state = this.channel.presenceState() as Record<string, Array<Partial<PresencePlayer>>>;
    const players: PresencePlayer[] = [];
    for (const key of Object.keys(state)) {
      const entry = state[key]?.[0];
      if (!entry) continue;
      players.push({
        id: safeString(entry.id || key, 40),
        name: safeString(entry.name, 24) || "Player",
        seat: typeof entry.seat === "number" ? Math.max(0, Math.min(3, entry.seat)) : 0,
        color: safeString(entry.color, 16) || "#c8a45a"
      });
    }
    for (const l of this.presenceListeners) l(players);
  }
}
