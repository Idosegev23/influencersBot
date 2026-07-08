/**
 * Per-agent RAG ingestion for the WhatsApp advisory brain (spec §4.5C).
 * Embeds brief raw_text, voice transcripts, specialTerms, deliverable descriptions
 * and quote/contract bodies into crm_agent_embeddings with per-chunk meta so
 * retrieval can be filtered by agent/talent/brand/deal and NEVER leaks between agents.
 * Pure chunk building (buildAgentChunks) is separated from DB/LLM I/O for testing.
 *
 * Repo adaptations vs. plan: the embeddings table + match RPC are migration 063
 * (public.crm_agent_embeddings, vector(2000)); embeddings come from
 * generateEmbeddings (OpenAI text-embedding-3-large @2000d). An embedding is
 * stored as JSON.stringify(vec) so the ::vector cast in the RPC round-trips.
 */
import crypto from 'crypto';
import { generateEmbeddings } from '@/lib/rag/embeddings';

export type AgentIngestInput = {
  agentId: string;
  talentId?: string | null;
  brand?: string | null;
  dealId?: string | null;
  sourceType: string;      // brief | transcript | quote | contract | note | deliverable | special_term
  sourceId: string;
  date?: string | null;
  texts: { label?: string; text: string }[];
};
export type AgentChunk = {
  source_type: string; source_id: string; chunk_index: number; chunk_text: string; chunk_hash: string;
};

const MAX_CHUNK_CHARS = 4000;
const MIN_CHUNK_CHARS = 8;
const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');

/**
 * Pure: normalize whitespace, drop empty/tiny fragments, dedup by hash, cap length.
 * chunk_index is contiguous over the *kept* chunks (0-based).
 */
export function buildAgentChunks(input: AgentIngestInput): AgentChunk[] {
  const out: AgentChunk[] = [];
  const seen = new Set<string>();
  for (const t of input.texts || []) {
    const text = (t?.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHUNK_CHARS);
    if (text.length < MIN_CHUNK_CHARS) continue;
    const hash = md5(text);
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push({
      source_type: input.sourceType,
      source_id: input.sourceId,
      chunk_index: out.length,
      chunk_text: text,
      chunk_hash: hash,
    });
  }
  return out;
}

/** Thin wrapper over the repo embeddings helper (OpenAI text-embedding-3-large @2000d). */
export async function embedAgentTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  return generateEmbeddings(texts);
}

/**
 * Embed + upsert one source's chunks into crm_agent_embeddings.
 * Re-ingest semantics: delete this (agent, source_type, source_id)'s prior chunks,
 * then insert fresh — respects the dedup unique index
 * (agent_id, source_type, source_id, chunk_index).
 * DB client is injected as first arg so tests pass a fake.
 */
export async function ingestAgentSource(sb: any, input: AgentIngestInput): Promise<{ written: number }> {
  const chunks = buildAgentChunks(input);
  if (!chunks.length) return { written: 0 };
  const embeddings = await embedAgentTexts(chunks.map(c => c.chunk_text));
  const rows = chunks.map((c, i) => ({
    agent_id: input.agentId,
    talent_id: input.talentId ?? null,
    brand: input.brand ?? null,
    deal_id: input.dealId ?? null,
    source_type: c.source_type,
    source_id: c.source_id,
    chunk_index: c.chunk_index,
    chunk_text: c.chunk_text,
    chunk_hash: c.chunk_hash,
    embedding: JSON.stringify(embeddings[i]),
    source_date: input.date ?? null,
    metadata: { label: input.texts?.[i]?.label ?? null },
  }));
  // Re-ingest on every scan/update → replace this source's prior chunks, then insert.
  await sb.from('crm_agent_embeddings')
    .delete().eq('agent_id', input.agentId).eq('source_type', input.sourceType).eq('source_id', input.sourceId);
  const { error } = await sb.from('crm_agent_embeddings').insert(rows);
  if (error) throw new Error(`agent embed insert failed: ${error.message}`);
  return { written: rows.length };
}

const nameOfAccount = (cfg: any): string | null => cfg?.display_name || cfg?.username || null;

/** Embed a brief: raw_text (prefixed with brand/talent) + specialTerms + deliverables. */
export async function ingestBriefEmbeddings(sb: any, briefId: string): Promise<void> {
  const { data: b } = await sb.from('crm_inbound_messages')
    .select('id, agent_id, suggested_account_id, deal_id, subject, raw_text, parsed_data, created_at')
    .eq('id', briefId).maybeSingle();
  if (!b || !b.agent_id) return;
  const p = (b.parsed_data as any) || {};
  const brand = p.brandName || b.subject || null;
  let talentName: string | null = null;
  if (b.suggested_account_id) {
    const { data: acct } = await sb.from('accounts').select('config').eq('id', b.suggested_account_id).maybeSingle();
    talentName = nameOfAccount(acct?.config);
  }
  const terms: string[] = Array.isArray(p.specialTerms) ? p.specialTerms.filter(Boolean) : [];
  const dels: string[] = Array.isArray(p.deliverables)
    ? p.deliverables.map((d: any) => (typeof d === 'string' ? d : [d?.type, d?.description, d?.platform].filter(Boolean).join(' '))).filter(Boolean)
    : [];
  const texts = [
    b.raw_text ? { label: 'brief', text: `${brand ? brand + ' — ' : ''}${talentName ? talentName + ': ' : ''}${b.raw_text}` } : null,
    ...terms.map(t => ({ label: 'special_term', text: t })),
    ...dels.map(d => ({ label: 'deliverable', text: d })),
  ].filter(Boolean) as { label: string; text: string }[];
  await ingestAgentSource(sb, {
    agentId: b.agent_id, talentId: b.suggested_account_id ?? null, brand, dealId: b.deal_id ?? null,
    sourceType: 'brief', sourceId: b.id, date: b.created_at ?? null, texts,
  });
}

/** Embed a recorded deal / quote: brief body (prefixed with brand) + deliverables. */
export async function ingestDealEmbeddings(sb: any, partnershipId: string): Promise<void> {
  const { data: d } = await sb.from('partnerships')
    .select('id, agent_id, account_id, brand_name, brief, deliverables, created_at')
    .eq('id', partnershipId).maybeSingle();
  if (!d || !d.agent_id) return;
  const dels: string[] = Array.isArray(d.deliverables) ? d.deliverables.filter(Boolean) : [];
  const texts = [
    d.brief ? { label: 'quote', text: `${d.brand_name || ''} ${d.brief}`.trim() } : null,
    ...dels.map(x => ({ label: 'deliverable', text: String(x) })),
  ].filter(Boolean) as { label: string; text: string }[];
  await ingestAgentSource(sb, {
    agentId: d.agent_id, talentId: d.account_id ?? null, brand: d.brand_name ?? null, dealId: d.id,
    sourceType: 'quote', sourceId: d.id, date: d.created_at ?? null, texts,
  });
}

/** Embed a voice-note transcript (called by the P1 worker after transcription). */
export async function ingestTranscriptEmbedding(
  sb: any,
  args: { agentId: string; talentId?: string | null; brand?: string | null; dealId?: string | null; text: string; sourceId: string; date?: string | null }
): Promise<void> {
  if (!args.text?.trim()) return;
  await ingestAgentSource(sb, {
    agentId: args.agentId, talentId: args.talentId ?? null, brand: args.brand ?? null, dealId: args.dealId ?? null,
    sourceType: 'transcript', sourceId: args.sourceId, date: args.date ?? null, texts: [{ label: 'transcript', text: args.text }],
  });
}
