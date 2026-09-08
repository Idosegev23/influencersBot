#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * Backfill config.widget.domain for accounts that were scanned without a website.
 *
 * Why: a scan started from an Instagram handle alone never sets state.websiteUrl,
 * so site-discover no-ops, finalize registers no domain, and /demo/<id> has
 * nothing to proxy — while the job reports `succeeded`. 55 of 80 active accounts
 * were in that state. For many of them the real site was sitting in their
 * Instagram bio the whole time.
 *
 * The preview route self-heals on demand, so this script is not required for
 * correctness — it exists to fix accounts BEFORE someone opens their demo, which
 * is also what puts them back on the admin websites list and re-enables the
 * demo_ready_v2 widget button.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-widget-domains.ts            # dry run
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-widget-domains.ts --apply
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-widget-domains.ts --apply --account <uuid>
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';
import { pickSiteHostFromBioLinks } from '@/lib/pipeline/bio-domain';
import { registrableDomain } from '@/lib/pipeline/apify-crawl';

const APPLY = process.argv.includes('--apply');
const ONE = process.argv[process.argv.indexOf('--account') + 1];
const ONLY_ACCOUNT = process.argv.includes('--account') ? ONE : null;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

async function servesAPage(host: string): Promise<{ ok: boolean; status: number | string }> {
  try {
    const res = await fetch(`https://${host}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    return { ok: false, status: e?.message || 'network error' };
  }
}

async function main() {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN (pass --apply to write) ===\n');

  let q = supabase.from('accounts').select('id, config').eq('status', 'active');
  if (ONLY_ACCOUNT) q = q.eq('id', ONLY_ACCOUNT);
  const { data: accounts, error } = await q;
  if (error) throw new Error(error.message);

  const missing = (accounts || []).filter((a: any) => {
    const d = a.config?.widget?.domain;
    return !(typeof d === 'string' && d.trim());
  });
  console.log(`${accounts?.length ?? 0} active accounts, ${missing.length} with no widget.domain\n`);

  let healed = 0, noLinks = 0, unreachable = 0;

  for (const acct of missing as any[]) {
    const name = acct.config?.display_name || acct.config?.username || acct.id;

    const { data: prof } = await supabase
      .from('instagram_profile_history')
      .select('bio_links')
      .eq('account_id', acct.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const fromBio = pickSiteHostFromBioLinks((prof as any)?.bio_links);
    if (!fromBio) { noLinks++; console.log(`  —  ${name}: no site in bio`); continue; }

    // Same apex-first preference the runtime resolver uses, so a dry run predicts
    // exactly what a self-heal would write.
    const apex = registrableDomain(fromBio);
    const candidates = apex && apex !== fromBio ? [apex, fromBio] : [fromBio];
    let host: string | null = null;
    let lastStatus: number | string = 'no candidates';
    for (const candidate of candidates) {
      const probe = await servesAPage(candidate);
      if (probe.ok) { host = candidate; break; }
      lastStatus = probe.status;
    }
    if (!host) { unreachable++; console.log(`  ✗  ${name}: ${fromBio} → ${lastStatus}`); continue; }

    console.log(`  ✓  ${name}: ${host}${host !== fromBio ? `  (bio linked ${fromBio})` : ''}`);
    if (process.argv.includes('--json')) console.log(`     JSON {"id":"${acct.id}","host":"${host}"}`);
    healed++;

    if (APPLY) {
      const { data: fresh } = await supabase.from('accounts').select('config').eq('id', acct.id).single();
      const next: Record<string, any> = { ...((fresh as any)?.config ?? {}) };
      if (next.widget?.domain) continue; // someone got there first
      // widget.domain only — see the note in resolve-domain.ts. Turning these
      // accounts into site-crawling scans is a separate, deliberate decision.
      next.widget = { ...(next.widget ?? {}), domain: host };
      const { error: upErr } = await supabase.from('accounts').update({ config: next }).eq('id', acct.id);
      if (upErr) console.log(`     ! write failed: ${upErr.message}`);
    }
  }

  console.log(`\nrecoverable: ${healed}   no site in bio: ${noLinks}   unreachable: ${unreachable}`);
  if (!APPLY && healed) console.log(`\nRe-run with --apply to write ${healed} domain(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
