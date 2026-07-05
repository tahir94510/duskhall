// Same-device fallback transport built on the browser's BroadcastChannel.
//
// Supabase Realtime carries play ACROSS devices. But when it is unconfigured or
// unreachable (no env vars, a blocked websocket, an offline dev box), every
// `send*` on the RealtimeBus is a silent no-op, which is exactly what makes the
// app feel "totally broken" — nothing an opponent does ever shows up. This
// transport closes that gap for the common "two tabs / two windows on ONE
// machine" case: it mirrors the same game/cursor/presence messages between tabs
// of the same origin, so a player can always see live sync working and a
// misconfiguration is obvious (the in-app indicator shows "offline" while tabs
// still talk locally) instead of silently dead.
//
// It is intentionally simple: no rate limiting (a local tab is trusted) and a
// tiny presence heartbeat so seats resolve just like they do online. The wire
// shape mirrors RealtimeBus so Game.ts needs no special-casing.

import type { CursorMsg, GameMsg, PresencePlayer } from "./realtime.js";

type GameCb = (msg: GameMsg) => void;
type CursorCb = (c: CursorMsg) => void;
type PresenceCb = (players: PresencePlayer[]) => void;

interface Envelope {
  kind: "game" | "cursor" | "presence" | "leave";
  from: string;
  room: string;
  game?: GameMsg;
  cursor?: CursorMsg;
  player?: PresencePlayer;
}

// How often each tab re-announces itself, and how long without a beat before a
// peer is considered gone. Generous enough that a busy tab is never dropped.
const HEARTBEAT_MS = 1500;
const PRESENCE_TTL_MS = 4000;

export class LocalBus {
  private channel: BroadcastChannel | null = null;
  private room = "";
  private me: PresencePlayer | null = null;
  private gameCbs = new Set<GameCb>();
  private cursorCbs = new Set<CursorCb>();
  private presenceCbs = new Set<PresenceCb>();
  // Last-seen wall-clock for every peer (including self), keyed by client id.
  private peers = new Map<string, { player: PresencePlayer; seen: number }>();
  private heartbeat = 0;
  private sweep = 0;

  static isSupported(): boolean {
    return typeof BroadcastChannel !== "undefined";
  }

  onGame(cb: GameCb): () => void { this.gameCbs.add(cb); return () => this.gameCbs.delete(cb); }
  onCursor(cb: CursorCb): () => void { this.cursorCbs.add(cb); return () => this.cursorCbs.delete(cb); }
  onPresence(cb: PresenceCb): () => void { this.presenceCbs.add(cb); return () => this.presenceCbs.delete(cb); }

  /** Join (or switch to) a room's local channel. Safe to call repeatedly. The mode namespaces
   *  the channel so two same-machine tabs in different games never cross-sync on a shared slug. */
  connect(room: string, me: PresencePlayer, mode = "zan"): void {
    if (!LocalBus.isSupported()) return;
    const key = `${mode}:${room}`;
    if (this.room === key && this.channel) { this.me = me; this.announce(); return; }
    this.teardown();
    this.room = key;
    this.me = me;
    // One channel per (mode, room) so two different rooms/games on the same machine stay apart.
    this.channel = new BroadcastChannel(`duskhall-local:${key}`);
    this.channel.onmessage = (e: MessageEvent) => this.onMessage(e.data as Envelope);
    this.peers.clear();
    this.touchSelf();
    this.announce();
    this.heartbeat = startInterval(() => { this.touchSelf(); this.announce(); }, HEARTBEAT_MS);
    this.sweep = startInterval(() => this.pruneStale(), HEARTBEAT_MS);
    this.emitPresence();
  }

  updateMe(me: PresencePlayer): void {
    this.me = me;
    this.touchSelf();
    this.announce();
  }

  sendGame(msg: GameMsg): void {
    this.post({ kind: "game", from: this.selfId(), room: this.room, game: msg });
  }

  sendCursor(c: CursorMsg): void {
    this.post({ kind: "cursor", from: this.selfId(), room: this.room, cursor: c });
  }

  /** Announce a clean departure so the other tabs drop our seat at once. */
  leave(): void {
    if (!this.channel || !this.me) return;
    this.post({ kind: "leave", from: this.selfId(), room: this.room });
  }

  disconnect(): void {
    this.leave();
    this.teardown();
    // Tabs that close report empty presence so the UI clears their ghosts.
    this.peers.clear();
    this.emitPresence();
  }

  private selfId(): string { return this.me?.id ?? ""; }

  private touchSelf(): void {
    if (!this.me) return;
    this.peers.set(this.me.id, { player: this.me, seen: Date.now() });
  }

  private announce(): void {
    if (!this.me) return;
    this.post({ kind: "presence", from: this.me.id, room: this.room, player: this.me });
  }

  private post(env: Envelope): void {
    if (!this.channel) return;
    try { this.channel.postMessage(env); } catch { /* clone failure: ignore */ }
  }

  private onMessage(env: Envelope): void {
    if (!env || env.room !== this.room) return;
    if (env.from && env.from === this.selfId()) return; // never echo our own
    switch (env.kind) {
      case "game":
        if (env.game) for (const cb of this.gameCbs) cb(env.game);
        break;
      case "cursor":
        if (env.cursor) for (const cb of this.cursorCbs) cb(env.cursor);
        break;
      case "presence":
        if (env.player) {
          const isNew = !this.peers.has(env.player.id);
          this.peers.set(env.player.id, { player: env.player, seen: Date.now() });
          this.emitPresence();
          // A peer we hadn't seen just announced: echo our own presence straight
          // back so a tab that connected after us learns about us at once, instead
          // of waiting a full heartbeat. Guard with isNew so two tabs don't ping
          // each other forever.
          if (isNew) this.announce();
        }
        break;
      case "leave":
        if (env.from && this.peers.delete(env.from)) this.emitPresence();
        break;
    }
  }

  private pruneStale(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, rec] of this.peers) {
      if (id === this.selfId()) continue;
      if (now - rec.seen > PRESENCE_TTL_MS) { this.peers.delete(id); changed = true; }
    }
    if (changed) this.emitPresence();
  }

  private emitPresence(): void {
    const players = Array.from(this.peers.values()).map((r) => r.player);
    for (const cb of this.presenceCbs) cb(players);
  }

  private teardown(): void {
    stopInterval(this.heartbeat); this.heartbeat = 0;
    stopInterval(this.sweep); this.sweep = 0;
    if (this.channel) {
      try { this.channel.close(); } catch { /* ignore */ }
      this.channel = null;
    }
  }
}

// setInterval shims that work in both the browser and a bare Node test runner.
function startInterval(fn: () => void, ms: number): number {
  return (setInterval(fn, ms) as unknown as number);
}
function stopInterval(handle: number): void {
  if (handle) clearInterval(handle as unknown as ReturnType<typeof setInterval>);
}
