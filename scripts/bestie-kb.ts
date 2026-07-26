/**
 * Rebuild Bestie's knowledge base from content/bestie-kb/*.md.
 *
 * Manual by design (spec §3.1): nothing runs this for you. If the dashboard UI
 * changes and this is not run, Bestie will keep giving directions to a screen
 * that moved — and will sound just as certain as when it is right.
 *
 * Run: npm run bestie:kb          (add -- --dry-run to check without writing)
 *
 * Needs Node >= 22 (`nvm use 22`) — supabase-js builds a realtime client at
 * construction and Node 20 has no native WebSocket.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const KB_DIR = join(process.cwd(), 'content', 'bestie-kb');
const dryRun = process.argv.includes('--dry-run');

async function main() {
  // Dynamic: these modules read env at load time, so they must resolve after
  // loadEnv() above.
  const { createClient } = await import('../src/lib/supabase/server');
  const { ingestDocument } = await import('../src/lib/rag');
  const { planKbIngest } = await import('../src/lib/bestie/kb-ingest');
  const { listCustomerScreens, findMissingScreens, findDeadRoutes } =
    await import('../src/lib/bestie/screen-inventory');

  const supabase = createClient();

  const { data: account } = await supabase
    .from('accounts').select('id').eq('config->>username', 'bestie').maybeSingle();
  if (!account) throw new Error('bestie account not found — run scripts/create-bestie-account.ts first');

  // Every other account's name is forbidden vocabulary for Bestie.
  const { data: others } = await supabase.from('accounts').select('config').neq('id', account.id);
  const forbiddenNames = (others ?? [])
    .flatMap((row: any) => [row.config?.display_name, row.config?.username])
    .filter((name: unknown): name is string => typeof name === 'string' && name.trim().length >= 3);

  const files = readdirSync(KB_DIR)
    .filter(name => name.endsWith('.md'))
    .map(name => ({ name, raw: readFileSync(join(KB_DIR, name), 'utf8') }));

  const plan = planKbIngest(files, forbiddenNames);

  if (plan.blocked.length) {
    console.error('BLOCKED — these files cross the boundary and nothing was ingested:');
    for (const b of plan.blocked) {
      console.error(`  ${b.id}: ${b.violations.map(v => `${v.rule}("${v.match}")`).join(', ')}`);
    }
    process.exit(1);
  }

  // Drift: what the customer can see but Bestie cannot explain, and the reverse.
  const screens = listCustomerScreens();
  const documented = plan.entries.filter(e => e.kind === 'screen').map(e => e.route!);
  const missing = findMissingScreens(screens, documented);
  const dead = findDeadRoutes(screens, documented);
  if (missing.length) console.warn(`⚠ ${missing.length} screens with no entry:\n  ${missing.join('\n  ')}`);
  if (dead.length) console.error(`✖ ${dead.length} entries point at screens that no longer exist:\n  ${dead.join('\n  ')}`);

  if (dryRun) {
    console.log(`dry run — ${plan.entries.length} entries would be ingested`);
    return;
  }

  // Replace wholesale: the markdown is the source of truth, so a deleted file
  // must take its chunks with it rather than lingering in the index.
  await supabase.from('document_chunks')
    .delete().eq('account_id', account.id).eq('metadata->>source', 'bestie_kb');

  for (const entry of plan.entries) {
    await ingestDocument({
      accountId: account.id,
      entityType: 'knowledge_base',
      sourceId: entry.id,
      title: entry.title,
      text: entry.body,
      metadata: { source: 'bestie_kb', kind: entry.kind, route: entry.route ?? null },
    });
  }

  console.log(`ingested ${plan.entries.length} entries`);
  if (dead.length) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
