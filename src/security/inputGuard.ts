// Hard caps for any payload arriving from the Realtime channel.
// We don't trust peers — schema-check, size-limit, and clamp coordinates.

const MAX_BYTES = 6 * 1024;
const MAX_CARDS_PER_PATCH = 200;
const COORD_CLAMP = 5000;

export function safeNumber(n: unknown, fallback = 0): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  if (n > COORD_CLAMP) return COORD_CLAMP;
  if (n < -COORD_CLAMP) return -COORD_CLAMP;
  return n;
}

export function safeString(s: unknown, max = 80): string {
  if (typeof s !== "string") return "";
  return s.slice(0, max);
}

export function safeBool(b: unknown): boolean {
  return b === true;
}

export function withinByteCap(payload: unknown): boolean {
  try {
    const s = JSON.stringify(payload);
    return s.length <= MAX_BYTES;
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
