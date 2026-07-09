import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { startPipeline } from '@/lib/pipeline/start';

export async function POST(req: Request) {
  // Auth: admin cookie OR CRON_SECRET bearer (mirrors /api/admin/full-scan) so the
  // pipeline can be triggered headlessly for acceptance runs / automation.
  const authHeader = req.headers.get('authorization');
  const expectedToken = process.env.CRON_SECRET;
  const hasCronToken = expectedToken && authHeader === `Bearer ${expectedToken}`;
  if (!hasCronToken) {
    const denied = await requireAdminAuth();
    if (denied) return denied;
  }

  const body = await req.json();
  const result = await startPipeline(body);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
