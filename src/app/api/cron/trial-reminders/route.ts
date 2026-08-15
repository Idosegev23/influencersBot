/**
 * Trial-period reminders (daily).
 *
 * Accounts on a free trial carry a `config.trial` object:
 *   { free, starts_at, ends_at, reminder_due, contact_name, contact_phone,
 *     brand_name?, reminder_sent_at? }
 *
 * On/after `reminder_due` (and until `ends_at`), send the account contact a
 * WhatsApp heads-up that the trial is about to end, then stamp
 * `reminder_sent_at` so it fires exactly once. Uses the approved
 * `support_freeform_message` UTILITY template ({{1}} name, {{2}} team,
 * {{3}} free text) via sendTemplate directly — this is an ops notice, not a
 * support flow, so the per-template notify flags don't apply.
 *
 * Auth: CRON_SECRET bearer. `?dryRun=1` reports matches without sending.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { sendTemplate } from '@/lib/whatsapp-cloud/client';
import { getBestieChannel } from '@/lib/whatsapp-cloud/channels';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function verifyCronSecret(req: NextRequest): boolean {
  const h = req.headers.get('authorization');
  return !!h && h === `Bearer ${process.env.CRON_SECRET}`;
}

// Meta rejects body params with newlines/tabs/4+ spaces (error 132018).
function sanitizeParam(s: string): string {
  return String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, ' ').trim();
}

function formatIlDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';

  const today = new Date().toISOString().slice(0, 10);
  const { data: accounts, error } = await supabaseAdmin
    .from('accounts')
    .select('id, config')
    .not('config->trial', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: any[] = [];
  for (const account of accounts || []) {
    const trial = (account.config as any)?.trial;
    if (!trial?.reminder_due || !trial?.contact_phone) continue;
    if (trial.reminder_sent_at) continue;            // already sent
    if (trial.reminder_due > today) continue;        // not due yet
    if (trial.ends_at && trial.ends_at < today) continue; // trial already over — pointless

    const brand = trial.brand_name || 'החשבון שלך';
    const endDate = trial.ends_at ? formatIlDate(trial.ends_at) : 'בקרוב';
    const body = `רצינו להזכיר שתקופת הנסיון החינמית של ${brand} במערכת Bestie מסתיימת ב-${endDate}, בעוד כשבוע. נשמח לשוחח על המשך הפעילות — אפשר פשוט להשיב להודעה הזו.`;

    if (dryRun) {
      results.push({ accountId: account.id, to: trial.contact_phone, due: trial.reminder_due, body, dryRun: true });
      continue;
    }

    const res = await sendTemplate({ channel: await getBestieChannel(),
      to: trial.contact_phone,
      templateName: 'support_freeform_message',
      languageCode: 'he',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: sanitizeParam(trial.contact_name || 'שלום') },
            { type: 'text', text: sanitizeParam('Bestie') },
            { type: 'text', text: sanitizeParam(body) },
          ],
        },
      ],
    });

    if (res.success) {
      await supabaseAdmin
        .from('accounts')
        .update({
          config: { ...(account.config as any), trial: { ...trial, reminder_sent_at: new Date().toISOString() } },
          updated_at: new Date().toISOString(),
        })
        .eq('id', account.id);
    }
    results.push({ accountId: account.id, to: trial.contact_phone, sent: res.success, error: res.success ? undefined : res.error });
  }

  return NextResponse.json({ checked: (accounts || []).length, matched: results.length, results });
}
