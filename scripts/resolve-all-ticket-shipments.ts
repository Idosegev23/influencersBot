/**
 * Backfill: for every LA BEAUTÉ support ticket that has an order_number
 * but no tracking_number, hit Focus's PULL endpoint with the scoped
 * P2 lookup (-N,-A<order>,-A,-N<customer>) and persist the resolved
 * ship_no.
 *
 * Reports per-ticket: found / pending / collision / error.
 *
 *   npx tsx scripts/resolve-all-ticket-shipments.ts
 *
 * Optional flags:
 *   --account=<uuid>   target a different account (defaults to LA BEAUTÉ)
 *   --concurrency=8    how many Focus requests to fire in parallel
 *   --refresh          re-resolve even tickets that already have a tracking_number
 */

import 'dotenv/config';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local', override: true });
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';

const ACCOUNT_ID_DEFAULT = '432dea15-707f-4cfe-b7e2-331c7a02b228'; // LA BEAUTÉ
const FOCUS_HOST = 'focusdelivery.co.il';
const CUSTOMER_CODE = 10038; // master_customer_id at Focus

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const ACCOUNT_ID = (args.account as string) || ACCOUNT_ID_DEFAULT;
const CONCURRENCY = Number(args.concurrency || 8);
const REFRESH = args.refresh === 'true';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;
if (!SUPABASE_URL || !SECRET_KEY) {
  console.error('Missing SUPABASE env');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SECRET_KEY);

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  trimValues: true,
});

interface FocusResult {
  found: boolean;
  shipNo: string | null;
  master: string | null;
  message: string | null;
}

async function focusCall(args: string): Promise<{
  shipNo: string | null;
  master: string | null;
  shgiya: string;
  message: string;
}> {
  const url = `https://${FOCUS_HOST}/RunCom.Server/Request.aspx?APPNAME=run&PRGNAME=ship_status_xml&ARGUMENTS=${args}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Focus ${res.status}`);
  const text = await res.text();
  const parsed = xml.parse(text);
  const data = parsed?.root?.mydata || {};
  const shipNo = String(data.ship_no || '').trim();
  const shgiya = String(data.shgiya_yn || '').trim();
  const message = String(data.message || '').trim();
  const master = String(data.master_customer_id || '').trim();
  const validMaster = !master.startsWith('<!$MG_') && !!master;
  return {
    shipNo: shipNo && shipNo !== '0' ? shipNo : null,
    master: validMaster ? master : null,
    shgiya,
    message: message || '',
  };
}

async function focusLookup(value: string): Promise<FocusResult> {
  // Variant strategy by digit length (per Tzvika at Focus + brand owner):
  //
  //   5-6 digits   → legacy LA BEAUTÉ orders, stored at Focus as
  //                  ref2="#180988". Search MUST include the '#'.
  //                  Plain-digit lookup will spuriously hit a different
  //                  customer's ship_no, so we skip it for this length.
  //   7 digits     → could be either a Focus ship_no copied from the
  //                  email (33xxxxx / 34xxxxx) or a transitional order#.
  //                  Try P1 (ship_no) first, then '#'-prefixed P2.
  //   8+ digits    → modern Shopify order# format (10000000+). Plain
  //                  P2 is sufficient — '#' isn't used for these.
  const variants: Array<{ kind: 'p2' | 'p1'; arg: string }> = [];

  if (value.length <= 6) {
    // Short — only the '#'-prefixed form.
    variants.push({
      kind: 'p2',
      arg: `-N,-A%23${encodeURIComponent(value)},-A,-N${CUSTOMER_CODE}`,
    });
  } else if (value.length === 7) {
    // 7 digits — most likely a Focus ship_no the customer pasted from
    // the email. Try P1 first.
    variants.push({ kind: 'p1', arg: `-N${encodeURIComponent(value)},-A` });
    variants.push({
      kind: 'p2',
      arg: `-N,-A%23${encodeURIComponent(value)},-A,-N${CUSTOMER_CODE}`,
    });
  } else {
    // 8+ digits — modern order numbers, plain P2.
    variants.push({
      kind: 'p2',
      arg: `-N,-A${encodeURIComponent(value)},-A,-N${CUSTOMER_CODE}`,
    });
  }

  let lastMaster: string | null = null;
  let lastMessage = '';
  for (const v of variants) {
    const r = await focusCall(v.arg);
    if (r.shipNo && r.master && Number(r.master) === CUSTOMER_CODE && r.shgiya !== 'y') {
      return { found: true, shipNo: r.shipNo, master: r.master, message: null };
    }
    lastMaster = r.master || lastMaster;
    lastMessage = r.message || lastMessage;
  }
  return { found: false, shipNo: null, master: lastMaster, message: lastMessage || null };
}

interface Ticket {
  id: string;
  order_number: string | null;
  tracking_number: string | null;
  customer_name: string | null;
  status: string;
  created_at: string;
}

async function loadTickets(): Promise<Ticket[]> {
  let q = supabase
    .from('support_requests')
    .select('id, order_number, tracking_number, customer_name, status, created_at')
    .eq('account_id', ACCOUNT_ID)
    .not('order_number', 'is', null)
    .order('created_at', { ascending: false });
  if (!REFRESH) {
    q = q.is('tracking_number', null);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Ticket[];
}

async function processBatch(items: Ticket[]) {
  return Promise.all(
    items.map(async (t) => {
      const order = (t.order_number || '').replace(/[^0-9]/g, '');
      if (!order) {
        return { id: t.id, kind: 'skip-no-digits' as const };
      }
      try {
        const r = await focusLookup(order);
        if (r.found && r.shipNo) {
          await supabase
            .from('support_requests')
            .update({ tracking_number: r.shipNo, updated_at: new Date().toISOString() })
            .eq('id', t.id);
          return { id: t.id, order, kind: 'found' as const, shipNo: r.shipNo };
        }
        return { id: t.id, order, kind: 'pending' as const, message: r.message };
      } catch (err) {
        return { id: t.id, order, kind: 'error' as const, error: String(err) };
      }
    }),
  );
}

async function main() {
  console.log(`account_id=${ACCOUNT_ID}  customer_code=${CUSTOMER_CODE}  refresh=${REFRESH}`);
  const tickets = await loadTickets();
  console.log(`Loaded ${tickets.length} ticket(s) with order_number${REFRESH ? '' : ' and no tracking_number'}.`);

  if (tickets.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let found = 0;
  let pending = 0;
  let error = 0;
  let skipped = 0;
  const errors: Array<{ id: string; order?: string; reason?: string }> = [];

  for (let i = 0; i < tickets.length; i += CONCURRENCY) {
    const batch = tickets.slice(i, i + CONCURRENCY);
    const results = await processBatch(batch);
    for (const r of results) {
      if (r.kind === 'found') {
        found++;
        process.stdout.write(`✓`);
      } else if (r.kind === 'pending') {
        pending++;
        process.stdout.write(`·`);
      } else if (r.kind === 'error') {
        error++;
        errors.push({ id: r.id, order: r.order, reason: r.error });
        process.stdout.write(`✗`);
      } else {
        skipped++;
        process.stdout.write(`-`);
      }
    }
  }

  console.log('\n');
  console.log(`╭───────────────────── Summary ──────────────────────╮`);
  console.log(`│ ✓ found    : ${String(found).padStart(4)}  (tracking_number persisted) │`);
  console.log(`│ · pending  : ${String(pending).padStart(4)}  (order not in Focus yet)   │`);
  console.log(`│ ✗ error    : ${String(error).padStart(4)}                              │`);
  console.log(`│ - skipped  : ${String(skipped).padStart(4)}  (no digits in order#)      │`);
  console.log(`│ total      : ${String(tickets.length).padStart(4)}                              │`);
  console.log(`╰────────────────────────────────────────────────────╯`);

  if (errors.length > 0) {
    console.log('\nFirst 5 errors:');
    for (const e of errors.slice(0, 5)) {
      console.log(`  ${e.id} order=${e.order} → ${e.reason}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
