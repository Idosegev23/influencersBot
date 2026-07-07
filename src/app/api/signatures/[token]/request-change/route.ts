/**
 * Public: the client returns a quote for edits instead of signing (haggle /
 * drop a deliverable). Marks the signature returned-for-edit, reopens the brief
 * for the agent to re-price, and notifies the agent. Body: { notes }.
 */
import { NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { getSignatureByToken } from '@/lib/crm/quotes';
import { notifyAgent } from '@/lib/crm/notify';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sig = await getSignatureByToken(token);
  if (!sig) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (sig.status === 'signed') return NextResponse.json({ error: 'המסמך כבר נחתם' }, { status: 409 });
  if (sig.status === 'cancelled') return NextResponse.json({ error: 'בקשת החתימה בוטלה' }, { status: 409 });

  const body = await req.json().catch(() => ({} as any));
  const notes = String(body?.notes ?? '').trim();
  if (!notes) return NextResponse.json({ error: 'יש לפרט מה לשנות' }, { status: 400 });

  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from('signature_requests')
    .update({ returned_for_edit: true, edit_notes: notes, updated_at: nowIso })
    .eq('id', sig.id);

  // Reopen the brief so the agent re-prices + resends.
  if (sig.partnership_id) {
    await supabaseAdmin
      .from('crm_inbound_messages')
      .update({ brief_status: 'assigned' })
      .eq('deal_id', sig.partnership_id);
  }

  notifyAgent(sig.agent_id, {
    subject: `✏️ בקשת שינוי בהצעה — ${sig.title || 'הצעה'}`,
    text: `הלקוח ביקש שינוי בהצעה "${sig.title || ''}":\n"${notes}"\n\nהיכנס/י ל-Bestie לעדכן את התמחור ולשלוח מחדש.`,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
