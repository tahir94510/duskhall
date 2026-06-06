import { describe, it, expect } from "vitest";
import { safeNumber, safeStamp, safeInt, withinByteCap } from "../security/inputGuard.js";
import { isNewerWrite } from "./lww.js";
import { classifyKey, maskHost, sanitizeAnim, sanitizeRemoved, clampCardTs, sanitizeGuide } from "./realtime.js";

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

describe("withinByteCap measures real UTF-8 bytes, not UTF-16 code units", () => {
  it("accepts a small payload", () => {
    expect(withinByteCap({ a: "hello" })).toBe(true);
  });

  it("rejects a payload whose true byte size exceeds the 32 KB cap even though its UTF-16 length does not", () => {
    // Each emoji is 2 UTF-16 code units but 4 UTF-8 bytes. ~9000 of them is ~18000
    // code units (well under 32768, so the old s.length check passed) but ~36000
    // bytes (over the cap). The real byte count must reject it.
    const payload = { s: "😀".repeat(9000) };
    const units = JSON.stringify(payload).length;
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
    expect(units).toBeLessThanOrEqual(32 * 1024); // old check would have passed
    expect(bytes).toBeGreaterThan(32 * 1024);     // true size is over
    expect(withinByteCap(payload)).toBe(false);   // so it is rejected
  });

  it("rejects a value that cannot be serialised (circular)", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(withinByteCap(a)).toBe(false);
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

describe("clampCardTs guards against a far-future (skewed-clock) sender", () => {
  it("passes a real present/past timestamp through unchanged", () => {
    expect(clampCardTs(REAL_TS, REAL_TS)).toBe(REAL_TS);
    expect(clampCardTs(REAL_TS - 10_000, REAL_TS)).toBe(REAL_TS - 10_000);
  });
  it("tolerates ordinary forward skew (seconds to a few minutes)", () => {
    expect(clampCardTs(REAL_TS + 30_000, REAL_TS)).toBe(REAL_TS + 30_000);
  });
  it("clamps a pathological far-future stamp back to now", () => {
    const wild = REAL_TS + 1e9; // ~11 days ahead
    expect(clampCardTs(wild, REAL_TS)).toBe(REAL_TS);
    expect(clampCardTs(wild, REAL_TS)).toBeLessThan(wild);
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

describe("sanitizeRemoved: validate the authoritative removed-players list", () => {
  it("keeps id, full-magnitude connAt, and clamped seat", () => {
    const connAt = 1_700_000_000_000; // a real wall-clock stamp
    expect(sanitizeRemoved([{ id: "abc", connAt, seat: 2 }]))
      .toEqual([{ id: "abc", connAt, seat: 2 }]);
  });
  it("preserves connAt magnitude (safeStamp, not the coordinate clamp)", () => {
    const connAt = 1_700_000_000_500;
    expect(sanitizeRemoved([{ id: "x", connAt }])[0]!.connAt).toBe(connAt);
  });
  it("defaults a missing/invalid seat to -1 and drops empty ids", () => {
    expect(sanitizeRemoved([{ id: "x" }])[0]!.seat).toBe(-1);
    expect(sanitizeRemoved([{ id: "", connAt: 1 }, { connAt: 2 } as never])).toEqual([]);
  });
  it("clamps an out-of-range seat into [-1,3]", () => {
    expect(sanitizeRemoved([{ id: "x", connAt: 1, seat: 99 }])[0]!.seat).toBe(3);
    expect(sanitizeRemoved([{ id: "y", connAt: 1, seat: -9 }])[0]!.seat).toBe(-1);
  });
  it("caps the list at 16 entries so it can never bloat the payload", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `id${i}`, connAt: 1 }));
    expect(sanitizeRemoved(many).length).toBe(16);
  });
  it("returns an empty array for non-arrays", () => {
    expect(sanitizeRemoved(null)).toEqual([]);
    expect(sanitizeRemoved("nope")).toEqual([]);
    expect(sanitizeRemoved(undefined)).toEqual([]);
  });
});

describe("sanitizeGuide: validate the rulebook-walkthrough sync off the wire", () => {
  it("accepts a well-formed host state, clamping seats and deduping ready", () => {
    const g = sanitizeGuide({ kind: "state", started: true, firstSeat: 2, progress: 5, ready: [0, 0, 1, 9, -1], v: 3, by: "host" });
    expect(g).toEqual({ kind: "state", started: true, firstSeat: 2, progress: 5, ready: [0, 1], v: 3, by: "host" });
  });
  it("caps the ready list at four seats and clamps firstSeat into [-1,3]", () => {
    const g = sanitizeGuide({ kind: "state", started: true, firstSeat: 99, progress: 0, ready: [0, 1, 2, 3], v: 1, by: "h" });
    expect(g!.kind).toBe("state");
    if (g!.kind === "state") {
      expect(g.ready.length).toBe(4);
      expect(g.firstSeat).toBe(3);
    }
  });
  it("keeps progress/version at full magnitude (wide ints, not coordinate clamp)", () => {
    const g = sanitizeGuide({ kind: "state", started: true, firstSeat: 0, progress: 99999, ready: [], v: 4242, by: "h" });
    if (g!.kind === "state") { expect(g.progress).toBe(99999); expect(g.v).toBe(4242); }
  });
  it("accepts a client intent and clamps its seat", () => {
    expect(sanitizeGuide({ kind: "intent", action: "ready", seat: 1, by: "p" }))
      .toEqual({ kind: "intent", action: "ready", seat: 1, by: "p" });
    const c = sanitizeGuide({ kind: "intent", action: "chooseFirst", seat: 88, by: "p" });
    if (c!.kind === "intent") expect(c.seat).toBe(3);
  });
  it("rejects an unknown intent action and malformed messages", () => {
    expect(sanitizeGuide({ kind: "intent", action: "explode", seat: 0, by: "p" })).toBe(null);
    expect(sanitizeGuide({ kind: "nope" })).toBe(null);
    expect(sanitizeGuide(null)).toBe(null);
    expect(sanitizeGuide("state")).toBe(null);
  });
});
