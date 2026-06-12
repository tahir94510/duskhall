# Vaerum: Heirs of the Ether

A digital card table for friends, 2 to 4 players. Free movement, no enforced rules; players follow the official rulebook themselves. Built with Vite, TypeScript, and Supabase Realtime.

Vaerum'un arkadaşlarla oynanan dijital kart masası, 2 ila 4 oyuncu. Kartlar serbestçe oynanır, kural dayatması yoktur; oyuncular resmi kural kitabını kendileri uygular. Vite, TypeScript ve Supabase Realtime ile yazıldı.

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
APP_NAME=Vaerum
SITE_URL=https://vaerum.example
OG_IMAGE=https://vaerum.example/assets/og.svg

# Support buttons (each appears in the Support dialog only when its var is set)
SUPPORT_URL=https://your-support-page
PATREON_URL=https://patreon.com/your-page
BUYMEACOFFEE_URL=https://buymeacoffee.com/your-page
NEXT_PUBLIC_APP_URL=https://vaerum.example

# Feedback channels (optional; the Feedback menu row appears if either is set)
ISSUES_URL=https://github.com/<you>/vaerum/issues
FEEDBACK_URL=https://forms.gle/your-anonymous-form
```

`/api/config` is an Edge function that reads these env vars and serves them to the client at runtime. With this path, no keys are baked into the bundle.

The client resolves config from three layers, first one with Supabase creds wins, branding merged across all:

1. **Vite build-time env** (`VITE_*`): for local dev or any static host. Put them in `.env.local`:
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<public anon key>
   # optional: VITE_APP_NAME, VITE_SITE_URL, VITE_OG_IMAGE, VITE_SUPPORT_URL,
   #           VITE_PATREON_URL, VITE_BUYMEACOFFEE_URL
   ```
   These are inlined at build, so they work in `vite dev` and on hosts without the edge function.
2. **`/api/config`**: Vercel runtime env (the **non‑prefixed** `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `APP_NAME` / … names above). No rebuild needed to change them. **This is the production path.**
3. **`public/config.local.json`**: a gitignored local fallback. Copy `public/config.local.json.example`, fill in your URL and public anon key, and never commit it.

**Why some names have `VITE_` and some don't (intentional, not a bug).** Vite only exposes variables that start with `VITE_` to browser code, so those are the *local‑dev* names you put in `.env.local`. In production the browser never reads env directly; it fetches `/api/config`, an Edge function that reads the **plain** names (`SUPABASE_URL`, etc.) on the server and returns them. Same settings, two delivery paths. For your Vercel deployment, use the plain names: exactly the ones you already set.

**Which Supabase key?** Either browser key works: the legacy **anon** key (a JWT starting `eyJ…`) or the newer **publishable** key (`sb_publishable_…`). The anon key is the simplest with the standard setup. **Never** use the `service_role` / `sb_secret_…` keys in the browser; the in‑app connection self‑test warns if you do. No SQL, tables, RLS, or auth setup is needed; the game uses only Realtime Broadcast + Presence, which are on by default.

### Troubleshooting: cards don't sync between players

If actions never reach other players and the menu's **Connection** row reads **Offline**, the client could not reach Supabase Realtime. Check, in order:

1. **Env vars are set in Vercel** (`SUPABASE_URL` and `SUPABASE_ANON_KEY`) and the project was redeployed after setting them. Open `/api/config` in the browser; both values must be present.
2. **Realtime is enabled** for the Supabase project (Project settings → Realtime). No tables or auth are needed; the app uses only Broadcast + Presence.
3. **CSP allows the socket**: `vercel.json` already permits `wss://*.supabase.co`; keep that entry if you fork the CSP.

Two browser tabs on the **same machine** always sync, even while offline, via a local `BroadcastChannel` fallback. So if same-machine tabs sync but two separate devices do not, the cause is the Supabase connection above. The `Cookie "__cf_bm" has been rejected` console message is a harmless Cloudflare bot-management notice and does not affect the websocket.

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
  - Right-click: flip the stack under the cursor (a single card flips alone)
  - Scroll: flip the single card under the cursor
  - Ctrl + scroll: flip the whole stack under the cursor
  - Shift + scroll: rotate 90° sideways; over a pile it turns and squares up the whole stack
  - G: gather the stack under the cursor; M: shuffle it
  - D: tidy your own hand area into a neat, grouped, deck-like layout (matching cards stacked, sorted by type and centred, never crossing into a neighbour's space). You hear it; everyone sees your cards settle.
  - V: turn the table to view it from your left-hand neighbour's side; press again to return. Local view only, nothing changes for anyone else.
  - Long-press on touch: open an action bar (flip, turn sideways, gather, shuffle, tidy your area, info, turn the view). Flip turns the whole pile under your finger, or a lone card if that is all there is. Tidy your area shows only on your own cards.
- **Privacy:** cards you drop into your own zone are private; opponents see their backs and can infer the count, not the contents.
- **URL:** `https://vaerum.example/P86B3T` (6-char path slug per room).
- **Leave room:** opens a fresh room with a new link, with you as host; the others stay in the old room.
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

### Table background (`public/background/`)

Drop a single image to set the backdrop. It is painted full-bleed and fixed
behind everything, so it covers the whole screen at every seat with no black bars
(it does not rotate with the board). It is kept separate from the card art and
card backs so the sets never mix. Only the first image is used; when the folder
is empty an elegant built-in gradient backdrop is used and nothing is fetched.

```json
{ "available": [{ "id": "backdrop", "ext": "webp" }] }
```

Recommended: a large image, 1600 px or wider, calm and mid-to-dark so cards stay
legible (a scrim already darkens the edges). See `public/background/README.md`.

### Audio (`public/audio/`)

Effects and music live in separate folders. Just drop files in and the manifest regenerates on build/dev:

```
public/audio/
  sfx/     flip.mp3, pickup.mp3, place.mp3, shuffle.mp3, gather.mp3, snap.mp3, ui-*.mp3
  music/   any file names; played in order, then looped
```

Missing sounds fall back to procedural Web Audio tones, so a fresh checkout produces zero 404s. The runtime debounces rapid repeats, caps overlapping voices, and ducks music under effects for clean, click-free playback. See `public/audio/README.md`.

In-game **Settings** (Master / Music / Effects) sliders persist to `localStorage`.

## Docs

- `docs/RULES.en.md`: complete English V8.2 rulebook
- `docs/RULES.tr.md`: Türkçe V8.2 kural kitabı
- `docs/CARDS.en.md`: card encyclopedia, every card's effect and flavor (English)
- `docs/CARDS.tr.md`: kart ansiklopedisi, her kartın etkisi ve hikâyesi (Türkçe)
- `docs/DESIGN.md`: balance numbers, palette, coordinate system, asset systems
- `docs/ASSETS.md`: exact art/audio specs and world-consistent prompts for creating or updating assets
- `docs/SECURITY.md`: security model, rate-limits, threat notes, Cloudflare guidance
- `docs/COPYRIGHT.md`: copyright notice and recommended legal steps
- `docs/MAINTAINING.md`: developer directives (changelog/updates convention, supporters, i18n parity, content style, architecture map)

## License

See `LICENSE`. All Vaerum game design, card names, effects, sigils, rulebook text and visual identity are copyright © 2026 the project author. Personal play permitted; commercial use, reprint, derivatives and source redistribution require written permission.
