# KABAL: Security and Threat Notes

## What KABAL is and is not

KABAL is a static client + a single Vercel Edge function (`/api/config`) + Supabase Realtime (Broadcast + Presence). There is no SQL table, no auth flow, no server-side game state. The threat surface is intentionally small.

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

- Token-bucket rate limit: cursors 30 Hz, ops 10 Hz.
- Byte cap: 6 KB per payload.
- Card array cap: 200 entries per patch.
- Coordinate clamp: ±5000 px.
- Schema check: every field must be the right primitive; unknown fields are dropped.
- Patch version: monotonic per room. Older versions are discarded.
- Seat index clamped to `[0, 3]`.

## Card privacy

Cards owned by a seat other than the local one render `visibility: hidden` on the front face. Opponent UI never sees the front DOM. This is enforced client-side and is sufficient for friendly play; a determined opponent with devtools can always inspect their own client memory. KABAL does not claim cryptographic secrecy.

## Room lifecycle

- New visitor → fresh `KBL-XXXXXX` slug generated client-side, set via `history.replaceState`.
- Leaving a room calls `channel.unsubscribe()`, clears local state and starts a new room.
- No server-side record is kept beyond the lifetime of the Supabase channel. When the last presence drops, the channel ends.

## Anti-abuse notes for production

- Configure Supabase realtime quotas to match your expected traffic.
- Front the deployment with Cloudflare (or equivalent) for WAF and bot mitigation; Vercel's built-in protections are not sufficient against targeted floods.
- Consider sponsored Supabase paid plan for elevated WS quotas before viral traffic.
- For multi-region resilience, deploy in two Vercel regions and let Supabase handle the realtime fan-out.

## Reporting issues

Open an issue on the repository or contact the project owner directly. Do not disclose exploitable findings publicly.
