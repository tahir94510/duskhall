export interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Generic support / donate page (the existing "Open support page" button). */
  supportUrl: string;
  /** Patreon page — shows a dedicated "Support on Patreon" button when set. */
  patreonUrl: string;
  /** Buy Me a Coffee page — shows a "Buy me a coffee" button when set. */
  buyMeACoffeeUrl: string;
  /** GitHub Issues page for bug reports / requests (posting needs a GitHub account). */
  issuesUrl: string;
  /** Account-less feedback form (Google Form / Tally) for anyone to submit. */
  feedbackUrl: string;
  appUrl: string;
  appName: string;
  siteUrl: string;
  socialOgImage: string;
}

export function normalise(j: Partial<RuntimeConfig>): RuntimeConfig {
  // Trim every value: a stray space or newline pasted into a Vercel env var is a
  // common, invisible reason the URL/key "looks right" but silently fails. Also
  // strip a trailing slash from the Supabase URL so https://x.supabase.co/ works.
  const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  return {
    supabaseUrl: s(j.supabaseUrl).replace(/\/+$/, ""),
    supabaseAnonKey: s(j.supabaseAnonKey),
    supportUrl: s(j.supportUrl),
    patreonUrl: s(j.patreonUrl),
    buyMeACoffeeUrl: s(j.buyMeACoffeeUrl),
    issuesUrl: s(j.issuesUrl),
    feedbackUrl: s(j.feedbackUrl),
    appUrl: s(j.appUrl),
    appName: s(j.appName),
    siteUrl: s(j.siteUrl),
    socialOgImage: s(j.socialOgImage)
  };
}

// Build-time Vite env (VITE_*). These are inlined at build, so they work both in
// `vite dev` and in any static host even without the /api/config edge function.
// This is the idiomatic local-dev path the README points at (.env.local).
function fromViteEnv(): Partial<RuntimeConfig> {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
  return {
    supabaseUrl: env.VITE_SUPABASE_URL,
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
    supportUrl: env.VITE_SUPPORT_URL,
    patreonUrl: env.VITE_PATREON_URL,
    buyMeACoffeeUrl: env.VITE_BUYMEACOFFEE_URL,
    issuesUrl: env.VITE_ISSUES_URL,
    feedbackUrl: env.VITE_FEEDBACK_URL,
    appName: env.VITE_APP_NAME,
    siteUrl: env.VITE_SITE_URL,
    socialOgImage: env.VITE_OG_IMAGE
  };
}

function hasCreds(c: RuntimeConfig): boolean {
  return !!(c.supabaseUrl && c.supabaseAnonKey);
}

// A dev server (vite) has no /api/config edge function, so that fetch can return
// index.html with HTTP 200; guard against parsing HTML as JSON.
async function fetchJson(url: string): Promise<Partial<RuntimeConfig> | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) return null;
    return (await res.json()) as Partial<RuntimeConfig>;
  } catch {
    return null;
  }
}

// Resolve config from three layers, lowest priority first:
//   1. Vite build-time env (VITE_*)  — local dev / static hosts (.env.local)
//   2. /api/config edge function    — Vercel runtime env (no rebuild needed)
//   3. /config.local.json           — gitignored local fallback
// We stop at the FIRST layer that carries Supabase creds and return it merged with
// everything gathered so far. This short-circuits the network fetches once we have a
// working config (faster boot on the common static-host path where VITE_* carries
// both creds and branding). Consequence: branding (APP_NAME etc.) set ONLY in a
// LATER layer than the one that first supplies creds is not consulted, so keep a
// layer's creds and its branding together. When no layer has creds we fall through
// and return whatever branding all three layers gathered.
export async function loadConfig(): Promise<RuntimeConfig> {
  let merged: Partial<RuntimeConfig> = stripEmpty(fromViteEnv());
  if (hasCreds(normalise(merged))) return normalise(merged);

  const api = await fetchJson("/api/config");
  if (api) merged = { ...merged, ...stripEmpty(api) };
  if (hasCreds(normalise(merged))) return normalise(merged);

  const local = await fetchJson("/config.local.json");
  if (local) merged = { ...merged, ...stripEmpty(local) };

  // No layer carried creds: return whatever branding we gathered (so APP_NAME can
  // still theme the page even when Supabase is unconfigured).
  return normalise(merged);
}

// Drop empty-string/undefined keys so a later source doesn't get clobbered by an
// earlier source's blanks during the spread-merge.
export function stripEmpty(o: Partial<RuntimeConfig>): Partial<RuntimeConfig> {
  const out: Partial<RuntimeConfig> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string" && v.trim()) (out as Record<string, string>)[k] = v;
  }
  return out;
}
