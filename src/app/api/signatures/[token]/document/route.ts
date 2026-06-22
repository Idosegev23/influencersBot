/**
 * Public: stream the UNSIGNED quote PDF for a signing token (private bucket).
 * Marks the request 'opened' on first view.
 */
import { NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { getSignatureByToken, downloadDoc } from '@/lib/crm/quotes';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sig = await getSignatureByToken(token);
  if (!sig || !sig.document_storage_path) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (sig.status === 'pending') {
    supabaseAdmin
      .from('signature_requests')
      .update({ status: 'opened', updated_at: new Date().toISOString() })
      .eq('id', sig.id)
      .then(undefined, () => {});
  }

  const bytes = await downloadDoc(sig.document_storage_path);
  if (!bytes) return NextResponse.json({ error: 'document unavailable' }, { status: 404 });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="quote-${token}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
