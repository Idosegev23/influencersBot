import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { callGraph, GRAPH_BASE } from '@/lib/meta-review/graph';

// instagram_business_manage_comments — READ-ONLY. Reading comments requires this
// permission, so a live read is a legitimate demonstration. No reply/hide/delete.
export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const accountId = req.nextUrl.searchParams.get('accountId');
  const mediaId = req.nextUrl.searchParams.get('mediaId');
  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
  if (!mediaId) return NextResponse.json({ error: 'Missing mediaId' }, { status: 400 });

  const conn = await getIgConnectionForAccount(accountId);
  if (!conn) return NextResponse.json({ error: 'No active Instagram connection' }, { status: 409 });

  const comments = await callGraph({
    method: 'GET',
    url: `${GRAPH_BASE}/${mediaId}/comments?fields=id,text,username,timestamp,like_count,replies{id,text,username}`,
    accessToken: conn.accessToken,
  });

  return NextResponse.json({
    requests: [comments.request],
    response: comments.response,
    ok: comments.ok,
  });
}
