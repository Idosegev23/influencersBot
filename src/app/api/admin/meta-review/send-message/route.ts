import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getIgConnectionForAccount } from '@/lib/instagram-graph/get-connection';
import { sendInstagramDM } from '@/lib/instagram-graph/client';
import { redactToken, redactDeep, type RequestMeta } from '@/lib/meta-review/util';

// instagram_business_manage_messages — the ONLY write/publish action: reply via DM.
export async function POST(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountId, recipientId, text } = await req.json().catch(() => ({}));
  if (!accountId || !recipientId || !text) {
    return NextResponse.json({ error: 'Missing accountId, recipientId, or text' }, { status: 400 });
  }

  const conn = await getIgConnectionForAccount(accountId);
  if (!conn) return NextResponse.json({ error: 'No active Instagram connection' }, { status: 409 });

  const request: RequestMeta = {
    method: 'POST',
    url: redactToken(`https://graph.instagram.com/v22.0/${conn.igId}/messages?access_token=${conn.accessToken}`),
    note: `body: {"recipient":{"id":"${recipientId}"},"message":{"text":${JSON.stringify(text)}}}`,
  };

  try {
    const result = await sendInstagramDM(recipientId, text, conn.igId, conn.accessToken);
    return NextResponse.json({ requests: [request], response: redactDeep(result), ok: true });
  } catch (e: any) {
    return NextResponse.json({ requests: [request], response: { error: { message: e?.message || 'send failed' } }, ok: false });
  }
}
