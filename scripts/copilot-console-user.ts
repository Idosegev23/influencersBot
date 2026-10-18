/**
 * Create or update a Co-Pilot console user (idempotent upsert on partner + email).
 *
 *   npx tsx scripts/copilot-console-user.ts --partner multiview --email ido@example.com --name "Ido" --role owner --partner-staff
 *   npx tsx scripts/copilot-console-user.ts --partner multiview --email staff@aba.test --name "Sam" --role admin --account <uuid>
 *   npx tsx scripts/copilot-console-user.ts --partner multiview --email staff@aba.test --disable
 *
 * Create/update needs --role and exactly one scope: --partner-staff (every association of
 * the partner) or --account <uuid> (that association only), so a typo can never widen a
 * user to the whole partner. --disable changes only the status of an existing user.
 * Node 22. Loads .env.local before anything else.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? (args[i + 1]?.startsWith('--') ? '' : args[i + 1] ?? '') : null; };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env missing (.env.local)');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const slug = flag('partner');
  const email = flag('email')?.trim().toLowerCase();
  const disable = flag('disable') !== null;
  if (!slug || !email) throw new Error('--partner and --email are required');
  if (!EMAIL_RE.test(email)) throw new Error('invalid --email');

  const { data: partner, error: pErr } = await sb.from('partners').select('id').eq('slug', slug).maybeSingle();
  if (pErr) throw new Error(`partner: ${pErr.message}`);
  if (!partner) throw new Error(`partner ${slug} not found`);

  if (disable) {
    const { data, error } = await sb.from('console_users').update({ status: 'disabled' })
      .eq('partner_id', partner.id).eq('email', email).select('id');
    if (error) throw new Error(`console user: ${error.message}`);
    if (!data?.length) throw new Error('no such console user');
    console.log('console user disabled', data[0].id);
    return;
  }

  const role = flag('role');
  const accountId = flag('account') || null;
  const partnerStaff = flag('partner-staff') !== null;
  if (!role || !['owner', 'admin', 'viewer'].includes(role)) throw new Error('--role owner|admin|viewer is required');
  if (partnerStaff === !!accountId) throw new Error('give exactly one of --partner-staff or --account <uuid>');
  if (accountId && !UUID_RE.test(accountId)) throw new Error('--account must be a uuid');

  if (accountId) {
    const { data: acc, error } = await sb.from('accounts').select('id, partner_id').eq('id', accountId).maybeSingle();
    if (error) throw new Error(`account: ${error.message}`);
    if (!acc) throw new Error('account not found');
    if (acc.partner_id !== partner.id) throw new Error('account does not belong to this partner');
  }

  const name = flag('name');
  const row = { partner_id: partner.id, email, role, account_id: accountId, status: 'active', ...(name !== null ? { name } : {}) };
  const { data: user, error } = await sb.from('console_users').upsert(row, { onConflict: 'partner_id,email' })
    .select('id, email, role, account_id, status').single();
  if (error || !user) throw new Error(`console user: ${error?.message}`);
  console.log('console user', user.id, user.email, user.role, user.account_id ?? '(partner staff)', user.status);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
