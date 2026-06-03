# Changelog

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
