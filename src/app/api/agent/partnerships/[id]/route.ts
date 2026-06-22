/**
 * GET  /api/agent/partnerships/[id]  — deal detail (partnership + beats + invoice + signature)
 * POST /api/agent/partnerships/[id]  — actions: add_beat | toggle_beat | request_invoice |
 *                                      mark_paid | set_payment_route
 */
import { NextResponse } from 'next/server';
import { requireAgentApi, type AgentSession } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { requestInvoice, markInvoicePaid } from '@/lib/crm/invoices';
import { notifyAgent } from '@/lib/crm/notify';

async function loadOwned(id: string, agent: AgentSession) {
  const { data } = await supabaseAdmin
    .from('partnerships')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!data) return { error: 'not found' as const };
  if (data.agent_id !== agent.id) return { error: 'forbidden' as const };
  return { partnership: data };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const res = await loadOwned(id, gate.agent);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.error === 'forbidden' ? 403 : 404 });

  const [{ data: beats }, { data: invoice }, { data: signature }, { data: acct }] = await Promise.all([
    supabaseAdmin.from('tasks').select('id, title, status, due_date, completed_at, type').eq('partnership_id', id).order('due_date', { ascending: true }),
    supabaseAdmin.from('invoices').select('*').eq('partnership_id', id).neq('status', 'cancelled').maybeSingle(),
    supabaseAdmin.from('signature_requests').select('token, status, signed_at').eq('partnership_id', id).maybeSingle(),
    supabaseAdmin.from('accounts').select('config').eq('id', res.partnership.account_id).maybeSingle(),
  ]);

  return NextResponse.json({
    partnership: res.partnership,
    client_name: (acct?.config as any)?.display_name || (acct?.config as any)?.username || null,
    beats: beats || [],
    invoice: invoice || null,
    signature: signature || null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;
  const { id } = await params;
  const res = await loadOwned(id, agent);
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.error === 'forbidden' ? 403 : 404 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  try {
    switch (action) {
      case 'add_beat': {
        const title = String(body?.title ?? '').trim();
        if (!title) return NextResponse.json({ error: 'שם הפעימה נדרש' }, { status: 400 });
        const { error } = await supabaseAdmin.from('tasks').insert({
          account_id: res.partnership.account_id,
          partnership_id: id,
          title,
          type: 'content_creation',
          status: 'pending',
          priority: 'medium',
          due_date: body?.due_date || null,
        });
        if (error) throw new Error(error.message);
        return NextResponse.json({ success: true });
      }
      case 'toggle_beat': {
        const taskId = String(body?.task_id ?? '');
        const done = !!body?.done;
        const { error } = await supabaseAdmin
          .from('tasks')
          .update({ status: done ? 'completed' : 'pending', completed_at: done ? new Date().toISOString() : null })
          .eq('id', taskId)
          .eq('partnership_id', id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ success: true });
      }
      case 'request_invoice': {
        const r = await requestInvoice({
          partnershipId: id,
          agentId: agent.id,
          paymentRoute: body?.payment_route === 'direct_from_brand' ? 'direct_from_brand' : 'via_agency',
          paymentTermsDays: Number(body?.payment_terms_days) || 30,
        });
        // Notify the agent immediately with the upload link.
        notifyAgent(agent.id, {
          subject: `📄 בקשת חשבונית — ${res.partnership.brand_name}`,
          text: `סומן "בוצע". נא להעלות חשבונית: ${r.uploadUrl}`,
        }).catch(() => {});
        return NextResponse.json({ success: true, ...r });
      }
      case 'mark_paid': {
        const invId = String(body?.invoice_id ?? '');
        const r = await markInvoicePaid(invId, agent.id);
        if (!r.ok) return NextResponse.json({ error: 'לא ניתן לסמן כשולם' }, { status: 400 });
        return NextResponse.json({ success: true });
      }
      case 'set_payment_route': {
        const invId = String(body?.invoice_id ?? '');
        const route = body?.payment_route === 'direct_from_brand' ? 'direct_from_brand' : 'via_agency';
        const { error } = await supabaseAdmin.from('invoices').update({ payment_route: route }).eq('id', invId).eq('agent_id', agent.id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
