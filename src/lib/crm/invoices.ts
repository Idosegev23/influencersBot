/**
 * Agency-CRM invoice lifecycle.
 *
 * Bestie does NOT issue invoices — it REQUESTS an upload (the agent's "activity
 * done" trigger), chases every 48h until uploaded, then tracks payment by terms
 * (e.g. net+30). The reminder cadence keys off requested_at / due_date, never a
 * contract date.
 */
import { randomBytes } from 'crypto';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { appBaseUrl } from '@/lib/crm/quotes';

const BUCKET = 'partnership-documents';

export function invoiceUploadUrl(token: string): string {
  return `${appBaseUrl()}/invoice/${token}`;
}

/** Mark activity done → create an invoice in 'draft' (awaiting upload) + upload link. */
export async function requestInvoice(params: {
  partnershipId: string;
  agentId: string;
  paymentRoute?: 'direct_from_brand' | 'via_agency';
  paymentTermsDays?: number;
}): Promise<{ invoiceId: string; uploadUrl: string }> {
  const { data: p } = await supabaseAdmin
    .from('partnerships')
    .select('id, account_id, contract_amount, proposal_amount, currency, agent_id')
    .eq('id', params.partnershipId)
    .maybeSingle();
  if (!p) throw new Error('partnership not found');

  // Guard against duplicate open invoice requests.
  const { data: existing } = await supabaseAdmin
    .from('invoices')
    .select('id, upload_token, status')
    .eq('partnership_id', params.partnershipId)
    .neq('status', 'cancelled')
    .maybeSingle();
  if (existing) {
    return { invoiceId: existing.id, uploadUrl: invoiceUploadUrl(existing.upload_token) };
  }

  const amount = Number(p.contract_amount ?? p.proposal_amount ?? 0);
  const token = randomBytes(16).toString('base64url');
  const nowIso = new Date().toISOString();

  const { data: inv, error } = await supabaseAdmin
    .from('invoices')
    .insert({
      partnership_id: params.partnershipId,
      agent_id: params.agentId,
      amount,
      total_amount: amount,
      currency: p.currency || 'ILS',
      status: 'draft', // draft = awaiting upload
      requested_at: nowIso,
      payment_route: params.paymentRoute || 'via_agency',
      payment_terms_days: params.paymentTermsDays ?? 30,
      upload_token: token,
    })
    .select('id, upload_token')
    .single();
  if (error || !inv) throw new Error(error?.message || 'failed to create invoice');

  await supabaseAdmin
    .from('partnerships')
    .update({ activity_completed_at: nowIso, updated_at: nowIso })
    .eq('id', params.partnershipId);

  return { invoiceId: inv.id, uploadUrl: invoiceUploadUrl(inv.upload_token) };
}

export async function getInvoiceByToken(token: string) {
  const { data } = await supabaseAdmin.from('invoices').select('*').eq('upload_token', token).maybeSingle();
  return data;
}

function extFor(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return mime.split('/')[1] || 'img';
  return 'bin';
}

/** Invoice uploaded → start payment tracking (status 'sent', due_date = issued + terms). */
export async function uploadInvoiceFile(
  token: string,
  bytes: Uint8Array,
  filename: string,
  mime: string
): Promise<{ ok: true }> {
  const inv = await getInvoiceByToken(token);
  if (!inv) throw new Error('invoice not found');
  if (inv.status !== 'draft') throw new Error('כבר הועלתה חשבונית');

  const path = `invoices/${inv.id}.${extFor(mime)}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(bytes), { contentType: mime, upsert: true });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);

  const issued = new Date();
  const due = new Date(issued.getTime() + (inv.payment_terms_days ?? 30) * 86400000);
  const nowIso = issued.toISOString();

  await supabaseAdmin
    .from('invoices')
    .update({
      status: 'sent', // uploaded → awaiting payment
      uploaded_at: nowIso,
      issued_at: issued.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
      storage_path: path,
      pdf_filename: filename,
      last_reminder_at: null, // reset cadence for the payment phase
      reminder_count: 0,
      updated_at: nowIso,
    })
    .eq('id', inv.id);

  await supabaseAdmin.from('partnership_documents').insert({
    partnership_id: inv.partnership_id,
    account_id: inv.account_id ?? null,
    filename,
    mime_type: mime,
    storage_path: path,
    document_type: 'invoice',
    parsing_status: 'manual',
  });

  return { ok: true };
}

/** The open (awaiting-upload) invoice's public upload URL, if any. */
export async function getOpenInvoiceUploadUrl(partnershipId: string, agentId: string): Promise<string | null> {
  const { data: inv } = await supabaseAdmin
    .from('invoices')
    .select('agent_id, upload_token, status')
    .eq('partnership_id', partnershipId)
    .eq('status', 'draft')
    .maybeSingle();
  if (!inv || inv.agent_id !== agentId || !inv.upload_token) return null;
  return invoiceUploadUrl(inv.upload_token);
}

/** Unwind an invoice request (the agent marked "done" prematurely). */
export async function cancelInvoice(partnershipId: string, agentId: string): Promise<{ ok: boolean }> {
  const { data: inv } = await supabaseAdmin
    .from('invoices')
    .select('id, agent_id, status')
    .eq('partnership_id', partnershipId)
    .neq('status', 'cancelled')
    .maybeSingle();
  if (!inv || inv.agent_id !== agentId) return { ok: false };
  if (inv.status === 'paid') return { ok: false };
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from('invoices').update({ status: 'cancelled', updated_at: nowIso }).eq('id', inv.id);
  await supabaseAdmin.from('partnerships').update({ activity_completed_at: null, updated_at: nowIso }).eq('id', partnershipId);
  return { ok: true };
}

export async function markInvoicePaid(invoiceId: string, agentId: string): Promise<{ ok: boolean }> {
  const { data: inv } = await supabaseAdmin
    .from('invoices')
    .select('id, agent_id, partnership_id')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!inv || inv.agent_id !== agentId) return { ok: false };

  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from('invoices')
    .update({ status: 'paid', paid_at: nowIso.slice(0, 10), updated_at: nowIso })
    .eq('id', invoiceId);

  // Deal fully closed.
  if (inv.partnership_id) {
    await supabaseAdmin
      .from('partnerships')
      .update({ status: 'completed', updated_at: nowIso })
      .eq('id', inv.partnership_id);
  }
  return { ok: true };
}
