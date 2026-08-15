import { NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/lib/pipeline/qstash';
import { runCsDrain } from '@/lib/cs/wa-cs-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // one CS turn (RAG + brain) is slow

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyQStashSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  let body: any;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }

  if (body?.drain && body?.waId && body?.waChannelId) {
    const result = await runCsDrain(String(body.waChannelId), String(body.waId));
    return NextResponse.json(result, { status: 200 });
  }
  // A drain published before the channel rollout has no waChannelId and no queue under the
  // new keys. ACK it so QStash stops retrying; the sweep cron re-publishes anything real.
  if (body?.drain && body?.waId) {
    console.warn('[cs-worker] legacy drain job without waChannelId — acking', { waId: body.waId });
    return NextResponse.json({ status: 'legacy-drain-ignored' }, { status: 200 });
  }
  return NextResponse.json({ status: 'ignored' }, { status: 200 });
}
