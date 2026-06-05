# Vaerum: Heirs of the Ether · Design Notes

## Balance constants

The canonical balance numbers live in `src/game/balance.ts`. The rulebook copy is hand-written prose (not interpolated), so a test (`src/game/balance.test.ts`) enforces that the deck composition and the quick-reference numbers in both locales stay consistent with these constants and with the actual card set in `cards.ts`. If you change a number here, update the rulebook text to match or the test fails.

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

- `seatRotationDeg(mySeat)` → 0 / 180 / -90 / 90 for seats 0-3.
- `localToCanonical(nx, ny, mySeat)` / `canonicalToLocal(...)` rotate around the board centre.

Card positions store the card CENTRE as a canonical fraction; the render loop turns that centre into the on-screen top-left by subtracting half the measured card size, so a pile sits on its marker identically on every device and never drifts on resize. Dock anchors are fixed CENTRE constants in `src/table/constants.ts`:

- `DECK_NX = 0.43`, `DECK_NY = 0.5`
- `DISCARD_NX = 0.57`, `DISCARD_NY = 0.5`

`board.css` paints the two dock markers at these same percentages (`left: 43%` / `57%`, centred with `translate(-50%, -50%)`), and the initial deal pile is anchored to the same numbers, so the markers and the dealt pile can never drift apart. They sit a little closer to centre than the board edges so the public ring opens a tableau-shelf band in front of every seat, clear of the deck/discard.

Magnet snap is removed; players place cards by hand. The dock slots are visual targets only.

## Stack interactions

Helpers live in `src/table/StackOps.ts`; `Game.ts` wires them to gestures.

- **Flip a stack** (right-click, Ctrl+scroll, or the long-press menu) turns the
  whole pile over the way a hand would, via `flipStackOver`. The depth order
  reverses (the bottom card ends up on top) and every face is toggled at once.
  A single card simply flips its face, matching a plain flip. Flipping a stack
  twice returns it to its exact starting order and orientation. Stack detection
  is rotation-aware, so a pile of mixed 0°/90° cards is still treated as one
  stack and turns over as a single piece (no under-card faces flash through).
- **Shuffle** (`shuffleStack`) randomises z-order with Fisher-Yates seeded from
  the crypto RNG, then sets every card face-down. Only the initiating client
  shuffles; the resulting order and orientation are broadcast as a normal patch,
  so every peer converges on the same pile (last-write-wins by `ts`). Cards keep
  their position and only wobble in place for the riffle feel.
- **Gather** (`gatherStack`) pulls the overlapping cards onto one point and
  reassigns z in their existing order, so the pile sits on top as a tight stack.

**Squaring angle is per-viewer.** When a pile is gathered, shuffled or turned it
squares to the ACTING player's own upright (`viewerUprightRot`): the angle that
reads straight from their seat. Because `rot` is shared, peers then see the pile at
whatever angle their own seat implies (a side seat sees a just-tidied central deck
edge-on). This keeps every interaction consistent with the rest of the table — a
player always squares a pile straight to their own view — and matches how the four
zones are bound per viewer. `rotateStack` (explicit Shift+scroll / rotate) is
unaffected and turns the pile exactly as the actor asked.

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

### Table background (`public/background/`)

A single image dropped here becomes the backdrop. The Vite plugin scans the
folder and writes `public/background/manifest.json`; `src/table/Background.ts`
reads it once, preloads the first image, and fades it onto the `.app-bg` layer.
That layer is `position: fixed`, full-bleed, and behind everything (`--z-bg`), so
it covers the whole screen at every seat with no black bars and does NOT rotate
with the board. A thin `.app-scrim` (`--z-scrim`) sits just above it to steady
contrast for card legibility without hiding the deck/discard. The folder is kept
separate from `public/cards/` so card art and the backdrop never collide. An
empty folder makes no request and an elegant built-in gradient (in `board.css`)
shows through, so there are zero 404s.

### Loading screen & first-sync gate

`index.html` paints a logo splash (`#kabal-loader`) on the first frame from
inline critical CSS. `Game.mount()` preloads the on-table card art and the
background, then connects and waits (capped at ~1.8s) for the first sync: our
seat (so the board is already rotated) and the authoritative snapshot (so cards
are already in place), before `main.ts` calls `hideLoader()` (`body.is-ready`).
Nothing rotates or reshuffles after the table is revealed.

### Viewer-relative zones

Card positions live in the shared canonical frame, but the four on-screen zone
slots (bottom/top/left/right) are bound per viewer: `localSlotForSeat` (in
`rotation.ts`) maps each absolute seat to the slot the rotated board puts it in,
so the local player's own seat is always the bottom slot. `Game.refreshZones`
uses this to set each slot's colour, occupant name (`Name (you)` for self) and
hit-test rect, and `pointInZone` resolves ownership through the same map. This is
what keeps drag/drop, ownership, concealment and cursors correct for all seats.

### Audio (`public/audio/`)

Effects and music live in separate folders so the asset set stays tidy:

```
public/audio/
  sfx/     effect sounds (file name must match a SfxName: flip, pickup, …)
  music/   music tracks (any file name; played in natural-sort order, looped)
```

The Vite plugin scans both folders (and, for backwards compatibility, any flat files in `public/audio/`) and writes `manifest.json`. Effects map a sound name to a concrete file path; music is an ordered path list. Anything missing falls back to a procedural Web Audio tone synthesised at runtime, so a fresh checkout shows zero 404s. Volumes live in `localStorage` (`kabal:vol:master|music|sfx`).

```json
{
  "sfx": [{ "id": "flip", "path": "/audio/sfx/flip.mp3" }],
  "music": [{ "id": "theme", "path": "/audio/music/theme.mp3" }]
}
```

The runtime (`src/audio/Audio.ts`) routes every voice through a per-effect gain into a shared SFX bus → master gain → `DynamicsCompressor` limiter → destination. Quality safeguards: a per-sound **retrigger debounce** (~45 ms) drops machine-gun repeats of the same effect, a global **voice cap** (10) fades the oldest sound out rather than cutting it, samples get a 4 ms click-free fade-in, and the music **ducks** ~45 % under each effect and restores over ~0.4 s. A single music track loops itself gaplessly; a playlist advances on `ended` and wraps.

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

## Balance rationale (why the numbers are what they are)

Vaerum is a manual, four-category duel; balance lives in the card text and counts,
not in an engine. The design follows current (2026) competitive-card-game thinking,
and these are the levers that keep it fair and replayable:

- **Every turn is a real decision.** Two HP per turn is the whole budget, and the
  three actions (Create / Study / Cleanse) always compete for it: advancing a Seal,
  casting a Spell and digging for an answer can never all happen at once. A turn is
  never "do nothing."
- **Nobody is idle off-turn.** Interventions cost no HP and resolve at any time, so
  every player holds a reason to stay alert during others' turns. This is the main
  guard against multiplayer downtime; Silence!, the most common card (×8), keeps the
  reaction layer live.
- **The four types form a rock-paper-scissors.** Spells answer permanents, Servants
  blunt Spells (the Servant Shield must be cleared first), Interventions punish a
  committed Spell, and Seals out-scale slow removal over time. No legal hand is left
  with zero answers to a whole threat class: removal (Ether Strike) is the commonest
  Spell, and Silence! answers anything.
- **Ascension is a contestable climax, not a coin flip.** Declaring at three Seals
  opens a full round in which every rival gets a real window to break it (destroy a
  Seal to drop the declarer below three). Karmic Reflection and Blood Atonement give
  the declarer earned defenses, so survival rewards prior play rather than luck.
  The known risk here is *king-making*, a single out-of-contention player tipping
  the result, so disruption is spread across categories and copies (a lone card is
  rarely enough), not concentrated in one silver bullet.
- **The leader faces a headwind, not the loser a handout.** Catch-up comes from the
  leader being the obvious, declared target during the Trial, the Cosmic-Encounter /
  Root "bash the leader" model, rather than from rubber-banding that hands resources
  to whoever is behind. Snowball is held in check by hard caps: Seals 4, Servants 3,
  HP 5, hand 7, so no engine runs away.
- **Luck flavors a game; skill wins the match.** Variance comes only from the draw.
  Cleanse (discard then draw) and Study (extra draw) let a skilled player dig out of
  a flooded hand, so a bad opening is a setback, not a loss.

Numbers worth keeping in proportion if the set is ever re-tuned: opening hand 5 with
a max of 7 (the genre standard), 2 base actions, an Ascension threshold of 3 reached
in roughly the back third of a 30-60 minute game, and Silence! kept as the single
most numerous card so the reaction layer never dries up.
