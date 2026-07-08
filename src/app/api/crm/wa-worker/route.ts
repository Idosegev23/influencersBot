import { NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/lib/pipeline/qstash';
import { runAgentDrain, runAgentJob } from '@/lib/crm/wa-worker';
import type { AgentJob } from '@/lib/crm/wa-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // AI parse + audio transcription are slow

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyQStashSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  let body: any;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }

  // New path: a drain trigger — pop the agent's FIFO queue in order.
  if (body?.drain && body?.agentId) {
    const result = await runAgentDrain(String(body.agentId));
    return NextResponse.json(result, { status: 200 });
  }
  // Legacy path: an in-flight single-message job from before the queue rollout.
  if (body?.msg) {
    const result = await runAgentJob(body as AgentJob);
    return NextResponse.json(result, { status: 200 });
  }
  return NextResponse.json({ status: 'ignored' }, { status: 200 });
}
