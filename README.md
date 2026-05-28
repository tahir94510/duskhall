# KABAL: Heirs of Ether

A digital card table for friends, 2 to 4 players. Free movement, no enforced rules; players follow the official rulebook themselves. Built with Vite, TypeScript, and Supabase Realtime.

KABAL'ın dijital kart masası. 2 ila 4 oyuncu. Kurallar oyuncular tarafından uygulanır; site yalnızca masayı sağlar.

## Stack

- Vite + TypeScript, zero-framework vanilla DOM modules
- Supabase Realtime (Broadcast + Presence); no tables required
- Vercel static deployment, plus one Edge function (`/api/config`) for runtime env

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
npm run preview  # serves dist/
```

## Environment variables

Set these in Vercel (or `.env.local` for local). All four are optional. If Supabase keys are missing, the table runs in single-player local mode without errors.

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<public anon key>
SUPPORT_URL=https://your-support-page
NEXT_PUBLIC_APP_URL=https://kabal.example
```

`/api/config` is an Edge function that reads these env vars and serves them to the client at runtime. No keys are baked into the bundle.

## Vercel deployment

```
Framework Preset: Other
Build Command:    npm run build
Output Directory: dist
Install Command:  npm ci
```

`vercel.json` sets CSP, HSTS, X-Frame-Options DENY, Referrer-Policy and Permissions-Policy headers. Assets and locales have explicit cache headers. The slug rewrite `/<6-char>` routes to the SPA.

## Game

- **Player count:** 4 seats (you + 3 opponents). Empty seats stay dim.
- **Cards:** 72-card deck (16 Seals, 24 Spells, 16 Interventions, 16 Servants).
- **Interaction:**
  - Left-press, drag: move a single card
  - Ctrl + left-press, drag: move the whole stack
  - Right-click: flip a single card
  - Ctrl + right-click: flip the whole stack (mixed becomes all face-down)
  - Ctrl + scroll up: gather the stack
  - Ctrl + scroll down: shuffle the stack
  - Long-press on touch: open a context bar for the same actions
- **Privacy:** cards you drop into your own zone are private; opponents see the count, not the contents.
- **URL:** `https://kabal.example/P86B3T` (6-char path slug per room).
- **Reset room:** opens a fresh room with a new link; current players stay in the old room.
- **Localisation:** English-primary with full Turkish parity. Auto-detected on first visit, remembered after.

## Audio

Drop your own MP3s into `public/audio/` to replace the placeholder synthesised tones. See `public/audio/README.md` for filenames. Volumes and master mute live in the in-game Settings panel.

## Docs

- `docs/RULES.en.md`: complete English V8.1 rulebook
- `docs/RULES.tr.md`: Türkçe V8.1 kural kitabı
- `docs/DESIGN.md`: balance numbers, palette, seating diagram
- `docs/SECURITY.md`: security model, rate-limits, threat notes
- `docs/COPYRIGHT.md`: copyright notice and recommended legal steps

## License

All KABAL game design, card names, effects, icons and rulebook text are copyright the project author. See `docs/COPYRIGHT.md`.
