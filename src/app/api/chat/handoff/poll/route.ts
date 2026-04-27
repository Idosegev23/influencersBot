/**
 * GET /api/chat/handoff/poll?sessionId=...&since=ISO
 *
 * Lightweight poll endpoint. The Bestie chat page calls this every few
 * seconds while a handoff is pending and renders any new
 * `metadata.source = 'whatsapp_personal'` messages with the Itamar badge.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const since = req.nextUrl.searchParams.get('since'); // ISO timestamp
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }
  const supabase = getSupabase();

  // Pending or recently-replied handoff for context
  const { data: handoffs } = await supabase
    .from('chat_handoffs')
    .select('id, ref_code, status, forwarded_at, replied_at, fallback_sent_at, target_name')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(5);

  // New messages since `since`
  let q = supabase
    .from('chat_messages')
    .select('id, role, content, created_at, metadata')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (since) q = q.gt('created_at', since);
  const { data: messages } = await q;

  return NextResponse.json({
    messages: messages || [],
    handoffs: handoffs || [],
    serverTime: new Date().toISOString(),
  });
}
