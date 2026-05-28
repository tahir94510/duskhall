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
  return {
    supabaseUrl: j.supabaseUrl || "",
    supabaseAnonKey: j.supabaseAnonKey || "",
    supportUrl: j.supportUrl || "",
    appUrl: j.appUrl || "",
    appName: j.appName || "",
    siteUrl: j.siteUrl || "",
    socialOgImage: j.socialOgImage || ""
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
