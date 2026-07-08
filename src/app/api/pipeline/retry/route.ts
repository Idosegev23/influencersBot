import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { publishStep } from '@/lib/pipeline/qstash';
import { SCAN_STEPS } from '@/lib/pipeline/progress';
import type { PipelineStep } from '@/lib/pipeline/types';

export async function POST(req: Request) {
  // Auth: admin cookie OR CRON_SECRET bearer (mirrors /api/pipeline/start) so the
  // pipeline can be retried headlessly for acceptance runs / automation.
  const authHeader = req.headers.get('authorization');
  const expectedToken = process.env.CRON_SECRET;
  const hasCronToken = expectedToken && authHeader === `Bearer ${expectedToken}`;
  if (!hasCronToken) {
    const denied = await requireAdminAuth();
    if (denied) return denied;
  }

  const body = await req.json();
  const { jobId, step } = body ?? {};

  if (!jobId || !step) {
    return NextResponse.json({ error: 'jobId and step required' }, { status: 400 });
  }
  if (!SCAN_STEPS.includes(step)) {
    return NextResponse.json({ error: 'invalid step' }, { status: 400 });
  }

  await publishStep({ jobId, step: step as PipelineStep, batch: 0 });

  return NextResponse.json({ ok: true });
}
