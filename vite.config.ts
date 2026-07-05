import { defineConfig, type Plugin } from "vite";
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Duskhall hosts several games ("modes"). Each mode owns its assets under
//   public/modes/<id>/cards/        card front images (id must match a card def) + optional back.<ext>
//   public/modes/<id>/background/    table surface (first image used)
//   public/modes/<id>/audio/music/   music tracks (any name; played in order)
//   public/modes/<id>/audio/sfx/     optional per-mode sound-effect overrides
//   public/modes/<id>/brand/         icon*.svg, og.png
// Shared, mode-agnostic sound effects live at public/audio/sfx/.
//
// This plugin regenerates every manifest from whatever files exist, so a designer only DROPS a
// file, no manual manifest editing, with zero 404s for assets that aren't there yet. It also
// emits a per-mode HTML shell at build (dist/<id>/index.html) with that mode's title/OG/favicon,
// so social crawlers (which don't run JS) get correct per-game share previews.
function assetManifest(): Plugin {
  const IMG_EXT = ["webp", "png", "jpg", "jpeg", "svg", "avif"];
  const AUDIO_EXT = ["mp3", "ogg", "wav", "m4a", "aac"];
  const SFX_NAMES = new Set([
    "flip", "pickup", "place", "shuffle", "gather", "snap",
    "ui-click", "ui-open", "ui-close", "your-turn"
  ]);

  const splitExt = (f: string): { id: string; ext: string } | null => {
    const dot = f.lastIndexOf(".");
    if (dot < 1) return null;
    return { id: f.slice(0, dot), ext: f.slice(dot + 1).toLowerCase() };
  };
  const isDir = (p: string) => { try { return statSync(p).isDirectory(); } catch { return false; } };

  // Write { available:[{id,ext}] } for every image in `dir`.
  const genImageManifest = (dir: string): void => {
    if (!existsSync(dir)) return;
    const entries: Array<{ id: string; ext: string }> = [];
    for (const f of readdirSync(dir)) {
      const parsed = splitExt(f);
      if (parsed && IMG_EXT.includes(parsed.ext)) entries.push(parsed);
    }
    writeFileSync(resolve(dir, "manifest.json"), JSON.stringify({ available: entries }, null, 2) + "\n");
  };

  // Write { sfx:[{id,path}], music:[{id,path}] } for an audio dir. `urlBase` is the public URL
  // prefix (e.g. "/audio" or "/modes/zan/audio"). Music is optional per call.
  const genAudioManifest = (dir: string, urlBase: string, includeMusic: boolean): void => {
    if (!existsSync(dir)) return;
    const sfx: Array<{ id: string; path: string }> = [];
    const music: Array<{ id: string; path: string }> = [];
    const sfxDir = resolve(dir, "sfx");
    if (isDir(sfxDir)) {
      for (const f of readdirSync(sfxDir)) {
        const parsed = splitExt(f);
        if (parsed && AUDIO_EXT.includes(parsed.ext) && SFX_NAMES.has(parsed.id)) {
          sfx.push({ id: parsed.id, path: `${urlBase}/sfx/${f}` });
        }
      }
    }
    if (includeMusic) {
      const musicDir = resolve(dir, "music");
      if (isDir(musicDir)) {
        for (const f of readdirSync(musicDir)) {
          const parsed = splitExt(f);
          if (parsed && AUDIO_EXT.includes(parsed.ext)) music.push({ id: parsed.id, path: `${urlBase}/music/${f}` });
        }
      }
      music.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" }));
    }
    writeFileSync(resolve(dir, "manifest.json"), JSON.stringify({ sfx, music }, null, 2) + "\n");
  };

  const generate = () => {
    const pub = resolve(process.cwd(), "public");

    // Shared, mode-agnostic sound effects (the default set every mode falls back to).
    genAudioManifest(resolve(pub, "audio"), "/audio", false);

    // Per-mode assets.
    const modesDir = resolve(pub, "modes");
    if (existsSync(modesDir)) {
      for (const id of readdirSync(modesDir)) {
        const modeDir = resolve(modesDir, id);
        if (!isDir(modeDir)) continue;
        genImageManifest(resolve(modeDir, "cards"));
        genImageManifest(resolve(modeDir, "background"));
        genAudioManifest(resolve(modeDir, "audio"), `/modes/${id}/audio`, true);
      }
    }
  };

  // Discover mode ids from the per-mode asset folders (public/modes/*), so shells match the real
  // mode list without a second source of truth. Falls back to the launch modes if none exist.
  const readModeIds = (): string[] => {
    const modesDir = resolve(process.cwd(), "public", "modes");
    if (existsSync(modesDir)) {
      const ids = readdirSync(modesDir).filter((d) => isDir(resolve(modesDir, d)));
      if (ids.length) return ids;
    }
    return ["zan", "vaerum"];
  };

  const SYSTEM_NAME = "Duskhall";
  const esc = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const readModeMeta = (id: string, lang: string): { title: string; description: string } => {
    try {
      const f = resolve(process.cwd(), "public", "locales", "modes", `${id}.${lang}.json`);
      const data = JSON.parse(readFileSync(f, "utf8")) as { meta?: { title?: string; description?: string } };
      return { title: data.meta?.title || id, description: data.meta?.description || "" };
    } catch {
      return { title: id, description: "" };
    }
  };

  // Build the per-mode <head> brand block (title, description, favicons, OG/Twitter, and the
  // pre-boot title map) that replaces the DUSKHALL:BRAND region in the root shell. Social crawlers
  // don't run JS, so this static block is what gives each game its own share preview and icon.
  const brandBlock = (id: string): string => {
    const en = readModeMeta(id, "en");
    const tr = readModeMeta(id, "tr");
    const titleEn = `${en.title} · ${SYSTEM_NAME}`;
    const titleTr = `${tr.title} · ${SYSTEM_NAME}`;
    const root = `/modes/${id}/brand`;
    const og = `${root}/og.png`;
    return [
      `<title>${esc(titleEn)}</title>`,
      `<meta name="description" content="${esc(en.description)}" />`,
      `<link rel="icon" type="image/svg+xml" href="${root}/icon-dark.svg" media="(prefers-color-scheme: dark)" />`,
      `<link rel="icon" type="image/svg+xml" href="${root}/icon-light.svg" media="(prefers-color-scheme: light)" />`,
      `<link rel="icon" type="image/svg+xml" href="${root}/icon.svg" />`,
      `<link rel="apple-touch-icon" href="${root}/icon.svg" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${esc(SYSTEM_NAME)}" />`,
      `<meta property="og:title" content="${esc(titleEn)}" />`,
      `<meta property="og:description" content="${esc(en.description)}" />`,
      `<meta property="og:image" content="${og}" />`,
      `<meta property="og:image:type" content="image/png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${esc(en.title)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${og}" />`,
      `<script>window.__DUSKHALL_TITLES__ = ${JSON.stringify({ en: titleEn, tr: titleTr })};</script>`
    ].map((l) => `    ${l}`).join("\n");
  };

  // Build per-mode HTML shells: dist/<id>/index.html, a copy of the root index.html with the mode
  // id stamped into <meta name="duskhall-mode"> (so the client boots that mode at a bare /<id>/
  // URL) and the DUSKHALL:BRAND region rewritten to that game's title/OG/favicon.
  const BRAND_RE = /<!-- DUSKHALL:BRAND:START -->[\s\S]*?<!-- DUSKHALL:BRAND:END -->/;
  const emitShells = (distDir: string): void => {
    const rootHtml = resolve(distDir, "index.html");
    if (!existsSync(rootHtml)) return;
    const html = readFileSync(rootHtml, "utf8");
    for (const id of readModeIds()) {
      let shell = /<meta\s+name="duskhall-mode"/i.test(html)
        ? html.replace(/<meta\s+name="duskhall-mode"[^>]*>/i, `<meta name="duskhall-mode" content="${id}">`)
        : html.replace(/<head>/i, `<head>\n    <meta name="duskhall-mode" content="${id}">`);
      shell = shell.replace(
        BRAND_RE,
        `<!-- DUSKHALL:BRAND:START -->\n${brandBlock(id)}\n    <!-- DUSKHALL:BRAND:END -->`
      );
      const outDir = resolve(distDir, id);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, "index.html"), shell);
    }
  };

  return {
    name: "duskhall-asset-manifest",
    buildStart() { generate(); },
    configureServer() { generate(); },
    closeBundle() { emitShells(resolve(process.cwd(), "dist")); }
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
