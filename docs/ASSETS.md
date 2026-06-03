# Vaerum Asset Guide

The single reference for creating or updating Vaerum's visual and audio assets:
card art, the table background, audio, and the logo / social preview. It records
the exact technical specs the runtime expects and gives world-consistent prompts
so anything you generate fits the game.

Vaerum is a quiet, mystical world built around the **Ether**, a sourceless power
fractured long ago. The tone is dark, restrained and elegant: near-black grounds,
ivory (`#f3efe5`) line work, calm light. Nothing garish, busy or neon. Every
asset is optional: when it is missing, the runtime falls back gracefully (blank
card face, a built-in gradient background, procedural audio), so a fresh checkout
produces zero broken images or 404s.

---

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| Ink | `#050505`-`#000000` | Backgrounds, card grounds |
| Ivory | `#f3efe5` | Logo, line work, primary text |
| Ivory dim | `#b8b4aa` | Secondary text |
| Ivory mute | `#837f76` | Tertiary text, hints |

### Card type colours (`src/game/cards.ts` → `CATEGORY_META`)

Each card belongs to one of four types, each with a canonical hue. Use the type
hue as the dominant background tint of that card's art, plus the per-card accent
for a small focal highlight.

| Type | Hue | Hex | Meaning |
| --- | --- | --- | --- |
| Seal | Violet | `#7a4ed1` | Passive power; the path to victory |
| Spell | Crimson | `#c8444a` | A single-use attack, then discarded |
| Intervention | Azure | `#3c7fc8` | Played any time, costs no HP |
| Servant | Verdant | `#3c9a6a` | Shields your Seals; unique abilities |

---

## Card art (`public/cards/`)

**Spec**

- **Aspect ratio:** 1 : 1.45 (portrait), matching the card frame exactly.
- **Resolution:** 640 × 928 px recommended.
- **Format:** WebP (lossy, quality ~85) preferred; PNG / JPG / AVIF also load.
- **File size:** aim for ≤ ~100 KB each.
- **Bleed:** design to the edges; the runtime clips to an 8 px corner radius.
- **No transparency needed:** a solid, type-tinted ground is ideal.

**Manifest**: `public/cards/manifest.json`. The runtime only fetches what the
manifest lists, so add a card's file there to enable it:

```json
{ "available": [{ "id": "timeRift", "ext": "webp" }] }
```

**Runtime:** `src/table/Card.ts` (`loadManifest`, `preloadCardArt`) reads the
manifest once and preloads on demand. A missing file leaves a clean blank face.
The same art is also sliced into the card-info panel (`src/ui/Tooltip.ts`), so the
**top of the image** should carry the subject (that band is what the panel shows).

**Composition prompt (shared base).** Vary the subject per card:

> Vertical card illustration, 640×928, dark mystical fantasy, painterly but
> restrained. Near-black ground tinted with **{TYPE HUE}**, a single focal
> subject centred slightly high, calm directional light, subtle **{ACCENT}**
> rim-light. No text, no border, no frame, no card UI, no people unless named.
> Muted, elegant, low-noise; matte finish; cohesive with a quiet occult world
> built around a fractured power called the Ether.

**Per-card subjects** (type hue from the table above; accent from `cards.ts`):

| Card | Type | Subject seed (from its flavour) |
| --- | --- | --- |
| Time Rift | Seal | A hairline crack in the air widening like a fracture in an hourglass |
| Veil of Void | Seal | A falling veil under which the world dissolves into unseen dark |
| Crimson Monolith | Seal | A rust-red monolith throne, weathered and resolute |
| Necromancer's Eye | Seal | A patient, ledger-keeping eye over rows of the dead |
| Ether Strike | Spell | A single clean luminous cut splitting darkness |
| Shadow Theft | Spell | A hand lifting a glowing secret out of a shadow |
| Ancient Sight | Spell | An unblinking ancient eye opening in stone |
| Mind Parasite | Spell | A key turning in a door shaped like a skull's thought |
| Twist of Fate | Spell | A turning wheel of fortune that asks no permission |
| Silence! | Intervention | A judge's gavel mid-strike, sound swallowed |
| Karmic Reflection | Intervention | A mirror returning a strike to its sender |
| Blood Atonement | Intervention | A vow sealed in slow heartbeats of blood |
| Runic Warden | Servant | An iron sentinel etched with patient runes |
| Glacial Aberration | Servant | A frozen aberration keeping its own slow winter |
| Shadow Slayer | Servant | A figure to whom even shadows answer |

---

## Card back

The card back is **CSS-painted** (`src/styles/card.css` → `.card__face--back`):
a near-black ground, a fine inner frame, and the Vaerum rhombus emblem at low
opacity. No image asset is required. To change it, edit that rule rather than
adding a file.

---

## Table background (`public/background/`)

**Spec**

- **Resolution:** 1600 × 1600 px or larger (the field is square and uses `cover`).
- **Format:** WebP (quality ~82) preferred; PNG / JPG / AVIF also load.
- **Orientation:** fixed, the background does **not** rotate per seat, so paint
  it upright.
- **Tone:** mid-to-dark, calm, low contrast. Cards must stay legible on top, and a
  scrim already darkens the edges. Avoid bright centres, busy detail or hard focal
  points under the play area.

**Manifest**: `public/background/manifest.json`; only the first entry is used:

```json
{ "available": [{ "id": "tableSurface", "ext": "webp" }] }
```

**Runtime:** `src/table/Background.ts` fades the image onto a fixed full-bleed
layer. With no image, an elegant built-in gradient shows and nothing is fetched.

**Prompt:**

> Seamless dark table surface, top-down, 1600×1600, very low contrast, calm and
> uniform, faint central vignette, near-black with a whisper of cool violet-grey.
> No objects, no focal point, no text. Subtle matte texture only; nothing that
> competes with cards laid on top.

---

## Audio (`public/audio/`)

**SFX**: `public/audio/sfx/`. File names must match these ids:
`flip`, `pickup`, `place`, `shuffle`, `gather`, `snap`, `ui-open`, `ui-close`,
`ui-click`. Keep each under ~250 ms for a snappy feel.

**Music**: `public/audio/music/`. Any file names; played in natural-sort order
(`music2` before `music10`), then looped.

- **Formats:** MP3 / OGG / WAV / M4A / AAC all load.
- **Mixing (handled by `src/audio/Audio.ts`):** a master limiter, music ducks
  under effects, rapid repeats are debounced, and overlapping voices are capped.
- **Fallback:** a missing sound is replaced by a procedural Web Audio tone, so the
  game is never silent and never 404s.

**Direction:** effects are soft, woody, tactile (real cards on felt), never harsh
or synthetic. Music is ambient, sparse and unobtrusive: long, dark, slow, with
no strong melody or percussion that would tire a long session.

---

## Logo, icon, and social preview (`public/assets/`)

**The mark:** a vertical rhombus with a centre axis and a dot, ivory on near-black
(`icon.svg`, viewBox 48 × 64). It appears as the favicon, the header brand, the
loading-screen pulse, and the card back, so any change must stay consistent across
all of them.

| File | Purpose | Notes |
| --- | --- | --- |
| `icon.svg` | Favicon + header mark | 3 : 4 portrait; keep this ratio (don't force square) |
| `icon-dark.svg` / `icon-light.svg` | Theme favicons | Same mark, light/dark stroke |
| `icon-maskable.svg` | PWA maskable icon | **Square** 512 × 512, emblem inside the ~80% safe zone on a solid ground, so adaptive-icon masks never clip it |
| `og.png` | Social / link preview | **Raster** 1200 × 630; most scrapers reject SVG, so this must stay a PNG |

**Regenerating `og.png`.** It is a 1200 × 630 PNG: emblem centred over a calm dark
ground with a soft central glow, the `VAERUM` wordmark, the `HEIRS OF THE ETHER`
line, and the tagline. To re-render from an SVG design, rasterise with any tool
(e.g. `sharp`, `rsvg-convert`, or a headless browser) at exactly 1200 × 630 and
keep it ≤ ~60 KB. Override per-deployment with the `OG_IMAGE` env var if needed.

**Prompt (if redrawing the preview):**

> 1200×630 social banner, near-black ground with a soft central radial glow,
> a minimal ivory line emblem (vertical rhombus with a centre axis and dot)
> centred above the wordmark "VAERUM", subtitle "HEIRS OF THE ETHER", and a small
> muted tagline "A digital card table for friends". Calm, elegant, lots of
> negative space. No card art, no clutter.
