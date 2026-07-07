/**
 * Public: submit a signature.
 * Branches on doc_kind:
 *  - quote:    a signed quote IS the agreement → partnership → 'active', then the
 *              agent is nudged (email + WhatsApp) to generate the contract.
 *  - contract: mark the contract signed and notify the agent.
 * Stamps the PDF, stores the signed copy either way.
 */
import { NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { getSignatureByToken, downloadDoc, uploadSignedPdf, appBaseUrl } from '@/lib/crm/quotes';
import { stampPdfWithSignature } from '@/lib/crm/pdf';
import { notifyAgent } from '@/lib/crm/notify';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sig = await getSignatureByToken(token);
  if (!sig) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (sig.status === 'signed') return NextResponse.json({ error: 'המסמך כבר נחתם' }, { status: 409 });
  if (sig.status === 'cancelled') return NextResponse.json({ error: 'בקשת החתימה בוטלה' }, { status: 409 });
  if (sig.expires_at && new Date(sig.expires_at) < new Date()) {
    return NextResponse.json({ error: 'בקשת החתימה פגה תוקף' }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const signerName = String(body?.signer_name ?? '').trim();
  if (!signerName) return NextResponse.json({ error: 'שם החותם נדרש' }, { status: 400 });
  if (!sig.document_storage_path) return NextResponse.json({ error: 'המסמך אינו זמין' }, { status: 400 });

  const original = await downloadDoc(sig.document_storage_path);
  if (!original) return NextResponse.json({ error: 'המסמך אינו זמין' }, { status: 400 });

  const signedAtIso = new Date().toISOString();

  let signedBytes: Uint8Array;
  try {
    signedBytes = await stampPdfWithSignature({
      originalPdf: original,
      signerName,
      signatureImageDataUrl: body?.signature_image ?? null,
      typedName: body?.typed_name ?? null,
      signedAtIso,
    });
  } catch (e) {
    console.error('[sign] stamp failed:', e);
    return NextResponse.json({ error: 'יצירת המסמך החתום נכשלה' }, { status: 500 });
  }

  const signedPath = await uploadSignedPdf(token, signedBytes);

  await supabaseAdmin
    .from('signature_requests')
    .update({
      status: 'signed',
      signed_at: signedAtIso,
      signed_storage_path: signedPath,
      signer_name: signerName,
      signer_email: body?.signer_email ?? sig.signer_email,
      signer_role: body?.signer_role ?? null,
      signer_notes: body?.signer_notes ?? null,
      signer_id_number: body?.signer_id_number ?? null,
      signer_company: body?.signer_company ?? null,
      signer_company_hp: body?.signer_company_hp ?? null,
      updated_at: signedAtIso,
    })
    .eq('id', sig.id);

  const docKind = (sig as any).doc_kind || 'quote';

  if (sig.partnership_id) {
    await supabaseAdmin.from('partnership_documents').insert({
      partnership_id: sig.partnership_id,
      account_id: sig.account_id,
      filename: `${sig.title || (docKind === 'contract' ? 'הסכם' : 'הצעה')} (חתום).pdf`,
      mime_type: 'application/pdf',
      storage_path: signedPath,
      document_type: 'contract',
      parsing_status: 'manual',
    });
  }

  if (docKind === 'contract') {
    // Mark the contract signed.
    await supabaseAdmin
      .from('contracts')
      .update({ status: 'signed', updated_at: signedAtIso })
      .eq('signature_request_id', sig.id);

    notifyAgent(sig.agent_id, {
      subject: `✅ החוזה "${sig.title || ''}" נחתם`,
      text: `${signerName} חתם/ה על החוזה "${sig.title || ''}".\nהעסקה מסודרת — אפשר להמשיך לפעילות ולחשבונית ב-Bestie.\n${appBaseUrl()}/agent/deals`,
    }).catch(() => {});
  } else {
    // Signed quote = agreement → activate the partnership.
    if (sig.partnership_id) {
      const { data: partnership } = await supabaseAdmin
        .from('partnerships')
        .select('proposal_amount')
        .eq('id', sig.partnership_id)
        .maybeSingle();
      await supabaseAdmin
        .from('partnerships')
        .update({
          status: 'active',
          contract_signed_date: signedAtIso.slice(0, 10),
          contract_amount: partnership?.proposal_amount ?? null,
          updated_at: signedAtIso,
        })
        .eq('id', sig.partnership_id);
    }

    notifyAgent(sig.agent_id, {
      subject: `✅ ההצעה "${sig.title || ''}" נחתמה`,
      text: `${signerName} חתם/ה על ההצעה "${sig.title || ''}". העסקה עברה ל"פעיל".\nהיכנס/י ל-Bestie כדי ליצור חוזה מהעסקה:\n${appBaseUrl()}/agent/deals`,
    }).catch(() => {});
  }

  return NextResponse.json({ signed_at: signedAtIso, signed_url: `/api/signatures/${token}/signed` });
}
