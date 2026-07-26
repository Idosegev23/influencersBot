import { NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/lib/pipeline/qstash';
import { runLeadDrain } from '@/lib/bestie/wa-lead-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // one turn (retrieval + brain) is slow

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyQStashSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let body: any;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }

  if (body?.drain && body?.waId) {
    const result = await runLeadDrain(String(body.waId));
    return NextResponse.json(result, { status: 200 });
  }

  return NextResponse.json({ status: 'ignored' }, { status: 200 });
}
