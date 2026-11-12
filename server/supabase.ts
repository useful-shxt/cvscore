import { createClient } from "@supabase/supabase-js";

// Server-only. Prefer the private (secret / service_role) key so the tables
// can be locked with row-level security; fall back to the old public key
// until SUPABASE_SERVICE_KEY is set in Railway.
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) must be set");
}

if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn("[supabase] SUPABASE_SERVICE_KEY not set - using the public key");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default supabase;
