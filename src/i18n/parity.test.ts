import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Guard rail: every locale must expose the EXACT same set of keys (and the same array
// shapes). t() returns the raw key on a miss, so a key present in one language but not
// another shows up as "ui.foo" (or, worse, the wrong language) to real players. This test
// fails the build the moment a translator adds/removes a key in one file only — so the UI
// is always fully bilingual with no English bleeding into Turkish or vice-versa.
const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../public/locales");

function structuralKeys(value: unknown, prefix = ""): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(value)) {
    // Record array length AND recurse into each element's shape (so a changelog entry
    // with {v,date,title,items} must match across locales, but plain string lists only
    // need the same length).
    out.add(`${prefix}[]=${value.length}`);
    value.forEach((v, i) => structuralKeys(v, `${prefix}[${i}]`).forEach((k) => out.add(k)));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const kp = prefix ? `${prefix}.${k}` : k;
      out.add(kp);
      structuralKeys(v, kp).forEach((x) => out.add(x));
    }
  }
  return out;
}

function loadLocale(name: string): unknown {
  return JSON.parse(readFileSync(join(LOCALES_DIR, name), "utf8"));
}

describe("i18n locale parity (EN ↔ TR ↔ every locale)", () => {
  const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json")).sort();

  it("ships at least the en and tr locales", () => {
    expect(files).toContain("en.json");
    expect(files).toContain("tr.json");
  });

  it("every locale has the identical key + array shape as en.json", () => {
    const base = structuralKeys(loadLocale("en.json"));
    for (const f of files) {
      if (f === "en.json") continue;
      const other = structuralKeys(loadLocale(f));
      const missing = [...base].filter((k) => !other.has(k));
      const extra = [...other].filter((k) => !base.has(k));
      expect({ locale: f, missing, extra }).toEqual({ locale: f, missing: [], extra: [] });
    }
  });

  it("no value is an empty string (a blank translation reads as a gap to players)", () => {
    for (const f of files) {
      const flatEmpty: string[] = [];
      const walk = (v: unknown, p: string): void => {
        if (typeof v === "string") { if (v.trim() === "") flatEmpty.push(p); }
        else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
        else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k);
      };
      walk(loadLocale(f), "");
      // meta.tagline is intentionally blank in both locales; allow only that.
      expect({ locale: f, empty: flatEmpty.filter((k) => k !== "meta.tagline") })
        .toEqual({ locale: f, empty: [] });
    }
  });
});
