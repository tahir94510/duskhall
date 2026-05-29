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
    this.ensureContext();
    if (!this.ctx || !this.sfxGain) return;
    this.duckMusic();
    const manifest = await this.loadManifest();
    const ext = manifest.get(name);
    if (ext) {
      const buf = await this.fetchBuffer(`/audio/${name}.${ext}`);
      if (buf) {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.sfxGain);
        src.start();
        return;
      }
    }
    this.playProcedural(PROCEDURAL[name]);
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

  // Maps a sound name to the file extension that actually exists (or "" if the
  // file is absent, in which case we fall back to the procedural synth).
  private manifestPromise: Promise<Map<string, string>> | null = null;
  private loadManifest(): Promise<Map<string, string>> {
    if (this.manifestPromise) return this.manifestPromise;
    this.manifestPromise = fetch("/audio/manifest.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : { available: [] }))
      .catch(() => ({ available: [] }))
      .then((data: { available?: unknown }) => {
        const map = new Map<string, string>();
        if (Array.isArray(data.available)) {
          for (const e of data.available as Array<string | { id: string; ext?: string }>) {
            if (typeof e === "string") map.set(e, "mp3");
            else if (e && typeof e.id === "string") map.set(e.id, (e.ext || "mp3").replace(/^\./, ""));
          }
        }
        return map;
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
    const manifest = await this.loadManifest();
    const musicExt = manifest.get("music");
    if (musicExt) {
      // A real music file: drive it as a plain looping <audio> element with
      // its own .volume. This sidesteps the cross-browser quirks of routing a
      // MediaElementSource through WebAudio, which was the reason music could
      // silently fail to play.
      const el = new Audio(`/audio/music.${musicExt}`);
      el.loop = true;
      el.preload = "auto";
      el.volume = this.effectiveMusic();
      this.musicElement = el;
      try {
        await el.play();
      } catch {
        // Autoplay can still be blocked; retry on the next user gesture.
        const retry = () => {
          el.play().catch(() => {});
          window.removeEventListener("pointerdown", retry);
          window.removeEventListener("keydown", retry);
        };
        window.addEventListener("pointerdown", retry, { once: true });
        window.addEventListener("keydown", retry, { once: true });
      }
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
