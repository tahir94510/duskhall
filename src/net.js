const DEFAULT_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  supportUrl: "",
  appUrl: ""
};

export async function loadConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (response.ok) {
      return { ...DEFAULT_CONFIG, ...(await response.json()) };
    }
  } catch {
    // Static local server fallback below.
  }

  try {
    const response = await fetch("/config.local.json", { cache: "no-store" });
    if (response.ok) {
      return { ...DEFAULT_CONFIG, ...(await response.json()) };
    }
  } catch {
    // No local config is fine; the game still works as an offline table.
  }

  return { ...DEFAULT_CONFIG };
}

export class RealtimeBus {
  constructor({ roomId, player, config, onGame, onCursor, onPresence, onStatus }) {
    this.roomId = roomId;
    this.player = player;
    this.config = config;
    this.onGame = onGame;
    this.onCursor = onCursor;
    this.onPresence = onPresence;
    this.onStatus = onStatus;
    this.client = null;
    this.channel = null;
    this.connected = false;
  }

  async connect() {
    const { supabaseUrl, supabaseAnonKey } = this.config;
    if (!supabaseUrl || !supabaseAnonKey) {
      this.onStatus?.("offline", "local table");
      this.onPresence?.([]);
      return false;
    }

    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      this.client = createClient(supabaseUrl, supabaseAnonKey, {
        realtime: { params: { eventsPerSecond: 25 } },
        auth: { persistSession: false, autoRefreshToken: false }
      });

      this.channel = this.client.channel(`kabal:${this.roomId}`, {
        config: {
          broadcast: { self: false, ack: false },
          presence: { key: this.player.id }
        }
      });

      this.channel
        .on("broadcast", { event: "game" }, ({ payload }) => this.onGame?.(payload))
        .on("broadcast", { event: "cursor" }, ({ payload }) => this.onCursor?.(payload))
        .on("presence", { event: "sync" }, () => this.emitPresence())
        .on("presence", { event: "join" }, () => this.emitPresence())
        .on("presence", { event: "leave" }, () => this.emitPresence());

      await new Promise((resolve) => {
        this.channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            this.connected = true;
            this.onStatus?.("online", "realtime ready");
            await this.channel.track({ ...this.player, onlineAt: Date.now() });
            this.emitPresence();
            this.sendGame({ kind: "hello", player: this.player, version: 0, sentAt: Date.now() });
            resolve(true);
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            this.connected = false;
            this.onStatus?.("offline", "local table");
            resolve(false);
          }
        });
      });

      return this.connected;
    } catch (error) {
      console.warn("Realtime disabled:", error);
      this.onStatus?.("offline", "local table");
      return false;
    }
  }

  emitPresence() {
    if (!this.channel) return;
    const presenceState = this.channel.presenceState();
    const players = Object.values(presenceState)
      .flat()
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        color: entry.color,
        joinedAt: entry.joinedAt || entry.onlineAt || Date.now()
      }))
      .filter((entry) => entry.id);
    this.onPresence?.(players);
  }

  sendGame(payload) {
    if (!this.channel || !this.connected) return;
    this.channel.send({ type: "broadcast", event: "game", payload });
  }

  sendCursor(payload) {
    if (!this.channel || !this.connected) return;
    this.channel.send({ type: "broadcast", event: "cursor", payload });
  }

  async disconnect() {
    if (this.channel) {
      try {
        await this.channel.untrack();
        await this.channel.unsubscribe();
      } catch {
        // Ignore disconnect race conditions.
      }
    }
    if (this.client) {
      try {
        await this.client.removeAllChannels();
      } catch {
        // Ignore cleanup race conditions.
      }
    }
    this.connected = false;
  }
}
