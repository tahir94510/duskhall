# ZAN: Perfect Doubt Rules

A four-player bluffing game. There is no winner, only a loser: force someone else to collect
four penalty cards.

- **Players:** 4 (exactly)
- **Time:** 10-15 minutes
- **Deck:** 40 cards, four suits of ten: Raven, Skull, Moon, Eye. The suits have no rank and no
  powers; a card is only worth the claim attached to it.

This document mirrors the in-app rulebook (`public/locales/modes/zan.en.json` → `rulesDoc`). The
locale text is the source of truth for wording; keep them in step.

## Goal

The game ends the instant a single player collects **4 penalty cards** (of any suits). That
player loses; everyone else wins together. So the whole game is about pushing cards, and blame,
onto everyone else while keeping your own side of the table clean.

## Setup

1. Shuffle all 40 cards and deal them out evenly: each of the four players holds **10 cards**. No
   cards are left on the table (there is no draw pile).
2. The system picks one player at random to open the first round.

## Playing a round

The opener takes one card from their hand and slides it **face down** in front of any other
player, claiming a suit out loud, for example "This is a Raven." The claim may be the truth or a
bluff.

The player who receives the card has exactly two options:

- **Challenge.** Say whether you think the claim is true or a lie, then flip the card face up. The
  challenge always judges the **most recent** claim (the one the card arrived with).
  - If you guessed right (caught a lie, or confirmed a truth): the card becomes a **penalty for
    the player who made that claim**.
  - If you guessed wrong: the card becomes **your** penalty.
  - Either way, the round ends the moment the card is taken.
- **Pass.** Secretly peek at the card (now you know the truth), then slide it face down to another
  player, with a claim of your own, repeat the suit or change it, truth or lie.

A card can be touched by each player **only once per round**. It keeps travelling until someone
challenges it. When it reaches the **fourth and last** player who has not yet touched it, that
player has no pass left and **must challenge**.

## Losing, and the next round

- Penalty cards stay face up in front of their owner for the rest of the game; they never return
  to a hand.
- The player who just took a penalty **opens the next round**.
- The first player to hold **4 penalty cards** loses immediately; everyone else wins.

## Why the game can never stall (the math)

Only the round-opener spends a card from hand (one per round). A player collects at most 3
penalties before the 4th ends the game, so across four players the game lasts at most
`3 + 3 + 3 + 3 + 1 = 13` rounds. A hand of 10 cards can never run out inside 13 rounds, so a
player always has a card to open with. No deadlock is possible.

## Optional variant (not the default)

For a deeper deduction game, you may agree that **3 penalty cards of the *same* suit** also
loses, in addition to 4 of any suits. This makes each player watch which suits are piling up in
front of them. Keep the base rule (4 of any suits) for the shortest, simplest game.

## At the digital table

ZAN runs on the shared Duskhall table, which deals and holds the cards but does not enforce the
rules, you run the round yourselves, exactly as in person. Slide a card face down to make a
claim, flip it to challenge, and keep taken cards face up in your own area. The frosted strip at
the bottom of your screen is your private hand.
