/**
 * Agent quotes.
 *   GET  /api/agent/quotes   → list the agent's quotes (signature requests)
 *   POST /api/agent/quotes   → create a quote (manual) → returns signing link
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { createQuote, listAgentQuotes } from '@/lib/crm/quotes';

export async function GET() {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const quotes = await listAgentQuotes(agent.id);

  // attach client display name
  const accountIds = Array.from(new Set(quotes.map((q) => q.account_id).filter(Boolean)));
  let nameById: Record<string, string> = {};
  if (accountIds.length) {
    const { data: accts } = await supabaseAdmin
      .from('accounts')
      .select('id, config')
      .in('id', accountIds as string[]);
    nameById = Object.fromEntries(
      (accts || []).map((a: any) => [a.id, a.config?.display_name || a.config?.username || ''])
    );
  }

  return NextResponse.json({
    quotes: quotes.map((q) => ({ ...q, client_name: q.account_id ? nameById[q.account_id] || null : null })),
  });
}

export async function POST(request: Request) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const body = await request.json().catch(() => null);
  const accountId = String(body?.account_id ?? '');
  const brandName = String(body?.brand_name ?? '').trim();

  if (!accountId || !(agent.managedAccountIds || []).includes(accountId)) {
    return NextResponse.json({ error: 'בחר/י לקוח מתוך הלקוחות שלך' }, { status: 400 });
  }
  if (!brandName) {
    return NextResponse.json({ error: 'שם המותג נדרש' }, { status: 400 });
  }

  // client display name (for the PDF)
  const { data: acct } = await supabaseAdmin
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .maybeSingle();
  const clientName = (acct?.config as any)?.display_name || (acct?.config as any)?.username || null;

  const deliverables = Array.isArray(body?.deliverables)
    ? body.deliverables
    : String(body?.deliverables ?? '')
        .split('\n')
        .map((s: string) => s.trim())
        .filter(Boolean);

  const amount = body?.amount != null && body.amount !== '' ? Number(body.amount) : null;

  try {
    const result = await createQuote({
      agentId: agent.id,
      accountId,
      brandName,
      clientName,
      campaignName: body?.campaign_name || null,
      amount: Number.isFinite(amount) ? amount : null,
      currency: body?.currency || 'ILS',
      validUntil: body?.valid_until || null,
      deliverables,
      terms: body?.terms || null,
      notes: body?.notes || null,
      brandContactName: body?.brand_contact_name || null,
      brandContactEmail: body?.brand_contact_email || null,
      brandContactPhone: body?.brand_contact_phone || null,
      agentName: agent.fullName,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'יצירת ההצעה נכשלה' }, { status: 500 });
  }
}
