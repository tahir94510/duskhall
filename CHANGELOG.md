# Changelog

## 0.9.12: Clean table restored, drag fix, consistent rulebook terms

A correctness and polish pass. The dedicated Seal/Servant areas were removed and the table
returned to main's clean, full-size symmetric design; the drag is page-bound; privacy is exact
even on diagonal exits; a hovered card lifts above its neighbours; the rulebook is consistent
and every term is explained; and a multiplayer hold-lock leak is closed. Card positions stay
device independent and identical for every player; the shared canonical frame, sync and balance
numbers are unchanged. 187 tests green.

- **Privacy is exact on every zone exit, including diagonals.** A card now stays concealed until
  it is FULLY out of every private band. The overlap test is union-aware (it checks all four
  bands and keeps the largest), so when a card slides diagonally across a corner where two zones
  meet — where the nearest seat flips — it no longer flashes visible while a sliver is still
  inside. Holds via the existing eager-hide / late-reveal hysteresis. Regression-tested.
- **A hovered card lifts above its neighbours.** Hovering raises the card into a dedicated z band
  (450, above resting cards but below the held/animation and cursor layers) so it is fully
  readable even under a pile, with the existing 2.5D shadow + brightness "picked up" read.
- **Rulebook: every term is explained.** Added glossary entries for the zones (Hand, Tableau,
  Deck, Discard), the turn phases (Focus, Action, Closing), the actions (Create, Study, Cleanse),
  HP, the Ascension Trial and Untargetable status — in both languages — so every rules term opens
  the same hover/tap info panel. Matching is case-insensitive and covers plural and leading-label
  forms. The info panel is capped to the viewport so it never runs off the page or breaks the
  layout on small screens.
- **Multiplayer: no stranded hold-locks.** A peer's card locks are now cleared by holder id (not
  only by seat) when they leave, are kicked, or their seat expires — so a card can never stay
  ungrabbable after a peer drops, even across a seat-reassignment race (the 6s TTL was the only
  safety net before).
- **Peer cursors land exactly on the point.** The ghost cursor now centres its dot on the peer's
  true pointer location (the inline position transform had been cancelling the CSS centering, so
  every peer cursor sat half-a-dot down-right). Combined with the existing 70 ms glide, peers see
  each other's cursors in real time, smooth and pixel-accurate, re-projected into their own view.
- **Rivals' private cards sit UNDER the glass.** An occupied rival's hand tray now lifts just
  above the card layer, so that seat's concealed cards read as soft shapes beneath the frosted
  zone — a rival arranging or dragging in their hidden area no longer shows sharp on top of the
  tray. Your own hand and the public centre stay perfectly sharp (your tray and empty seats stay
  below the cards).
- **Longer away grace.** A dropped player (refresh, network blip, phone lock, app switch) keeps
  their seat, presence and concealed cards far longer before auto-eviction (30 s → 120 s). Only a
  deliberate exit, a host kick, or a genuinely long absence releases them; the host can still kick
  an away player immediately. The no-two-hosts seniority invariant tracks the new window.

- **Clean table, main's proportions.** The off-board ledges and the on-board tableau shelves
  were removed and the board is full-size again, with main's hidden-zone depth (`ZONE_DEPTH`
  0.28, a 0.44 public centre) and card sizing restored. Players lay their face-up Seals and
  Servants by hand anywhere in their own area.
- **Drag is page-bound, not board-bound.** A card can now be dragged off the board into the
  surrounding margin — only the PAGE limits it; it can never go off-screen. The clamp runs in
  screen pixels (`clampSeedToPage`, `src/table/playfield.ts`), so it is exact for every device,
  aspect ratio and seat rotation, and the off-board margins are public (droppable). This also
  fixes the old bug where cards stuck short of the edges/corners.
- **Rulebook: consistent, complete hover terms.** Every hover term — a card name, a glossary
  term, or a card-type name (Seal/Spell/Intervention/Servant) — now reads IDENTICALLY (same
  weight and quiet dotted underline, no more some-bold/some-italic) and opens the same info
  panel. Matching is case-insensitive and covers plural forms, so "Seal", "Seals" and the
  uppercase colour-key "SEAL" are all hover-able, including a leading definition label. The
  terms use the normal cursor (not a pointer/help cursor) — the panel opens on hover, so the
  underline alone is the affordance.

## 0.9.11: Symmetric table, tableau shelves, safer drag, clearer text, robust restore

A large presentation, interaction and content pass so the table reads like a premium,
Steam-quality card game and plays cleanly on every device. Card positions stay device
independent and identical for every player; sync, the square coordinate frame and the
balance numbers are unchanged. 177 tests green throughout.

- **Symmetric trapezoid hand areas, replacing the pinwheel.** Each private hand zone is a
  full-width edge band clipped to a trapezoid: wide at the board edge (easy to read your
  whole hand), tapering inward, so the four meet along the board diagonals with no overlap.
  They are exactly congruent (each the next rotated 90deg) with full square symmetry, so
  after each client rotates its seat to the bottom every player sees an identical area.
  Ownership resolves by the nearest board edge to the card centre in the shared canonical
  frame (`cardZoneOverlap`, `pointInZoneCanonical` in `src/table/SlotGrid.ts`); the CSS
  clip-paths and `Game.pointInZone` use the same rule, so drag-drop, concealment and cursors
  agree for every seat. The hand depth is 18% of the board, leaving room for a tableau shelf
  in front of every seat that clears the deck/discard on each edge.
- **Per-seat tableau shelves.** A single framed slot, drawn exactly like the deck/discard dock
  (one card tall) but 3.5 card-widths wide (half a 7-card row, since Seals and Servants are
  laid out overlapping like a fanned row), sits in front of each player. Congruent across
  seats, clear of the deck/discard, and shown only when a seat is occupied (like the hidden
  zones); only your own shelf shows its "Seals / Servants" label.
- **Safer dragging and privacy.** A dragged card (or pile) is clamped so its whole body stays
  inside the square field: it never hangs half off the top/bottom of the page and is never
  lost off-screen, while its body can still fill every in-field area. Concealment is sticky: a
  card hides the instant any part enters a zone and reveals only once it has fully cleared it,
  so you can arrange cards in your own hidden area without ever flashing one to the table.
- **Under-glass own cards + even lighting.** A card resting in your own hand area gains a
  thin glass sheen (no blur, stays sharp). The felt uses one gentle, even vignette (no
  bright-centre / dark-edge hotspot), and the redundant board edge padding was removed.
- **Single field frame.** The wide-screen frame is one quiet edge, and it steps aside
  entirely when you supply a background image (which carries its own framing), so the table
  never shows a doubled border. The built-in gradient backdrop still gets the single edge.
- **Pointer-lift depth (2.5D feel).** A hovered card raises off the felt via shadow and
  light on its `::before` underlay only, so it never fights the render transform, flip or
  coordinates. Gated to hover pointers; honors reduced motion.
- **Clearer card and rulebook text, both languages.** Reworded the confusing cards in
  EN and TR across every copy: Necromancer's Eye (a free benefit, not a "must" trap), Shadow
  Theft (the rival's hand is shuffled face-down and one card taken at random), and the
  steal-is-not-destroy interaction of Mind Parasite and Glacial Aberration; plus when to use
  Study vs Cleanse. In the rulebook, card names and key terms (Ether Resonance, Ascension,
  Servant Shield) open an info panel on hover or tap, the same panel you get from a card on
  the table, so you can check any reference without leaving the page.
- **Robust tab restore.** Returning to a tab the browser froze into the back/forward cache
  now reloads cleanly, replaying the first-load flow (splash, reconnect, then the loader
  clears once everything is synced) instead of resuming on a dead socket.

## 0.9.10: Bigger, consistent cards; deeper, equal private zones; polish

A presentation and consistency pass so the table reads like a premium digital card
game at every size, plus a small interaction fix. CSS and one shared canonical
constant; no change to sync, privacy logic, stack detection, or the coordinate frame
(card positions stay device independent and identical for every player).

- **Cards are bigger and scale by one consistent proportion.** Card size is now a
  fraction of the square board (`--card-w` on `.table`, `0.125` of the field on
  pointer devices, `0.14`-`0.145` on touch), replacing the old `8.4vmin` desktop /
  `0.15` mobile split that left desktop cards small. The board cap grew `1180px` to
  `1400px` so large monitors and TVs fill more of the screen. Verified across 294
  viewport combinations (260px fold to 4K TV, portrait and landscape): cards never
  overflow their zone, and the deck and discard markers never overlap.
- **Wider, deeper private zones that pinwheel into the board corners.** A square
  board is required (so a 90deg seat rotation maps the field onto itself and all four
  players share one coordinate space), which on a wide screen leaves unavoidable side
  margins; but the board's own corners were unused. Each zone now covers its edge cell
  plus one adjacent corner cell, so every seat's hand area is a wide `0.72 x 0.28`
  rectangle (area `0.2016`, 64% larger than a centre-strip-only zone, and much wider),
  with the free centre cell (`0.44 x 0.44`) holding the deck/discard. The four zones
  are congruent (each is the next rotated 90deg), tile the board with no overlap, and
  the canonical `ZONES` (`src/table/SlotGrid.ts`) move in lockstep with the CSS grid
  spans (`zones.css`, `board.css`). This also fixed a real imbalance: before, bottom/top
  zones were `0.68 x 0.22` (area `0.150`) and left/right `0.22 x 0.56` (`0.123`), so
  seats 0/1 had a 22% larger hand area than seats 2/3, and since each client rotates its
  own seat to the bottom, players saw different sizes. Now every seat's area is
  identical after rotation (proven: each seat's own zone maps to the same physical
  bottom slot `[0, 0.72, 0.72, 1]`), and the deck/discard touch no zone.
- **Privacy footprint tracks the visible card.** `CARD_CANON_W/H` (the shared
  canonical card size used for the conceal/reveal test) was realigned from `0.085`
  (the old desktop card) to `0.125 x 0.181`, matching the enlarged card, so a card
  reads as private right as it visually enters a zone and public as it leaves, the
  same for the actor and every onlooker. Deck and discard piles are provably never
  auto-owned. `SlotGrid` privacy tests now derive their boundaries from the real
  constants (parametric), so future re-tuning cannot silently invalidate them.
- **Polish.** Card-proportional corner radius and a card-scaled conceal blur (so
  roundness and hidden softness read the same from a 34px phone card to a 178px TV
  card), a crisper face-up card edge, a clearer lifted-card shadow, premium frosted
  trays for the private zones, and seat-name type that scales with the board. The 404
  page and the boot-failure / noscript cards, the only spots that still looked like a
  generic website, now use the same atmospheric backdrop and premium frosted panel as
  the live table.
- **Fix: the header menu could not be closed with the keyboard from its own
  button.** Pressing Space or Enter on the focused "more" button closed the menu via
  keydown, then the browser's synthetic click reopened it. The keydown handler now
  excludes the trigger (mirroring the existing pointerdown guard). Also hardened the
  modal focus trap (focus on the panel can no longer escape on Shift+Tab), made
  `shuffleStack` reseat survivors contiguously if a card vanishes mid-gesture, read
  `localStorage` once in `Audio.readBool`, and completed `DragController.destroy`.

## 0.9.9: Reset deck works for everyone; per-viewer angle restored

Two user-reported issues.

- **Reset deck now opens its confirm dialog for any seated player.** It was
  host-only, so for every other player the menu item did nothing — the confirmation
  modal never opened, which read as "reset is broken." Resetting is collaborative
  (like shuffle), so any seated player may now trigger it; the confirm dialog is the
  safeguard, and spectators (no deck) still cannot. `resetDeck` now also stamps every
  card with a fresh winning clock + writer id, so the reset reliably wins on every
  peer (the authoritative snapshot bypasses LWW, but the follow-up reconcile must win
  too). Reset returns all 72 cards to a freshly shuffled, face-down, canonical
  (`rot 0`) pile on the deck spot — the start-of-game setup. Removed the now-unused
  `Header.setHostMode`/`host` plumbing (kept the per-zone kick gate).
- **Reverted 0.9.8: pile squaring is per-viewer again.** Gathering, shuffling or
  turning a pile (including the central deck) once more squares it to the ACTING
  player's own upright (`viewerUprightRot`), consistent with the rest of the table,
  per the user's preference. (0.9.8 had made the central deck a fixed canonical angle
  for all seats; that is removed, along with its `docs/DESIGN.md` note, which now
  documents the per-viewer rule.) Note: because `rot` is shared, a pile reads upright
  for whoever last tidied it and at each other seat's own angle — a single shared
  rotation cannot read upright for all four seats at once.

## 0.9.8: The shared deck rests at one angle for everyone

Side-seat players (left/right) squaring the central deck used to rotate the SHARED
`rot` to their own viewport, so the deck flipped sideways for the other seats and
changed each time a different player tidied it — an inconsistency between viewers.

- **Central deck/discard square to the canonical upright for all seats.** New
  `Game.uprightTargetFor` returns `rot ≡ 0` (shortest path) for a pile sitting on the
  `DECK`/`DISCARD` marker (`isCentralDockPile`), and the per-viewer upright for every
  other pile. Gather, shuffle and stack-turn all route their squaring angle through
  it, so the shared deck now rests at one stable table angle that the side seats see
  edge-on (like a real deck) instead of teleport-rotating per actor. `rotateStack`
  (explicit rotate) is unchanged. Sync-safe: every client writes the same `rot ≡ 0`.
  A previously-sideways deck self-heals to canonical on the next gather/shuffle.
- Documented the rule in `docs/DESIGN.md` (Stack interactions).

## 0.9.7: A dropped "release" could lock a pile for peers

This is the real cause behind "a non-host's Shuffle does nothing." Shuffle is, by
design, allowed for every player (only deck-reset and kick are host-only); a third
end-to-end audit confirmed no host gate and no silent no-op in `shuffleAt`. The
culprit was the lock protocol, not shuffle itself.

- **Hold RELEASE frames are no longer rate-limited.** `RealtimeBus.sendHold` routed
  every hold frame — locks, refreshes AND releases — through the same `holdBucket`
  token bucket. A burst of grabs/locks could drain the bucket and drop the one frame
  that frees a pile, so peers kept the cards shown as locked until the 6s hold-TTL
  expired. During that window the other player genuinely could not grab, flip or
  shuffle those cards — a pile that "does nothing." Releases (`h.release === true`)
  now always send; only lock/refresh frames are throttled. (`src/net/realtime.ts`)
- **No stale "locked" outline over your own grab.** `renderAllCards` toggled
  `is-locked` every frame even on a card you are actively dragging or animating, so a
  stale peer lock could paint the dashed lock outline on top of your own pickup. The
  toggle is now skipped while the card is busy (held/animating). (`src/game/Game.ts`)

Note: side-seat players squaring the shared central deck to their own upright (so it
reads sideways for others) is a per-viewer-rotation design choice, left unchanged
pending a deliberate decision.

## 0.9.6: One shadow per lifted pile

- **Lifted-deck shadow no longer buries the table.** v0.9.3 gave the held card a big
  drop shadow, but it was applied to EVERY card in a lifted pile (`.card.is-held::before`),
  so picking up a 50+ card deck stacked dozens of heavy shadow haloes into a black smear
  that swallowed everything beneath it. The held cards now keep the light resting shadow
  and only the TOP card of the pile (`.is-held-lead`, set by `DragController` on grab and
  cleared on release/drop) carries the big lift shadow, so the pile reads as one floating
  object and the table stays legible. Matches the tokens.css note that card shadows must
  stay light because they compound through a deep stack.

## 0.9.5: Join-by-code and cursor fixes

- **Join by code rejects garbage.** `parseRoomInput`'s last-resort scan was greedy:
  any pasted string with six or more consecutive letters/numbers resolved to its first
  six characters, so pasting a username or a sentence lit the Join button and dropped
  you into an unrelated, empty room. The scan now only accepts a STANDALONE six-char
  code, and the invite-link path tolerates a trailing slash (so `.../P86B3T/` reads the
  code from the path instead of grabbing a six-letter token out of the hostname). Added
  `src/net/room.test.ts` to lock the behaviour.
- **Your cursor hides while you are in a menu.** Opening a modal stopped broadcasting
  the cursor but never sent a hide, so peers saw your ghost frozen on the table the
  whole time. It now sends the off-board sentinel once on the first move with a menu
  open, mirroring the private-zone hide.
- **Sturdier cursor-hide sentinel.** The off-board sentinel moved from -10 to -2 (a
  named `CURSOR_OFFBOARD`), so it survives the input-guard coordinate clamp on its own
  instead of relying on the old -10→-3 clamp coincidence.
- **Reduced-motion consistency.** The shared `snapback` keyframe used by a (currently
  unwired) error-flash state is now disabled under reduced motion too.

## 0.9.4: Card encyclopedia in the docs

- **The card encyclopedia is now in the docs.** Added `docs/CARDS.en.md` and
  `docs/CARDS.tr.md`: every card's category, copy count, full effect text and flavor,
  mirroring the in-app encyclopedia and the locale source so the rules are browsable
  outside the app. Linked from the README, with a `MAINTAINING.md` directive to keep
  `cards.ts`, the locales, and these files in sync.
- **Style pass.** Removed the em dashes that had slipped into the recent changelog and
  "What's new" entries, per the project's no-dash copy rule.

## 0.9.3: A bigger, richer table

- **Bigger, more legible cards.** The card-size clamp grew (max 126px → 150px on
  large screens, with a higher floor and a slightly larger mid-range) so the table
  feels like real cards in hand instead of a small island in the centre, and the
  deck/discard markers (which scale with the card) grow with it. This is purely
  visual: stack-detection reads the measured pixel size and privacy uses a fixed
  canonical fraction, so who can see or group a card is unchanged. Mobile caps were
  raised for big tablets/phones while the field-proportional floors that guarantee
  fit on the smallest screens stayed put.
- **Premium card depth.** The deck back gained a directional gradient, a top
  catch-light and a dark inner edge for real card-stock thickness; face-up cards now
  carry a crisp framed edge over the art; a lifted/held card casts a deeper shadow.
  All still strictly monochrome.
- **Richer table atmosphere.** Added a soft, soft-light film grain and a depth
  vignette painted ON TOP of the table image (so they survive the runtime image
  swap), masking softness in the source and settling the eye on the centre. The
  deck/discard slots read as carved, premium drop targets with a clearer label and a
  stronger hot-state glow. The calm, dark, monochrome mood is preserved.

## 0.9.2: Reduced-motion and resting-pile fixes

- **Reduced motion is honoured end to end.** With the OS "reduce motion" setting
  on, flips and shuffles were already instant visually, but the JS still held the
  pile elevated, kept the undercards hidden, and locked the pile for peers for up
  to ~1.2s with nothing moving, and the riffle/snap-back keyframes still played.
  Now the elevation/quiet/peer-lock windows collapse to zero in lockstep with the
  zeroed CSS, and the `shuffle-spin` and `snapback` keyframes are disabled under
  reduced motion, so a flip/shuffle is genuinely instant with no leftover state.
- **A fully-turned deck stays on its marker.** `recenterDeckPile` recognised a deck
  card as "on the deck" only when its cumulative rotation was exactly 0, so a
  face-down, visually-upright card whose `rot` had wrapped a full circle (4, 8, …)
  drifted off the marker on resize/zoom. It now tests the orientation mod 4, the
  same idiom the rest of the code uses.
- **No needless repaint on a hold refresh.** The holder re-broadcasts a hold every
  few seconds to refresh its TTL; `applyHold` repainted on every one even when the
  locked set was unchanged. It now extends the TTL silently and repaints only when
  the lock set or its seat actually changes.

## 0.9.1: Quieter, more tactile table

- **A collected pile stays collected.** Gathering a pile that is already a tidy,
  squared stack now does nothing (no repeated swoosh, no needless re-broadcast)
  instead of re-gathering and re-playing the sound every time you press it. A
  scattered or fanned pile still gathers normally. Shuffling and turning a pile
  over stay intentionally repeatable.
- **A deck lands heavier than a card.** Dropping a whole pile now plays a deeper,
  settling thud that reads distinctly from the crisp tap of a single card, so the
  table sounds the way it looks.

## 0.9.0: Physical flips, device-consistent privacy, polish and docs

- **Flipping a deck feels physical.** Turning a pile over reverses its depth (the
  bottom card ends up on top) and squares every card to one consistent face, so a
  mixed open and closed pile tidies itself as it turns. No card flashes the wrong
  face, and the whole pile turns as one clean block. Shuffle, gather and the
  shortest-path 90 degree rotation share the same tidy flow with no overlapping
  sound or animation.
- **Your private area is consistent for everyone, on every screen.** A card is
  hidden from other players the instant any part of it enters your zone, from any
  side, and shown again only once it is almost fully out. The decision now uses a
  shared canonical card size, so two players on different screen sizes always agree:
  a card dragged out reveals everywhere at once, never lingering as hidden on one
  view.
- **Host survives a blip.** If the host's connection drops for a moment, they keep
  host while away instead of it jumping to another player; it transfers only on a
  real exit or kick, or once the away grace ends. Returning players still cannot
  steal host from those who stayed.
- **Readable dark table.** Softened the full-screen dark wash, lifted the felt off
  near-black, and raised card contrast so cards stand out and the deck and discard
  labels are clear, while keeping the calm, dark mood.
- **Sound starts cleanly.** Audio resumes on a real tap and re-arms after you switch
  tabs and come back, with no AudioContext console warning.
- **Smaller fixes.** Card info and the touch action bar appear where you are instead
  of sliding in from a corner. A large dragged pile keeps its stacking order. Modals
  open without a stray focus ring. The tab title and the 404 and startup pages now
  read in your language. Joining a room you are already in says so. A new supporters
  wall (newest first) and a "What's new" panel with a badge were added. Player names
  de-duplicate correctly, including Turkish dotted and dotless I.
- **Docs.** Added `docs/MAINTAINING.md` with directives for the changelog and updates
  convention, supporters, locale parity, content style, and the architecture map.

## 0.8.0: Rejoin and host fixes, whole-pile flip, cross-browser join, rules clarity

- **A returning player is visible at once, with no refresh needed.** A player who
  left, was kicked, or dropped and came back is now shown to everyone right away.
  Each client publishes a per-connection stamp, so peers can tell a real reconnect
  (shown immediately) from a stale presence echo (briefly ignored), instead of
  hiding any returning player for the whole grace window.
- **A refresh no longer costs you host.** Host and seat order now come from a
  persisted seniority that survives a reload or reconnect, so refreshing the page
  never hands host to someone else. A player who genuinely leaves and comes back
  returns as the newest, so they cannot take host from the people who stayed.
- **Returning to your seat keeps your perspective.** A returning player reclaims
  their own seat, the board stays oriented to it, and names no longer get swapped
  during a rejoin race.
- **Flipping an open deck turns it as one block.** "Select all and flip" now
  captures the whole connected pile instead of only the cards under one seed,
  gathers it, and turns it over cleanly. The top card no longer drops to the bottom
  mid-turn with a stray card popping up, and the deck and discard piles can never
  merge.
- **Paste-to-join works in Firefox.** Joining by code or link now opens a dialog
  with a text field you paste or type into, instead of relying on a clipboard read
  that Firefox blocks behind its own native paste button.
- **Steadier sync under load.** The host's periodic self-heal is no longer dropped
  by the send-rate cap on a busy table, and a peer with a badly wrong clock can no
  longer freeze cards by stamping them far in the future.
- **Clearer rules.** Necromancer's Eye now says plainly that the card you must take
  counts toward your hand, so you can still discard down to 7 that same Closing.
  Blood Atonement now says plainly that its two cards leave your hand at random and
  nobody picks them. Both notes appear in the in-app rules and the rulebooks, in
  English and Turkish, with new FAQ entries. A few flavour lines were polished too.

## 0.7.2: Exit propagation, scattered-pile flip, dev note

- **Leaving no longer lingers as "away".** On exit or room-hop the `left` broadcast
  is now awaited (with a 700 ms safety timeout) before the channel is torn down, so
  peers receive it and the player vanishes immediately instead of showing "away" for
  the grace window. (A genuine connection drop still shows "away" and resumes.)
- **Flipping a scattered or mixed-angle pile** now gathers and squares the cards onto
  the top card first, so the stack turns over as one solid block instead of the
  under-cards appearing to vanish and teleport. Single-card flips are unchanged.
- **A small "in development, support us" note** sits under the Support menu row.
- Replaced the last user-facing em-dash placeholders (debug HUD) with plain hyphens.

## 0.7.1: Lifecycle hardening, faithful card physics, unique names

- **Leaving a room is a clean break.** Switching rooms (exit or kick) now wipes
  the whole roster (active seats, players, claims, tombstones, holds), so a
  player who leaves or is kicked lands in a fresh room with no phantom "away"
  players carried over from the old one.
- **A kick no longer makes everyone look "away".** Freeing a seat no longer
  re-evaluates a stale presence roster (which could flip still-active players to
  "away"); the next real presence sync re-seats correctly.
- **Everyone sees the same "away".** Seat claims from the authoritative snapshot
  are now the source of truth, so a player who dropped is shown as away on every
  client, including ones that joined after the drop, and a stale claim is
  corrected to match the host.
- **The host can kick an away player.** The kick control now appears on a dropped
  (away) seat too, resolved from its claim, so a stuck seat can always be cleared.
- **Unique handles.** The name pool is much larger and de-duplicated, and the
  table guarantees no two players share a name (the later joiner yields,
  deterministically), and your id never changes.
- **Interacting claims a card.** Flipping, rotating, gathering or shuffling a card
  that sits in your own zone now makes it yours, the same as dragging it in, on
  keyboard, scroll, right-click and the touch bar.
- **No more stray 360° spin on shuffle.** Squaring a pile now turns every card by
  the shortest path, so a sideways card never does a full extra turn (gather and
  shuffle both fixed).
- **A pile turns as one solid block.** Flipping a stack face-down no longer reveals
  the fronts of the inner cards mid-turn; only the outer card is visible through
  the turn (no blink, no leak).
- **Card info reads on the art.** The info panel now uses the card's artwork as its
  background with a dark scrim, text directly on top, with no inner picture box,
  sized so long text never overflows or scrolls.
- **Balanced header mark.** The logo sits a touch larger, in proportion with the
  menu button.

## 0.7.0: Seat labels, clean flips, touch polish, and a real link preview

- **Player areas read clearly.** Each seat's name, status light and host kick
  control now live in a separate upright layer above the cards, so a card dropped
  into a zone never hides them. The cluster reads "light · name · ✕" as one unit,
  and an empty seat shows nothing at all (no floating dot).
- **"Away" is bounded.** A player who drops without leaving is held as away only
  for a short grace window; if they do not return, the seat fully vacates and
  their cards go public, so someone who truly left never lingers as "away".
- **Bigger, sharper table.** The square field cap was raised so large monitors and
  fullscreen fill the screen instead of cramming everyone into a small centre,
  with the same proportions for every player.
- **Flips no longer blink.** Turning a card or a whole pile now animates as one
  solid piece; no card or stack flashes out of existence mid-turn, and a flip
  during a peer's concealment update can't snap it back.
- **Honest actions.** Gather and shuffle are multi-card actions: on a lone card
  they do nothing and play no sound, on every input (keyboard, scroll, touch bar).
- **Touch bar simplified.** One smart "flip" turns the whole pile under your
  finger (or a lone card); the separate stack-flip button is gone.
- **Card info on touch fixed.** Info shows only when you pick a card and press
  Info, a tap anywhere outside dismisses it, and the stale hover panel on touch is
  gone. The panel now shows a slice of the card's art above the text.
- **Responsive from phones to TVs.** Narrow phones get roomier seat strips, modals
  stay fully on-screen on small devices, and safe-area handling is consistent.
- **Support options.** The Support dialog can show Patreon and Buy Me a Coffee
  buttons alongside the generic link, each behind its own env var.
- **Link previews actually render.** The social preview is now a real PNG (most
  scrapers reject SVG), the home-screen icon has a proper square maskable variant,
  and the header emblem keeps its aspect (no more squished logo).
- **Asset guide.** `docs/ASSETS.md` documents the exact art/audio specs and gives
  world-consistent prompts for generating card art, backgrounds and the logo.

## 0.6.0: Square field, lifecycle, and legal

- **Square play field.** The play area is now a centered square (capped at 880px),
  so all four seats share one identical coordinate space. Previously the rectangular
  field distorted the ±90° side seats, making a card's position inconsistent between
  head-on and side players. Proven by tests: every seat agrees on where a card is.
- **Kick is final for everyone.** A kicked player is removed on every screen at once
  (never shown as "away"), their cards go public, and they land in a fresh room as
  host. Only the host can kick; forged kicks are ignored. Connection drops still show
  "away" and remain resumable, the one path that does.
- **Smooth bulk moves.** Dragging a large stack no longer queries the DOM per card
  per frame; element references are cached at grab.
- **Drop lands on top.** Ctrl-dragging a card or stack onto another pile now rests on
  top, not under it.
- **Softer shadows** so a deep deck no longer compounds into a dark mass.
- **About & Legal** menu entry: About, Privacy, Terms, Copyright: professional,
  accurate content in English and Turkish.

## 0.5.0: Production-ready multiplayer

Builds on the 0.4.0 sync fix to make the live, multi-device experience solid.

### Player lifecycle (drop vs exit) and empty seats
- **Empty seats are open table.** Zone hit-testing and card concealment now key off
  whether a player actually holds the seat, not the physical zone div. A seat nobody
  occupies (never sat, or the player left/was kicked) accepts card drops and shows its
  cards as public, exactly like the center table. Centralized in `occupancy.ts`
  (`seatIsOwned` / `seatIsRival` / `cardIsRivalOwned`), unit-tested.
- **Drop (away) vs exit (leave/kick) are clean and distinct.** A dropped player (closed
  tab / lost network) keeps their seat and private cards and resumes on return with the
  same identity. An exited player's seat fully frees and their cards become public.
- **Kick is reliable.** The kicked player is removed on every screen immediately
  (including the kicker's), their freed cards' hold-locks release at once, and a
  12-second tombstone stops a lagging presence sync from resurrecting them.

### Feedback, security, mobile
- **Feedback channel**: optional `ISSUES_URL` (GitHub Issues) and `FEEDBACK_URL`
  (anonymous form); a Feedback row in the menu opens whichever is configured.
- **Security**: the connection self-test masks the project URL (`unizx….supabase.co`);
  SECURITY.md documents that the anon/publishable key is public by design and warns
  against using a secret key. Both `anon` and `sb_publishable_` keys are accepted.
- **Mobile/touch**: no sticky hover after a tap (`@media (hover)`), ≥40-44px touch
  targets, and the long-press action bar wraps instead of overflowing on small phones.
- **Perf**: removed a per-card-per-frame Set allocation from the render hot path.

## 0.4.0: Vaerum

This release renames the project and, more importantly, fixes the root cause behind
the long-standing "nothing syncs / everyone sees a different table" reports.

### The keystone fix: real-time sync

Card moves, flips, rotations and cursors were always wired to broadcast, but every
send was a silent no-op unless the Supabase websocket was online. When Supabase was
unconfigured or unreachable, each client lived in its own world, which is what made
so many already-built features look broken (cursors, per-seat perspective, opponent
privacy, host/kick, away-state). The connection, not those features, was the problem.

- **Same-device fallback transport** (`BroadcastChannel`): two tabs/windows on one
  machine now always sync, even with Supabase offline. A misconfiguration is now
  visible (the Connection row reads Offline) instead of silently dead.
- **Connection self-test** (menu → Connection row): a four-step check: settings
  loaded, URL shape, project reachable + key accepted, Realtime subscribes, that
  echoes the received URL and decodes the anon key's role, so a wrong/missing/
  service-role key is caught immediately. No SQL, tables, RLS or auth are required;
  only a correct URL + anon key + Realtime enabled.
- **Config trimming**: a stray space/newline pasted into an env var no longer breaks
  the URL or key, in both `/api/config` and the client loader.

### Geometry, physics, perspective (covered by unit tests)

- Card positions store the card **centre** as a canonical fraction, so the deck and
  discard sit exactly on their markers on every device and never drift on resize.
- **Rotation-aware stack detection**: a mixed 0°/90° pile is treated as one stack,
  so group flips no longer flash under-card faces and rotated cards are grabbable.
- Group flip keeps every under-card hidden through the whole turn (open and close).
- Four-player seating is regression-locked so the left/right (P3/P4) mirroring the
  reports described can never silently return.

### Audio, content, mobile, brand

- Softer default mix; audio unlocks on the first pointer/touch/key gesture.
- Music plays a crypto-shuffled bag (no repeats until exhausted) and resumes from
  the saved position on refresh.
- Removed invisible zero-width characters from the locales; rulebook controls (TR
  and EN) now match the actual app; balance rationale documented in `docs/DESIGN.md`.
- Mobile long-press action bar gains a card-info button (touch has no hover).
- Deck reset is host-only; leaving a room opens a fresh one with you as host.
- Renamed KABAL → **Vaerum: Heirs of the Ether** across all visible strings and
  docs. Internal storage keys and the realtime channel name are intentionally kept
  so live rooms and saved seats/volumes survive the rename.

### Verifying live multiplayer

Two tabs on one machine sync via the local fallback with no setup. For real
cross-device play, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Vercel, redeploy,
then run the in-app Connection self-test. See `README.md` → Troubleshooting.
