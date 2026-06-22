/**
 * Public: stream the SIGNED PDF for a signing token (private bucket).
 */
import { NextResponse } from 'next/server';
import { getSignatureByToken, downloadDoc } from '@/lib/crm/quotes';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sig = await getSignatureByToken(token);
  if (!sig || !sig.signed_storage_path) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const bytes = await downloadDoc(sig.signed_storage_path);
  if (!bytes) return NextResponse.json({ error: 'document unavailable' }, { status: 404 });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="signed-${token}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
