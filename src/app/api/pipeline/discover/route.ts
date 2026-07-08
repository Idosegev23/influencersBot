import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { discoverCategories } from '@/lib/pipeline/discover';
import { redisGet, redisSet } from '@/lib/redis';

export const maxDuration = 60;

/**
 * POST /api/pipeline/discover
 * Body: { websiteUrl, refresh? }
 * Auth: admin cookie OR Bearer CRON_SECRET (mirrors /api/pipeline/start).
 * Discovers a site's sitemap, AI-labels its path categories, and caches the
 * result in Redis under `discover:{domain}` for 1h (bypassed by `refresh`).
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const expectedToken = process.env.CRON_SECRET;
  const hasCronToken = expectedToken && authHeader === `Bearer ${expectedToken}`;
  if (!hasCronToken) {
    const denied = await requireAdminAuth();
    if (denied) return denied;
  }

  const { websiteUrl, refresh } = await req.json();
  if (!websiteUrl) {
    return NextResponse.json({ error: 'websiteUrl required' }, { status: 400 });
  }
  let domain: string;
  try {
    domain = new URL(websiteUrl).host;
  } catch {
    return NextResponse.json({ error: 'bad url' }, { status: 400 });
  }

  const cacheKey = `discover:${domain}`;
  if (!refresh) {
    const cached = await redisGet<Awaited<ReturnType<typeof discoverCategories>>>(cacheKey);
    if (cached) return NextResponse.json({ ...cached, cached: true });
  }

  const result = await discoverCategories(websiteUrl);
  // redisSet JSON-stringifies internally — pass the object, not a pre-stringified string.
  await redisSet(cacheKey, result, 3600);
  return NextResponse.json(result);
}
