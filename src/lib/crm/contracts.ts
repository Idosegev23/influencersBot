/**
 * Agency-CRM contracts (Phase B). A signed quote activates the deal; the agent
 * then generates a CONTRACT — an editable Hebrew text template — reviews/edits it,
 * and sends it for e-signature (rendered to a PDF, doc_kind='contract').
 */
import { randomBytes } from 'crypto';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { generateContractPdf } from '@/lib/crm/pdf';
import { signUrlFor } from '@/lib/crm/quotes';

const BUCKET = 'partnership-documents';

export function buildContractBody(d: {
  brandName?: string | null;
  clientName?: string | null;
  campaignName?: string | null;
  influencerName?: string | null;
  amount?: number | null;
  currency?: string | null;
  deliverables?: string[];
  terms?: string | null;
  agentName?: string | null;
}): string {
  const cur = d.currency === 'USD' ? '$' : d.currency === 'EUR' ? '€' : '₪';
  const lines: string[] = [];
  lines.push('הסכם התקשרות');
  lines.push('');
  lines.push(
    `הסכם זה נערך בין ${d.clientName || d.brandName || 'המזמין'} ("המזמין") לבין ${d.influencerName || 'המיוצג'} ("המיוצג")${d.agentName ? `, באמצעות הסוכן ${d.agentName}` : ''}.`
  );
  if (d.campaignName) lines.push(`קמפיין: ${d.campaignName}${d.brandName ? ` (מותג: ${d.brandName})` : ''}.`);
  lines.push('');
  lines.push('1. התוצרים');
  for (const dv of d.deliverables || []) if (dv?.trim()) lines.push(`• ${dv}`);
  if (!(d.deliverables || []).length) lines.push('• —');
  lines.push('');
  if (d.amount != null) {
    lines.push('2. התמורה');
    lines.push(`סך ${cur} ${Number(d.amount).toLocaleString('en-US')} בתוספת מע"מ כדין.`);
    lines.push('');
  }
  if (d.terms?.trim()) {
    lines.push('3. תנאים מיוחדים');
    lines.push(d.terms.trim());
    lines.push('');
  }
  lines.push('4. תשלום');
  lines.push('התשלום יבוצע בכפוף להמצאת חשבונית כדין ובתנאי התשלום המוסכמים בין הצדדים.');
  lines.push('');
  lines.push('חתימת הצדדים על הסכם זה מהווה הסכמה מלאה ומחייבת לכל תנאיו.');
  return lines.join('\n');
}

export async function getContract(partnershipId: string) {
  const { data } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('partnership_id', partnershipId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Generate a draft contract from the deal (idempotent while still draft). */
export async function createContractDraft(partnershipId: string, agentId: string) {
  const existing = await getContract(partnershipId);
  if (existing && existing.status !== 'signed') return existing;

  const { data: p } = await supabaseAdmin.from('partnerships').select('*').eq('id', partnershipId).maybeSingle();
  if (!p) throw new Error('deal not found');

  const [{ data: acct }, { data: camp }, { data: client }, { data: agentRow }, { data: items }] = await Promise.all([
    p.account_id ? supabaseAdmin.from('accounts').select('config').eq('id', p.account_id).maybeSingle() : Promise.resolve({ data: null }),
    p.campaign_id ? supabaseAdmin.from('campaigns').select('name').eq('id', p.campaign_id).maybeSingle() : Promise.resolve({ data: null }),
    p.client_id ? supabaseAdmin.from('clients').select('name').eq('id', p.client_id).maybeSingle() : Promise.resolve({ data: null }),
    supabaseAdmin.from('users').select('full_name').eq('id', agentId).maybeSingle(),
    supabaseAdmin.from('deal_line_items').select('*').eq('partnership_id', partnershipId).order('sort_order', { ascending: true }),
  ]);

  const deliverables = (items || []).length
    ? (items || []).map((li: any) => {
        const kind = [li.deliverable_type, li.platform].filter(Boolean).join(' · ') || 'תוצר';
        const price = li.unit_price ? ` — ${(Number(li.qty) * Number(li.unit_price)).toLocaleString('en-US')} ₪` : '';
        return `${li.qty}× ${kind}${price}`;
      })
    : Array.isArray(p.deliverables)
    ? p.deliverables
    : [];

  const influencerName = (acct?.config as any)?.display_name || (acct?.config as any)?.username || null;
  const body = buildContractBody({
    brandName: p.brand_name,
    clientName: client?.name,
    campaignName: camp?.name,
    influencerName,
    amount: p.contract_amount ?? p.proposal_amount,
    currency: p.currency,
    deliverables,
    terms: p.brief || null,
    agentName: agentRow?.full_name,
  });

  const { data: c, error } = await supabaseAdmin
    .from('contracts')
    .insert({ partnership_id: partnershipId, agent_id: agentId, account_id: p.account_id, body, status: 'draft' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return c;
}

export async function saveContractBody(contractId: string, agentId: string, body: string) {
  const { data: c } = await supabaseAdmin.from('contracts').select('agent_id, status').eq('id', contractId).maybeSingle();
  if (!c || c.agent_id !== agentId) throw new Error('חוזה לא נמצא');
  if (c.status === 'signed') throw new Error('החוזה כבר נחתם');
  await supabaseAdmin.from('contracts').update({ body, updated_at: new Date().toISOString() }).eq('id', contractId);
  return { ok: true };
}

/** Render the contract body to a PDF and create a signature request (doc_kind=contract). */
export async function sendContract(contractId: string, agentId: string): Promise<{ signUrl: string }> {
  const { data: c } = await supabaseAdmin.from('contracts').select('*').eq('id', contractId).maybeSingle();
  if (!c || c.agent_id !== agentId) throw new Error('חוזה לא נמצא');
  if (c.status === 'signed') throw new Error('החוזה כבר נחתם');

  const { data: p } = await supabaseAdmin
    .from('partnerships')
    .select('brand_name, account_id, brand_contact_name, brand_contact_email')
    .eq('id', c.partnership_id)
    .maybeSingle();

  // agency branding for the header
  const { data: agentRow } = await supabaseAdmin.from('users').select('agency').eq('id', agentId).maybeSingle();
  const agency = (agentRow?.agency as any) || {};
  let agencyLogo: Uint8Array | null = null;
  if (agency.logo_path) {
    const { data: file } = await supabaseAdmin.storage.from(BUCKET).download(agency.logo_path);
    if (file) agencyLogo = new Uint8Array(await file.arrayBuffer());
  }

  const title = `הסכם — ${p?.brand_name || ''}`.trim();
  const pdfBytes = await generateContractPdf({
    title,
    body: c.body || '',
    agencyName: agency.name || null,
    agencyLogo,
    agencyLogoType: agency.logo_type || null,
  });

  const docPath = `contracts/${c.partnership_id}.pdf`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(docPath, Buffer.from(pdfBytes), { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);

  await supabaseAdmin.from('partnership_documents').insert({
    partnership_id: c.partnership_id,
    account_id: c.account_id,
    filename: `${title}.pdf`,
    mime_type: 'application/pdf',
    storage_path: docPath,
    document_type: 'contract',
    parsing_status: 'manual',
  });

  // cancel any prior pending contract signature for this deal
  await supabaseAdmin
    .from('signature_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('partnership_id', c.partnership_id)
    .eq('doc_kind', 'contract')
    .eq('status', 'pending');

  const token = randomBytes(18).toString('base64url');
  const { data: sig, error: sErr } = await supabaseAdmin
    .from('signature_requests')
    .insert({
      token,
      partnership_id: c.partnership_id,
      account_id: c.account_id,
      agent_id: agentId,
      title,
      status: 'pending',
      document_storage_path: docPath,
      doc_kind: 'contract',
      signer_name: p?.brand_contact_name || null,
      signer_email: p?.brand_contact_email || null,
    })
    .select('id, token')
    .single();
  if (sErr || !sig) throw new Error(sErr?.message || 'failed to create signature request');

  await supabaseAdmin
    .from('contracts')
    .update({ status: 'sent', signature_request_id: sig.id, updated_at: new Date().toISOString() })
    .eq('id', contractId);

  return { signUrl: signUrlFor(sig.token) };
}
