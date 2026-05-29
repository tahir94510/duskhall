// Lightweight audio: try /audio/<name>.mp3, otherwise synthesise a placeholder
// tone with the Web Audio API. Users replace the MP3s under public/audio/.

export type SfxName = "flip" | "pickup" | "place" | "shuffle" | "gather" | "snap" | "ui-click" | "ui-open" | "ui-close";

interface ProceduralSpec {
  type: "click" | "swoosh" | "thud" | "riffle" | "chime" | "snap";
  freq?: number;
}

const PROCEDURAL: Record<SfxName, ProceduralSpec> = {
  "flip": { type: "click", freq: 1100 },
  "pickup": { type: "click", freq: 720 },
  "place": { type: "thud", freq: 220 },
  "shuffle": { type: "riffle" },
  "gather": { type: "swoosh", freq: 540 },
  "snap": { type: "snap", freq: 320 },
  "ui-click": { type: "click", freq: 980 },
  "ui-open": { type: "chime", freq: 660 },
  "ui-close": { type: "chime", freq: 440 }
};

// Balanced defaults: sfx sits above music so effects never get buried, and
// the master leaves headroom for the limiter.
const SFX_DEFAULT = 0.7;
const MUSIC_DEFAULT = 0.35;
const MASTER_DEFAULT = 0.8;
// The "auto-balance" target ratio (music vs sfx); master is left to the user.
export const BALANCED_MUSIC = 0.35;
export const BALANCED_SFX = 0.7;

const LS_SFX = "kabal:vol:sfx";
const LS_MUSIC = "kabal:vol:music";
const LS_MASTER = "kabal:vol:master";
const LS_MUTED = "kabal:audio:muted";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private cachedBuffers = new Map<string, AudioBuffer | null>();
  private musicElement: HTMLAudioElement | null = null;
  private musicProcedural: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  private booted = false;
  // Sequential playlist of music file paths, in play order. Looped end-to-end.
  private musicPlaylist: string[] = [];
  private musicIndex = 0;
  // Per-sound retrigger debounce: a rapid repeat of the SAME effect within this
  // window is dropped, so machine-gun triggers never stack into a harsh blast.
  // (Different effects are never debounced against each other.)
  private static readonly RETRIGGER_MS = 45;
  private lastPlayedAt = new Map<SfxName, number>();
  // Active effect voices, oldest first. Capped so a flurry of sounds can never
  // pile up; when the cap is hit the oldest voice is faded out (not cut) so it
  // never clicks.
  private static readonly MAX_VOICES = 10;
  private voices: Array<{ src: AudioBufferSourceNode; gain: GainNode }> = [];

  sfxVolume = readNum(LS_SFX, SFX_DEFAULT);
  musicVolume = readNum(LS_MUSIC, MUSIC_DEFAULT);
  masterVolume = readNum(LS_MASTER, MASTER_DEFAULT);
  muted = readBool(LS_MUTED, false);

  ensureContext(): void {
    if (this.ctx) return;
    try {
      const Ctor = (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!Ctor) return;
      this.ctx = new Ctor();
      // master gain → limiter → destination. The limiter tames peaks so the
      // mix never clips or stings the ears regardless of how many sounds
      // overlap.
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterVolume;
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -18;
      this.limiter.knee.value = 24;
      this.limiter.ratio.value = 4;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.25;
      this.master.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.master);
    } catch {
      this.ctx = null;
    }
  }

  // Resume audio on first user gesture (browsers block autoplay)
  async boot(): Promise<void> {
    if (this.booted) return;
    this.booted = true;
    this.ensureContext();
    if (this.ctx && this.ctx.state === "suspended") {
      try { await this.ctx.resume(); } catch {}
    }
    if (!this.muted) await this.startMusic();
  }

  async play(name: SfxName): Promise<void> {
    if (this.muted) return;
    // Never create / touch an AudioContext before the first user gesture —
    // otherwise the browser logs "AudioContext was not allowed to start".
    if (!this.booted) return;

    // Debounce machine-gun retriggers of the SAME sound. This is what keeps
    // rapid actions from doubling into a distorted blast — without ever cutting
    // a sound short (which is what produced the choppy/clicky audio before).
    const nowMs = performance.now();
    const last = this.lastPlayedAt.get(name) ?? 0;
    if (nowMs - last < AudioEngine.RETRIGGER_MS) return;
    this.lastPlayedAt.set(name, nowMs);

    this.ensureContext();
    if (!this.ctx || !this.sfxGain) return;
    this.duckMusic();
    const { sfx } = await this.loadManifest();
    const path = sfx.get(name);
    if (path) {
      const buf = await this.fetchBuffer(path);
      if (buf) {
        this.playBuffer(buf);
        return;
      }
    }
    this.playProcedural(PROCEDURAL[name]);
  }

  // Play a decoded sample with a click-free 4 ms fade-in, tracked by the voice
  // cap so a flurry of effects can never pile up unbounded.
  private playBuffer(buf: AudioBuffer): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(1, now + 0.004);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    gain.connect(this.sfxGain);
    this.registerVoice(src, gain);
    src.start(now);
  }

  // Track a voice for the global cap. When too many overlap, the oldest is
  // faded out over 50 ms (never hard-cut, so it cannot click) and stopped.
  private registerVoice(src: AudioBufferSourceNode, gain: GainNode): void {
    const voice = { src, gain };
    this.voices.push(voice);
    src.onended = () => {
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
    };
    if (this.voices.length > AudioEngine.MAX_VOICES) {
      const oldest = this.voices.shift();
      if (oldest && this.ctx) {
        try {
          const t = this.ctx.currentTime;
          const g = oldest.gain.gain;
          g.cancelScheduledValues(t);
          g.setValueAtTime(Math.max(g.value, 0.0001), t);
          g.exponentialRampToValueAtTime(0.0001, t + 0.05);
          oldest.src.stop(t + 0.06);
        } catch {}
      }
    }
  }

  private duckTimer = 0;
  // Briefly dip the music so a sound effect always cuts through, then restore.
  private duckMusic(): void {
    if (this.musicVolume <= 0 || this.muted) return;
    // File-based music: ramp the element volume.
    if (this.musicElement) {
      this.musicElement.volume = this.effectiveMusic(0.55);
      window.clearTimeout(this.duckTimer);
      this.duckTimer = window.setTimeout(() => {
        if (this.musicElement) this.musicElement.volume = this.effectiveMusic();
      }, 320);
      return;
    }
    // Procedural music: ramp the gain node.
    if (this.ctx && this.musicGain) {
      const g = this.musicGain.gain;
      const now = this.ctx.currentTime;
      const full = this.musicVolume;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(g.value, full * 0.55), now);
      g.linearRampToValueAtTime(full * 0.55, now + 0.06);
      g.linearRampToValueAtTime(full, now + 0.45);
    }
  }

  // Reads /audio/manifest.json (generated by the Vite plugin) into a sound→path
  // map for effects and an ordered list of music paths. Understands the current
  // split-folder format ({ sfx:[{id,path}], music:[{id,path}] }) and the legacy
  // flat format ({ available:[...] }) so older deploys keep working.
  private manifestPromise: Promise<{ sfx: Map<string, string>; music: string[] }> | null = null;
  private loadManifest(): Promise<{ sfx: Map<string, string>; music: string[] }> {
    if (this.manifestPromise) return this.manifestPromise;
    this.manifestPromise = fetch("/audio/manifest.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((data: { sfx?: unknown; music?: unknown; available?: unknown }) => {
        const sfx = new Map<string, string>();
        const music: string[] = [];

        if (Array.isArray(data.sfx)) {
          for (const e of data.sfx as Array<{ id?: string; path?: string }>) {
            if (e && typeof e.id === "string" && typeof e.path === "string") sfx.set(e.id, e.path);
          }
        }
        if (Array.isArray(data.music)) {
          for (const e of data.music as Array<string | { path?: string }>) {
            if (typeof e === "string") music.push(e);
            else if (e && typeof e.path === "string") music.push(e.path);
          }
        }

        // Legacy { available: [...] } — flat /audio/<name>.<ext> layout.
        if (Array.isArray(data.available)) {
          for (const e of data.available as Array<string | { id: string; ext?: string }>) {
            const id = typeof e === "string" ? e : e?.id;
            if (!id) continue;
            const ext = (typeof e === "string" ? "mp3" : (e.ext || "mp3")).replace(/^\./, "");
            if (/^music[0-9]*$/.test(id)) music.push(`/audio/${id}.${ext}`);
            else sfx.set(id, `/audio/${id}.${ext}`);
          }
          music.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
        }

        this.musicPlaylist = music;
        return { sfx, music };
      });
    return this.manifestPromise;
  }

  private async fetchBuffer(url: string): Promise<AudioBuffer | null> {
    if (this.cachedBuffers.has(url)) return this.cachedBuffers.get(url)!;
    if (!this.ctx) return null;
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) {
        this.cachedBuffers.set(url, null);
        return null;
      }
      const arr = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(arr);
      this.cachedBuffers.set(url, buf);
      return buf;
    } catch {
      this.cachedBuffers.set(url, null);
      return null;
    }
  }

  private playProcedural(spec: ProceduralSpec): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(this.sfxGain);

    switch (spec.type) {
      case "click": {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.setValueAtTime(spec.freq || 1000, now);
        o.frequency.exponentialRampToValueAtTime((spec.freq || 1000) * 0.5, now + 0.08);
        g.gain.setValueAtTime(0.001, now);
        g.gain.exponentialRampToValueAtTime(0.3, now + 0.006);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        o.connect(g);
        o.start(now);
        o.stop(now + 0.13);
        break;
      }
      case "thud": {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(spec.freq || 200, now);
        o.frequency.exponentialRampToValueAtTime(80, now + 0.18);
        g.gain.setValueAtTime(0.001, now);
        g.gain.exponentialRampToValueAtTime(0.28, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        o.connect(g);
        o.start(now);
        o.stop(now + 0.24);
        break;
      }
      case "swoosh": {
        const noise = noiseBuffer(ctx, 0.25);
        const src = ctx.createBufferSource();
        src.buffer = noise;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(1100, now);
        filter.frequency.exponentialRampToValueAtTime(380, now + 0.22);
        filter.Q.value = 5;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.2, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        src.connect(filter);
        filter.connect(g);
        src.start(now);
        src.stop(now + 0.26);
        break;
      }
      case "riffle": {
        // Series of soft tiny clicks.
        for (let i = 0; i < 9; i++) {
          const t = now + i * 0.028;
          const o = ctx.createOscillator();
          const eg = ctx.createGain();
          o.type = "triangle";
          o.frequency.setValueAtTime(900 + Math.random() * 600, t);
          eg.gain.setValueAtTime(0.0001, t);
          eg.gain.exponentialRampToValueAtTime(0.16, t + 0.003);
          eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
          o.connect(eg);
          eg.connect(this.sfxGain);
          o.start(t);
          o.stop(t + 0.06);
        }
        break;
      }
      case "snap": {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.setValueAtTime(spec.freq || 300, now);
        o.frequency.exponentialRampToValueAtTime(120, now + 0.05);
        g.gain.setValueAtTime(0.001, now);
        g.gain.exponentialRampToValueAtTime(0.24, now + 0.006);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        o.connect(g);
        o.start(now);
        o.stop(now + 0.1);
        break;
      }
      case "chime": {
        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        o1.type = "sine";
        o2.type = "sine";
        o1.frequency.setValueAtTime(spec.freq || 600, now);
        o2.frequency.setValueAtTime((spec.freq || 600) * 1.5, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        o1.connect(g);
        o2.connect(g);
        o1.start(now);
        o2.start(now);
        o1.stop(now + 0.45);
        o2.stop(now + 0.45);
        break;
      }
    }
  }

  // Set music + sfx to the balanced ratio; master is left to the user.
  autoBalance(): void {
    this.setMusicVolume(BALANCED_MUSIC);
    this.setSfxVolume(BALANCED_SFX);
  }

  // Effective music level for the file element (which is NOT routed through
  // the WebAudio master, so master is folded in here manually).
  private effectiveMusic(duck = 1): number {
    return this.muted ? 0 : clamp01(this.masterVolume * this.musicVolume * duck);
  }

  async startMusic(): Promise<void> {
    this.ensureContext();
    if (this.musicElement || this.musicProcedural) return;
    const { music } = await this.loadManifest();
    if (music.length > 0) {
      // One <audio> element shared across tracks. A single track loops itself
      // gaplessly; a playlist advances on "ended" and wraps back to the first.
      const el = new Audio();
      el.preload = "auto";
      el.volume = this.effectiveMusic();
      el.addEventListener("ended", () => {
        if (!this.musicElement || this.musicPlaylist.length <= 1) return;
        this.musicIndex = (this.musicIndex + 1) % this.musicPlaylist.length;
        this.playMusicTrack(this.musicIndex);
      });
      this.musicElement = el;
      this.musicIndex = 0;
      this.playMusicTrack(0);
      return;
    }
    // No file: a gentle procedural ambient bed through the WebAudio master.
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 110;
    const osc2 = this.ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = 164.81; // a soft fifth above for warmth
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 5;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = this.ctx.createGain();
    gain.gain.value = 0.16; // audible but calm
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.musicGain);
    osc.start();
    osc2.start();
    lfo.start();
    this.musicProcedural = { osc, lfo, gain };
  }

  // Drive the shared <audio> element to track #i in the playlist. Autoplay
  // blocking is handled by retrying on the next user gesture.
  private playMusicTrack(i: number): void {
    if (!this.musicElement || this.musicPlaylist.length === 0) return;
    const path = this.musicPlaylist[i];
    if (!path) return;
    const el = this.musicElement;
    // A lone track loops itself for a seamless bed; a playlist relies on the
    // "ended" handler to advance, so looping must stay off there.
    el.loop = this.musicPlaylist.length === 1;
    el.src = path;
    el.volume = this.effectiveMusic();
    el.play().catch(() => {
      // Autoplay blocked — retry once on the next user gesture.
      const retry = () => {
        el.play().catch(() => {});
        window.removeEventListener("pointerdown", retry);
        window.removeEventListener("keydown", retry);
      };
      window.addEventListener("pointerdown", retry, { once: true });
      window.addEventListener("keydown", retry, { once: true });
    });
  }

  stopMusic(): void {
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement = null;
    }
    if (this.musicProcedural) {
      try {
        this.musicProcedural.osc.stop();
        this.musicProcedural.lfo.stop();
      } catch {}
      this.musicProcedural = null;
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = clamp01(v);
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
    writeNum(LS_SFX, this.sfxVolume);
  }

  setMusicVolume(v: number): void {
    this.musicVolume = clamp01(v);
    if (this.musicElement) this.musicElement.volume = this.effectiveMusic();
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
    writeNum(LS_MUSIC, this.musicVolume);
  }

  setMasterVolume(v: number): void {
    this.masterVolume = clamp01(v);
    if (this.master) this.master.gain.value = this.muted ? 0 : this.masterVolume;
    if (this.musicElement) this.musicElement.volume = this.effectiveMusic();
    writeNum(LS_MASTER, this.masterVolume);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.masterVolume;
    if (this.musicElement) this.musicElement.volume = this.effectiveMusic();
    writeBool(LS_MUTED, m);
    if (m) this.stopMusic();
    else void this.startMusic();
  }
}

function noiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * durationSec);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = b.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  return b;
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

function readNum(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const n = parseFloat(v);
    return Number.isFinite(n) ? clamp01(n) : fallback;
  } catch { return fallback; }
}
function writeNum(key: string, v: number): void { try { localStorage.setItem(key, String(v)); } catch {} }
function readBool(key: string, fallback: boolean): boolean {
  try { return localStorage.getItem(key) === "1" ? true : localStorage.getItem(key) === "0" ? false : fallback; }
  catch { return fallback; }
}
function writeBool(key: string, v: boolean): void { try { localStorage.setItem(key, v ? "1" : "0"); } catch {} }
