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
Draw 1 extra card every turn. Focus gives you 3 cards instead of 2; each extra copy adds 1
more (up to 4 copies, 6 cards). Starts working next turn.

*A hairline crack in the hour, widening with every breath.*

### Veil of Void (Seal, 4 copies)
Shields your other Seals and your hand. Neither can be targeted by enemy spells or
effects; the Veil itself stays targetable. Works at once; extra copies add nothing.

*Where it falls, the world forgets to look.*

### Crimson Monolith (Seal, 4 copies)
Gives you 1 extra HP every turn. Action grants 3 HP instead of 2; each extra copy adds 1,
never past 5 in total. Starts working next turn.

*It still stands when all else has fallen.*

### Necromancer's Eye (Seal, 4 copies)
Take the Discard's top card into your hand every turn. It fires at the start of your
Closing (one more per extra copy) and works the turn it is placed. If the Discard is
empty, nothing happens. It draws before the hand-limit check, so it never costs you a card
you wanted.

*The dead keep their accounts in long, patient ledgers.*

---

## Spells (24)

### Ether Strike (Spell, 7 copies)
Destroy one card on a rival's tableau. Servant Shield applies: if they have any Servant,
you must target a Servant first. If the target is untargetable it cannot be cast, and no
HP is spent. 1 HP.

*A clean cut between the seen and the sealed.*

### Shadow Theft (Spell, 5 copies)
Steal one random card from a rival's hand. Their hand is shuffled face-down and one card
moves to you at random; neither player chooses which. If their hand is empty or shielded
by Veil of Void it cannot be cast, and no HP is spent. 1 HP.

*Every secret has a weight you can lift.*

### Ancient Sight (Spell, 4 copies)
Draw 3 cards from the deck. It only benefits you; no one is targeted. If the deck runs out
mid-draw, Ether Resonance resolves first and the rest come from the new deck. 1 HP.

*Open the eye that never blinks.*

### Mind Parasite (Spell, 4 copies)
Take a rival's Servant onto your own tableau. Its ongoing effects now serve you and it
counts toward your 3-Servant limit. You need a free slot: with 3 Servants already it
cannot be cast (a steal can't discard one of yours to make room), nor if the rival has no
Servant; no HP is spent. 1 HP.

*Loyalty is a door, and you have the key.*

### Twist of Fate (Spell, 4 copies)
Swap your entire hand with a chosen rival's. Tableau cards stay put; hand-limit excess
resolves at each player's own Closing. It cannot be cast if the target is shielded by Veil
of Void. 1 HP.

*Fate's wheel turns, and asks no one.*

---

## Interventions (16)

### Silence! (Intervention, 8 copies)
Cancel a freshly played Spell or Intervention. The cancelled card and the Silence! both go
to the Discard. A Silence! can be silenced by another; the topmost cancels the one below.
Costs no HP; play it at any moment, on anyone's turn.

*The gavel of the table.*

### Karmic Reflection (Intervention, 4 copies)
Turn an attack on you or your tableau back onto the attacker. It resolves against them in
full, and on the rebound their own Servant Shield applies. Strictly selfish: it cannot
cover your hand, your deck or another player. Costs no HP; play it at any moment.

*What you send returns, in kind.*

### Blood Atonement (Intervention, 4 copies)
Save YOUR OWN Seal at the moment it would be destroyed. Play it right then; as the price,
2 random cards leave your hand for the Discard. Neither you nor your rival picks them; it
is always a gamble. With fewer than 2 cards in hand it cannot be played. Costs no HP.

*A vow paid in heartbeats.*

---

## Servants (16)

### Runic Warden (Servant, 8 copies)
All of your Seals become untargetable while it stands. The Warden itself can be targeted,
and by the Shield rule a rival must destroy every Servant before reaching your Seals.

*Patience etched in iron.*

### Glacial Aberration (Servant, 4 copies)
Whoever destroys this skips their entire next turn. The skipped turn has no Focus, Action
or Closing, though Interventions may still be played. The penalty fires on an indirect
kill too, such as a Shadow Slayer entry or a Karmic Reflection rebound; only destroying it
triggers this, not stealing it.

*A winter that keeps its own time.*

### Shadow Slayer (Servant, 4 copies)
When you place it, if any rival has a Servant you must choose one and destroy it at once.
If that destroys a Glacial Aberration, YOU take its skip-a-turn penalty. If no rival has a
Servant the effect does nothing, but the Slayer still enters.

*Even shadows answer to him.*

---

For the full rules of play (turn structure, HP, Ascension, Ether Resonance, the Servant
Shield rule, edge cases), see [`RULES.en.md`](RULES.en.md).
