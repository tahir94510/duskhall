export default function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    supportUrl: process.env.SUPPORT_URL || "",
    appUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || ""
  });
}
