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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId: string | undefined = body.sessionId;
    const question: string | undefined = body.question;
    const visitorName: string | undefined = body.visitorName;
    const visitorMeta: string | undefined = body.visitorMeta;

    if (!sessionId || !question) {
      return NextResponse.json({ error: 'sessionId and question required' }, { status: 400 });
    }
    if (question.length > 2000) {
      return NextResponse.json({ error: 'question too long' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Resolve account_id + sanity check the session exists
    const { data: session, error: sErr } = await supabase
      .from('chat_sessions')
      .select('id, account_id')
      .eq('id', sessionId)
      .single();
    if (sErr || !session) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 });
    }

    const labelParts = [visitorName, visitorMeta].filter(Boolean);
    const visitorLabel = labelParts.length ? labelParts.join(' · ') : 'אורח/ת ב-Bestie';

    const result = await forwardToItamar({
      sessionId,
      accountId: session.account_id,
      visitorLabel,
      visitorQuestion: question,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Forward failed', refCode: result.refCode },
        { status: 502 },
      );
    }

    // Drop a system note into the visitor's chat so they see what happened
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
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
    });
  } catch (err: any) {
    console.error('[/api/chat/handoff/itamar] error:', err);
    return NextResponse.json({ error: err?.message || 'unexpected' }, { status: 500 });
  }
}
