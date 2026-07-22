// QStash-triggered (or admin) backfill runner. Body: { accountId }.
import { NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/lib/pipeline/qstash';
import { backfillAccountOrders } from '@/lib/orders/backfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyQStashSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  let body: any;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }
  const accountId = String(body?.accountId || '');
  if (!accountId) return NextResponse.json({ error: 'missing accountId' }, { status: 400 });

  try {
    const result = await backfillAccountOrders(accountId);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
