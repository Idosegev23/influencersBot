/**
 * 24-hour customer-service window check.
 *
 * Meta only allows free-form (non-template) outbound messages within 24
 * hours of the customer's last inbound. The window is tracked per phone
 * number on `whatsapp_conversations.service_window_expires_at`. If the
 * customer has never replied through WhatsApp, no conversation row
 * exists — we treat that as "window closed, send a template instead".
 */

import { supabase } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';

export type ServiceWindow = {
  withinWindow: boolean;
  expiresAt: string | null;
  lastInboundAt: string | null;
};

export async function getServiceWindow(
  accountId: string,
  customerPhone: string | null,
): Promise<ServiceWindow> {
  if (!customerPhone) {
    return { withinWindow: false, expiresAt: null, lastInboundAt: null };
  }

  const waId = toWaId(customerPhone);

  // contact ↔ account is 1:1; if the customer has chatted with this brand
  // through WhatsApp we'll find a row here. (Inbound webhook upserts it.)
  const { data: contact } = await supabase
    .from('whatsapp_contacts')
    .select('id')
    .eq('account_id', accountId)
    .eq('wa_id', waId)
    .maybeSingle();

  if (!contact) {
    return { withinWindow: false, expiresAt: null, lastInboundAt: null };
  }

  const { data: convo } = await supabase
    .from('whatsapp_conversations')
    .select('service_window_expires_at, last_inbound_at')
    .eq('contact_id', contact.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!convo) {
    return { withinWindow: false, expiresAt: null, lastInboundAt: null };
  }

  const exp = convo.service_window_expires_at as string | null;
  const last = convo.last_inbound_at as string | null;
  const within = !!exp && new Date(exp).getTime() > Date.now();

  return { withinWindow: within, expiresAt: exp, lastInboundAt: last };
}
