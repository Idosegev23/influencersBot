import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { callGraph, GRAPH_BASE } from '@/lib/meta-review/graph';

// instagram_business_basic — live profile + recent media
export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });

  const conn = await getIgConnectionForAccount(accountId);
  if (!conn) return NextResponse.json({ error: 'No active Instagram connection' }, { status: 409 });

  const profile = await callGraph({
    method: 'GET',
    url: `${GRAPH_BASE}/me?fields=id,username,name,profile_picture_url,followers_count,media_count,biography,website`,
    accessToken: conn.accessToken,
  });
  const media = await callGraph({
    method: 'GET',
    url: `${GRAPH_BASE}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=12`,
    accessToken: conn.accessToken,
  });

  return NextResponse.json({
    requests: [profile.request, media.request],
    response: { profile: profile.response, media: media.response },
    ok: profile.ok && media.ok,
  });
}
