import { NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/lib/pipeline/qstash';
import { runAgentJob } from '@/lib/crm/wa-worker';
import type { AgentJob } from '@/lib/crm/wa-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // AI parse + audio transcription are slow

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyQStashSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  let job: AgentJob;
  try { job = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }
  const result = await runAgentJob(job);
  return NextResponse.json(result, { status: 200 });
}
