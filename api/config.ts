// Vercel serverless function for public runtime config.
// Returns Supabase + branding URLs from environment variables.

export const config = {
  runtime: "edge"
};

interface Env {
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPPORT_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  APP_NAME?: string;
  SITE_URL?: string;
  OG_IMAGE?: string;
}

export default function handler(): Response {
  const env = process.env as unknown as Env;
  // Trim every value so a trailing space/newline accidentally pasted into a
  // dashboard env var can't silently break the URL or key.
  const v = (x?: string): string => (typeof x === "string" ? x.trim() : "");
  const payload = {
    supabaseUrl:
      v(env.SUPABASE_URL) || v(env.NEXT_PUBLIC_SUPABASE_URL) || v(env.VITE_SUPABASE_URL) || "",
    supabaseAnonKey:
      v(env.SUPABASE_ANON_KEY) ||
      v(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
      v(env.VITE_SUPABASE_ANON_KEY) ||
      "",
    supportUrl: v(env.SUPPORT_URL),
    appUrl: v(env.NEXT_PUBLIC_APP_URL),
    appName: v(env.APP_NAME),
    siteUrl: v(env.SITE_URL) || v(env.NEXT_PUBLIC_APP_URL),
    socialOgImage: v(env.OG_IMAGE)
  };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
