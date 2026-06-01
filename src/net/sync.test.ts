import { describe, it, expect } from "vitest";
import { safeNumber, safeStamp, safeInt } from "../security/inputGuard.js";
import { isNewerWrite } from "./lww.js";
import { classifyKey, maskHost, sanitizeAnim } from "./realtime.js";

// A minimal unsigned JWT with a given role claim, for classifyKey tests.
function fakeJwt(role: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, iss: "supabase" })}.sig`;
}

// Regression lock for THE multiplayer-sync bug: incoming card timestamps were run
// through safeNumber(), which clamps to a small coordinate range, so every remote
// patch arrived with ts=5000 and the last-write-wins gate rejected it. Cursors (no
// ts) and snapshots (bypass the gate) worked, which is exactly why it hid for so
// long. These tests assert the field validators keep the right magnitudes and that
// the LWW rule then accepts a genuinely newer remote edit.

const REAL_TS = Date.now(); // ~1.7e12, a real monotonic stamp

describe("field validators keep field-appropriate magnitudes", () => {
  it("safeStamp preserves a real wall-clock timestamp (never clamps it)", () => {
    expect(safeStamp(REAL_TS)).toBe(REAL_TS);
    expect(safeStamp(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("safeStamp rejects NaN/Infinity/negative to the fallback", () => {
    expect(safeStamp(NaN, 0)).toBe(0);
    expect(safeStamp(Infinity, 0)).toBe(0);
    expect(safeStamp(-5, 0)).toBe(0);
    expect(safeStamp("nope" as unknown, 0)).toBe(0);
  });

  it("safeInt preserves a large z-order / patch-version, only rounding", () => {
    expect(safeInt(123456)).toBe(123456);
    expect(safeInt(9999.6)).toBe(10000);
    expect(safeInt(NaN, 0)).toBe(0);
  });

  it("safeNumber still clamps a coordinate to the near-board range", () => {
    expect(safeNumber(0.42)).toBeCloseTo(0.42, 9);
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber(1)).toBe(1);
    // Way off board: clamped, but NOT to 5000 (the old bug value).
    expect(safeNumber(99999)).toBeLessThanOrEqual(4);
    expect(safeNumber(-99999)).toBeGreaterThanOrEqual(-3);
  });

  it("CRITICAL: a real timestamp does NOT survive the old coordinate clamp", () => {
    // This is the exact bug: ts through safeNumber collapses to the clamp ceiling,
    // which is < any real ts, so LWW rejected every patch. Proven here so nobody
    // ever routes ts through safeNumber again.
    expect(safeNumber(REAL_TS)).toBeLessThan(REAL_TS);
    // The correct validator keeps it intact.
    expect(safeStamp(REAL_TS)).toBe(REAL_TS);
  });
});

describe("last-write-wins accepts a newer remote edit", () => {
  it("newer remote ts beats older local ts (the move now propagates)", () => {
    // Local card stamped a moment ago; remote edit stamped now.
    expect(isNewerWrite(REAL_TS + 1000, "peerB", REAL_TS, "self")).toBe(true);
  });

  it("older remote ts loses to newer local ts (our fresh edit is not clobbered)", () => {
    expect(isNewerWrite(REAL_TS - 1000, "peerB", REAL_TS, "self")).toBe(false);
  });

  it("equal ts breaks deterministically by writer id, both directions", () => {
    expect(isNewerWrite(REAL_TS, "zeta", REAL_TS, "alpha")).toBe(true);
    expect(isNewerWrite(REAL_TS, "alpha", REAL_TS, "zeta")).toBe(false);
    expect(isNewerWrite(REAL_TS, "same", REAL_TS, "same")).toBe(false);
  });

  it("a remote edit always beats a freshly dealt card (local ts 0, no writer)", () => {
    expect(isNewerWrite(REAL_TS, "peerB", 0, undefined)).toBe(true);
  });

  it("END-TO-END: sanitize then compare — a remote move applies on the receiver", () => {
    // Simulate the receive path: a peer's patch ts is sanitized, then gated.
    const sanitizedTs = safeStamp(REAL_TS + 500); // was the bug: safeNumber -> clamp
    const localTs = REAL_TS; // receiver's current copy
    expect(sanitizedTs).toBe(REAL_TS + 500);
    expect(isNewerWrite(sanitizedTs, "peerB", localTs, "self")).toBe(true);
  });
});

describe("classifyKey accepts both browser keys, rejects secrets", () => {
  it("recognises the legacy anon JWT", () => {
    expect(classifyKey(fakeJwt("anon"))).toBe("anon");
  });

  it("recognises the new publishable key", () => {
    expect(classifyKey("sb_publishable_abc123DEF456")).toBe("publishable");
  });

  it("flags the secret/service_role keys as NOT browser-safe", () => {
    expect(classifyKey(fakeJwt("service_role"))).toBe("service_role");
    expect(classifyKey("sb_secret_super_secret_value")).toBe("secret");
  });

  it("returns unknown for garbage so diagnostics warn", () => {
    expect(classifyKey("not-a-key")).toBe("unknown");
    expect(classifyKey("")).toBe("unknown");
  });
});

describe("maskHost hides the project ref in the self-test", () => {
  it("masks the ref but keeps the supabase suffix", () => {
    const m = maskHost("https://unizxindpodcvrdynlrl.supabase.co");
    expect(m).toBe("unizx….supabase.co");
    expect(m).not.toContain("unizxindpodcvrdynlrl"); // full ref never shown
  });
  it("handles a trailing slash and other supabase TLDs", () => {
    expect(maskHost("https://abcdef.supabase.co/")).toBe("abcde….supabase.co");
  });
  it("never throws on garbage", () => {
    expect(maskHost("not a url")).toBe("••••");
    expect(maskHost("")).toBe("••••");
  });
});

describe("sanitizeAnim: validate the cosmetic flip/shuffle hint", () => {
  it("accepts a valid flip hint with direction", () => {
    expect(sanitizeAnim({ kind: "flip", ids: ["a", "b"], toFaceUp: true }))
      .toEqual({ kind: "flip", ids: ["a", "b"], toFaceUp: true });
  });
  it("accepts a valid shuffle hint (no toFaceUp)", () => {
    expect(sanitizeAnim({ kind: "shuffle", ids: ["a"] })).toEqual({ kind: "shuffle", ids: ["a"] });
  });
  it("drops toFaceUp when it isn't a boolean", () => {
    const a = sanitizeAnim({ kind: "flip", ids: ["a"], toFaceUp: "yes" });
    expect(a).toEqual({ kind: "flip", ids: ["a"] });
    expect(a && "toFaceUp" in a).toBe(false);
  });
  it("rejects an unknown kind", () => {
    expect(sanitizeAnim({ kind: "explode", ids: ["a"] })).toBe(null);
    expect(sanitizeAnim({ ids: ["a"] })).toBe(null);
  });
  it("rejects missing / empty / oversize / non-array ids", () => {
    expect(sanitizeAnim({ kind: "flip", ids: [] })).toBe(null);
    expect(sanitizeAnim({ kind: "flip" })).toBe(null);
    expect(sanitizeAnim({ kind: "flip", ids: "a" })).toBe(null);
    expect(sanitizeAnim({ kind: "flip", ids: new Array(201).fill("x") })).toBe(null);
  });
  it("filters non-string ids and caps id length", () => {
    const a = sanitizeAnim({ kind: "flip", ids: ["ok", 5, null, "y"] });
    expect(a).toEqual({ kind: "flip", ids: ["ok", "y"] });
    const long = "z".repeat(50);
    const b = sanitizeAnim({ kind: "shuffle", ids: [long] });
    expect(b?.ids[0]!.length).toBe(32); // safeString caps at 32
  });
  it("returns null for non-objects", () => {
    expect(sanitizeAnim(null)).toBe(null);
    expect(sanitizeAnim("flip")).toBe(null);
    expect(sanitizeAnim(undefined)).toBe(null);
  });
});
