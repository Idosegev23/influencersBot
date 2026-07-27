/**
 * Files a support ticket straight from a public chat conversation.
 *
 * Companion to auto-ticket.ts (which only assesses). Runs inside the chat
 * route's after() hook, so it never blocks the response.
 *
 * Dedup: one auto-ticket per session. A customer describing the same problem
 * across five turns must not produce five rows in the brand's inbox.
 */

import { supabase } from '@/lib/supabase';
import { assessServiceTurn, type ServiceTurnAssessment } from './auto-ticket';
import { autoAssignNewTicket } from './auto-assign';

const AUTO_SOURCE = 'chat_auto';
const AUTO_SOURCE_URGENT = 'chat_auto_urgent';

/** All user turns of the session, oldest first, joined for assessment. */
async function loadUserTurns(sessionId: string): Promise<string> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('content, role, created_at')
    .eq('session_id', sessionId)
    .eq('role', 'user')
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[auto-ticket] could not load session turns:', error.message);
    return '';
  }
  return (data || []).map((m: any) => m.content).filter(Boolean).join('\n');
}

/** True when this session already produced a ticket (auto or human-driven). */
async function sessionHasTicket(sessionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('support_requests')
    .select('id')
    .eq('session_id', sessionId)
    .limit(1);
  if (error) {
    // Fail CLOSED: if we can't tell, don't file. A missed ticket is recoverable
    // from the transcript; a duplicate storm in the brand's inbox is not.
    console.warn('[auto-ticket] dedup check failed, skipping:', error.message);
    return true;
  }
  return (data || []).length > 0;
}

export interface AutoTicketResult {
  filed: boolean;
  ticketId?: string;
  reason?: 'disabled' | 'not_service' | 'no_handle' | 'already_ticketed' | 'insert_failed';
  assessment?: ServiceTurnAssessment;
}

/** Per-account opt-in. Auto-filing changes what lands in a brand's inbox, so it
 *  stays OFF until that brand asks for it — one tenant's fix must not silently
 *  start generating tickets for the other 66 accounts. */
async function isEnabledForAccount(accountId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();
  if (error || !data) return false;
  return (data as any).config?.support?.auto_ticket_enabled === true;
}

export async function maybeFileAutoTicket(args: {
  accountId: string;
  sessionId: string;
  latestUserMessage: string;
}): Promise<AutoTicketResult> {
  const { accountId, sessionId, latestUserMessage } = args;

  if (!(await isEnabledForAccount(accountId))) {
    return { filed: false, reason: 'disabled' };
  }

  // The turn being saved is written by the same after() block, so append it
  // rather than relying on it already being in chat_messages.
  const history = await loadUserTurns(sessionId);
  const conversation = history.includes(latestUserMessage)
    ? history
    : [history, latestUserMessage].filter(Boolean).join('\n');

  const assessment = assessServiceTurn(conversation);
  if (!assessment.isServiceIssue) return { filed: false, reason: 'not_service', assessment };
  if (!assessment.shouldFileTicket) return { filed: false, reason: 'no_handle', assessment };
  if (await sessionHasTicket(sessionId)) return { filed: false, reason: 'already_ticketed', assessment };

  const { contact, urgent } = assessment;
  const { data, error } = await supabase
    .from('support_requests')
    .insert({
      account_id: accountId,
      customer_name: '',                        // chat is anonymous; agent asks on callback
      customer_phone: contact.phone || null,
      customer_email: contact.email || null,
      order_number: contact.orderNumber || null,
      message: conversation.slice(0, 4000),     // the transcript IS the description
      session_id: sessionId,
      status: 'new',
      source: urgent ? AUTO_SOURCE_URGENT : AUTO_SOURCE,
      escalation_reason: assessment.suppressContactDeflection
        ? 'customer reports official support channels unanswered'
        : null,
      metadata: {
        auto_filed: true,
        urgent,
        exhausted_channels: assessment.suppressContactDeflection,
      },
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[auto-ticket] insert failed:', error?.message);
    return { filed: false, reason: 'insert_failed', assessment };
  }

  try {
    await autoAssignNewTicket(data.id, accountId);
  } catch (e) {
    console.warn('[auto-ticket] auto-assign failed:', (e as Error).message);
  }

  console.log('[auto-ticket] filed', { ticketId: data.id, sessionId, urgent });
  return { filed: true, ticketId: data.id, assessment };
}
