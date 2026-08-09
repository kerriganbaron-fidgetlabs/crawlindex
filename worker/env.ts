import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config({ path: '.env' });

export function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}. Set it in .env.local.`);
  return v;
}

/**
 * Service-role client for the worker. Bypasses RLS, so every write below must still
 * assert on returned rows: PostgREST reports a policy-blocked write as a successful
 * zero-row response, and a crawl that silently stores nothing looks exactly like a
 * crawl that worked.
 */
export function serviceClient(): SupabaseClient {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

/** Throw unless the write came back with the rows we asked for. */
export function assertWrote<T>(rows: T[] | null, what: string, expected?: number): T[] {
  if (!rows || rows.length === 0) {
    throw new Error(`${what}: write returned zero rows. Check RLS and the service role key.`);
  }
  if (expected !== undefined && rows.length !== expected) {
    throw new Error(`${what}: expected ${expected} rows, got ${rows.length}.`);
  }
  return rows;
}
