/**
 * Per-ticket feedback token.
 *
 * One token per support_requests row. Generated when we send the
 * "delivered, how was it?" template — the URL embedded in the WhatsApp
 * button is `https://<host>/feedback/<token>`. Token grants read +
 * one-time write access to feedback (positive / issue).
 *
 * Mirrors the pattern of `src/lib/support/reply-token.ts`.
 */

import { randomBytes } from 'crypto';
import { supabase } from '@/lib/supabase';

const TOKEN_BYTES = 24; // → 32 chars base64url
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function generateFeedbackToken(): string {
  return randomBytes(TOKEN_BYTES)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function isValidFeedbackTokenShape(token: string | null | undefined): boolean {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

/** Set the feedback token on a ticket if not yet set, returns the active token. */
export async function ensureFeedbackToken(ticketId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('support_requests')
    .select('feedback_token')
    .eq('id', ticketId)
    .maybeSingle();
  if (existing?.feedback_token) return existing.feedback_token;

  const token = generateFeedbackToken();
  const { data, error } = await supabase
    .from('support_requests')
    .update({ feedback_token: token })
    .eq('id', ticketId)
    .is('feedback_token', null)
    .select('feedback_token')
    .maybeSingle();

  if (error) {
    console.warn('[feedback-token] update failed:', error.message);
    return null;
  }
  if (data?.feedback_token) return data.feedback_token;

  // Race with another writer — re-read.
  const { data: latest } = await supabase
    .from('support_requests')
    .select('feedback_token')
    .eq('id', ticketId)
    .maybeSingle();
  return latest?.feedback_token || null;
}

export type FeedbackTicketContext = {
  id: string;
  account_id: string;
  brand: string | null;
  order_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  feedback_status: string | null;
  feedback_responded_at: string | null;
};

export async function findTicketByFeedbackToken(
  token: string,
): Promise<FeedbackTicketContext | null> {
  if (!isValidFeedbackTokenShape(token)) return null;
  const { data } = await supabase
    .from('support_requests')
    .select(
      'id, account_id, brand, order_number, customer_name, customer_phone, feedback_status, feedback_responded_at',
    )
    .eq('feedback_token', token)
    .maybeSingle();
  return data || null;
}
