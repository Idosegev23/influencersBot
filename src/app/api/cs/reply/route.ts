import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { sendText } from '@/lib/whatsapp-cloud/client';
import { loadCsSession } from '@/lib/cs/cs-session';
import { pauseBot } from '@/lib/handoff/bot-pause';
import { appendCsTicketHistory } from '@/lib/cs/cs-ticket';

export const runtime = 'nodejs';

const MAX_BODY = 4000; // WhatsApp text body cap is 4096

/** Bestie-inbox human reply: out the shared Bestie number, auto-pauses the bot for this thread. */
export async function POST(req: NextRequest) {
  if ((await requireAdminAuth()) !== null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const waId = (body?.waId || '').toString().trim();
  const messageBody = (body?.body || '').toString().trim();
  if (!waId || !messageBody) {
    return NextResponse.json({ error: 'bad_request', message: 'waId ו-body נדרשים' }, { status: 400 });
  }
  if (messageBody.length > MAX_BODY) {
    return NextResponse.json({ error: 'too_long', limit: MAX_BODY }, { status: 400 });
  }

  // Resolve the owning CS thread server-side from waId — never trust an account/session id from the body.
  const cs = await loadCsSession(waId);
  if (!cs || !cs.active_account_id) {
    return NextResponse.json({ error: 'no_active_thread' }, { status: 404 });
  }

  // customer-initiated CS conversations → free-form text is valid inside the 24h window.
  const result = await sendText({ to: waId, body: messageBody });

  // a human message takes over — pause the bot until manual resume.
  if (cs.active_chat_session_id) {
    await pauseBot(cs.active_chat_session_id, 'human_reply');
  }

  if (cs.active_ticket_id) {
    await appendCsTicketHistory({
      ticketId: cs.active_ticket_id,
      accountId: cs.active_account_id,
      action: 'agent_message',
      actor: 'bestie_inbox',
      body_text: messageBody,
      whatsapp_message_id: result.wa_message_id || null,
      note: result.success ? undefined : `Send failed: ${result.error?.message || 'unknown'}`,
    });
  }

  return NextResponse.json({
    ok: result.success,
    wa_message_id: result.wa_message_id || null,
    error: result.success ? null : result.error?.message || 'send_failed',
  });
}
