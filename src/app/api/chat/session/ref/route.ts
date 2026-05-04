/**
 * Stamp ref_source attribution on a chat_session.
 *
 * Currently used for late URL attribution (e.g. an open chat session
 * that picked up ?ref= on a follow-up page). Coupon copies do NOT
 * trigger this endpoint — attribution is "where the visitor came from",
 * and copying someone else's code shouldn't reattribute the session.
 *
 * Body: { sessionId: string, ref: string, lock?: boolean, source?: string }
 *
 * Lock semantics (kept for future use, e.g. an explicit admin override):
 *   - lock=false (default): only set ref if not already locked AND not
 *     already set to a different value
 *   - lock=true: overwrite any prior value AND set ref_locked=true
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

const REF_RE = /^[a-z0-9_.-]{1,32}$/i;
const SESSION_ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, ref, lock, source } = body || {};

    if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }
    if (typeof ref !== 'string' || !REF_RE.test(ref)) {
      return NextResponse.json({ error: 'Invalid ref' }, { status: 400 });
    }

    const cleanRef = ref.toLowerCase();
    const wantLock = lock === true;

    const { data: sess, error: readErr } = await supabase
      .from('chat_sessions')
      .select('id, ref_source, ref_locked')
      .eq('id', sessionId)
      .maybeSingle();

    if (readErr || !sess) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Locked ref can only be overwritten by another locked update
    if (sess.ref_locked && !wantLock) {
      return NextResponse.json({ ok: true, applied: false, reason: 'already locked' });
    }

    // Soft updates: don't overwrite a different existing soft ref
    if (!wantLock && sess.ref_source && sess.ref_source !== cleanRef) {
      return NextResponse.json({ ok: true, applied: false, reason: 'already attributed' });
    }

    const { error: updErr } = await supabase
      .from('chat_sessions')
      .update({
        ref_source: cleanRef,
        ref_locked: wantLock || sess.ref_locked || false,
      })
      .eq('id', sessionId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    console.log(`[ref] session ${sessionId} ref=${cleanRef} locked=${wantLock} source=${source || 'unspecified'}`);
    return NextResponse.json({ ok: true, applied: true, ref: cleanRef, locked: wantLock });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'fatal' }, { status: 500 });
  }
}
