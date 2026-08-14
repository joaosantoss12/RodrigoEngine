import { createClient } from '@supabase/supabase-js'

// Service-role client — server-only, bypasses RLS. Used for the `subscribers`
// table (holds Telegram identity + payment/invite state), which must never
// be reachable through the public anon key.
export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)
