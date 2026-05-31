import { defineConfig, type Plugin } from "vite";
import { readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

// Generates /cards/manifest.json and /audio/manifest.json from whatever files
// actually live under public/. A user only has to DROP a file, with no manual
// manifest editing, and it works on the next dev start or build, with zero
// 404s for files that aren't there.
//
// Audio is split into two folders so effects and music stay tidy:
//   public/audio/sfx/<name>.<ext>     effect sounds (name must match a SfxName)
//   public/audio/music/<anything>.<ext>  music tracks (any name; play in order)
// A flat public/audio/<file> layout is still honoured for backwards
// compatibility, but the folders are the documented convention.
function assetManifest(): Plugin {
  const IMG_EXT = ["webp", "png", "jpg", "jpeg", "svg", "avif"];
  const AUDIO_EXT = ["mp3", "ogg", "wav", "m4a", "aac"];
  const SFX_NAMES = new Set([
    "flip", "pickup", "place", "shuffle", "gather", "snap",
    "ui-click", "ui-open", "ui-close"
  ]);
  // Legacy flat-layout music naming: "music", "music1", "music2", …
  const LEGACY_MUSIC_RE = /^music[0-9]*$/;

  const splitExt = (f: string): { id: string; ext: string } | null => {
    const dot = f.lastIndexOf(".");
    if (dot < 1) return null;
    return { id: f.slice(0, dot), ext: f.slice(dot + 1).toLowerCase() };
  };
  const isDir = (p: string) => { try { return statSync(p).isDirectory(); } catch { return false; } };

  const generate = () => {
    const pub = resolve(process.cwd(), "public");

    // ---- Cards ----
    const cardsDir = resolve(pub, "cards");
    if (existsSync(cardsDir)) {
      const cardEntries: Array<{ id: string; ext: string }> = [];
      for (const f of readdirSync(cardsDir)) {
        const parsed = splitExt(f);
        if (parsed && IMG_EXT.includes(parsed.ext)) cardEntries.push(parsed);
      }
      writeFileSync(resolve(cardsDir, "manifest.json"), JSON.stringify({ available: cardEntries }, null, 2) + "\n");
    }

    // ---- Background (table surface) ----
    // Separate folder and manifest from cards so the two image sets never mix.
    // Only the first entry is used as the active table surface.
    const bgDir = resolve(pub, "background");
    if (existsSync(bgDir)) {
      const bgEntries: Array<{ id: string; ext: string }> = [];
      for (const f of readdirSync(bgDir)) {
        const parsed = splitExt(f);
        if (parsed && IMG_EXT.includes(parsed.ext)) bgEntries.push(parsed);
      }
      writeFileSync(resolve(bgDir, "manifest.json"), JSON.stringify({ available: bgEntries }, null, 2) + "\n");
    }

    // ---- Audio ----
    const audioDir = resolve(pub, "audio");
    if (existsSync(audioDir)) {
      const sfx: Array<{ id: string; path: string }> = [];
      const music: Array<{ id: string; path: string }> = [];

      // Preferred layout: public/audio/sfx and public/audio/music.
      const sfxDir = resolve(audioDir, "sfx");
      if (isDir(sfxDir)) {
        for (const f of readdirSync(sfxDir)) {
          const parsed = splitExt(f);
          if (parsed && AUDIO_EXT.includes(parsed.ext) && SFX_NAMES.has(parsed.id)) {
            sfx.push({ id: parsed.id, path: `/audio/sfx/${f}` });
          }
        }
      }
      const musicDir = resolve(audioDir, "music");
      if (isDir(musicDir)) {
        for (const f of readdirSync(musicDir)) {
          const parsed = splitExt(f);
          if (parsed && AUDIO_EXT.includes(parsed.ext)) {
            music.push({ id: parsed.id, path: `/audio/music/${f}` });
          }
        }
      }

      // Backwards compatibility: flat files dropped straight into public/audio.
      for (const f of readdirSync(audioDir)) {
        const full = resolve(audioDir, f);
        if (isDir(full)) continue;
        const parsed = splitExt(f);
        if (!parsed || !AUDIO_EXT.includes(parsed.ext)) continue;
        if (SFX_NAMES.has(parsed.id) && !sfx.some((e) => e.id === parsed.id)) {
          sfx.push({ id: parsed.id, path: `/audio/${f}` });
        } else if (LEGACY_MUSIC_RE.test(parsed.id)) {
          music.push({ id: parsed.id, path: `/audio/${f}` });
        }
      }

      // Natural sort music by name so "track2" precedes "track10".
      music.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" }));

      writeFileSync(
        resolve(audioDir, "manifest.json"),
        JSON.stringify({ sfx, music }, null, 2) + "\n"
      );
    }
  };

  return {
    name: "vaerum-asset-manifest",
    buildStart() { generate(); },
    configureServer() { generate(); }
  };
}

export default defineConfig({
  base: "/",
  plugins: [assetManifest()],
  build: {
    target: "es2022",
    outDir: "dist",
    assetsInlineLimit: 4096,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  server: {
    port: 5173,
    host: true,
    strictPort: false
  },
  preview: {
    port: 5173,
    host: true
  }
});
