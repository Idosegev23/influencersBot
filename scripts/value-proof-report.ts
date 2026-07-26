#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * One-off value-proof report.
 *
 *   npx tsx scripts/value-proof-report.ts <accountId> [--since 2026-06-12] [--until <iso>]
 *
 * Reads the same RPC and the same buildValueProof() the dashboards use, so the
 * report cannot disagree with the UI. Metrics that are not measured are printed
 * as "NOT MEASURED" with their basis — never as 0.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { buildValueProof } from '@/lib/analytics/value-proof/metrics';
import type { Metric } from '@/lib/analytics/value-proof/types';

const [accountId, ...rest] = process.argv.slice(2);
if (!accountId) {
  console.error('usage: value-proof-report.ts <accountId> [--since ISO] [--until ISO]');
  process.exit(1);
}
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const fmt = (m: Metric<any> | undefined, render: (v: any) => string): string =>
  !m ? 'n/a'
    : m.measured
      ? `${render(m.value)}${m.lowConfidence ? ` (n=${m.n} — low confidence)` : ''}`
      : `**NOT MEASURED** — ${m.basis}`;
const ils = (n: number) => `₪${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function main() {
  const since = arg('since') || '1970-01-01';
  const until = arg('until') || new Date().toISOString();

  const { data: account } = await supabase.from('accounts').select('config').eq('id', accountId).maybeSingle();
  const label = (account as any)?.config?.username || accountId;
  const costPerTicket = Number((account as any)?.config?.support?.cost_per_ticket) || null;

  const { data: raw, error } = await supabase.rpc('value_proof_summary', {
    p_account_id: accountId, p_since: since, p_until: until,
  });
  if (error) throw new Error(`rpc failed: ${error.message}`);

  const vp = buildValueProof(raw, { audience: 'admin', costPerTicket });

  const md = `# Value-Proof Report — ${label}

**Account:** \`${accountId}\` · **Window:** ${since.slice(0, 10)} → ${until.slice(0, 10)} · **Generated:** ${new Date().toISOString().slice(0, 10)}

Every number is computed by the same code that feeds the dashboards. A metric with no data source says NOT MEASURED and states why — it does not say zero.

| # | Metric | Value |
|---|---|---|
| 1 | Revenue in conversations (total) | ${fmt(vp.revenue.total, ils)} |
| 1a | — direct (bot link / UTM) | ${fmt(vp.revenue.byTier.direct, ils)} |
| 1b | — assisted (anon_id, ≤24h) | ${fmt(vp.revenue.byTier.assisted, ils)} |
| 1c | — influenced (phone/email, ≤7d) | ${fmt(vp.revenue.byTier.influenced, ils)} |
| 2 | Conversation conversion rate | ${fmt(vp.conversion, pct)} |
| 3 | AOV with vs without | ${fmt(vp.aov, (v) => `${ils(v.withChat)} vs ${ils(v.without)} = ${v.deltaPct.toFixed(1)}%`)} |
| 4 | Cart recovery rate (≤7d, derived) | ${fmt(vp.carts.recoveryRate, pct)} |
| 4a | — recovered cart value | ${fmt(vp.carts.recoveredValue, ils)} |
| 4b | — of which Bestie touched | ${fmt(vp.carts.bestieTouched, String)} |
| 4c | — platform baseline | ${fmt(vp.carts.platformBaseline, String)} |
| 5 | Deflection (of support-intent conversations) | ${fmt(vp.deflection.rate, pct)} |
| 5a | — in shekels | ${fmt(vp.deflection.value_ils, ils)} |
| 6 | Time to first response | ${fmt(vp.responseTime.firstResponse, (v) => `${Math.round(v)} ms`)} |
| 6a | Time to close (median) | ${fmt(vp.responseTime.timeToClose, (v) => `${(v / 3600).toFixed(1)}h`)} |
| 7 | Bot gave up | ${fmt(vp.escalation.gaveUpRate, pct)} |
| 7a | Any human touch | ${fmt(vp.escalation.anyHumanRate, pct)} |
| 7b | Escalation reasons | ${fmt(vp.escalation.byReason, (v) => v.map((r: any) => `${r.reason}: ${r.n}`).join(', '))} |
| 8 | Answer accuracy | ${fmt(vp.accuracy, String)} |
| 9 | Setup time | ${fmt(vp.setup?.days, (v) => `${v} day(s)`)} |
| 9a | Setup staff-hours | ${fmt(vp.setup?.staffHours, String)} |
| 10 | Client's own usage | ${fmt(vp.clientUsage, String)} |

## Attribution tiers, never summed without the breakdown

| Tier | Orders | Revenue |
|---|---|---|
| direct | ${fmt(vp.revenue.orders.direct, String)} | ${fmt(vp.revenue.byTier.direct, ils)} |
| assisted | ${fmt(vp.revenue.orders.assisted, String)} | ${fmt(vp.revenue.byTier.assisted, ils)} |
| influenced | ${fmt(vp.revenue.orders.influenced, String)} | ${fmt(vp.revenue.byTier.influenced, ils)} |
`;

  const out = `docs/reports/${new Date().toISOString().slice(0, 10)}-value-proof-${label}.md`;
  writeFileSync(out, md);
  console.log('wrote', out);
}

main().catch((e) => { console.error(e); process.exit(1); });
