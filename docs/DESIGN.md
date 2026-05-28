# KABAL: Heirs of Ether · Design Notes

## Balance constants

All numbers live in `src/game/balance.ts` and are referenced from rules text, tooltips, and UI counters. Change once, everywhere updates.

| Constant | Value | Rationale |
| --- | --- | --- |
| `PLAYER_COUNT` | 4 | Sweet spot between political (5) and direct (2). Symmetric 4-seat layout (you / opponent / left / right). |
| `STARTING_HAND` | 5 | Enough for a turn or two of agency; leaves 52 cards in the deck. |
| `HAND_LIMIT` | 7 | Caps card-hoarding without trivialising Cleanse. |
| `MAX_SEALS_IN_PLAY` | 4 | Ascension is 3; this leaves 1 buffer slot for redundancy. |
| `MAX_SERVANTS_IN_PLAY` | 3 | One per Servant type fills the bench. Forces choice. |
| `HP_BASE` | 2 | Two meaningful actions per turn. |
| `HP_CAP` | 5 | Even four Crimson Monoliths cannot break the cadence. |
| `FOCUS_DRAW_BASE` | 2 | Matches deck depth so Resonance lands around turn 13. |
| `ASCENSION_SEAL_THRESHOLD` | 3 | Reachable, defendable, contestable. |
| `TOTAL_CARDS` | 72 | 16+24+16+16. |

## Card distribution

| Category | Counts | Total |
| --- | --- | --- |
| Seals (4 types × 4) | Time Rift 4, Veil of Void 4, Crimson Monolith 4, Necromancer's Eye 4 | 16 |
| Spells (5 types) | Ether Strike 8, Shadow Theft 6, Ancient Sight 4, Mind Parasite 4, Twist of Fate 2 | 24 |
| Interventions (3 types) | Silence! 8, Karmic Reflection 4, Blood Atonement 4 | 16 |
| Servants (3 types) | Runic Warden 8, Glacial Aberration 4, Shadow Slayer 4 | 16 |
| **Total** | | **72** |

## Coordinate system (v3)

Card positions are stored in a single canonical normalised frame `[0, 1]²` of the board. Every client rotates its own view so its seat sits at the bottom; the rotation helpers live in `src/table/rotation.ts`:

- `seatRotationDeg(mySeat)` → 0 / 180 / -90 / 90 for seats 0–3.
- `localToCanonical(nx, ny, mySeat)` / `canonicalToLocal(...)` rotate around the board centre.

Dock anchors are fixed constants in `src/table/constants.ts`:

- `DECK_NX = 0.42`, `DECK_NY = 0.5`
- `DISCARD_NX = 0.58`, `DISCARD_NY = 0.5`

The Board.ts dock paints the two slots from these constants via CSS `top` / `left` percentages; the initial deal pile is anchored to the same numbers.

`v3.7` removed magnet snap entirely — players place cards by hand. The dock slots remain as visual placeholders only.

## Palette (v3.7)

Pure neutral greys plus ivory; no blue / purple / olive cast.

- `--ink` `#000000`, `--ink-2` `#060606`
- `--ash` `#111111`, `--ash-2` `#1a1a1a`
- `--ivory` `#f3efe5`, `--ivory-dim` `#b3afa5`, `--ivory-mute` `#6e6a63`
- Seat accents `--seat-0..3` are four ivory tones for cursors / zone borders.

Category hues (`--cat-seal`, `--cat-spell`, `--cat-intervention`, `--cat-servant`) are kept in tokens.css purely so the rulebook can describe the four canonical colours; the live UI does not paint with them.

## Seating layout

```
       ┌────────────┐
       │  opponent  │
       └────────────┘
┌────┐                 ┌────┐
│left│       BOARD     │righ│
└────┘                 └────┘
       ┌────────────┐
       │    you     │
       └────────────┘
```

Empty seats render dim grey; once a player presence arrives the seat gains its accent colour.

## Asset systems

### Card art (`public/cards/`)

The runtime reads `public/cards/manifest.json` once on first card render. Only entries listed in `available` produce an HTTP request, so a fresh checkout shows zero 404s in the browser console.

```json
{
  "available": [
    { "id": "timeRift", "ext": "webp" },
    { "id": "etherStrike", "ext": "png" }
  ]
}
```

Or, for a single extension across the board:

```json
{ "available": ["timeRift", "etherStrike", "silence"] }
```

Recommended file: 640 × 928 px WebP (`object-fit: cover` covers the 8 px corner radius). Solid backgrounds; no transparency required.

### Audio (`public/audio/`)

Same model: `manifest.json` lists which sound files actually exist. Anything missing falls back to a procedural Web Audio tone (synthesised at runtime). Volumes live in `localStorage` (`kabal:vol:master|music|sfx`).

```json
{ "available": ["flip", "pickup", "place", "shuffle", "gather", "music"] }
```

## Runtime branding (v3.8)

`src/net/config.ts` `RuntimeConfig` ships three extra branding fields:

- `appName` overrides `document.title`.
- `siteUrl` becomes the canonical URL and `og:url`.
- `socialOgImage` becomes the `og:image`.

`api/config.ts` reads the corresponding env vars (`APP_NAME`, `SITE_URL`, `OG_IMAGE`). `src/main.ts applyMeta()` patches the document on boot. Domain or tagline changes do not require a code change.

## Rule reconciliations (V8 → V8.1)

- Standardised English first, Turkish second, with shared key IDs across both locale files.
- Fixed typos (`zorundasınuz`, `Mühlürü`, `MÜDAHALEler`).
- Clarified `Mind Parasite` requires both target and self-room legality: otherwise it cannot be cast and HP is not spent.
- Explicit "Necromancer's Eye fizzles if Discard empty" line.
- Ascension declaration restricted to end-of-own-turn explicitly.
- Blood Atonement randomiser: digital table auto-shuffles and auto-discards two hand cards; physical play follows the same rule.
- Rulebook §13 quick reference now sources its limits and totals from `balance.ts`.
