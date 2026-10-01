/**
 * Append-only interaction records: the structured data Multiview's reporting
 * and Intent Exchange read. Never let a write failure break the request.
 */
import { supabase } from '@/lib/supabase';

export const SERVER_EVENT_TYPES = [
  'session_started', 'question', 'topic_classified', 'resource_shown', 'related_item_shown',
  'event_suggested', 'membership_prompted', 'renewal_prompted', 'contact_requested',
  'contact_captured', 'identified', 'escalated', 'recap_sent', 'ams_unavailable',
] as const;
export const CLIENT_EVENT_TYPES = ['page_view', 'link_clicked'] as const;

export type InteractionEventType = (typeof SERVER_EVENT_TYPES)[number] | (typeof CLIENT_EVENT_TYPES)[number];

export interface InteractionEventInput {
  type: InteractionEventType;
  sessionId?: string | null;
  messageId?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

export async function recordEvents(
  ctx: { partnerId: string; accountId: string; visitorId: string; industry: string | null },
  events: InteractionEventInput[],
): Promise<void> {
  if (events.length === 0) return;
  const rows = events.map((e) => ({
    partner_id: ctx.partnerId,
    account_id: ctx.accountId,
    visitor_id: ctx.visitorId,
    session_id: e.sessionId ?? null,
    message_id: e.messageId ?? null,
    type: e.type,
    payload: e.payload ?? {},
    industry: ctx.industry,
    ...(e.occurredAt ? { occurred_at: e.occurredAt } : {}),
  }));
  try {
    const { error } = await supabase.from('interaction_events').insert(rows);
    if (error) console.error('[copilot/events] insert failed', ctx.accountId, error.message);
  } catch (e) {
    console.error('[copilot/events] insert threw', ctx.accountId, e);
  }
}
