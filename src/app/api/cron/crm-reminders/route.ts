/**
 * Agency-CRM reminders (every 48h, capped):
 *   1. Invoice-upload chase — invoices 'draft' (requested, not uploaded).
 *   2. Payment chase — invoices 'sent'/'overdue' past due_date, unpaid.
 * Reminders go to the AGENT (email + WhatsApp). The 48h cadence is enforced by
 * last_reminder_at, so the cron itself can run more frequently.
 *
 * Auth: CRON_SECRET bearer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { notifyAgent } from '@/lib/crm/notify';
import { invoiceUploadUrl } from '@/lib/crm/invoices';
import { appBaseUrl } from '@/lib/crm/quotes';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CAP = 12;

function verifyCronSecret(req: NextRequest): boolean {
  const h = req.headers.get('authorization');
  return !!h && h === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = Date.now();
  const cutoff48 = new Date(now - 48 * 3600 * 1000).toISOString();
  const today = new Date(now).toISOString().slice(0, 10);
  let uploadChased = 0;
  let paymentChased = 0;
  let markedOverdue = 0;

  // 0) Transition uploaded-but-unpaid past due → overdue.
  const { data: toOverdue } = await supabaseAdmin
    .from('invoices')
    .select('id')
    .eq('status', 'sent')
    .is('paid_at', null)
    .lt('due_date', today);
  for (const inv of toOverdue || []) {
    await supabaseAdmin.from('invoices').update({ status: 'overdue' }).eq('id', inv.id);
    markedOverdue++;
  }

  // 1) Invoice-upload chase (draft = requested, awaiting upload).
  const { data: awaiting } = await supabaseAdmin
    .from('invoices')
    .select('id, agent_id, upload_token, reminder_count, last_reminder_at, partnerships(brand_name)')
    .eq('status', 'draft')
    .not('requested_at', 'is', null)
    .lt('reminder_count', CAP);
  for (const inv of awaiting || []) {
    if (!inv.agent_id) continue;
    if (inv.last_reminder_at && inv.last_reminder_at > cutoff48) continue;
    const brand = (inv as any).partnerships?.brand_name || 'הפעילות';
    await notifyAgent(inv.agent_id, {
      subject: `📄 תזכורת: העלאת חשבונית — ${brand}`,
      text: `נדרשת חשבונית עבור ${brand}. קישור להעלאה: ${inv.upload_token ? invoiceUploadUrl(inv.upload_token) : appBaseUrl() + '/agent'}\n(תזכורת ${(inv.reminder_count || 0) + 1})`,
    });
    await supabaseAdmin
      .from('invoices')
      .update({ last_reminder_at: new Date().toISOString(), reminder_count: (inv.reminder_count || 0) + 1 })
      .eq('id', inv.id);
    uploadChased++;
  }

  // 2) Payment chase (uploaded + past/at due, unpaid).
  const { data: unpaid } = await supabaseAdmin
    .from('invoices')
    .select('id, agent_id, reminder_count, last_reminder_at, due_date, total_amount, currency, payment_route, partnerships(brand_name)')
    .in('status', ['sent', 'overdue'])
    .is('paid_at', null)
    .lte('due_date', today)
    .lt('reminder_count', CAP);
  for (const inv of unpaid || []) {
    if (!inv.agent_id) continue;
    if (inv.last_reminder_at && inv.last_reminder_at > cutoff48) continue;
    const brand = (inv as any).partnerships?.brand_name || 'הפעילות';
    const route = inv.payment_route === 'direct_from_brand' ? 'מהמותג ישירות' : 'דרך הסוכנות';
    await notifyAgent(inv.agent_id, {
      subject: `💰 תזכורת תשלום — ${brand}`,
      text: `התשלום עבור ${brand} (${Number(inv.total_amount || 0).toLocaleString('en-US')} ${inv.currency || 'ILS'}, ${route}) חלף את מועד הפירעון (${inv.due_date}).\nכשהתקבל — סמן/י כשולם ב-Bestie. (תזכורת ${(inv.reminder_count || 0) + 1})`,
    });
    await supabaseAdmin
      .from('invoices')
      .update({ last_reminder_at: new Date().toISOString(), reminder_count: (inv.reminder_count || 0) + 1 })
      .eq('id', inv.id);
    paymentChased++;
  }

  return NextResponse.json({ ok: true, markedOverdue, uploadChased, paymentChased });
}
