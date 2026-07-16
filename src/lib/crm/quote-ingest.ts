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
import { signUrlFor } from '@/lib/crm/quotes';
import { pickInfluencerAccount } from '@/lib/crm/match-influencer';

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

async function matchInfluencer(managedIds: string[], phones: string[], text?: string | null) {
  if (!managedIds?.length) return null;
  const { data: accts } = await supabaseAdmin
    .from('accounts')
    .select('id, config')
    .in('id', managedIds);
  // Phone when present (strong), else the influencer's name in the brief text.
  return pickInfluencerAccount((accts || []) as any[], phones, text);
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
    // Defense in depth: parsed_data is stored with `{...parsed}` below — if the parser ever hands
    // back an ARRAY, that spread becomes {"0":{...}} and silently hides every extracted field.
    if (Array.isArray(parsed)) parsed = (parsed as any[]).find((x) => x && typeof x === 'object') || null;
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

  // 4) Suggest the influencer — name when present, else phone. The AGENT confirms.
  //    We do NOT auto-create a quote here: pricing each deliverable requires the
  //    agent's judgement (human-in-the-loop). The inbound becomes a "brief".
  const phones = collectPhones(input.rawText, [parsed?.contactPerson?.phone, parsed?.clientPhone]);
  const nameHay = [input.rawText, input.subject, parsed?.influencerName, parsed?.talentName]
    .filter(Boolean)
    .join(' \n ');
  let influencer = await matchInfluencer(agent.managed_account_ids || [], phones, nameHay);
  // Fuzzy fallback — the exact-substring matcher misses a name the brand spelled slightly off
  // ("סהר קרן"/"אנה ארונוב"). Resolve the parsed talent name against the roster (Hebrew-tolerant).
  if (!influencer && (agent.managed_account_ids || []).length) {
    const candidate = String(parsed?.influencerName || parsed?.talentName || '').trim();
    if (candidate.length >= 2) {
      const { data: accts } = await supabaseAdmin.from('accounts').select('id, config').in('id', agent.managed_account_ids);
      const roster = (accts || []).map((a: any) => ({ id: a.id, name: (a.config as any)?.display_name || (a.config as any)?.username || '' }));
      const { resolveTalent } = await import('@/lib/crm/wa-interpret');
      const m = resolveTalent(candidate, roster);
      if (m && !m.ambiguous) influencer = (accts || []).find((a: any) => a.id === m.id) || null;
    }
  }

  const brandName = parsed?.brandName || input.subject || 'מותג';
  const amount = typeof parsed?.totalAmount === 'number' ? parsed.totalAmount : null;
  const clientName = influencer
    ? (influencer.config as any)?.display_name || (influencer.config as any)?.username || null
    : null;

  // Record the parsed brief + the suggested influencer for the agent to confirm & price.
  if (inboundId) {
    await supabaseAdmin
      .from('crm_inbound_messages')
      .update({
        parse_status: 'parsed',
        parsed_data: { ...parsed, _confidence: confidence, _model: model },
        suggested_account_id: influencer?.id ?? null,
        brief_status: influencer ? 'assigned' : 'new',
      })
      .eq('id', inboundId);
  }

  const amountHint = amount ? ` (~${amount.toLocaleString('en-US')} ₪)` : '';
  return {
    ok: true,
    matched: true,
    agentId: agent.id,
    inboundId,
    needsClient: !influencer,
    ackText: influencer
      ? `📥 התקבל בריף מ-${brandName}${amountHint} עבור ${clientName}.\nהיכנס/י ל-Bestie כדי לתמחר כל תוצר ולשלוח הצעה.`
      : `📥 התקבל בריף מ-${brandName}${amountHint}. לא זוהה מיוצג תואם — היכנס/י ל-Bestie לשייך, לתמחר ולשלוח.`,
  };
}

export { signUrlFor };
