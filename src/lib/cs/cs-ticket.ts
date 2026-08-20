import { supabase } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';
import { realPhoneOrNull } from '@/lib/support/contact';

const TERMINAL = new Set(['resolved', 'closed', 'cancelled']);

/**
 * Every bound CS conversation opens (or re-attaches to) a support_request thread.
 * Discriminator is `source='whatsapp_cs'` (support_requests has no channel/topic column).
 */
export async function openOrAttachCsTicket(input: {
  accountId: string;
  waId: string;                    // channel_user_id — a real phone ONLY on WhatsApp
  customerPhone: string | null;    // the dialable phone when known; null on an anonymous web shopper
  customerName: string | null;
  topic?: string;
  source?: string; // channel ticket source (spec §8): whatsapp_cs (default) | widget_cs | web_cs | instagram_cs
}): Promise<{ ticketId: string }> {
  const source = input.source || 'whatsapp_cs';
  // Store only what can be dialled. On the widget / chat page `waId` is a synthetic visitor id
  // (`aw_…`), and writing it here is what made the inbox offer a WhatsApp send that Meta rejected
  // with (#131009) — see @/lib/support/contact.
  const phone = realPhoneOrNull(input.customerPhone);
  const wa = phone ? toWaId(phone) : null;

  const { data: rows } = await supabase
    .from('support_requests')
    .select('id, status, customer_phone, metadata')
    .eq('account_id', input.accountId)
    .eq('source', source)
    .order('updated_at', { ascending: false })
    .limit(20);

  // Re-attach by phone when there is one, else by the channel user id — an anonymous web shopper
  // must still land back on their own open thread instead of spawning one per turn.
  const match = (rows || []).find((t: any) => {
    if (TERMINAL.has(t.status)) return false;
    if (wa) return t.customer_phone && toWaId(t.customer_phone) === wa;
    return (t.metadata as any)?.channel_user_id === input.waId;
  });
  if (match) return { ticketId: match.id };

  const { data: inserted, error } = await supabase
    .from('support_requests')
    .insert({
      account_id: input.accountId,
      customer_name: input.customerName || 'לקוח/ה',      // NOT NULL
      customer_phone: phone,
      message: input.topic || 'פנייה בוואטסאפ',            // NOT NULL
      status: 'new',
      source,
      metadata: { channel: source, topic: input.topic || null, channel_user_id: input.waId },
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
