/**
 * Public: submit a signature for a quote.
 * Stamps the PDF, stores the signed copy, and — since a signed quote IS the
 * agreement — advances the partnership to 'active' and records the agreement
 * document. Notifies the managing agent (best-effort).
 */
import { NextResponse } from 'next/server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { getSignatureByToken, downloadDoc, uploadSignedPdf, appBaseUrl } from '@/lib/crm/quotes';
import { stampPdfWithSignature } from '@/lib/crm/pdf';
import { sendEmail } from '@/lib/email';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sig = await getSignatureByToken(token);
  if (!sig) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (sig.status === 'signed') {
    return NextResponse.json({ error: 'המסמך כבר נחתם' }, { status: 409 });
  }
  if (sig.status === 'cancelled') {
    return NextResponse.json({ error: 'בקשת החתימה בוטלה' }, { status: 409 });
  }
  if (sig.expires_at && new Date(sig.expires_at) < new Date()) {
    return NextResponse.json({ error: 'בקשת החתימה פגה תוקף' }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const signerName = String(body?.signer_name ?? '').trim();
  if (!signerName) return NextResponse.json({ error: 'שם החותם נדרש' }, { status: 400 });

  if (!sig.document_storage_path) {
    return NextResponse.json({ error: 'המסמך אינו זמין' }, { status: 400 });
  }
  const original = await downloadDoc(sig.document_storage_path);
  if (!original) return NextResponse.json({ error: 'המסמך אינו זמין' }, { status: 400 });

  const signedAtIso = new Date().toISOString();

  // Stamp the signature onto the PDF.
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

  // Mark signature request signed + capture signer fields.
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

  // Signed quote = agreement → activate the partnership + record the agreement doc.
  if (sig.partnership_id) {
    const { data: partnership } = await supabaseAdmin
      .from('partnerships')
      .select('proposal_amount, currency')
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

    await supabaseAdmin.from('partnership_documents').insert({
      partnership_id: sig.partnership_id,
      account_id: sig.account_id,
      filename: `${sig.title || 'agreement'} (חתום).pdf`,
      mime_type: 'application/pdf',
      storage_path: signedPath,
      document_type: 'contract',
      parsing_status: 'manual',
    });
  }

  // Notify the managing agent (best-effort).
  notifyAgent(sig.agent_id, sig.title, signerName, token).catch(() => {});

  return NextResponse.json({ signed_at: signedAtIso, signed_url: `/api/signatures/${token}/signed` });
}

async function notifyAgent(agentId: string | null, title: string, signerName: string, token: string) {
  if (!agentId) return;
  const { data: agent } = await supabaseAdmin
    .from('users')
    .select('contact_email, full_name')
    .eq('id', agentId)
    .maybeSingle();
  const to = agent?.contact_email;
  if (!to) return;
  const link = `${appBaseUrl()}/sign/${token}`;
  await sendEmail({
    to,
    subject: `✅ ההצעה "${title}" נחתמה`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
      <h2>ההצעה נחתמה 🎉</h2>
      <p><b>${signerName}</b> חתם/ה על ההצעה <b>${title}</b>.</p>
      <p>הפעילות עברה לסטטוס "פעיל". <a href="${link}">צפייה במסמך החתום</a>.</p>
      <hr/><p style="color:#888;font-size:12px">Bestie CRM</p>
    </div>`,
  });
}
