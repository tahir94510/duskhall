export interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supportUrl: string;
  appUrl: string;
}

const EMPTY: RuntimeConfig = { supabaseUrl: "", supabaseAnonKey: "", supportUrl: "", appUrl: "" };

export async function loadConfig(): Promise<RuntimeConfig> {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) throw new Error(`config ${res.status}`);
    const j = (await res.json()) as Partial<RuntimeConfig>;
    return {
      supabaseUrl: j.supabaseUrl || "",
      supabaseAnonKey: j.supabaseAnonKey || "",
      supportUrl: j.supportUrl || "",
      appUrl: j.appUrl || ""
    };
  } catch {
    try {
      const res = await fetch("/config.local.json", { cache: "no-store" });
      if (res.ok) {
        const j = (await res.json()) as Partial<RuntimeConfig>;
        return {
          supabaseUrl: j.supabaseUrl || "",
          supabaseAnonKey: j.supabaseAnonKey || "",
          supportUrl: j.supportUrl || "",
          appUrl: j.appUrl || ""
        };
      }
    } catch {}
    return EMPTY;
  }
}
