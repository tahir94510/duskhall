# Changelog

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
