/**
 * Unified inbound quote ingestion — one core, three feeders (WhatsApp / email / manual).
 *
 * Flow: match the agent by sender identity → AI-parse the quote (text/PDF/image)
 * → match the influencer (the agent's client) by phone → create the quote
 * (partnership + signature request) → return a tailored ack for the feeder to send.
 * If no influencer matches, the inbound is held in the agent's inbox for review.
 */
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';
import { parseDocument } from '@/lib/ai-parser';
import { createQuote, signUrlFor } from '@/lib/crm/quotes';

export interface IngestAttachment {
  filename: string;
  mime: string;
  bytes: Uint8Array;
}

export interface IngestInput {
  channel: 'whatsapp' | 'email' | 'manual';
  sender: string; // email address or wa_id
  providerMessageId?: string | null;
  subject?: string | null;
  rawText?: string | null;
  attachments?: IngestAttachment[];
}

export interface IngestResult {
  ok: boolean;
  matched: boolean; // agent matched
  reason?: string;
  inboundId?: string;
  agentId?: string;
  needsClient?: boolean; // parsed but no influencer matched
  quote?: { signUrl: string; title: string; partnershipId: string };
  ackText?: string; // suggested reply for the feeder to send
}

const PHONE_RE = /(?:\+?972|0)(?:[-\s]?\d){8,9}/g;

async function matchAgent(channel: string, sender: string) {
  const q = supabaseAdmin
    .from('users')
    .select('id, full_name, contact_email, whatsapp, managed_account_ids, role, status, onboarding_completed');
  if (channel === 'email') {
    const { data } = await q.ilike('contact_email', sender).maybeSingle();
    return data;
  }
  const { data } = await q.eq('whatsapp', toWaId(sender)).maybeSingle();
  return data;
}

function collectPhones(text: string | null | undefined, extra: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const e of extra) if (e) set.add(toWaId(e));
  if (text) {
    for (const m of text.match(PHONE_RE) || []) set.add(toWaId(m));
  }
  return Array.from(set).filter((p) => p.length >= 9);
}

async function matchInfluencer(managedIds: string[], phones: string[]) {
  if (!managedIds?.length || !phones.length) return null;
  const { data: accts } = await supabaseAdmin
    .from('accounts')
    .select('id, config')
    .in('id', managedIds);
  for (const a of accts || []) {
    const accPhone = (a.config as any)?.phone;
    if (accPhone && phones.includes(toWaId(String(accPhone)))) return a;
  }
  return null;
}

export function deliverablesToStrings(d: any): string[] {
  if (!Array.isArray(d)) return [];
  return d
    .map((x) =>
      typeof x === 'string'
        ? x
        : [x?.quantity, x?.type, x?.platform, x?.description].filter(Boolean).join(' · ')
    )
    .filter(Boolean);
}

/** Map AI parsed_data → the common createQuote fields (reused by ingest + inbox convert). */
export function parsedToQuoteFields(parsed: any) {
  return {
    brandName: parsed?.brandName || 'מותג',
    campaignName: parsed?.campaignName || null,
    amount: typeof parsed?.totalAmount === 'number' ? parsed.totalAmount : null,
    currency: parsed?.currency || 'ILS',
    validUntil: parsed?.timeline?.endDate || null,
    deliverables: deliverablesToStrings(parsed?.deliverables),
    terms: Array.isArray(parsed?.specialTerms) ? parsed.specialTerms.join('\n') : parsed?.specialTerms || null,
    brandContactName: parsed?.contactPerson?.name || null,
    brandContactEmail: parsed?.contactPerson?.email || null,
    brandContactPhone: parsed?.contactPerson?.phone || null,
  };
}

export async function ingestQuote(input: IngestInput): Promise<IngestResult> {
  // 1) Match the agent. Unknown sender → fall through (no record, no reply).
  const agent = await matchAgent(input.channel, input.sender);
  if (!agent || agent.role !== 'agent' || agent.status !== 'active') {
    return { ok: true, matched: false, reason: 'no_agent' };
  }

  // 2) Dedupe by provider message id.
  if (input.providerMessageId) {
    const { data: dup } = await supabaseAdmin
      .from('crm_inbound_messages')
      .select('id')
      .eq('channel', input.channel)
      .eq('provider_message_id', input.providerMessageId)
      .maybeSingle();
    if (dup) return { ok: true, matched: true, agentId: agent.id, reason: 'duplicate', inboundId: dup.id };
  }

  // Record the inbound (pending).
  const { data: inbound } = await supabaseAdmin
    .from('crm_inbound_messages')
    .insert({
      channel: input.channel,
      agent_id: agent.id,
      sender: input.sender,
      provider_message_id: input.providerMessageId || null,
      subject: input.subject || null,
      raw_text: input.rawText || null,
      media_refs: (input.attachments || []).map((a) => ({ filename: a.filename, mime: a.mime })),
      parse_status: 'pending',
    })
    .select('id')
    .single();
  const inboundId = inbound?.id as string | undefined;

  // 3) AI-parse — prefer a PDF/image attachment, else the text body.
  let parsed: any = null;
  let confidence = 0;
  let model = 'manual';
  const att = (input.attachments || []).find((a) =>
    /pdf|image\//.test(a.mime)
  ) || (input.attachments || [])[0];
  try {
    let file: File;
    if (att) {
      file = new File([Buffer.from(att.bytes)], att.filename || 'quote', { type: att.mime });
    } else {
      file = new File([input.rawText || ''], 'quote.txt', { type: 'text/plain' });
    }
    const res = await parseDocument({ file, documentType: 'quote', language: 'he' });
    parsed = res?.data || null;
    confidence = res?.confidence || 0;
    model = (res as any)?.model || 'gemini';
  } catch (e: any) {
    if (inboundId) {
      await supabaseAdmin
        .from('crm_inbound_messages')
        .update({ parse_status: 'failed', error: String(e?.message || e) })
        .eq('id', inboundId);
    }
    return { ok: false, matched: true, agentId: agent.id, reason: 'parse_failed', inboundId };
  }

  // 4) Match the influencer (agent's client) by phone.
  const phones = collectPhones(input.rawText, [parsed?.contactPerson?.phone, parsed?.clientPhone]);
  const influencer = await matchInfluencer(agent.managed_account_ids || [], phones);

  const brandName = parsed?.brandName || input.subject || 'מותג';
  const amount = typeof parsed?.totalAmount === 'number' ? parsed.totalAmount : null;

  if (!influencer) {
    // Parsed but no client matched → hold for agent review.
    if (inboundId) {
      await supabaseAdmin
        .from('crm_inbound_messages')
        .update({ parse_status: 'parsed', parsed_data: parsed })
        .eq('id', inboundId);
    }
    return {
      ok: true,
      matched: true,
      agentId: agent.id,
      needsClient: true,
      inboundId,
      ackText: `קיבלתי הצעה מ-${brandName}${amount ? ` בסך ${amount.toLocaleString('en-US')} ₪` : ''}. לא זוהה לקוח תואם — היכנס/י ל-Bestie כדי לשייך ולשלוח לחתימה.`,
    };
  }

  // 5) Create the quote.
  try {
    const clientName = (influencer.config as any)?.display_name || (influencer.config as any)?.username || null;
    const result = await createQuote({
      agentId: agent.id,
      accountId: influencer.id,
      brandName,
      clientName,
      campaignName: parsed?.campaignName || null,
      amount,
      currency: parsed?.currency || 'ILS',
      validUntil: parsed?.timeline?.endDate || null,
      deliverables: deliverablesToStrings(parsed?.deliverables),
      terms: Array.isArray(parsed?.specialTerms) ? parsed.specialTerms.join('\n') : parsed?.specialTerms || null,
      notes: input.rawText || null,
      brandContactName: parsed?.contactPerson?.name || null,
      brandContactEmail: parsed?.contactPerson?.email || null,
      brandContactPhone: parsed?.contactPerson?.phone || null,
      agentName: agent.full_name,
      originalPdf: att && att.mime === 'application/pdf' ? att.bytes : null,
      originalMime: att?.mime || null,
      parsedData: { ...parsed, _confidence: confidence, _model: model },
    });

    if (inboundId) {
      await supabaseAdmin
        .from('crm_inbound_messages')
        .update({
          parse_status: 'parsed',
          parsed_data: parsed,
          partnership_id: result.partnershipId,
          signature_request_id: result.signatureRequestId,
        })
        .eq('id', inboundId);
    }

    return {
      ok: true,
      matched: true,
      agentId: agent.id,
      inboundId,
      quote: { signUrl: result.signUrl, title: result.title, partnershipId: result.partnershipId },
      ackText: `✅ נוצרה הצעה: ${result.title}${clientName ? ` (${clientName})` : ''}.\nקישור לחתימה: ${result.signUrl}`,
    };
  } catch (e: any) {
    if (inboundId) {
      await supabaseAdmin
        .from('crm_inbound_messages')
        .update({ parse_status: 'failed', parsed_data: parsed, error: String(e?.message || e) })
        .eq('id', inboundId);
    }
    return { ok: false, matched: true, agentId: agent.id, reason: 'quote_failed', inboundId };
  }
}

export { signUrlFor };
