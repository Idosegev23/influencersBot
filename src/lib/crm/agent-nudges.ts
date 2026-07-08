/**
 * Proactivity for the WhatsApp advisory brain (spec §4.5E).
 *
 * Pure predicates (stuckSignatureNudge / unpricedBriefNudge / buildDigestText) carry
 * NO DB/LLM import so they unit-test without mocks. The DB helpers below take an
 * injected `sb` client (first arg) and reuse the READ-ONLY agent-tools — nothing here
 * mutates the money/deal tables. Nudges are proposals only; a "do it" reply (Task 9)
 * flips them open → done.
 */
import { pipelineStatus, sumSales, searchContext } from '@/lib/crm/agent-tools';

const DAY = 24 * 3600 * 1000;

// ── Pure predicates ─────────────────────────────────────────────────────────

/** A signature request pending > `days` with no reminder inside the cadence → nudge. */
export function stuckSignatureNudge(
  sig: { created_at: string; status: string; last_reminder_at?: string | null },
  now: number,
  days = 3,
): { due: boolean } {
  if (sig.status !== 'pending') return { due: false };
  const age = now - Date.parse(sig.created_at);
  if (age < days * DAY) return { due: false };
  if (sig.last_reminder_at && now - Date.parse(sig.last_reminder_at) < days * DAY) return { due: false };
  return { due: true };
}

/** A brief still un-priced (new/assigned) older than `days` → nudge to price it. */
export function unpricedBriefNudge(
  brief: { created_at: string; brief_status: string },
  now: number,
  days = 2,
): { due: boolean } {
  if (!['new', 'assigned'].includes(brief.brief_status)) return { due: false };
  return { due: now - Date.parse(brief.created_at) >= days * DAY };
}

/** Compose the morning/weekly digest text (Hebrew, no buttons — free-form reply). */
export function buildDigestText(
  stats: { quotes: number; sales: number; awaitingPricing: number; viewedUnsigned: number },
  mode: 'morning' | 'weekly',
): string {
  const head = mode === 'morning' ? 'בוקר טוב ☀️ עדכון היום:' : 'סיכום שבועי 📊:';
  return [
    head,
    `• הצעות פעילות: ${stats.quotes}`,
    `• מכירות חתומות: ${stats.sales.toLocaleString('en-US')} ₪`,
    `• בריפים ממתינים לתמחור: ${stats.awaitingPricing}`,
    `• הצעות שנצפו ולא נחתמו: ${stats.viewedUnsigned}`,
    'רוצה שאשלח תזכורת על אחת מההצעות? כתוב/י לי.',
  ].join('\n');
}

// ── DB helpers (injected sb) — READ-ONLY except persistNudge (queue only) ─────

/** Signature requests for the agent that are stuck past cadence. */
export async function detectStuckSignatures(sb: any, agentId: string, now = Date.now()) {
  const { data } = await sb.from('signature_requests')
    .select('id, created_at, status, last_reminder_at, title, partnership_id')
    .eq('agent_id', agentId).eq('status', 'pending');
  return (data || []).filter((s: any) => stuckSignatureNudge(s, now).due);
}

/** Inbound briefs that have been sitting un-priced too long. */
export async function detectUnpricedBriefs(sb: any, agentId: string, now = Date.now()) {
  const { data } = await sb.from('crm_inbound_messages')
    .select('id, created_at, brief_status, subject')
    .eq('agent_id', agentId).in('brief_status', ['new', 'assigned']);
  return (data || []).filter((b: any) => unpricedBriefNudge(b, now).due);
}

/** Find past deals/quotes semantically similar to a new brief (helps pricing). */
export async function detectSimilarBrief(sb: any, agentId: string, briefId: string) {
  const { data: b } = await sb.from('crm_inbound_messages').select('raw_text').eq('id', briefId).maybeSingle();
  if (!b?.raw_text) return [];
  return searchContext(sb, agentId, b.raw_text, { sourceTypes: ['quote'], limit: 3 });
}

/** Insert a nudge, deduped by (agent_id, dedup_key). Queue write only — no money mutation. */
export async function persistNudge(
  sb: any,
  n: { agentId: string; kind: string; subjectType?: string; subjectId?: string; payload?: any; dedupKey: string },
): Promise<void> {
  await sb.from('crm_agent_nudges').upsert(
    {
      agent_id: n.agentId,
      kind: n.kind,
      subject_type: n.subjectType ?? null,
      subject_id: n.subjectId ?? null,
      payload: n.payload ?? {},
      status: 'open',
      dedup_key: n.dedupKey,
    },
    { onConflict: 'agent_id,dedup_key', ignoreDuplicates: true },
  );
}

/** Compose a digest for one agent from the read-only fact tools. */
export async function dispatchDigest(sb: any, agentId: string, mode: 'morning' | 'weekly'): Promise<string> {
  const pipe = await pipelineStatus(sb, agentId);
  const sales = await sumSales(sb, agentId, { signedOnly: true, sinceMonths: mode === 'weekly' ? 12 : 1 });
  return buildDigestText(
    { quotes: pipe.priced + pipe.sent, sales: sales.total, awaitingPricing: pipe.new, viewedUnsigned: pipe.sent },
    mode,
  );
}
