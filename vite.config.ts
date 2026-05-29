import { defineConfig, type Plugin } from "vite";
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Generates /cards/manifest.json and /audio/manifest.json from whatever files
// actually live in public/cards and public/audio. This means a user only has
// to DROP a file (timeRift.webp, flip.mp3, music.mp3) — no manual manifest
// editing — and it works on the next dev start or build, with zero 404s for
// files that aren't there.
function kabalAssetManifest(): Plugin {
  const IMG_EXT = ["webp", "png", "jpg", "jpeg", "svg", "avif"];
  const AUDIO_EXT = ["mp3", "ogg", "wav", "m4a", "aac"];
  const AUDIO_NAMES = new Set([
    "flip", "pickup", "place", "shuffle", "gather", "snap",
    "ui-click", "ui-open", "ui-close", "music"
  ]);

  const generate = () => {
    const pub = resolve(process.cwd(), "public");
    // Cards
    const cardsDir = resolve(pub, "cards");
    const cardEntries: Array<{ id: string; ext: string }> = [];
    if (existsSync(cardsDir)) {
      for (const f of readdirSync(cardsDir)) {
        const dot = f.lastIndexOf(".");
        if (dot < 1) continue;
        const id = f.slice(0, dot);
        const ext = f.slice(dot + 1).toLowerCase();
        if (IMG_EXT.includes(ext)) cardEntries.push({ id, ext });
      }
      writeFileSync(resolve(cardsDir, "manifest.json"), JSON.stringify({ available: cardEntries }, null, 2) + "\n");
    }
    // Audio
    const audioDir = resolve(pub, "audio");
    const audioEntries: Array<{ id: string; ext: string }> = [];
    if (existsSync(audioDir)) {
      for (const f of readdirSync(audioDir)) {
        const dot = f.lastIndexOf(".");
        if (dot < 1) continue;
        const id = f.slice(0, dot);
        const ext = f.slice(dot + 1).toLowerCase();
        if (AUDIO_EXT.includes(ext) && AUDIO_NAMES.has(id)) audioEntries.push({ id, ext });
      }
      writeFileSync(resolve(audioDir, "manifest.json"), JSON.stringify({ available: audioEntries }, null, 2) + "\n");
    }
  };

  return {
    name: "kabal-asset-manifest",
    buildStart() { generate(); },
    configureServer() { generate(); }
  };
}

export default defineConfig({
  base: "/",
  plugins: [kabalAssetManifest()],
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
