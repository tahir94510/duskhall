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
  const payload = {
    supabaseUrl:
      env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || "",
    supabaseAnonKey:
      env.SUPABASE_ANON_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      env.VITE_SUPABASE_ANON_KEY ||
      "",
    supportUrl: env.SUPPORT_URL || "",
    appUrl: env.NEXT_PUBLIC_APP_URL || "",
    appName: env.APP_NAME || "",
    siteUrl: env.SITE_URL || env.NEXT_PUBLIC_APP_URL || "",
    socialOgImage: env.OG_IMAGE || ""
  };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
