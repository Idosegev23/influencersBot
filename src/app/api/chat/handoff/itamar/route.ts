/**
 * POST /api/chat/handoff/itamar
 *
 * Triggered when a Bestie visitor clicks "✉️ שלח לאיתמר אישית". Forwards
 * the question to Itamar's WhatsApp via the bestie_handoff_lead template
 * and writes a system message into the chat letting the visitor know it
 * was sent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { forwardToItamar } from '@/lib/handoff/forward-to-itamar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Personal handoff is restricted to conference visitors on the LDRS account.
// Both gates are required:
//   1. session.account_id === LDRS_ACCOUNT_ID
//   2. body.source === 'conf'
const LDRS_ACCOUNT_ID = 'de38eac6-d2fb-46a7-ac09-5ec860147ca0';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId: string | undefined = body.sessionId;
    const question: string | undefined = body.question;
    const visitorName: string | undefined = body.visitorName;
    const visitorPhone: string | undefined = body.visitorPhone;
    const visitorMeta: string | undefined = body.visitorMeta;
    const source: string | undefined = body.source;

    if (!question) {
      return NextResponse.json({ error: 'question required' }, { status: 400 });
    }
    if (question.length > 2000) {
      return NextResponse.json({ error: 'question too long' }, { status: 400 });
    }
    if (source !== 'conf') {
      return NextResponse.json(
        { error: 'Personal handoff is enabled only for conference visitors.' },
        { status: 403 },
      );
    }

    const supabase = getSupabase();

    // Resolve or create the chat session. Conference visitors who tap
    // "send to Itamar" before chatting with the bot don't yet have a
    // sessionId — we mint one for them so the reply has a target.
    let resolvedSessionId: string | null = null;
    if (sessionId) {
      const { data: existing } = await supabase
        .from('chat_sessions')
        .select('id, account_id')
        .eq('id', sessionId)
        .maybeSingle();
      if (existing) {
        if (existing.account_id !== LDRS_ACCOUNT_ID) {
          return NextResponse.json(
            { error: 'Personal handoff is not enabled for this account.' },
            { status: 403 },
          );
        }
        resolvedSessionId = existing.id;
      }
    }
    if (!resolvedSessionId) {
      const threadId = `handoff_conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { data: created, error: createErr } = await supabase
        .from('chat_sessions')
        .insert({ thread_id: threadId, account_id: LDRS_ACCOUNT_ID })
        .select('id')
        .single();
      if (createErr || !created) {
        console.error('[/api/chat/handoff/itamar] session create failed:', createErr);
        return NextResponse.json({ error: 'could not create session' }, { status: 500 });
      }
      resolvedSessionId = created.id;
    }
    const session = { id: resolvedSessionId, account_id: LDRS_ACCOUNT_ID };

    const labelParts = [
      visitorName,
      visitorPhone ? `📞 ${visitorPhone}` : null,
      visitorMeta,
    ].filter(Boolean) as string[];
    const visitorLabel = labelParts.length ? labelParts.join(' · ') : 'אורח/ת ב-Bestie';

    const result = await forwardToItamar({
      sessionId: resolvedSessionId,
      accountId: session.account_id,
      visitorLabel,
      visitorQuestion: question,
      visitorName,
      visitorPhone,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Forward failed', refCode: result.refCode },
        { status: 502 },
      );
    }

    // Drop a system note into the visitor's chat so they see what happened
    await supabase.from('chat_messages').insert({
      session_id: resolvedSessionId,
      role: 'assistant',
      content:
        '✉️ ההודעה שלך הועברה לאיתמר אישית.\n' +
        'הוא קורא ועונה כאן בצ׳אט בדרך כלל תוך כמה שעות.',
      metadata: {
        source: 'handoff_system_note',
        ref_code: result.refCode,
      },
    });

    return NextResponse.json({
      success: true,
      refCode: result.refCode,
      handoffId: result.handoffId,
      sessionId: resolvedSessionId,
    });
  } catch (err: any) {
    console.error('[/api/chat/handoff/itamar] error:', err);
    return NextResponse.json({ error: err?.message || 'unexpected' }, { status: 500 });
  }
}
