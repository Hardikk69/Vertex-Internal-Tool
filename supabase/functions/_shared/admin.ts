import { createClient } from "jsr:@supabase/supabase-js@2";

// Service-role client: bypasses RLS, so only ever used server-side, after the caller is checked.
// Newer projects expose the secret key as SUPABASE_SECRET_KEYS instead of SUPABASE_SERVICE_ROLE_KEY.
export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default,
  { auth: { persistSession: false } },
);

// The deployed app, for links in emails, e.g. https://vertex-internal-tool.h-kansara106.workers.dev
export const APP_URL = Deno.env.get("APP_URL")!.replace(/\/$/, "");
