/**
 * Set up a Co-Pilot partner and link an association to it.
 *
 *   npx tsx scripts/copilot-setup-tenant.ts --partner multiview --partner-name "Multiview" \
 *     --partner-host copilot.example.com \
 *     --account e7302108-b12f-4e3e-b8d4-a1f75cfbef41 --host aba.copilot.example.com --industry motorcoach \
 *     --new-key "white-label app" --new-identify-secret --stub-ams
 */
import { config as loadEnv } from 'dotenv';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { generatePartnerKey, normalizeHost } from '../src/lib/copilot/keys';

loadEnv({ path: '.env.local' });

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? (args[i + 1]?.startsWith('--') ? '' : args[i + 1] ?? '') : null; };

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, { auth: { persistSession: false } });

async function main() {
  const slug = flag('partner');
  const name = flag('partner-name');
  if (!slug || !name) throw new Error('--partner and --partner-name are required');

  const { data: partner, error: pErr } = await sb.from('partners').upsert({ slug, name }, { onConflict: 'slug' }).select('id').single();
  if (pErr || !partner) throw new Error(`partner: ${pErr?.message}`);
  console.log('partner', slug, partner.id);

  const partnerHost = normalizeHost(flag('partner-host'));
  if (partnerHost) {
    await sb.from('tenant_domains').upsert({ host: partnerHost, partner_id: partner.id, account_id: null, kind: 'subdomain' });
    console.log('partner host', partnerHost);
  }

  const accountId = flag('account');
  if (accountId) {
    const host = normalizeHost(flag('host'));
    if (!host) throw new Error('--host is required with --account');
    const { data: acc } = await sb.from('accounts').select('id, config, partner_id').eq('id', accountId).single();
    if (!acc) throw new Error('account not found');
    if (acc.partner_id && acc.partner_id !== partner.id) throw new Error('account belongs to another partner');

    const config = { ...(acc.config ?? {}) } as Record<string, any>;
    const copilot = { ...(config.copilot ?? {}) };
    const industry = flag('industry');
    if (industry) copilot.industry = industry;
    if (flag('stub-ams') !== null && !copilot.ams) copilot.ams = { provider: 'stub', stub_members: [] };

    let newSecret: string | null = null;
    if (flag('new-identify-secret') !== null) {
      newSecret = crypto.randomBytes(32).toString('hex');
      const { data: ref, error } = await sb.rpc('copilot_store_secret', { p_secret: newSecret });
      if (error) throw new Error(`secret: ${error.message}`);
      copilot.identify_secret_ref = ref;
    }
    config.copilot = copilot;
    const { error: uErr } = await sb.from('accounts').update({ partner_id: partner.id, config }).eq('id', accountId);
    if (uErr) throw new Error(`account: ${uErr.message}`);
    await sb.from('tenant_domains').upsert({ host, partner_id: partner.id, account_id: accountId, kind: 'subdomain' });
    console.log('association', accountId, 'on', host);
    if (newSecret) console.log('\nIDENTIFY SECRET (shown once, give to the association developer):\n' + newSecret + '\n');
  }

  const label = flag('new-key');
  if (label !== null) {
    const { plaintext, hash } = generatePartnerKey();
    const { error } = await sb.from('partner_api_keys').insert({ partner_id: partner.id, key_hash: hash, label: label || 'default' });
    if (error) throw new Error(`key: ${error.message}`);
    console.log('\nPARTNER API KEY (shown once, store in the white-label app env):\n' + plaintext + '\n');
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
