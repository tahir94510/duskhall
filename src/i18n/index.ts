import { getActiveModeId } from "../modes/active.js";

export type Locale = "en" | "tr";
const SUPPORTED: Locale[] = ["en", "tr"];
const STORAGE_KEY = "duskhall:lang";
// The previous single-game key, read as a fallback so a returning player's language survives the
// upgrade even before the storage migration has copied it over.
const LEGACY_STORAGE_KEY = "vaerum:lang";

export type LocaleData = Record<string, unknown>;

let current: Locale = "en";
let data: LocaleData = {};
const listeners = new Set<() => void>();

export function detectLocale(): Locale {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("lang");
  if (fromQuery && SUPPORTED.includes(fromQuery as Locale)) return fromQuery as Locale;
  // Guard the read: in storage-blocked environments (some private modes, embedded
  // or policy-restricted contexts) even getItem throws. detectLocale is the very
  // first call in boot, so an unguarded throw here would replace the whole app with
  // the boot-fail card instead of just falling back to the browser language. The
  // write side is already guarded the same way.
  let stored: string | null = null;
  try { stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY); } catch {}
  if (stored && SUPPORTED.includes(stored as Locale)) return stored as Locale;
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("tr")) return "tr";
  return "en";
}

// Deep-merge the per-mode locale over the shared one: mode keys win, nested objects merge,
// arrays and primitives replace. Shared UI text lives once while each game supplies its own
// cards, rules, guide and meta under the key paths the UI already reads.
function deepMerge(base: LocaleData, over: LocaleData): LocaleData {
  const out: LocaleData = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const cur = out[k];
    if (v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" && !Array.isArray(cur)) {
      out[k] = deepMerge(cur as LocaleData, v as LocaleData);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function fetchLocaleFile(path: string): Promise<LocaleData | null> {
  // Always revalidate against the server (a cheap conditional request). Translations ship WITH
  // each release; the no-cache response header (vercel.json) keeps text in step with the bundle
  // without the player needing a hard refresh.
  try {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as LocaleData;
  } catch {
    return null;
  }
}

// Load a language: the shared system strings merged with the active mode's own strings. A
// missing mode file degrades to shared-only (the shared file may still carry a mode's text
// during a transition), so the app never shows raw keys for a mode whose file is absent.
export async function loadLocale(loc: Locale, modeId: string = getActiveModeId()): Promise<void> {
  const shared = await fetchLocaleFile(`/locales/${loc}.json`);
  if (!shared) throw new Error(`locale ${loc} failed`);
  const mode = await fetchLocaleFile(`/locales/modes/${modeId}.${loc}.json`);
  data = mode ? deepMerge(shared, mode) : shared;
  current = loc;
  document.documentElement.setAttribute("lang", loc);
  try {
    localStorage.setItem(STORAGE_KEY, loc);
  } catch {}
  for (const l of listeners) l();
}

export function getLocale(): Locale {
  return current;
}

export function onLocaleChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function t(path: string, params?: Record<string, string | number>): string {
  const parts = path.split(".");
  let cur: unknown = data;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return path;
    }
  }
  if (typeof cur !== "string") return path;
  if (!params) return cur;
  return cur.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

export function tArr<T = unknown>(path: string): T[] {
  const parts = path.split(".");
  let cur: unknown = data;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return [];
    }
  }
  return Array.isArray(cur) ? (cur as T[]) : [];
}

export function tObj<T = Record<string, unknown>>(path: string): T | null {
  const parts = path.split(".");
  let cur: unknown = data;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return null;
    }
  }
  return (cur as T) ?? null;
}
