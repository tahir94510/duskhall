# KABAL: Heirs of Ether

A digital card table for friends, 2 to 4 players. Free movement, no enforced rules; players follow the official rulebook themselves. Built with Vite, TypeScript, and Supabase Realtime.

KABAL'ın dijital kart masası. 2 ila 4 oyuncu. Kurallar oyuncular tarafından uygulanır; site yalnızca masayı sağlar.

## Stack

- **Vite 6** + **TypeScript 5.7**, zero-framework vanilla DOM modules
- **Supabase Realtime** (Broadcast + Presence); no SQL tables required
- **Vercel** static deployment + one Edge function (`/api/config`) for runtime env
- **Node 22 LTS** for local development (`.nvmrc` shipped)

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
npm run preview  # serves dist/
```

## Environment variables

Set these in Vercel (or `.env.local` for local). All are optional; missing ones use safe fallbacks.

```
# Realtime (required for multiplayer)
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<public anon key>

# Branding (runtime-patched; lets you rename or move domains without a code change)
APP_NAME=KABAL
SITE_URL=https://kabal.example
OG_IMAGE=https://kabal.example/assets/og.svg

# Support button link
SUPPORT_URL=https://your-support-page
NEXT_PUBLIC_APP_URL=https://kabal.example
```

`/api/config` is an Edge function that reads these env vars and serves them to the client at runtime. No keys are baked into the bundle.

## Vercel deployment

```
Framework Preset: Other
Build Command:    npm run build
Output Directory: dist
```

`vercel.json` sets CSP, HSTS, X-Frame-Options DENY, Referrer-Policy and Permissions-Policy headers. Assets and locales have explicit cache headers. The slug rewrite `/<6-char>` routes to the SPA.

## Game

- **Player count:** 4 seats (you + 3 opponents). Empty seats stay dim.
- **Cards:** 72-card deck (16 Seals, 24 Spells, 16 Interventions, 16 Servants).
- **Interaction:**
  - Left-press + drag: move the card under the cursor
  - Ctrl + left-press + drag: move the whole stack
  - Right-click: flip the card(s) under the cursor
  - Scroll: flip the single card under the cursor
  - Ctrl / Shift + scroll up: gather the stack to the cursor
  - Ctrl / Shift + scroll down: shuffle the stack in place
  - Long-press on touch: open a context bar for the same actions
- **Privacy:** cards you drop into your own zone are private; opponents see the count, not the contents.
- **URL:** `https://kabal.example/P86B3T` (6-char path slug per room).
- **Reset room:** opens a fresh room with a new link; current players stay in the old room.
- **Localisation:** English-primary with full Turkish parity. Auto-detected on first visit, remembered after.

## Assets

### Card art (`public/cards/`)

Drop your own card front images and list them in `public/cards/manifest.json`. The runtime only fetches what the manifest declares, so a fresh checkout produces zero 404s.

```json
{ "available": ["timeRift", "etherStrike", "silence"] }
```

or per-card extensions:

```json
{ "available": [{ "id": "timeRift", "ext": "webp" }, { "id": "etherStrike", "ext": "png" }] }
```

Recommended: 640 × 928 px WebP under ~100 KB. See `public/cards/README.md`.

### Audio (`public/audio/`)

Effects and music live in separate folders — just drop files in, the manifest regenerates on build/dev:

```
public/audio/
  sfx/     flip.mp3, pickup.mp3, place.mp3, shuffle.mp3, gather.mp3, snap.mp3, ui-*.mp3
  music/   any file names; played in order, then looped
```

Missing sounds fall back to procedural Web Audio tones, so a fresh checkout produces zero 404s. The runtime debounces rapid repeats, caps overlapping voices, and ducks music under effects for clean, click-free playback. See `public/audio/README.md`.

In-game **Settings** (Master / Music / Effects) sliders persist to `localStorage`.

## Docs

- `docs/RULES.en.md`: complete English V8.1 rulebook
- `docs/RULES.tr.md`: Türkçe V8.1 kural kitabı
- `docs/DESIGN.md`: balance numbers, palette, coordinate system, asset systems
- `docs/SECURITY.md`: security model, rate-limits, threat notes, Cloudflare guidance
- `docs/COPYRIGHT.md`: copyright notice and recommended legal steps

## License

See `LICENSE`. All KABAL game design, card names, effects, sigils, rulebook text and visual identity are copyright © 2026 the project author. Personal play permitted; commercial use, reprint, derivatives and source redistribution require written permission.
