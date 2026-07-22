import { supabase } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';

const TERMINAL = new Set(['resolved', 'closed', 'cancelled']);

/**
 * Every bound CS conversation opens (or re-attaches to) a support_request thread.
 * Discriminator is `source='whatsapp_cs'` (support_requests has no channel/topic column).
 */
export async function openOrAttachCsTicket(input: {
  accountId: string;
  waId: string;
  customerPhone: string;
  customerName: string | null;
  topic?: string;
}): Promise<{ ticketId: string }> {
  const wa = toWaId(input.customerPhone || input.waId);

  const { data: rows } = await supabase
    .from('support_requests')
    .select('id, status, customer_phone')
    .eq('account_id', input.accountId)
    .eq('source', 'whatsapp_cs')
    .order('updated_at', { ascending: false })
    .limit(20);

  const match = (rows || []).find(
    (t: any) => t.customer_phone && toWaId(t.customer_phone) === wa && !TERMINAL.has(t.status),
  );
  if (match) return { ticketId: match.id };

  const { data: inserted, error } = await supabase
    .from('support_requests')
    .insert({
      account_id: input.accountId,
      customer_name: input.customerName || 'לקוח/ה',      // NOT NULL
      customer_phone: input.customerPhone,
      message: input.topic || 'פנייה בוואטסאפ',            // NOT NULL
      status: 'new',
      source: 'whatsapp_cs',
      metadata: { channel: 'whatsapp_cs', topic: input.topic || null },
    })
    .select('id')
    .single();

  if (error || !inserted) {
    throw new Error(`openOrAttachCsTicket failed: ${error?.message || 'no row returned'}`);
  }
  return { ticketId: inserted.id };
}

export async function appendCsTicketHistory(input: {
  ticketId: string;
  accountId: string;
  action: string;
  actor: string;
  note?: string;
  body_text?: string;
  whatsapp_message_id?: string | null;
}): Promise<void> {
  await supabase.from('support_ticket_history').insert({
    ticket_id: input.ticketId,
    account_id: input.accountId,
    action: input.action,
    actor: input.actor,
    note: input.note ?? null,
    body_text: input.body_text ?? null,
    whatsapp_message_id: input.whatsapp_message_id ?? null,
  });
}
