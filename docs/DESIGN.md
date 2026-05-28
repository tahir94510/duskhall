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
| `HP_CAP` | 5 | Even four Crimson Monoliths can't break the cadence. |
| `FOCUS_DRAW_BASE` | 2 | Matches deck depth so Resonance lands around turn 13. |
| `ASCENSION_SEAL_THRESHOLD` | 3 | Reachable, defendable, contestable. |
| `TOTAL_CARDS` | 72 | 16+24+16+16. |

## Deck math (4-player default)

- Starting deal: 4 × 5 = **20 cards** out, **52 left** in deck.
- Without Time Rift, each player draws 2/turn → ~13 rounds to deck exhaustion → one Ether Resonance every ~13 turns. Two of them in a long game.
- Ascension threshold of 3 Seals against 16 total Seals (4 / player average) makes the race tight but not luck-locked.
- Servant economy: 16 / 4 = 4 average; cap of 3 in play. Roughly 75% of the time, a player will be at risk of having no shield.

## Card distribution

| Category | Counts | Total |
| --- | --- | --- |
| Seals (4 types × 4) | Time Rift 4, Veil of Void 4, Crimson Monolith 4, Necromancer's Eye 4 | 16 |
| Spells (5 types) | Ether Strike 8, Shadow Theft 6, Ancient Sight 4, Mind Parasite 4, Twist of Fate 2 | 24 |
| Interventions (3 types) | Silence! 8, Karmic Reflection 4, Blood Atonement 4 | 16 |
| Servants (3 types) | Runic Warden 8, Glacial Aberration 4, Shadow Slayer 4 | 16 |
| **Total** | | **72** |

## Palette

- `--ink #070708`: table background
- `--ash #1a1a1f`: panels
- `--ivory #f3efe5`: body text
- `--gold #c8a45a`: accents
- Category sigils: Seal `#7a4ed1`, Spell `#c8444a`, Intervention `#3c7fc8`, Servant `#3c9a6a`
- Seat accents: seat 0 `#c8a45a`, seat 1 `#6cb6c0`, seat 2 `#c87a9a`, seat 3 `#9aa86c`

Card type colour and card name colour are deliberately decoupled: every card has two distinct chromatic anchors so the eye never confuses category with identity. The card body never carries a third colour line.

## Seating layout

```
       ┌────────────┐
       │   seat 1   │
       └────────────┘
┌────┐                 ┌────┐
│s 2 │       BOARD     │s 3 │
└────┘                 └────┘
       ┌────────────┐
       │   seat 0   │  ← you
       └────────────┘
```

Empty seats render dim grey; once a player presence arrives the seat gains its accent colour and label.

## Rule reconciliations (V8 → V8.1)

- Standardised English first, Turkish second, with shared key IDs across both locale files.
- Fixed typos (`zorundasınuz`, `Mühlürü`, `MÜDAHALEler`).
- Clarified `Mind Parasite` requires both target and self-room legality: otherwise it cannot be cast and HP is not spent.
- Explicit "Necromancer's Eye fizzles if Discard empty" line.
- Ascension declaration restricted to end-of-own-turn explicitly.
- Blood Atonement randomiser: digital table auto-shuffles and auto-discards two hand cards; physical play follows the same rule.
- Rulebook §13 quick reference now sources its limits and totals from `balance.ts`.
