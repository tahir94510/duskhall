export type Locale = "en" | "tr";
const SUPPORTED: Locale[] = ["en", "tr"];
const STORAGE_KEY = "kabal:lang";

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
  try { stored = localStorage.getItem(STORAGE_KEY); } catch {}
  if (stored && SUPPORTED.includes(stored as Locale)) return stored as Locale;
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("tr")) return "tr";
  return "en";
}

export async function loadLocale(loc: Locale): Promise<void> {
  const res = await fetch(`/locales/${loc}.json`, { cache: "default" });
  if (!res.ok) throw new Error(`locale ${loc} failed`);
  data = await res.json();
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
