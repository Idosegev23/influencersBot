import { notFound } from 'next/navigation';
import { getSignatureByToken } from '@/lib/crm/quotes';
import SignClient from '@/components/sign/SignClient';

export const dynamic = 'force-dynamic';

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sig = await getSignatureByToken(token);
  if (!sig) notFound();

  const isExpired =
    (sig.status === 'pending' || sig.status === 'opened') &&
    sig.expires_at &&
    new Date(sig.expires_at) < new Date();
  const status = isExpired ? 'expired' : (sig.status as any);

  return (
    <SignClient
      token={token}
      title={sig.title || 'הצעת מחיר'}
      status={status}
      signerName={sig.signer_name}
      signerEmail={sig.signer_email}
      signedAt={sig.signed_at}
      documentUrl={`/api/signatures/${token}/document`}
      signedUrl={sig.signed_storage_path ? `/api/signatures/${token}/signed` : null}
    />
  );
}
