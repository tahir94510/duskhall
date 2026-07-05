# Maintaining Duskhall

Practical directives for anyone working on this codebase. The goal is that a new
developer can ship a change correctly without having to ask. Read the section you need;
each one is self contained.

Duskhall is a platform: one table engine, many games ("modes"). Vaerum and ZAN are the first two.
A game is described entirely by data (a `ModeDef` plus assets and a locale file); the engine never
hardcodes a single game.

## How to add a game (mode)

Adding a game is adding data, not editing the engine. Do all of the following, then run the gate.

1. **Mode definition**: create `src/modes/<id>.ts` exporting a `ModeDef` (see `zan.ts` for the
   simplest example): its `deck` (each face's `id`, `category`, `count`), `categoryMeta` and
   `categoryOrder`, `balance` (must include `playerCount`, `startingHand`, `totalCards`; the sum
   of face counts must equal `totalCards`), `meta` (difficulty 1-5, min/max players, duration),
   `seatCount` (4 for now), `hasCardBackImage`, `tooltipFields`, and `guide` (setup steps + turn
   phases). Register it in `src/modes/registry.ts` (`MODES`); the first entry is the default.
2. **Locale**: create `public/locales/modes/<id>.{en,tr}.json` with `meta`, `cards` (name +
   whatever tooltip fields you declared), `categories`, `glossary`, `rulesDoc`, `guide` (its
   `steps.*` and `phase.*` must match the ids/phases in the `ModeDef.guide`), and `support`
   (title, intro, lines, supportersHint). Add the game's picker entry to the SHARED file under
   `modePicker.modes.<id>` (name + desc), in both languages.
3. **Assets**: create `public/modes/<id>/{cards,background,audio/music,brand}/` and
   `supporters.json`. Ship at least `brand/icon.svg` (+ dark/light). Everything else is optional;
   missing art falls back cleanly. See `docs/modes/<id>/ASSETS.md` for the specs.
4. **Docs**: create `docs/modes/<id>/{RULES.en,RULES.tr,CARDS.en,CARDS.tr,ASSETS}.md`.
5. **Deploy**: no `vercel.json` change is needed: the `/{mode}/{slug}` rewrite and the per-mode
   HTML shell are generated for every folder under `public/modes/`. No env change is needed either.
6. **Tests**: `src/modes/registry.test.ts` and `src/i18n/parity.test.ts` automatically cover the
   new mode (deck totals, category integrity, en/tr parity). Add game-specific logic tests if the
   game introduces any pure logic.

Do NOT hardcode a mode id anywhere in the engine. Read the active mode via
`getActiveMode()`/`getActiveModeId()` (from `src/modes/active.ts`), the same way UI code reads the
current locale via `t()`.

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

- Text is split into SHARED and PER-GAME files. Shared UI/system strings live in
  `public/locales/{en,tr}.json`. Each game's own strings (meta, cards, categories, glossary,
  rulesDoc, guide, support copy) live in `public/locales/modes/<id>.{en,tr}.json`. At load,
  `src/i18n/index.ts loadLocale(loc, mode)` deep-merges the mode file over the shared one, so
  `t()` call sites are unchanged. A missing key returns the raw key string, so a gap shows up as
  `ui.foo` to players.
- Parity is checked per file PAIR (shared en/tr, and each game's en/tr) by
  `src/i18n/parity.test.ts`, which also fails on any blank string. A game has its own key set, so
  games are never compared across each other or against the shared file. If you add a key, add it
  to BOTH languages of the SAME file in the same shape, with a real translation.
- Static pages that load before the bundle have their own inline localizer that follows
  the same locale priority as `detectLocale` (the `?lang=` query, then
  `localStorage["duskhall:lang"]`, then the browser language). When you add or change static
  user text, update these too:
  - `index.html` (tab title and the boot failure card)
  - `public/404.html` (the not found card)

## Card content and the encyclopedia

A card's text and counts live in three places, per game, that must agree (example uses `vaerum`;
substitute the game's id):

- `src/modes/<id>.ts`: structural data only (each face's `category` and copy `count`). This is
  what `buildDeck(mode.deck)` expands. The face count sum must equal `balance.totalCards`, which
  `src/modes/registry.test.ts` enforces.
- `public/locales/modes/<id>.{en,tr}.json` under `cards.*`: the canonical `name` and the tooltip
  fields the game declares (`type`/`effect`/`flavor`). This is the source of truth for wording.
- `docs/modes/<id>/CARDS.{en,tr}.md`: the readable card encyclopedia. It MIRRORS the locale text
  and the mode's counts so the cards are browsable outside the app.

When you add, remove, retune, or rename a card, or change a copy count, update all of the above
together (both languages) and re-run the gate; `registry.test.ts` re-checks the deck total and
`parity.test.ts` re-checks en/tr shape.

## The in app "What's new" panel and CHANGELOG

Two separate things, same rule: newest first, keep the old entries.

### In app updates (players see this)

Defined in the SHARED `public/locales/{en,tr}.json` under `updates.entries` (the changelog is
platform-wide, not per game), an array of:

```json
{ "v": "2026-06-03", "date": "June 3, 2026", "title": "Short headline", "items": ["...", "..."] }
```

- `v` is the internal version id. It is never shown to players, but it must be UNIQUE,
  increasing, and IDENTICAL across every locale for the same entry. Use the release date
  in ISO form, `yyyy-mm-dd`. If you ship twice in one day, add a suffix: `2026-06-03.2`.
  The "New" badge compares `entries[0].v` to `localStorage["duskhall:seen-updates"]` (see
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

The Support panel shows a thank you wall, newest first, for the active game. Players who add the
game's tag (for example `#vaerum` or `#zan`) to their support message are added here within a few
days.

### Where the data lives

`public/modes/<id>/supporters.json`, a plain JSON array of display names, PER GAME (the Support
dialog shows the active game's wall). It ships empty:

```json
[]
```

To list supporters, fill it like this (oldest to newest, one name per entry):

```json
["Ada Lovelace", "Bora", "Cem K.", "Deniz"]
```

### How to add a supporter

1. Open the game's `public/modes/<id>/supporters.json`.
2. Append the person's display name as a new string at the END of the array (keep the
   existing names, keep it valid JSON: double quotes, comma between entries).
3. Commit and deploy. The file is fetched at runtime, so a redeploy (or CDN refresh) is
   all that is needed, no code change.

The panel reverses the list, so the newest name you appended shows at the TOP. Names are
de-duplicated case-insensitively (including the Turkish dotted and dotless I), trimmed,
capped at 40 characters each and 500 total, and HTML-escaped before render, so the file
is safe to edit by hand and a stray duplicate or odd character cannot break the panel.

### Build-time alternative (env)

Instead of (or in addition to) the file, set `VITE_SUPPORTERS` to a comma-separated list
at build time, for example in `.env.local`:

```
VITE_SUPPORTERS=Ada Lovelace, Bora, Cem K.
```

The JSON file and the env list are merged and then shown newest first (each kept
oldest-to-newest, so the last name you append leads). Use one or the other; editing the
JSON file is preferred because it needs no rebuild. The whole section is hidden
automatically when there are no names. See `src/ui/SupportModal.ts` (`loadSupporters` /
`cleanSupporters`).

## Runtime configuration

`src/net/config.ts` resolves config from three layers, first match wins for the Supabase
credentials, branding merges across all:

1. Build time `VITE_*` env (`.env.local`), the local dev path.
2. `/api/config` edge function (runtime env on the host, no rebuild).
3. `/config.local.json` (gitignored local fallback).

Known keys include the Supabase URL and anon key, the support and feedback links, the app
name, the site URL, and the social image. See `RuntimeConfig` for the full list.

### Keeping Supabase awake

Supabase Free-plan projects pause after ~7 days with no activity, which takes realtime sync
offline until the project is manually restored. `.github/workflows/keep-supabase-awake.yml`
pings the project once a day (PostgREST root + auth health) so the idle timer never reaches
7 days. It needs two repo secrets (Settings -> Secrets and variables -> Actions):

- `SUPABASE_URL`: same as `VITE_SUPABASE_URL` (`https://<project-ref>.supabase.co`)
- `SUPABASE_ANON_KEY`: same as `VITE_SUPABASE_ANON_KEY`

Both are public values (they ship in the web client), so storing them as Actions secrets is
safe. You can also trigger the workflow by hand from the Actions tab. GitHub disables
scheduled workflows after ~60 days with no repo activity, so if the repo goes idle too,
re-enable it (or just push) to resume the pings.

## Architecture map

- `src/modes/*` is the mode (game) system: `types.ts` (`ModeDef`), `registry.ts` (the game list +
  default), `active.ts` (the current mode singleton + last-mode persistence, mirrors i18n), and
  one file per game (`vaerum.ts`, `zan.ts`). Engine code reads the active mode here; it never
  names a game.
- `src/ui/branding.ts` patches the document head (title, description, OG, favicon) for the active
  mode + locale. `src/net/room.ts` owns the `/{mode}/{slug}` URL scheme (`resolveLocation`).
- `src/game/Game.ts` orchestrates state, input, rendering, and networking glue. `switchMode()`
  reloads a new game behind the loader (modeled on `openOwnRoom`).
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
