# Duskhall Asset Guide (master reference)

Every visual and audio asset in Duskhall, where it lives, its exact format and size, and how the
default vs. custom (your own) override works. This is the platform-level reference; each game's
own generation prompts live in `docs/modes/<id>/ASSETS.md`.

## The override model (read this first)

Duskhall ships a complete, high-quality **default** set so a fresh checkout looks finished with
zero missing pieces. You replace any of it with your own, and can always fall back to the default.
There are two override mechanisms, by asset type:

- **Manifest-driven (cards, background, music, per-game sfx):** drop a file into the folder and the
  Vite plugin lists it in that folder's `manifest.json` on the next build/dev; the runtime uses
  whatever the manifest declares. **Delete the file and the default fallback returns automatically**
  (placeholder card faces, the built-in CSS card back, the gradient table surface, or silence).
  You never edit a manifest by hand.
- **Shipped default files (brand SVGs, system icons, OG images):** these are committed files at a
  fixed path. To use your own, **replace the file** at that path (keep the same name). The shipped
  default is version-controlled, so `git checkout <path>` always restores it. A brand SVG that is
  deleted (not replaced) falls back to the platform mark where possible (see Brand below).

Result: if you upload nothing, the defaults render. If you add your own (following the specs
below), yours render. If you remove yours, the defaults return.

## Golden rules

- **Small-size legibility.** Favicons and the top-left logo render as small as 16 px. Keep marks
  bold and simple: one clear silhouette, generous stroke weight, no fine detail that muddies when
  shrunk. The shipped SVG marks fill their canvas and read cleanly at 16 px.
- **Transparency.** Logo/brand SVGs are transparent (no background box) so they sit on any surface.
  Card fronts, card backs, and table surfaces are fully opaque (no transparency needed). The OG
  share image is opaque.
- **One coherent set per game.** A game's card fronts, card back, and table surface must read as
  one designed family (palette, contrast, line weight). See the game's `docs/modes/<id>/ASSETS.md`.
- **Contrast, not glare.** Mid-to-dark, atmospheric. Never so bright it glares, never so dark the
  cards are unreadable. Cards stay legible against the table (a scrim already darkens the edges).

## System (platform) assets

These represent Duskhall itself, used at the root `/` and in the installable app manifest.

| Asset | Path | Format | Size | Transparent | Notes |
|-------|------|--------|------|:-----------:|-------|
| App icon | `public/assets/icon.svg` | SVG | 48×64 viewBox | Yes | The Duskhall mark; favicon + apple-touch fallback. |
| Icon (dark UI) | `public/assets/icon-dark.svg` | SVG | 48×64 | Yes | Shown to viewers in dark mode (ivory stroke). |
| Icon (light UI) | `public/assets/icon-light.svg` | SVG | 48×64 | Yes | Shown in light mode (ink stroke). |
| Maskable icon | `public/assets/icon-maskable.svg` | SVG | 512×512 | No | Solid dark ground; mark inside the ~80% safe zone for Android adaptive masks. |
| Share image | `public/assets/og.png` | PNG | 1200×630 | No | Link-preview image for the platform root. Social scrapers reject SVG, so this is PNG. |

The default Duskhall mark is a dusk-hall archway with a moon within, drawn in ivory `#f3efe5`.

## Per-game assets

Each game owns a folder under `public/modes/<id>/`. `<id>` is the mode id (`zan`, `vaerum`, ...).

### Brand (the game's logo)

| Asset | Path | Format | Size | Transparent | Notes |
|-------|------|--------|------|:-----------:|-------|
| Logo | `public/modes/<id>/brand/icon.svg` | SVG | 48×64 viewBox | Yes | The top-left logo AND the tab favicon for this game. |
| Logo (dark UI) | `public/modes/<id>/brand/icon-dark.svg` | SVG | 48×64 | Yes | Dark-mode favicon variant. |
| Logo (light UI) | `public/modes/<id>/brand/icon-light.svg` | SVG | 48×64 | Yes | Light-mode favicon variant. |
| Share image | `public/modes/<id>/brand/og.png` | PNG | 1200×630 | No | Link-preview for `/<id>/…`. Optional; if absent the link preview simply has no image. |

The three `icon*.svg` files ship as defaults. To use your own logo, replace them (same names,
same 48×64 viewBox, transparent). If a game's brand icon is missing, the branding falls back to the
platform mark (`/assets/icon.svg`), so a favicon always shows.

### Card fronts and back

| Asset | Path | Format | Size | Transparent | Notes |
|-------|------|--------|------|:-----------:|-------|
| Card front | `public/modes/<id>/cards/<cardId>.webp` | WebP | 640×928 px | No | One per card face; `<cardId>` matches the mode's deck (e.g. `raven`). Under ~100 KB each. |
| Card back | `public/modes/<id>/cards/back.webp` | WebP | 640×928 px | No | Shared by every card. Only used if the mode declares `hasCardBackImage`; otherwise the built-in CSS back shows. |

Missing a front image shows a tasteful placeholder face (the card name over the mode's dark ground),
so an in-progress deck never shows broken images. Add the WebP and it takes over on the next build.

### Table surface

| Asset | Path | Format | Size | Transparent | Notes |
|-------|------|--------|------|:-----------:|-------|
| Table | `public/modes/<id>/background/tableSurface.webp` | WebP | 2560×1440 px (16:9) | No | Full-bleed backdrop. Only the first image in the folder is used. Under ~400 KB. |

An empty folder makes no request; the built-in CSS gradient surface shows through. High resolution
keeps it crisp on large and high-DPI screens; the fixed layer scales to any viewport with no bars.

### Audio

| Asset | Path | Format | Notes |
|-------|------|--------|-------|
| Music | `public/modes/<id>/audio/music/*.mp3` | MP3 | Any file names; played in a fair shuffle, then looped. No music = silence (there is no synthesized fallback bed). |
| SFX override | `public/modes/<id>/audio/sfx/<name>.mp3` | MP3 | Optional per-game override of a shared effect. `<name>` must match a sound id (see shared SFX). |

### Supporters

| Asset | Path | Format | Notes |
|-------|------|--------|-------|
| Supporters | `public/modes/<id>/supporters.json` | JSON | A plain array of display names for that game's Support wall. Ships as `[]`. |

## Shared assets (all games)

| Asset | Path | Format | Notes |
|-------|------|--------|-------|
| Sound effects | `public/audio/sfx/<name>.mp3` | MP3 | The default effect set, shared by every game. Sound ids: `flip`, `pickup`, `place`, `shuffle`, `gather`, `snap`, `ui-click`, `ui-open`, `ui-close`, `your-turn`. |

A missing effect file falls back to a clean synthesized tone (never a crackle); a game may override
any effect under its own `audio/sfx/`. Effects fade in and out, so they never click.

## Making the assets

- **Raster (cards, card back, table surface, OG images):** generate with an image model (Midjourney,
  DALL-E, etc.), then export to the format/size above (WebP for cards/table, PNG for OG). Each
  game's refined, ready-to-paste prompts are in `docs/modes/<id>/ASSETS.md`.
- **Vector (brand SVGs, system marks):** image models do NOT produce clean SVG, so these are hand-
  authored (or generated with a code-capable model like ChatGPT or Gemini that can output SVG
  markup, then hand-checked). Keep them to a few crisp paths on a transparent 48×64 viewBox, filling
  the canvas and legible at 16 px. Match the weight and simplicity of the shipped marks. There is no
  Midjourney prompt for these; describe the mark and generate the SVG markup directly, or edit the
  shipped file.
- **OG PNG from an SVG:** if you design a share image as SVG and want the PNG social scrapers need,
  render it with `scripts/make-og.mjs` (see the script's header for usage).

## Where the runtime reads each asset

- Brand/favicon/OG/title: `src/ui/branding.ts` (per game, patched at runtime on a game switch).
- Card art + back: `src/table/Card.ts` (`loadManifest`, `applyCardBack`).
- Table surface: `src/table/Background.ts`.
- Audio: `src/audio/Audio.ts` (shared sfx + per-game music/sfx).
- Manifests are generated by the `assetManifest()` plugin in `vite.config.ts`.
