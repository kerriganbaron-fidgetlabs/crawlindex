import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
async function main() {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await db.from('domains')
    .update({ indexable: true, excluded_reason: null, probe_version: null })
    .eq('excluded_reason', 'Opted out via robots.txt')
    .select('domain');
  if (error) throw new Error(error.message);
  console.log('re-enabled', data?.length ?? 0, 'domains wrongly treated as opt-outs');
}
main().catch((e) => { console.error(e); process.exit(1); });
