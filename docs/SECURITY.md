# Vaerum: Security and Threat Notes

## What Vaerum is and is not

Vaerum is a static client + a single Vercel Edge function (`/api/config`) + Supabase Realtime (Broadcast + Presence). There is no SQL table, no auth flow, no server-side game state. The threat surface is intentionally small.

Web clients can never be made 100% tamper-proof. The following layers reduce common risks; legal protection (trademark, copyright registration, design patents) remains the only real safeguard for the IP itself.

## HTTP hardening (`vercel.json`)

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (clickjacking)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=()`
- CSP:
  - `default-src 'self'`
  - `script-src 'self'` (no inline scripts, no eval)
  - `connect-src 'self' https://*.supabase.co wss://*.supabase.co`
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` (Google Fonts)
  - `font-src https://fonts.gstatic.com data:`
  - `img-src 'self' data:`
  - `frame-ancestors 'none'`
  - `form-action 'self'`
  - `object-src 'none'`
- `Cache-Control` set explicitly for `/assets` (immutable, 1 year) and `/locales` (1 hour) so static integrity is preserved.

## Realtime payload guarding (`src/security/inputGuard.ts`)

Every broadcast message is treated as untrusted.

- Token-bucket rate limit on **send**: cursors 30 Hz, ops 10 Hz, holds 20 Hz.
- Token-bucket rate limit on **receive, per sender**: a flooding/buggy peer is
  throttled (≈20 patch msgs/s, ≈45 cursor msgs/s) before dispatch, and its
  bucket is pruned when it leaves presence, so one peer can't pin every client's CPU.
- Byte cap: 6 KB per payload.
- Card array cap: 200 entries per patch.
- Coordinate clamp: ±5000 px.
- Schema check: every field must be the right primitive; unknown fields are dropped.
- Seat index clamped to `[-1, 3]` (`-1` = spectator).

## State sync & resilience

- **Auto-reconnect:** a dropped channel (network blip, `CHANNEL_ERROR`/`TIMED_OUT`/
  `CLOSED`) flips the client offline and rejoins with exponential backoff
  (1→16 s + jitter); regained connectivity/visibility kicks an immediate retry.
- **Last-write-wins:** each card carries a write stamp (`ts`); a patch is applied
  to a card only when its stamp is newer, so a late/out-of-order packet can never
  clobber a fresher edit. Snapshots are authoritative full state used to (re)sync.
- **Single-responder join:** a newcomer's `hello` is answered by exactly one peer
  (lowest seat other than the asker), avoiding redundant snapshot storms.
- **Ephemeral hold-lock:** grabbing a card broadcasts a short, auto-expiring lock
  so two players can't tug the same card; a crashed/departed holder's lock lapses.

> **Threat model:** there is no auth, so the `by`/`id` fields on a broadcast are
> not cryptographically verifiable, so a determined peer could spoof another
> player's cursor/patch. This is acceptable for *friendly play*; for a public
> instance, gate room-create behind Cloudflare Turnstile and add Supabase RLS if
> an auth flow is introduced.

## Card privacy

Cards owned by a seat other than the local one render `visibility: hidden` on the front face. Opponent UI never sees the front DOM. This is enforced client-side and is sufficient for friendly play; a determined opponent with devtools can always inspect their own client memory. Vaerum does not claim cryptographic secrecy.

## Room lifecycle

- New visitor: fresh `XXXXXX` slug generated client-side, set via `history.replaceState`. URL path is `/<SLUG>`.
- Resetting a room calls `channel.unsubscribe()`, clears local state and starts a new room.
- No server-side record is kept beyond the lifetime of the Supabase channel. When the last presence drops, the channel ends.
- A periodic `sessionStorage` snapshot lets a single tab survive a hard reload without losing the table.

## Anti-abuse notes for production

- **Front the deployment with Cloudflare** (or an equivalent reverse proxy) for WAF rules, bot fight mode, rate limiting per IP, and DDoS L7 mitigation. Vercel's built-in protections handle infrastructure-level floods but not targeted application-layer abuse.
- Configure Supabase realtime quotas to match your expected traffic.
- Consider a paid Supabase plan for elevated WebSocket quotas before viral traffic.
- For multi-region resilience, deploy in two Vercel regions and let Supabase handle the realtime fan-out.
- Add a Cloudflare Turnstile (or equivalent) challenge on the room-create path if you start seeing scraping or automated room-spawning.

## Reporting issues

Open an issue on the repository or contact the project owner directly. Do not disclose exploitable findings publicly.
