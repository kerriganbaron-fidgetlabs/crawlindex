import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Read-only client for the public site. Uses the anon key against RLS policies that
 * permit `select` and nothing else, so a leaked anon key exposes only data the site
 * already publishes on every page.
 */
export function publicClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
