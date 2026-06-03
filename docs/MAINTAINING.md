# Maintaining Vaerum

Practical directives for anyone working on this codebase. The goal is that a new
developer can ship a change correctly without having to ask. Read the section you need;
each one is self contained.

## Before you commit (the gate)

Every change must keep all of these green:

```
npx tsc --noEmit     # types
npm test             # vitest (unit + i18n parity)
npm run build        # tsc + vite production build
```

If you change pure logic, add a focused unit test next to it (see `src/**/**.test.ts`).
Do not commit with a failing or skipped test.

## Content and writing style (important)

All player facing copy and all docs must read like a careful human wrote them: clear,
short, professional, friendly. Specifically:

- Do not use the long em dash (Unicode U+2014) or the fancy en dash (U+2013) in copy or
  docs. Use a period, a comma, a colon, parentheses, or split the sentence. For number
  ranges use a plain hyphen, for example "48-72 hours".
- Avoid AI sounding filler, over explaining, and padding. Say the thing once, plainly.
- Keep both languages equal in quality. Turkish is not a second class translation.

This applies to: `public/locales/*.json`, the in app changelog entries, README,
CHANGELOG, and every file under `docs/`.

## Internationalization (TR + EN)

- Every user visible string lives in `public/locales/en.json` and `public/locales/tr.json`.
  `src/i18n/index.ts` exposes `t()`, `tArr()`, `tObj()`. A missing key returns the raw
  key string, so a gap shows up as `ui.foo` to players.
- The two locale files must have the exact same key structure and array shapes.
  `src/i18n/parity.test.ts` enforces this and also fails on any blank string. If you add
  a key, add it to both files in the same shape, with a real translation.
- Static pages that load before the bundle have their own inline localizer that follows
  the same locale priority as `detectLocale` (the `?lang=` query, then
  `localStorage["kabal:lang"]`, then the browser language). When you add or change static
  user text, update these too:
  - `index.html` (tab title and the boot failure card)
  - `public/404.html` (the not found card)

## The in app "What's new" panel and CHANGELOG

Two separate things, same rule: newest first, keep the old entries.

### In app updates (players see this)

Defined in `public/locales/*.json` under `updates.entries`, an array of:

```json
{ "v": "2026-06-03", "date": "June 3, 2026", "title": "Short headline", "items": ["...", "..."] }
```

- `v` is the internal version id. It is never shown to players, but it must be UNIQUE,
  increasing, and IDENTICAL across every locale for the same entry. Use the release date
  in ISO form, `yyyy-mm-dd`. If you ship twice in one day, add a suffix: `2026-06-03.2`.
  The "New" badge compares `entries[0].v` to `localStorage["kabal:seen-updates"]` (see
  `latestUpdateVersion()` in `src/ui/UpdatesModal.ts` and the wiring in `src/game/Game.ts`),
  so a fresh `v` lights the badge for everyone and it clears once they open the panel.
- `date` is the human label players see. Use a SPECIFIC full date (day, month, year), not
  just a month, so two entries in the same month never look identical. Localize it per
  language (for example "June 3, 2026" and "3 Haziran 2026").
- To announce a release: add a NEW entry at the FRONT of `entries` in BOTH `en.json` and
  `tr.json` (same `v`, localized `date`/`title`/`items`). Keep the existing entries below.
- Write `items` for players, not for engineers. Describe what they will notice. Keep the
  `v` values in sync across locales or the badge will misfire (the parity test checks the
  shape, not the values, so this one is on you).

### CHANGELOG.md (developers see this)

Add a new version section at the top, keep the history below. Plain language, no em
dashes.

## Supporters wall

The Support panel shows a thank you wall, newest first.

- Source of truth: `public/supporters.json`, a JSON array of names. Append each new
  supporter to the END of the array (oldest to newest). The panel reverses it so the
  most recent name shows first, and de dupes case insensitively.
- An optional `VITE_SUPPORTERS` env (comma separated) is merged in for build time lists.
- Names are length and count capped and escaped before render, so the file is safe to
  edit by hand. See `src/ui/SupportModal.ts`.

## Runtime configuration

`src/net/config.ts` resolves config from three layers, first match wins for the Supabase
credentials, branding merges across all:

1. Build time `VITE_*` env (`.env.local`), the local dev path.
2. `/api/config` edge function (runtime env on the host, no rebuild).
3. `/config.local.json` (gitignored local fallback).

Known keys include the Supabase URL and anon key, the support and feedback links, the app
name, the site URL, and the social image. See `RuntimeConfig` for the full list.

## Architecture map

- `src/game/Game.ts` orchestrates state, input, rendering, and networking glue.
- `src/table/StackOps.ts` is pure card pile logic (find, gather, shuffle, turn over,
  rotate by shortest path). It has no DOM. Prefer adding pure helpers here and unit
  testing them.
- `src/table/SlotGrid.ts` owns the per seat private zone rectangles and the position
  based "is this card in a zone" rule (`cardZoneOwner` / `cardZoneOverlap`,
  `ZONE_PRIVACY_FRAC`, and the shared `CARD_CANON_W/H` canonical card size that keeps the
  decision identical on every device).
- `src/table/DragController.ts` handles pointer drag and the held z band.
- `src/game/occupancy.ts` is the pure seating, host election, and tombstone logic.
- `src/net/*` is the realtime transport, the last write wins rule (`lww.ts`), and input
  guards (`security/inputGuard.ts`).
- `src/ui/*` are the modals and header. `src/styles/*` are the styles, with all colors
  and contrast tokens in `tokens.css`.

## Networking model (so you do not break sync)

- Peer to peer over Supabase Realtime, with a deterministic host (earliest joiner, ties
  by id; an away host keeps host through the grace window).
- Card edits use last write wins by a monotonic stamp plus writer id. Never trust a raw
  timestamp without `safeStamp`.
- Card positions and zone membership are canonical (board fractions in `[0,1]`), so they
  are identical for every viewer regardless of screen size or per seat board rotation.
  Anything that affects visibility or ownership must be computed in canonical space, not
  measured pixels.
- All inbound messages are validated and rate limited in `src/net/realtime.ts`. Keep new
  message fields optional and sanitized for backward compatibility.

## Security and abuse

See `docs/SECURITY.md`. In short: the client is untrusted by design, so the protections
that matter are input validation, per sender rate limits, and the deterministic last
write wins rule. Real DDoS and edge protection is a hosting concern (the platform in
front of the static site and Supabase), not client code. Do not promise more than that.
