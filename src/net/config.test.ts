import { describe, it, expect } from "vitest";
import { normalise, stripEmpty } from "./config.js";

// The trim/strip helpers are the defense against the most common, invisible
// misconfiguration: a space or newline pasted into an env var.

describe("normalise", () => {
  it("trims whitespace and strips a trailing slash from the Supabase URL", () => {
    const c = normalise({
      supabaseUrl: "  https://abc.supabase.co/  ",
      supabaseAnonKey: " key123 \n"
    });
    expect(c.supabaseUrl).toBe("https://abc.supabase.co");
    expect(c.supabaseAnonKey).toBe("key123");
  });

  it("fills every field with a string, even when absent", () => {
    const c = normalise({});
    expect(c.supabaseUrl).toBe("");
    expect(c.appName).toBe("");
    expect(typeof c.socialOgImage).toBe("string");
    // The support channels default to empty strings (button hidden) when unset.
    expect(c.patreonUrl).toBe("");
    expect(c.buyMeACoffeeUrl).toBe("");
  });

  it("trims the support-channel URLs", () => {
    const c = normalise({ patreonUrl: "  https://patreon.com/x \n", buyMeACoffeeUrl: " https://buymeacoffee.com/x " });
    expect(c.patreonUrl).toBe("https://patreon.com/x");
    expect(c.buyMeACoffeeUrl).toBe("https://buymeacoffee.com/x");
  });

  it("strips multiple trailing slashes but keeps the host intact", () => {
    expect(normalise({ supabaseUrl: "https://x.supabase.co///" }).supabaseUrl).toBe("https://x.supabase.co");
  });
});

describe("stripEmpty", () => {
  it("drops blank and whitespace-only values so a later layer is not clobbered", () => {
    const out = stripEmpty({ supabaseUrl: "https://x.supabase.co", appName: "   ", supportUrl: "" });
    expect(out.supabaseUrl).toBe("https://x.supabase.co");
    expect("appName" in out).toBe(false);
    expect("supportUrl" in out).toBe(false);
  });

  it("layered spread merges branding across sources (low to high)", () => {
    // Simulates: Vite env (creds) + /api/config (branding) merged.
    const merged = { ...stripEmpty({ supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "k" }), ...stripEmpty({ appName: "Vaerum", supabaseUrl: "" }) };
    expect(merged.supabaseUrl).toBe("https://x.supabase.co"); // not clobbered by the empty
    expect(merged.appName).toBe("Vaerum");
  });
});
