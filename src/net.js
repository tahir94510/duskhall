const DEFAULT_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  supportUrl: "",
  appUrl: ""
};

export async function loadConfig() {
  const sources = ["/api/config", "/config.local.json"];
  for (const url of sources) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const json = await response.json();
        return { ...DEFAULT_CONFIG, ...json };
      }
    } catch {
      // Local/static fallback continues silently.
    }
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
    this.closed = false;
  }

  async connect() {
    const supabaseUrl = String(this.config?.supabaseUrl || "").trim();
    const supabaseAnonKey = String(this.config?.supabaseAnonKey || "").trim();
    if (!supabaseUrl || !supabaseAnonKey) {
      this.onStatus?.("offline", "yerel masa");
      this.onPresence?.([]);
      return false;
    }

    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      if (this.closed) return false;
      this.client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        realtime: { params: { eventsPerSecond: 35 } }
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

      const subscribed = await new Promise((resolve) => {
        const timer = window.setTimeout(() => resolve(false), 8500);
        this.channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            window.clearTimeout(timer);
            this.connected = true;
            this.onStatus?.("online", "eş zamanlı hazır");
            await this.channel.track({ ...this.player, onlineAt: Date.now() });
            this.emitPresence();
            this.sendGame({ kind: "hello", player: this.player, version: 0, sentAt: Date.now(), from: this.player.id });
            resolve(true);
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            window.clearTimeout(timer);
            this.connected = false;
            this.onStatus?.("offline", "yerel masa");
            resolve(false);
          }
        });
      });

      if (!subscribed) this.onStatus?.("offline", "yerel masa");
      return Boolean(subscribed);
    } catch (error) {
      console.warn("Eş zamanlı bağlantı kapalı:", error);
      this.connected = false;
      this.onStatus?.("offline", "yerel masa");
      return false;
    }
  }

  emitPresence() {
    if (!this.channel || !this.connected) return;
    const state = this.channel.presenceState();
    const players = Object.values(state)
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
    if (!this.channel || !this.connected || this.closed) return;
    this.channel.send({ type: "broadcast", event: "game", payload });
  }

  sendCursor(payload) {
    if (!this.channel || !this.connected || this.closed) return;
    this.channel.send({ type: "broadcast", event: "cursor", payload });
  }

  async disconnect() {
    this.closed = true;
    if (this.channel) {
      try { await this.channel.untrack(); } catch {}
      try { await this.channel.unsubscribe(); } catch {}
    }
    if (this.client) {
      try { await this.client.removeAllChannels(); } catch {}
    }
    this.connected = false;
  }
}
