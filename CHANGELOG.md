# Changelog

## 0.6.0 — Square field, lifecycle, and legal

- **Square play field.** The play area is now a centered square (capped at 880px),
  so all four seats share one identical coordinate space. Previously the rectangular
  field distorted the ±90° side seats, making a card's position inconsistent between
  head-on and side players. Proven by tests: every seat agrees on where a card is.
- **Kick is final for everyone.** A kicked player is removed on every screen at once
  (never shown as "away"), their cards go public, and they land in a fresh room as
  host. Only the host can kick; forged kicks are ignored. Connection drops still show
  "away" and remain resumable — the one path that does.
- **Smooth bulk moves.** Dragging a large stack no longer queries the DOM per card
  per frame; element references are cached at grab.
- **Drop lands on top.** Ctrl-dragging a card or stack onto another pile now rests on
  top, not under it.
- **Softer shadows** so a deep deck no longer compounds into a dark mass.
- **About & Legal** menu entry: About, Privacy, Terms, Copyright — professional,
  accurate content in English and Turkish.

## 0.5.0 — Production-ready multiplayer

Builds on the 0.4.0 sync fix to make the live, multi-device experience solid.

### Player lifecycle (drop vs exit) and empty seats
- **Empty seats are open table.** Zone hit-testing and card concealment now key off
  whether a player actually holds the seat, not the physical zone div. A seat nobody
  occupies (never sat, or the player left/was kicked) accepts card drops and shows its
  cards as public — exactly like the center table. Centralized in `occupancy.ts`
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
- **Mobile/touch**: no sticky hover after a tap (`@media (hover)`), ≥40–44px touch
  targets, and the long-press action bar wraps instead of overflowing on small phones.
- **Perf**: removed a per-card-per-frame Set allocation from the render hot path.

## 0.4.0 — Vaerum

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
- **Connection self-test** (menu → Connection row): a four-step check — settings
  loaded, URL shape, project reachable + key accepted, Realtime subscribes — that
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
