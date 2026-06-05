# Vaerum: Card Encyclopedia (English)

The complete deck: **72 cards**, 16 unique faces across four categories. Every card
resolves exactly as written here; the digital table moves cards but never enforces
these rules; the players do.

> **Source of truth.** The card text below mirrors the in-app encyclopedia. The
> canonical copy lives in the locale files (`public/locales/en.json` → `cards.*`)
> and the structural data (category, copy counts) in `src/game/cards.ts`. When a
> card's wording or count changes, update those **and** this file (and the Turkish
> `CARDS.tr.md`) together. See `docs/MAINTAINING.md`.

## The four categories

| Category | What it is |
| --- | --- |
| **Seal** | A permanent structure placed on your tableau. Passive power. The path to Ascension. |
| **Spell** | A one-shot attack played from the hand for 1 HP. Resolved, then discarded. |
| **Intervention** | A reactive card. Costs no HP and may be played at any moment, even out of turn. |
| **Servant** | A living shield on your tableau. Opponents must clear your Servants before they can target your Seals. |

Deck composition: **Seals 16** (4 unique × 4), **Spells 24**, **Interventions 16**,
**Servants 16**.

---

## Seals (16)

### Time Rift (Seal, 4 copies)
During your Focus phase you draw 3 cards instead of 2. Each additional copy adds +1
draw (max 4 copies, 6 cards). Becomes active from the turn AFTER it is placed.

*A hairline crack in the hour, widening with every breath.*

### Veil of Void (Seal, 4 copies)
Your other Seals and your hand cannot be targeted by enemy spells or effects. Veil of
Void itself remains targetable. Active immediately when placed. Multiple copies do not
stack.

*Where it falls, the world forgets to look.*

### Crimson Monolith (Seal, 4 copies)
During your Action phase you spend 3 HP instead of 2. Each additional copy adds +1 HP,
but your total HP can never exceed 5. Becomes active from the turn AFTER it is placed.

*It still stands when all else has fallen.*

### Necromancer's Eye (Seal, 4 copies)
At the start of your Closing phase, before the hand-limit check, take the top card of the
Discard into your hand (each extra copy takes one more). Because this happens before the
limit check, if your hand goes over 7 you simply discard down as usual and may discard the
card you just took, so it never costs you a card you wanted to keep. If the Discard is
empty, nothing happens. It works the turn it is placed.

*The dead keep their accounts in long, patient ledgers.*

---

## Spells (24)

### Ether Strike (Spell, 8 copies)
Spend 1 HP. Destroy 1 card on a rival's tableau. The Servant Shield rule applies: if
the rival has any Servant, you must target a Servant first. If the chosen target is
untargetable, the spell cannot be cast, no HP is spent.

*A clean cut between the seen and the sealed.*

### Shadow Theft (Spell, 6 copies)
Spend 1 HP. Choose a rival. Their hand is shuffled face-down so no one can see it, then
one card is taken from it at random into your hand; neither of you chooses which. If their
hand is empty or protected by Veil of Void, this spell cannot be cast and no HP is spent.

*Every secret has a weight you can lift.*

### Ancient Sight (Spell, 4 copies)
Spend 1 HP. Draw 3 cards from the deck. It only ever benefits you; no opponent is
targeted. If the deck empties mid-draw, Ether Resonance resolves first, then the
remaining draws come from the new deck.

*Open the eye that never blinks.*

### Mind Parasite (Spell, 4 copies)
Spend 1 HP. Take control of one Servant on a rival's tableau and move it to yours. It
counts toward your 3-Servant limit and keeps all of its ongoing effects, now under your
control. Taking control is not the same as destroying, so stealing a Glacial Aberration
does not trigger its skip-a-turn penalty. If you already have 3 Servants, or the target
has none, this spell cannot be cast and no HP is spent.

*Loyalty is a door, and you have the key.*

### Twist of Fate (Spell, 2 copies)
Spend 1 HP. Exchange every card in your hand with every card in a chosen rival's hand.
Tableau cards are unaffected. Hand-limit excess is resolved by each player at their next
Closing phase. Cannot be cast if the target is protected by Veil of Void.

*Fate's wheel turns, and asks no one.*

---

## Interventions (16)

### Silence! (Intervention, 8 copies)
Costs no HP. Played at any moment, on anyone's turn, to instantly cancel a freshly cast
Spell or Intervention. The cancelled card and Silence! both go to the Discard. Silence!
can be cancelled by another Silence!, the topmost Silence! cancels the one below.

*The gavel of the table.*

### Karmic Reflection (Intervention, 4 copies)
Costs no HP. Play it only to cancel an attack aimed at you or at a card you control in
play (your Seals and Servants on your tableau). It does not shield your hand or your
deck, and it cannot protect another player. The cancelled attack rebounds onto the
attacker and resolves against them in full. On the rebound, the attacker's own Servant
Shield applies: if they have any Servant in play, the attack must destroy those Servants
first and only then can it reach their Seals.

*What you send returns, in kind.*

### Blood Atonement (Intervention, 4 copies)
Costs no HP. Played ONLY when one of YOUR own Seals is about to be destroyed. To save
the Seal, 2 cards leave your hand at random. You do not pick them and neither does your
opponent, so it is always a gamble. If you have fewer than 2 cards in hand, this card
cannot be played.

*A vow paid in heartbeats.*

---

## Servants (16)

### Runic Warden (Servant, 8 copies)
While Runic Warden is on your tableau, ALL of your Seals gain the 'untargetable' status.
Runic Warden itself is always targetable. As a normal Servant, the Servant Shield rule
applies: rivals must destroy Wardens (and any other Servant) before they can target
Seals.

*Patience etched in iron.*

### Glacial Aberration (Servant, 4 copies)
When this Servant is destroyed, whoever destroyed it skips their entire next turn (Focus,
Action, and Closing); they may still play Interventions during that skipped turn. The
penalty applies even when the destruction is indirect, such as a Shadow Slayer's entry or
a Karmic Reflection redirect. Only destruction triggers it: having this Servant stolen,
for example by Mind Parasite, does not.

*A winter that keeps its own time.*

### Shadow Slayer (Servant, 4 copies)
When you place Shadow Slayer, if any rival has at least one Servant you MUST choose one
of those Servants and destroy it immediately. If a Glacial Aberration is destroyed this
way, YOU receive its skip-next-turn penalty. If no rival Servant exists, the entry effect
fizzles but Shadow Slayer still enters play.

*Even shadows answer to him.*

---

For the full rules of play (turn structure, HP, Ascension, Ether Resonance, the Servant
Shield rule, edge cases), see [`RULES.en.md`](RULES.en.md).
