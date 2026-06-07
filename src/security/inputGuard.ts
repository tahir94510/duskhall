// Hard caps for any payload arriving from the Realtime channel.
// We don't trust peers, schema-check, size-limit, and clamp coordinates.

// A full 72-card snapshot (every card with rounded coords + stamp) is ~7-8 KB;
// the old 6 KB cap silently DROPPED it, so joiners never received the
// authoritative board and saw a pristine deck. 32 KB clears a full snapshot
// with generous headroom while still rejecting absurd payloads.
const MAX_BYTES = 32 * 1024;
const MAX_CARDS_PER_PATCH = 200;
// Card positions are canonical [0,1] fractions; allow a little off-board drift but
// nothing absurd. This bound is for COORDINATES ONLY — never reuse it for stamps,
// z-order, or other unbounded fields (see safeStamp / safeInt below).
const COORD_MIN = -3;
const COORD_MAX = 4;

/**
 * Clamp a COORDINATE-like number (a canonical fraction) to a sane on/near-board
 * range. Do NOT use this for timestamps or z-order: a last-write-wins stamp is a
 * wall-clock value (~1.7e12) and z grows without bound, so clamping them to a small
 * range silently breaks conflict resolution and stacking. Use safeStamp / safeInt.
 */
export function safeNumber(n: unknown, fallback = 0): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  if (n > COORD_MAX) return COORD_MAX;
  if (n < COORD_MIN) return COORD_MIN;
  return n;
}

/**
 * A finite number with NO magnitude clamp — for last-write-wins timestamps. Only
 * rejects NaN/Infinity (and negatives, which a monotonic clock never produces).
 * Keeping the real magnitude is what makes the LWW gate work across clients.
 */
export function safeStamp(n: unknown, fallback = 0): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/**
 * A finite integer in a wide but bounded range — for z-order. Big enough that a
 * long session never hits the ceiling, but still rejects absurd/hostile values.
 */
export function safeInt(n: unknown, fallback = 0, min = -1e9, max = 1e9): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  const r = Math.round(n);
  if (r > max) return max;
  if (r < min) return min;
  return r;
}

export function safeString(s: unknown, max = 80): string {
  if (typeof s !== "string") return "";
  return s.slice(0, max);
}

export function safeBool(b: unknown): boolean {
  return b === true;
}

// Reused so we don't allocate a new encoder on every send.
const byteCounter = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

export function withinByteCap(payload: unknown): boolean {
  try {
    const s = JSON.stringify(payload);
    // s.length counts UTF-16 code units; the real wire size is the UTF-8 BYTE length,
    // which is >= the unit count (a single non-ASCII char is one unit but up to 3-4
    // bytes). Fast path: if even the unit count is over, it is certainly over. Else
    // measure true bytes so a payload of multibyte names/emoji can't slip past the cap.
    if (s.length > MAX_BYTES) return false;
    // True UTF-8 byte length when TextEncoder exists. In the rare fallback (no TextEncoder),
    // assume the worst case of 4 bytes per UTF-16 code unit so a multibyte payload can never
    // slip past the cap and get silently dropped on the wire.
    const bytes = byteCounter ? byteCounter.encode(s).length : s.length * 4;
    return bytes <= MAX_BYTES;
  } catch {
    return false;
  }
}

export { MAX_CARDS_PER_PATCH };

export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private readonly capacity: number, private readonly refillPerSec: number) {
    this.tokens = capacity;
    this.last = performance.now();
  }
  consume(n = 1): boolean {
    const now = performance.now();
    const delta = (now - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + delta * this.refillPerSec);
    this.last = now;
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }
}
