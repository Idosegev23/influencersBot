/**
 * Hourly sweep for leads that went quiet mid-qualification, on EVERY surface —
 * IG DM, the chat page, and the site widget. The route keeps its ig-lead-flush
 * path because vercel.json's cron entry points at it; the sweep itself is no
 * longer Instagram-only (see LEAD_SOURCES in engines/escalation/lead-capture).
 *
 * A lead that answered two digging questions and disappeared is still a lead —
 * flushStaleLeads emails whatever was gathered as a "partial brief" once the
 * session has been idle past config.lead_capture.idleFlushMinutes (default 30).
 */
import { NextRequest, NextResponse } from 'next/server';
import { flushStaleLeads } from '@/engines/escalation/lead-capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Vercel cron sends this header; anything else must not be able to fire sends.
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron');
  const secret = process.env.CRON_SECRET;
  const authorized =
    isVercelCron || (secret && req.headers.get('authorization') === `Bearer ${secret}`);
  if (!authorized) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const result = await flushStaleLeads();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[ig-lead-flush] sweep failed:', e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
