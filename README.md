# KABAL — Heirs of Ether

A noble, tabletop-style digital card sandbox for 2–4 friends. Free movement, no enforced rules — players follow the official rulebook themselves. Built with Vite, TypeScript and Supabase Realtime.

Asil bir dijital kart masası. 2–4 oyuncu için. Kurallar oyuncular tarafından uygulanır; site yalnızca masayı sağlar.

## Stack

- Vite + TypeScript, zero-framework vanilla DOM modules
- Supabase Realtime (Broadcast + Presence) — no tables required
- Vercel static deployment, with one Edge function (`/api/config`) for runtime env

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
npm run preview  # serves dist/
```

## Environment variables

Set these in Vercel (or `.env.local` for local) — all four are optional. If Supabase keys are missing, the table runs in single-player local mode without errors.

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
Install Command:  npm install
```

`vercel.json` sets CSP, HSTS, X-Frame-Options DENY, Referrer-Policy and Permissions-Policy headers. Assets and locales have explicit cache headers.

## Game

- **Player count:** locked to 4 seats (you + 3 opponents). Empty seats stay dim.
- **Cards:** 72-card deck (16 Seals, 24 Spells, 16 Interventions, 16 Servants).
- **Interaction:**
  - Left-press + drag — move a card
  - Right-click / `F` — flip the card under the cursor
  - `Ctrl + drag` — drag the whole stack
  - `Ctrl + G` — gather the stack under the cursor
  - `Ctrl + M` — shuffle the stack
  - `Shift + A` / `Shift + K` — reveal / conceal the whole stack
  - Long-press on touch → context bar for the same actions
- **Privacy:** cards you drop into your own zone are private — opponents see the count, not the contents.
- **Rooms:** one room per page load. URL contains the slug. "Leave room" generates a new slug.
- **Localisation:** English-primary with full Turkish parity. Auto-detected on first visit, remembered after.

## Docs

- `docs/RULES.en.md` — complete English V8.1 rulebook
- `docs/RULES.tr.md` — Türkçe V8.1 kural kitabı
- `docs/DESIGN.md` — balance numbers, palette, seating diagram
- `docs/SECURITY.md` — security model, rate-limits, threat notes
- `docs/COPYRIGHT.md` — copyright notice and recommended legal steps

## License

All KABAL game design, card names, effects, icons and rulebook text are © the project author. See `docs/COPYRIGHT.md`.
