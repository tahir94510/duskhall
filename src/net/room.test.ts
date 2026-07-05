import { describe, it, expect, vi, afterEach } from "vitest";
import { parseRoomInput, resolveLocation } from "./room.js";

// resolveLocation reads window.location and localStorage. Stub both so we can drive it in node.
function stubEnv(href: string, storedMode?: string): void {
  const store = new Map<string, string>();
  if (storedMode) store.set("duskhall:mode", storedMode);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); }
  });
  vi.stubGlobal("window", { location: { href } });
}
afterEach(() => vi.unstubAllGlobals());

// parseRoomInput is pure (no window/DOM): it only uses `new URL` and regex, so it
// is safe and meaningful to unit test here. It must accept the many shapes a user
// can paste while NEVER inventing a room from an unrelated long token.
describe("parseRoomInput", () => {
  it("accepts a bare code, case- and quote-insensitive", () => {
    expect(parseRoomInput("P86B3T")).toBe("P86B3T");
    expect(parseRoomInput("  p86b3t ")).toBe("P86B3T");
    expect(parseRoomInput("'P86B3T'")).toBe("P86B3T");
  });

  it("reads the code from a full invite link", () => {
    expect(parseRoomInput("https://vaerum.example/P86B3T")).toBe("P86B3T");
    expect(parseRoomInput("https://vaerum.example/P86B3T/")).toBe("P86B3T");
  });

  it("reads a legacy ?r= link, tolerating a KBL- prefix", () => {
    expect(parseRoomInput("https://vaerum.example/?r=KBL-P86B3T")).toBe("P86B3T");
    expect(parseRoomInput("https://vaerum.example/?r=P86B3T")).toBe("P86B3T");
  });

  it("finds a standalone code embedded in surrounding text", () => {
    expect(parseRoomInput("join me: ABC123 tonight")).toBe("ABC123");
    expect(parseRoomInput("KBL-ABC123")).toBe("ABC123");
  });

  it("does NOT truncate a longer alphanumeric run into a 6-char room", () => {
    // The old greedy scan returned the FIRST six chars of any long token, dropping
    // the player into a garbage room. These must all be rejected.
    expect(parseRoomInput("MYLONGUSERNAME")).toBeNull();
    expect(parseRoomInput("ABCDEFG")).toBeNull();      // 7 contiguous
    expect(parseRoomInput("KBL-ABC1234")).toBeNull();  // 7 after the prefix
    expect(parseRoomInput("P86B3TX")).toBeNull();      // a 6-code with a trailing alnum
  });

  it("returns null for empty or codeless input", () => {
    expect(parseRoomInput("")).toBeNull();
    expect(parseRoomInput("   ")).toBeNull();
    expect(parseRoomInput("hello world")).toBeNull();
  });

  it("reads the room code from a /{mode}/{slug} invite link, never the mode word", () => {
    // Regression: a 6-letter mode word like "vaerum" must NOT be read as the room code; the
    // slug is the LAST path segment.
    expect(parseRoomInput("https://duskhall.app/vaerum/P86B3T")).toBe("P86B3T");
    expect(parseRoomInput("https://duskhall.app/zan/ABC123")).toBe("ABC123");
  });
});

describe("resolveLocation: mode + room from the URL", () => {
  it("reads /{mode}/{slug}", () => {
    stubEnv("https://duskhall.app/zan/P86B3T");
    expect(resolveLocation()).toEqual({ mode: "zan", slug: "P86B3T", redirect: null });
  });

  it("reads a bare mode path /{mode} with no room", () => {
    stubEnv("https://duskhall.app/vaerum");
    expect(resolveLocation()).toEqual({ mode: "vaerum", slug: null, redirect: null });
  });

  it("redirects a legacy bare /{SLUG} link to the Vaerum game", () => {
    stubEnv("https://duskhall.app/P86B3T");
    expect(resolveLocation()).toEqual({ mode: "vaerum", slug: "P86B3T", redirect: "/vaerum/P86B3T" });
  });

  it("redirects a legacy ?r= link to the Vaerum game", () => {
    stubEnv("https://duskhall.app/?r=KBL-P86B3T");
    expect(resolveLocation()).toEqual({ mode: "vaerum", slug: "P86B3T", redirect: "/vaerum/P86B3T" });
  });

  it("opens the stored mode with a fresh room at the root", () => {
    stubEnv("https://duskhall.app/", "vaerum");
    expect(resolveLocation()).toEqual({ mode: "vaerum", slug: null, redirect: null });
  });

  it("opens the default mode at the root when none is stored", () => {
    stubEnv("https://duskhall.app/");
    expect(resolveLocation()).toEqual({ mode: "zan", slug: null, redirect: null });
  });

  it("sends a mode path with a malformed slug to the 404 page", () => {
    stubEnv("https://duskhall.app/zan/not-a-slug");
    expect(resolveLocation()).toEqual({ mode: "zan", slug: null, redirect: "/404.html" });
  });

  it("normalises a lowercase slug to uppercase", () => {
    stubEnv("https://duskhall.app/zan/p86b3t");
    expect(resolveLocation()).toEqual({ mode: "zan", slug: "P86B3T", redirect: null });
  });
});
