export interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supportUrl: string;
  appUrl: string;
  appName: string;
  siteUrl: string;
  socialOgImage: string;
}

const EMPTY: RuntimeConfig = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  supportUrl: "",
  appUrl: "",
  appName: "",
  siteUrl: "",
  socialOgImage: ""
};

function normalise(j: Partial<RuntimeConfig>): RuntimeConfig {
  // Trim every value: a stray space or newline pasted into a Vercel env var is a
  // common, invisible reason the URL/key "looks right" but silently fails. Also
  // strip a trailing slash from the Supabase URL so https://x.supabase.co/ works.
  const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  return {
    supabaseUrl: s(j.supabaseUrl).replace(/\/+$/, ""),
    supabaseAnonKey: s(j.supabaseAnonKey),
    supportUrl: s(j.supportUrl),
    appUrl: s(j.appUrl),
    appName: s(j.appName),
    siteUrl: s(j.siteUrl),
    socialOgImage: s(j.socialOgImage)
  };
}

export async function loadConfig(): Promise<RuntimeConfig> {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) throw new Error(`config ${res.status}`);
    return normalise(await res.json());
  } catch {
    try {
      const res = await fetch("/config.local.json", { cache: "no-store" });
      if (res.ok) return normalise(await res.json());
    } catch {}
    return EMPTY;
  }
}
