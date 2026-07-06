# Duskhall

A shared digital card table for friends, 2 to 4 players. One table engine, many games ("modes").
Free movement, no enforced rules; players follow each game's rulebook themselves. Built with Vite,
TypeScript, and Supabase Realtime.

Duskhall arkadaşlarla oynanan dijital bir kart masasıdır, 2 ila 4 oyuncu. Tek bir masa motoru,
birçok oyun ("mod"). Kartlar serbestçe oynanır, kural dayatması yoktur; oyuncular her oyunun kural
kitabını kendileri uygular. Vite, TypeScript ve Supabase Realtime ile yazıldı.

## Games (modes)

| Mode | Game | Players | Time | Difficulty | Path |
|------|------|---------|------|:----------:|------|
| `zan` (default) | ZAN: Perfect Doubt, a fast bluffing game of claims and challenges | 4 | 10-15 min | 2 / 5 | `/zan` |
| `vaerum` | Vaerum: Heirs of the Ether, a deep duel of seals, spells, and Ascension | 2-4 | 20-40 min | 4 / 5 | `/vaerum` |

A first-time visitor opens **ZAN** by default. Whichever game you last played is remembered and
reopened next time. Switch games any time from the menu (**Change Game**); the table reloads with
the new deck, art, and rules behind a loading screen, while your language and audio settings stay.

## Stack

- **Vite 6** + **TypeScript 5.7**, zero-framework vanilla DOM modules
- **Supabase Realtime** (Broadcast + Presence); no SQL tables required
- **Vercel** static deployment + one Edge function (`/api/config`) for runtime env
- **Node 22 LTS** for local development (`.nvmrc` shipped)

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/ (per-mode HTML shells included)
npm run preview  # serves dist/
npm test         # vitest
```

## How the multi-mode system fits together

- **Mode registry**: `src/modes/` is the single place a game is described. `types.ts` defines
  `ModeDef` (deck, categories, balance, difficulty, seat count, card-back image flag, tooltip
  fields, guide steps/phases). `registry.ts` lists the modes and the default. `active.ts` holds
  the current mode (mirrors how i18n holds the current locale) and remembers the last mode in
  `localStorage`. To add a game you add a `ModeDef` plus assets and a locale file, nothing else.
- **URL**: `/{mode}/{SLUG}` (e.g. `/zan/P86B3T`). The mode segment is a lowercase mode id; the
  slug is a 6-char room code. A legacy bare `/{SLUG}` link is a Vaerum room and redirects to
  `/vaerum/{SLUG}`. `src/net/room.ts resolveLocation()` is the single entry point.
- **Rooms**: realtime channels are namespaced `duskhall:{mode}:{room}`, and room-scoped
  `localStorage` keys include the mode, so two players in different games can share a 6-char slug
  without ever crossing decks.
- **Branding / SEO**: the build emits a per-mode HTML shell (`dist/{mode}/index.html`) with that
  game's title, description, Open Graph image, and favicon, so social crawlers (which don't run
  JS) get the right preview. At runtime, switching games re-patches the tab title, favicon, and
  share meta (`src/ui/branding.ts`).
- **Assets**: each game owns `public/modes/{id}/{cards,background,audio/music,brand}/` plus
  `supporters.json`. Sound effects are shared (`public/audio/sfx/`) with an optional per-mode
  override. All asset paths are manifest-driven with graceful fallbacks, so a game with no art yet
  still boots with zero 404s.
- **Content**: shared UI text lives in `public/locales/{en,tr}.json`; each game's own text (meta,
  cards, categories, glossary, rulebook, guide, support copy) lives in
  `public/locales/modes/{id}.{en,tr}.json` and is deep-merged over the shared file at load.

See **[docs/MAINTAINING.md](docs/MAINTAINING.md)** for the step-by-step "how to add a game" runbook.

## Environment variables

Set these in Vercel (or `.env.local` for local). All are optional; missing ones use safe
fallbacks. They are **platform-level** (they describe Duskhall, not a single game).

```
# Realtime (required for multiplayer)
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<public anon key>

# Branding (runtime-patched; lets you rename or move domains without a code change)
APP_NAME=Duskhall
SITE_URL=https://duskhall.example
OG_IMAGE=https://duskhall.example/assets/og.png

# Support buttons (each appears in the Support dialog only when its var is set)
SUPPORT_URL=https://your-support-page
PATREON_URL=https://patreon.com/your-page
BUYMEACOFFEE_URL=https://buymeacoffee.com/your-page
NEXT_PUBLIC_APP_URL=https://duskhall.example

# Feedback channels (optional; the Feedback menu row appears if either is set)
ISSUES_URL=https://github.com/<you>/duskhall/issues
FEEDBACK_URL=https://forms.gle/your-anonymous-form
```

`/api/config` is an Edge function that reads these env vars and serves them to the client at
runtime. With this path, no keys are baked into the bundle. The client resolves config from three
layers (first with Supabase creds wins, branding merged across all): **Vite build-time env**
(`VITE_*` in `.env.local`), **`/api/config`** (the production path, plain names above), and
**`public/config.local.json`** (a gitignored local fallback).

**Which Supabase key?** Either browser key works: the legacy **anon** key (a JWT starting `eyJ…`)
or the newer **publishable** key (`sb_publishable_…`). **Never** use the `service_role` /
`sb_secret_…` keys in the browser. No SQL, tables, RLS, or auth setup is needed; the app uses only
Realtime Broadcast + Presence.

### Troubleshooting: cards don't sync between players

If actions never reach other players and the menu's **Connection** row reads **Offline**, the
client could not reach Supabase Realtime. Check, in order: (1) env vars are set in Vercel and the
project was redeployed (open `/api/config` to verify), (2) Realtime is enabled for the project,
(3) `vercel.json` CSP still permits `wss://*.supabase.co`. Two tabs on the same machine always
sync via a local `BroadcastChannel` fallback, so if same-machine tabs sync but two devices don't,
the cause is the Supabase connection.

### Harmless console notice: `__cf_bm` cookie rejected

Firefox may log that the `__cf_bm` cookie was rejected (`Alan adı geçersiz olduğu için
'__cf_bm' çerezi reddedildi`). This is **not** a Duskhall bug: `__cf_bm` is Cloudflare's
bot-management cookie set by Supabase's edge, and Firefox rejects it under its third-party
cookie policy. Realtime runs over the WebSocket, not that cookie, so gameplay and sync are
unaffected. It cannot be suppressed from the client. See `docs/SECURITY.md` for detail.

## Vercel deployment

```
Framework Preset: Other
Build Command:    npm run build
Output Directory: dist
```

`vercel.json` sets CSP, HSTS, X-Frame-Options DENY, and cache headers, and rewrites `/{mode}` and
`/{mode}/{slug}` to the per-mode shell while everything else falls back to the SPA.

## Assets

Drop art, audio, and brand files into `public/modes/{id}/…` and shared sound effects into
`public/audio/sfx/`. The Vite plugin regenerates every manifest on build/dev, so you only ever
drop a file. See each game's `docs/modes/{id}/ASSETS.md` for exact specs and generation prompts.
Missing assets fall back cleanly (placeholder card faces, the built-in CSS card back, a gradient
table surface, procedural sound effects), so a fresh checkout produces zero 404s.

## Docs

- `docs/MAINTAINING.md`: developer directives + the "how to add a game" runbook
- `docs/ASSETS.md`: master asset guide (every logo, icon, card, background, and audio asset: paths, formats, sizes, transparency, and the default vs. custom override model)
- `docs/DESIGN.md`: engine architecture, coordinate system, asset systems
- `docs/SECURITY.md`: security model, rate-limits, threat notes
- `docs/COPYRIGHT.md`: copyright notice for the platform and its games
- `docs/modes/{id}/`: each game's rulebook, card reference, and asset generation prompts

## License

See `LICENSE`. All Duskhall game designs, names, card art, rulebook text, and visual identity are
copyright © 2026 the project author. Personal play permitted; commercial use, reprint, derivatives,
and source redistribution require written permission.
