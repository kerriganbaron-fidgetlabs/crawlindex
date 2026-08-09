import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function main() {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Everything observed today came from probe 1.2.0. Stamp it so tonight's run has a
  // like-for-like baseline to compare against.
  const { data: stamped, error: e1 } = await db
    .from('domains')
    .update({ probe_version: '1.2.0' })
    .not('observed_at', 'is', null)
    .is('probe_version', null)
    .select('domain');
  if (e1) throw new Error(e1.message);
  console.log('probe_version stamped on', stamped?.length ?? 0, 'rows');

  // Every existing change row was produced by comparing across probe versions, so each
  // one may describe our methodology rather than the site. They cannot be salvaged.
  const { data: killed, error: e2 } = await db.from('changes').delete().gt('id', 0).select('id');
  if (e2) throw new Error(e2.message);
  console.log('discarded', killed?.length ?? 0, 'pre-baseline change rows');

  const { count: idx } = await db.from('domains').select('domain', { count: 'exact', head: true }).eq('indexable', true);
  const { count: scored } = await db.from('domains').select('domain', { count: 'exact', head: true }).eq('indexable', true).not('score', 'is', null);
  const { count: opted } = await db.from('domains').select('domain', { count: 'exact', head: true }).eq('excluded_reason', 'Opted out via robots.txt');
  console.log(`indexable=${idx} scored=${scored} optedOut=${opted}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
