/**
 * PATCH  /api/agent/clients/[id] — edit a managed client's name/phone/email
 *                                  (phone/email are inbound-matching keys).
 * DELETE /api/agent/clients/[id] — unlink (and delete CRM-only client if unused).
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;
  const { id } = await params;

  if (!(agent.managedAccountIds || []).includes(id)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { data: acct } = await supabaseAdmin.from('accounts').select('config').eq('id', id).maybeSingle();
  if (!acct) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const config: any = { ...(acct.config || {}) };
  if (typeof body?.display_name === 'string' && body.display_name.trim()) config.display_name = body.display_name.trim();
  if (typeof body?.phone === 'string') config.phone = body.phone.trim() ? toWaId(body.phone.trim()) : undefined;
  if (typeof body?.email === 'string') config.email = body.email.trim() || undefined;

  const { error } = await supabaseAdmin.from('accounts').update({ config, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;
  const { id } = await params;

  if (!(agent.managedAccountIds || []).includes(id)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Unlink from the agent.
  const next = (agent.managedAccountIds || []).filter((x) => x !== id);
  await supabaseAdmin.from('users').update({ managed_account_ids: next }).eq('id', agent.id);

  // Delete the account only if it's a CRM-only client with no deals.
  const { data: acct } = await supabaseAdmin.from('accounts').select('config').eq('id', id).maybeSingle();
  const { count } = await supabaseAdmin
    .from('partnerships')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', id);
  if ((acct?.config as any)?.crmOnly === true && !count) {
    await supabaseAdmin.from('accounts').delete().eq('id', id);
  }
  return NextResponse.json({ success: true });
}
