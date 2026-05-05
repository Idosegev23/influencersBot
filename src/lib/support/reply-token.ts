/**
 * Reply-token helper for customer-facing reply links.
 *
 * Each ticket has a unique unguessable token (32 random chars). The token
 * is generated lazily — the first time we send a customer-facing
 * WhatsApp template, we mint one and persist it on the ticket. The
 * customer hits /reply/<token> to add a reply that is stored as a
 * support_ticket_history row visible to the brand under the ticket.
 *
 * The token is shorter than a UUID and URL-safe, which matters because
 * WhatsApp template URL buttons have a tight character budget.
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';

const TOKEN_BYTES = 16; // 16 bytes → 22 base64url chars

function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Returns the reply token for the ticket, generating one if missing.
 * Idempotent — subsequent calls reuse the same token.
 */
export async function ensureReplyToken(ticketId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('support_requests')
    .select('reply_token')
    .eq('id', ticketId)
    .maybeSingle();

  if (existing?.reply_token) return existing.reply_token;

  // Mint + persist. If two concurrent calls race, the unique constraint
  // on reply_token still keeps things consistent — both rows can't get
  // the same one, and the loser will fall through to a re-read below.
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateToken();
    const { error } = await supabase
      .from('support_requests')
      .update({ reply_token: token })
      .eq('id', ticketId)
      .is('reply_token', null);
    if (!error) {
      // Re-read to handle the case where another request beat us to it.
      const { data: latest } = await supabase
        .from('support_requests')
        .select('reply_token')
        .eq('id', ticketId)
        .maybeSingle();
      if (latest?.reply_token) return latest.reply_token;
    }
  }
  return null;
}

/**
 * Validate token + return the ticket. Public-facing — never trust the
 * token to be present or well-formed.
 */
export async function findTicketByReplyToken(token: string) {
  if (!token || typeof token !== 'string') return null;
  // base64url charset only — anything else is bogus and we short-circuit
  // before even hitting the DB.
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;

  const { data } = await supabase
    .from('support_requests')
    .select(
      `id, account_id, customer_name, customer_phone, brand, order_number,
       message, status, created_at, last_customer_notified_at, tracking_number`,
    )
    .eq('reply_token', token)
    .maybeSingle();
  return data;
}

/**
 * Public reply URL for the customer. Used in WhatsApp template URL
 * button params — Meta replaces `{{1}}` in the registered URL with
 * whatever we pass.
 */
export function publicReplyUrl(token: string, baseUrl?: string): string {
  const root = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://bestie.ldrsgroup.com';
  return `${root.replace(/\/$/, '')}/reply/${encodeURIComponent(token)}`;
}
