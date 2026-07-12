import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { callGraph, GRAPH_BASE } from '@/lib/meta-review/graph';

// instagram_business_manage_messages — READ recent DM conversations.
export async function GET(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });

  const conn = await getIgConnectionForAccount(accountId);
  if (!conn) return NextResponse.json({ error: 'No active Instagram connection' }, { status: 409 });

  const convos = await callGraph({
    method: 'GET',
    url: `${GRAPH_BASE}/me/conversations?platform=instagram&fields=id,updated_time,participants,messages.limit(5){id,from,message,created_time}`,
    accessToken: conn.accessToken,
  });

  return NextResponse.json({
    requests: [convos.request],
    response: convos.response,
    businessIgId: conn.igId,
    ok: convos.ok,
  });
}
