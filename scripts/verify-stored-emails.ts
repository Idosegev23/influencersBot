/**
 * One-off sweep: MX-check every address we have stored, and record the verdict.
 *
 * Read-only with respect to customer data — it writes only to email_deliverability, and
 * contacts nobody. The point is that an agent opening an old ticket sees "this address
 * bounces" instead of spending a reply on it.
 *
 * Resumable: re-running skips anything already recorded, so it can be interrupted freely.
 *
 * Needs Node >= 22: supabase-js reaches for a native WebSocket at construction time and
 * Node 20 does not have one, so this dies before it reads a single row.
 *   PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" \
 *     npx tsx scripts/verify-stored-emails.ts [--limit N] [--recheck]
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { verifyEmail, normalizeEmail } from '../src/lib/support/email-deliverability';

// Same fallback chain as src/lib/supabase.ts — .env.local carries SUPABASE_SECRET_KEY.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!,
);

/**
 * Only the tables that feed an outbound mail path. brand_orders and brand_abandoned_carts
 * hold far more damage — gmail.con alone appears 88 and 46 times — but that is merchant
 * data synced from QuickShop, not something a shopper typed into our forms, and nothing
 * here sends to it.
 */
const SOURCES: { table: string; column: string }[] = [
  { table: 'support_requests', column: 'customer_email' },
  { table: 'bestie_leads', column: 'email' },
  { table: 'service_briefs', column: 'email' },
  { table: 'client_contacts', column: 'email' },
];

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const limitArg = argValue('--limit');
  const limit = limitArg ? Number(limitArg) : Infinity;
  const recheck = process.argv.includes('--recheck');

  const addresses = new Set<string>();
  for (const { table, column } of SOURCES) {
    const { data, error } = await supabase.from(table).select(column).not(column, 'is', null);
    if (error) { console.error(`[skip] ${table}: ${error.message}`); continue; }
    for (const row of (data as any[]) || []) {
      const a = normalizeEmail(row[column]);
      if (a) addresses.add(a);
    }
    console.log(`${table}.${column}: ${data?.length ?? 0} rows`);
  }

  let known = new Set<string>();
  if (!recheck) {
    const { data } = await supabase.from('email_deliverability').select('address');
    known = new Set(((data as any[]) || []).map((r) => r.address));
  }

  const all = [...addresses].filter((a) => !known.has(a));
  const todo = limit === Infinity ? all : all.slice(0, limit);
  console.log(`\n${addresses.size} distinct addresses, ${todo.length} to check\n`);

  const counts: Record<string, number> = {};
  const dead: string[] = [];
  for (let i = 0; i < todo.length; i++) {
    const addr = todo[i];
    const v = await verifyEmail(addr);
    counts[v.status] = (counts[v.status] || 0) + 1;

    // 'unknown' is not recorded: it is a statement about the resolver, not the address.
    if (v.status !== 'unknown') {
      // A 'typo' verdict is stored as ok, because the domain DOES accept mail — that is
      // exactly what makes a live typosquat dangerous rather than merely broken. The
      // reason column keeps the finding: gamil.com and gnail.com deliver, just not to the
      // person the shopper meant.
      await supabase.from('email_deliverability').upsert({
        address: addr,
        status: v.status === 'undeliverable' ? 'no_mx' : 'ok',
        reason: v.status === 'undeliverable' ? v.reason
          : v.status === 'typo' ? `lookalike_domain:${v.suggestion}`
          : null,
        checked_at: new Date().toISOString(),
      });
    }
    if (v.status === 'undeliverable') {
      const line = `  ✗ ${addr}${v.suggestion ? `  → ${addr.split('@')[0]}@${v.suggestion}` : ''}`;
      dead.push(line);
      console.log(line);
    }
    if ((i + 1) % 100 === 0) console.log(`… ${i + 1}/${todo.length}`);
  }

  console.log('\ndone:', counts);
  console.log(`${dead.length} undeliverable of ${todo.length} checked`);
}

main().catch((e) => { console.error(e); process.exit(1); });
