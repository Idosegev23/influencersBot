/**
 * Agency-CRM quote service: create a quote (partnership + PDF + signature
 * request), fetch by signing token, list an agent's quotes.
 *
 * A quote = partnerships row (status 'proposal') + a quote PDF in the private
 * `partnership-documents` bucket + a signature_requests row. Signing it makes it
 * the agreement (no separate contract).
 */
import { randomBytes } from 'crypto';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { generateQuotePdf } from '@/lib/crm/pdf';

const BUCKET = 'partnership-documents';

export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://bestieai.co.il'
  ).replace(/\/$/, '');
}

export function signUrlFor(token: string): string {
  return `${appBaseUrl()}/sign/${token}`;
}

export interface CreateQuoteInput {
  agentId: string;
  accountId: string; // influencer/client account
  brandName: string; // brand receiving the quote
  clientName?: string | null;
  campaignName?: string | null;
  amount?: number | null;
  currency?: string | null;
  validUntil?: string | null;
  deliverables?: string[];
  terms?: string | null;
  notes?: string | null;
  brandContactName?: string | null;
  brandContactEmail?: string | null;
  brandContactPhone?: string | null;
  agentName?: string | null;
  title?: string;
  originalPdf?: Uint8Array | null; // forwarded PDF — stamp the original instead of generating
  originalMime?: string | null;
  parsedData?: any;
}

export interface CreateQuoteResult {
  partnershipId: string;
  signatureRequestId: string;
  token: string;
  signUrl: string;
  title: string;
}

export async function createQuote(input: CreateQuoteInput): Promise<CreateQuoteResult> {
  // 1) partnership (the deal)
  const { data: partnership, error: pErr } = await supabaseAdmin
    .from('partnerships')
    .insert({
      account_id: input.accountId,
      agent_id: input.agentId,
      brand_name: input.brandName || 'מותג',
      brand_contact_name: input.brandContactName || null,
      brand_contact_email: input.brandContactEmail || null,
      brand_contact_phone: input.brandContactPhone || null,
      status: 'proposal',
      proposal_amount: input.amount ?? null,
      currency: input.currency || 'ILS',
      brief: input.notes || null,
      deliverables: input.deliverables && input.deliverables.length ? input.deliverables : null,
      proposal_date: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single();
  if (pErr || !partnership) throw new Error(pErr?.message || 'failed to create partnership');

  const title = input.title || `הצעת מחיר${input.brandName ? ` — ${input.brandName}` : ''}`;

  // 2) quote PDF — reuse a forwarded PDF if present, else generate
  let pdfBytes: Uint8Array;
  if (input.originalPdf && (!input.originalMime || input.originalMime === 'application/pdf')) {
    pdfBytes = input.originalPdf;
  } else {
    pdfBytes = await generateQuotePdf({
      title,
      clientName: input.clientName ?? null,
      brandName: input.brandName ?? null,
      campaignName: input.campaignName ?? null,
      amount: input.amount ?? null,
      currency: input.currency ?? null,
      validUntil: input.validUntil ?? null,
      deliverables: input.deliverables ?? [],
      terms: input.terms ?? null,
      notes: input.notes ?? null,
      agentName: input.agentName ?? null,
    });
  }

  // 3) upload to private bucket
  const docPath = `quotes/${partnership.id}.pdf`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(docPath, Buffer.from(pdfBytes), { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);

  // 4) partnership_documents record
  await supabaseAdmin.from('partnership_documents').insert({
    partnership_id: partnership.id,
    account_id: input.accountId,
    filename: `${title}.pdf`,
    mime_type: 'application/pdf',
    storage_path: docPath,
    document_type: 'quote',
    parsing_status: input.parsedData ? 'completed' : 'manual',
    parsed_data: input.parsedData || null,
  });

  // 5) signature request
  const token = randomBytes(18).toString('base64url');
  const { data: sig, error: sErr } = await supabaseAdmin
    .from('signature_requests')
    .insert({
      token,
      partnership_id: partnership.id,
      account_id: input.accountId,
      agent_id: input.agentId,
      title,
      status: 'pending',
      document_storage_path: docPath,
      signer_name: input.brandContactName || null,
      signer_email: input.brandContactEmail || null,
    })
    .select('id, token')
    .single();
  if (sErr || !sig) throw new Error(sErr?.message || 'failed to create signature request');

  return {
    partnershipId: partnership.id,
    signatureRequestId: sig.id,
    token: sig.token,
    signUrl: signUrlFor(sig.token),
    title,
  };
}

export async function getSignatureByToken(token: string) {
  const { data } = await supabaseAdmin
    .from('signature_requests')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  return data;
}

/** Download a stored PDF as bytes (for streaming through a public API). */
export async function downloadDoc(storagePath: string): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function uploadSignedPdf(token: string, bytes: Uint8Array): Promise<string> {
  const path = `signed/${token}.pdf`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`signed upload failed: ${error.message}`);
  return path;
}

export async function listAgentQuotes(agentId: string) {
  const { data } = await supabaseAdmin
    .from('signature_requests')
    .select('id, token, title, status, signed_at, created_at, signer_name, partnership_id, account_id')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false });
  return data || [];
}
