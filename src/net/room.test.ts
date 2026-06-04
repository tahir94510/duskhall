import { describe, it, expect } from "vitest";
import { parseRoomInput } from "./room.js";

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
});
