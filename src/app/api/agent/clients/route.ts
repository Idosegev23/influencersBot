/**
 * Agent CRM clients.
 *   GET  /api/agent/clients   → the agent's managed accounts (Bestie + CRM-only)
 *   POST /api/agent/clients   → create a CRM-only client (no chatbot) + attach to agent
 *
 * A CRM-only client is a real `accounts` row (the universal Bestie entity) marked
 * config.crmOnly=true so it gets no scan / persona / widget / chat — "another hat".
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';

export async function GET() {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const ids = agent.managedAccountIds || [];
  if (ids.length === 0) return NextResponse.json({ clients: [] });

  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('id, type, status, config, created_at')
    .in('id', ids)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clients = (data || []).map((a: any) => ({
    id: a.id,
    display_name: a.config?.display_name || a.config?.username || 'ללא שם',
    username: a.config?.username || null,
    phone: a.config?.phone || null,
    email: a.config?.email || null,
    crmOnly: a.config?.crmOnly === true,
    status: a.status,
    created_at: a.created_at,
  }));
  return NextResponse.json({ clients });
}

export async function POST(request: Request) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;

  const body = await request.json().catch(() => null);
  const displayName = String(body?.display_name ?? '').trim();
  const phoneRaw = String(body?.phone ?? '').trim();
  const email = String(body?.email ?? '').trim();
  if (!displayName) {
    return NextResponse.json({ error: 'שם הלקוח נדרש' }, { status: 400 });
  }
  const phone = phoneRaw ? toWaId(phoneRaw) : null;

  // CRM-only account — no scan/persona/widget/chat.
  const { data: account, error: accErr } = await supabaseAdmin
    .from('accounts')
    .insert({
      type: 'creator',
      status: 'active',
      config: {
        crmOnly: true,
        display_name: displayName,
        phone: phone || undefined,
        email: email || undefined,
        created_via: 'agent_crm',
      },
    })
    .select('id')
    .single();
  if (accErr || !account) {
    return NextResponse.json({ error: accErr?.message || 'יצירת לקוח נכשלה' }, { status: 500 });
  }

  // Attach to the agent's managed accounts.
  const next = Array.from(new Set([...(agent.managedAccountIds || []), account.id]));
  const { error: updErr } = await supabaseAdmin
    .from('users')
    .update({ managed_account_ids: next })
    .eq('id', agent.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ success: true, client: { id: account.id, display_name: displayName } });
}
