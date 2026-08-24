/**
 * Fills conversation_classifications.product_line on rows classified before the
 * series axis existed.
 *
 * Costs nothing: the series names are already sitting in product_mention_raw
 * (the classifier copies whatever the customer wrote, and customers write
 * "סדרת קיק"), so this is pure code resolution — no model call.
 *
 *   npx tsx scripts/backfill-product-lines.ts --account <uuid> [--dry]
 */

import { createClient } from '@supabase/supabase-js';
import { buildSeriesIndex, resolveSeries } from '../src/lib/conversation-analytics/series-resolver';

function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // This repo uses SUPABASE_SECRET_KEY locally and SUPABASE_SERVICE_ROLE_KEY in
  // some deployments; accept either rather than failing on the wrong name.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) are required');
  }

  const accountId = arg('account');
  if (!accountId) throw new Error('--account is required');
  const dry = has('dry');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: catalog, error: catErr } = await supabase
    .from('widget_products')
    .select('id, product_line')
    .eq('account_id', accountId);
  if (catErr) throw new Error(`catalog: ${catErr.message}`);

  const index = buildSeriesIndex(catalog || []);
  console.log(`${index.labels.length} distinct product lines after normalisation`);

  // PostgREST caps an unbounded select at 1000 rows, which silently truncates a
  // backfill of this size — page explicitly.
  const PAGE = 1000;
  const rows: Array<{ id: string; product_mention_raw: string | null }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('conversation_classifications')
      .select('id, product_mention_raw')
      .eq('account_id', accountId)
      .is('product_line', null)
      .not('product_mention_raw', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`rows: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  console.log(`${rows.length} rows with a mention and no line yet`);

  let resolved = 0;
  for (const r of rows) {
    const line = resolveSeries(index, r.product_mention_raw);
    if (!line) continue;
    resolved++;
    if (!dry) {
      const { error: upErr } = await supabase
        .from('conversation_classifications')
        .update({ product_line: line })
        .eq('id', r.id);
      if (upErr) console.error(`update ${r.id}: ${upErr.message}`);
    }
  }

  console.log(`${resolved} rows resolved to a line${dry ? ' (dry run, nothing written)' : ''}`);

  // Rows whose SKU matched already know their line — inherit it directly.
  if (!dry) {
    const skuRows: Array<{ id: string; product_id: string }> = [];
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from('conversation_classifications')
        .select('id, product_id')
        .eq('account_id', accountId)
        .is('product_line', null)
        .not('product_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      skuRows.push(...data as any);
      if (data.length < PAGE) break;
    }

    const lineById = new Map((catalog || []).map((p: any) => [p.id, p.product_line]));
    let inherited = 0;
    for (const r of skuRows) {
      const line = lineById.get(r.product_id);
      if (!line) continue;
      await supabase.from('conversation_classifications').update({ product_line: line }).eq('id', r.id);
      inherited++;
    }
    console.log(`${inherited} rows inherited a line from their matched SKU`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
