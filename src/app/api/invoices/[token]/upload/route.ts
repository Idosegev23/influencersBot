/**
 * Public invoice upload (token-gated): the client/agent uploads the invoice PDF.
 *   GET  → invoice meta (brand, amount, status) for the upload page
 *   POST → multipart file → store + start payment tracking (net+terms)
 */
import { NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { getInvoiceByToken, uploadInvoiceFile } from '@/lib/crm/invoices';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvoiceByToken(token);
  if (!inv) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data: p } = await supabaseAdmin
    .from('partnerships')
    .select('brand_name')
    .eq('id', inv.partnership_id)
    .maybeSingle();
  return NextResponse.json({
    brand: p?.brand_name || null,
    amount: inv.total_amount,
    currency: inv.currency,
    status: inv.status,
    uploaded: inv.status !== 'draft',
    due_date: inv.due_date,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid form' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'קובץ נדרש' }, { status: 400 });

  const mime = file.type || 'application/octet-stream';
  if (!/pdf|image\//.test(mime)) {
    return NextResponse.json({ error: 'יש להעלות PDF או תמונה' }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 15MB)' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    await uploadInvoiceFile(token, bytes, file.name || 'invoice.pdf', mime);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'upload failed' }, { status: 400 });
  }
}
