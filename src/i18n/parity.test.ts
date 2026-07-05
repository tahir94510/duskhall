import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Guard rail: every language of a file must expose the EXACT same set of keys (and the same array
// shapes) as its English counterpart. t() returns the raw key on a miss, so a key present in one
// language but not another shows up as "ui.foo" (or, worse, the wrong language) to real players.
// Parity is checked per file PAIR: the shared en/tr, and each game's en/tr under modes/. A game
// has its own key set, so games are only compared against their own other language, never across
// games or against the shared file.
const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../public/locales");
const MODES_DIR = join(LOCALES_DIR, "modes");

function structuralKeys(value: unknown, prefix = ""): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(value)) {
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

function load(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function emptyStrings(value: unknown, p = ""): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (typeof v === "string") { if (v.trim() === "") out.push(path); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(value, p);
  return out;
}

// Build the list of (en, tr) file pairs to check: the shared locale, plus every game's locale.
function localePairs(): Array<{ label: string; en: string; tr: string }> {
  const pairs: Array<{ label: string; en: string; tr: string }> = [
    { label: "shared", en: join(LOCALES_DIR, "en.json"), tr: join(LOCALES_DIR, "tr.json") }
  ];
  if (existsSync(MODES_DIR)) {
    const ids = new Set<string>();
    for (const f of readdirSync(MODES_DIR)) {
      const m = f.match(/^(.+)\.(en|tr)\.json$/);
      if (m) ids.add(m[1]!);
    }
    for (const id of [...ids].sort()) {
      pairs.push({ label: `mode:${id}`, en: join(MODES_DIR, `${id}.en.json`), tr: join(MODES_DIR, `${id}.tr.json`) });
    }
  }
  return pairs;
}

describe("i18n locale parity (per file pair)", () => {
  const pairs = localePairs();

  it("ships the shared en/tr and at least one game (zan)", () => {
    expect(pairs.some((p) => p.label === "shared")).toBe(true);
    expect(pairs.some((p) => p.label === "mode:zan")).toBe(true);
    expect(pairs.some((p) => p.label === "mode:vaerum")).toBe(true);
  });

  for (const { label, en, tr } of pairs) {
    it(`${label}: en and tr have identical key + array shapes`, () => {
      expect(existsSync(en)).toBe(true);
      expect(existsSync(tr)).toBe(true);
      const base = structuralKeys(load(en));
      const other = structuralKeys(load(tr));
      const missing = [...base].filter((k) => !other.has(k));
      const extra = [...other].filter((k) => !base.has(k));
      expect({ label, missing, extra }).toEqual({ label, missing: [], extra: [] });
    });

    it(`${label}: no value is an empty string (meta.tagline may be blank)`, () => {
      for (const file of [en, tr]) {
        const empty = emptyStrings(load(file)).filter((k) => k !== "meta.tagline");
        expect({ file, empty }).toEqual({ file, empty: [] });
      }
    });
  }
});

describe("updates changelog (shared)", () => {
  it("version ids are unique within en and identical in tr", () => {
    const versions = (file: string): string[] => {
      const u = (load(file) as { updates?: { entries?: Array<{ v?: string }> } }).updates;
      return (u?.entries ?? []).map((e) => String(e.v ?? ""));
    };
    const en = versions(join(LOCALES_DIR, "en.json"));
    expect(new Set(en).size).toBe(en.length);
    expect(en.every((v) => v.length > 0)).toBe(true);
    expect(versions(join(LOCALES_DIR, "tr.json"))).toEqual(en);
  });
});
