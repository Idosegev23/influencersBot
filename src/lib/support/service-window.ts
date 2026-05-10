/**
 * 24-hour customer-service window check.
 *
 * Meta only allows free-form (non-template) outbound messages within 24
 * hours of the customer's last inbound. The window lives at the WhatsApp
 * BUSINESS PHONE NUMBER level — not per account/brand: once a customer
 * has replied to any message we sent from our number, ANY agent on that
 * number can send free-form text for the next 24h, regardless of which
 * brand the conversation started with.
 *
 * The accountId arg is accepted for backward compat but no longer used
 * to filter; the truth source is `whatsapp_conversations` keyed on
 * (phone_number_id, contact_id).
 */

import { supabase } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';

export type ServiceWindow = {
  withinWindow: boolean;
  expiresAt: string | null;
  lastInboundAt: string | null;
};

export async function getServiceWindow(
  _accountId: string,
  customerPhone: string | null,
): Promise<ServiceWindow> {
  if (!customerPhone) {
    return { withinWindow: false, expiresAt: null, lastInboundAt: null };
  }

  const waId = toWaId(customerPhone);

  const { data: contact } = await supabase
    .from('whatsapp_contacts')
    .select('id')
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
