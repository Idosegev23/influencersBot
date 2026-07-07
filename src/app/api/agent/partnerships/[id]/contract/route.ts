/**
 * GET  /api/agent/partnerships/[id]/contract — the deal's contract + signature status
 * POST /api/agent/partnerships/[id]/contract — { action: 'create' | 'save' | 'send', ... }
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { getContract, createContractDraft, saveContractBody, sendContract } from '@/lib/crm/contracts';

async function ownsDeal(id: string, agentId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('partnerships').select('id, agent_id').eq('id', id).maybeSingle();
  return !!data && data.agent_id === agentId;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  if (!(await ownsDeal(id, gate.agent.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const contract = await getContract(id);
  let signature = null;
  if (contract?.signature_request_id) {
    const { data: s } = await supabaseAdmin
      .from('signature_requests')
      .select('token, status, signed_at')
      .eq('id', contract.signature_request_id)
      .maybeSingle();
    signature = s;
  }
  return NextResponse.json({ contract, signature });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;
  const { agent } = gate;
  const { id } = await params;
  if (!(await ownsDeal(id, agent.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({} as any));
  try {
    switch (body?.action) {
      case 'create': {
        const contract = await createContractDraft(id, agent.id);
        return NextResponse.json({ success: true, contract });
      }
      case 'save': {
        await saveContractBody(String(body?.contract_id ?? ''), agent.id, String(body?.body ?? ''));
        return NextResponse.json({ success: true });
      }
      case 'send': {
        const r = await sendContract(String(body?.contract_id ?? ''), agent.id);
        return NextResponse.json({ success: true, ...r });
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
