/**
 * Read-only, agent-scoped fact tools for the advisory brain (spec §4.5B).
 * SQL for numbers (ground truth), search_context for meaning. NOTHING here mutates.
 * Every function hard-filters .eq('agent_id', agentId) — the tenant boundary.
 */
import { generateEmbedding } from '@/lib/rag/embeddings';

const sinceIso = (months?: number) =>
  months ? new Date(Date.now() - months * 30 * 24 * 3600 * 1000).toISOString() : null;
// A signed/won CRM deal = partnerships.status 'active' — that's what the signature-completion
// handler sets (signatures/[token]/sign → status:'active'). ('signed' never existed in the status
// CHECK constraint, so the old value silently matched nothing.)
const SIGNED = 'active';

export async function countContracts(
  sb: any,
  agentId: string,
  opts: { talentId?: string; sinceMonths?: number; status?: string } = {}
): Promise<{ count: number }> {
  let q = sb.from('partnerships').select('id, agent_id, account_id, status, created_at').eq('agent_id', agentId);
  if (opts.talentId) q = q.eq('account_id', opts.talentId);
  if (opts.status) q = q.eq('status', opts.status);
  const since = sinceIso(opts.sinceMonths);
  if (since) q = q.gte('created_at', since);
  const { data } = await q;
  return { count: (data || []).length };
}

export async function listContracts(
  sb: any,
  agentId: string,
  opts: { talentId?: string; sinceMonths?: number; limit?: number } = {}
): Promise<{ rows: { brand: string; amount: number; status: string; date: string }[]; total: number }> {
  let q = sb.from('partnerships')
    .select('id, agent_id, account_id, brand_name, status, contract_amount, proposal_amount, proposal_date, created_at')
    .eq('agent_id', agentId).order('created_at', { ascending: false });
  if (opts.talentId) q = q.eq('account_id', opts.talentId);
  const since = sinceIso(opts.sinceMonths);
  if (since) q = q.gte('created_at', since);
  if (opts.limit) q = q.limit(opts.limit);
  const { data } = await q;
  const rows = (data || []).map((p: any) => ({
    brand: p.brand_name || 'מותג',
    amount: Number(p.contract_amount ?? p.proposal_amount ?? 0),
    status: p.status,
    date: (p.proposal_date || p.created_at || '').slice(0, 10),
  }));
  return { rows, total: rows.reduce((s: number, r: any) => s + r.amount, 0) };
}

export async function sumSales(
  sb: any,
  agentId: string,
  opts: { talentId?: string; brand?: string; sinceMonths?: number; signedOnly?: boolean } = {}
): Promise<{ total: number; count: number; currency: string }> {
  let q = sb.from('partnerships')
    .select('agent_id, account_id, brand_name, status, contract_amount, proposal_amount, currency, created_at')
    .eq('agent_id', agentId);
  if (opts.talentId) q = q.eq('account_id', opts.talentId);
  if (opts.signedOnly) q = q.eq('status', SIGNED);
  const since = sinceIso(opts.sinceMonths);
  if (since) q = q.gte('created_at', since);
  const { data } = await q;
  let rows = data || [];
  if (opts.brand) rows = rows.filter((r: any) => String(r.brand_name || '').includes(opts.brand!));
  const total = rows.reduce((s: number, r: any) => s + Number(r.contract_amount ?? r.proposal_amount ?? 0), 0);
  return { total, count: rows.length, currency: rows[0]?.currency || 'ILS' };
}

export async function getQuoteDetails(
  sb: any,
  agentId: string,
  opts: { dealId?: string; talentId?: string }
): Promise<{ brand: string; lineItems: { deliverable: string; qty: number; unit_price: number }[]; total: number } | null> {
  let dealId = opts.dealId || null;
  if (!dealId && opts.talentId) {
    const { data } = await sb.from('partnerships').select('id').eq('agent_id', agentId).eq('account_id', opts.talentId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    dealId = data?.id || null;
  }
  if (!dealId) return null;
  const { data: p } = await sb.from('partnerships')
    .select('id, agent_id, brand_name, contract_amount, proposal_amount')
    .eq('id', dealId).eq('agent_id', agentId).maybeSingle();
  if (!p) return null;
  const { data: items } = await sb.from('deal_line_items').select('deliverable_type, qty, unit_price').eq('partnership_id', dealId);
  return {
    brand: p.brand_name || 'מותג',
    lineItems: (items || []).map((li: any) => ({
      deliverable: li.deliverable_type || 'תוצר',
      qty: Number(li.qty) || 1,
      unit_price: Number(li.unit_price) || 0,
    })),
    total: Number(p.contract_amount ?? p.proposal_amount ?? 0),
  };
}

export async function talentStats(
  sb: any,
  agentId: string,
  talentId: string
): Promise<{ name: string; deals: number; signed: number; totalSales: number; avgDeal: number }> {
  const { data: acct } = await sb.from('accounts').select('config').eq('id', talentId).maybeSingle();
  const name = (acct?.config as any)?.display_name || (acct?.config as any)?.username || 'המיוצג';
  const { data } = await sb.from('partnerships').select('status, contract_amount, proposal_amount')
    .eq('agent_id', agentId).eq('account_id', talentId);
  const rows = data || [];
  const signed = rows.filter((r: any) => r.status === SIGNED);
  const totalSales = signed.reduce((s: number, r: any) => s + Number(r.contract_amount ?? r.proposal_amount ?? 0), 0);
  return {
    name,
    deals: rows.length,
    signed: signed.length,
    totalSales,
    avgDeal: signed.length ? Math.round(totalSales / signed.length) : 0,
  };
}

export async function pipelineStatus(
  sb: any,
  agentId: string
): Promise<{ new: number; priced: number; sent: number; signed: number }> {
  const { data } = await sb.from('crm_inbound_messages').select('brief_status').eq('agent_id', agentId);
  const rows = data || [];
  const c = (s: string) => rows.filter((r: any) => r.brief_status === s).length;
  return { new: c('new') + c('assigned'), priced: c('priced'), sent: c('sent'), signed: c('signed') };
}

// Statuses that mean the brief is still "in the agent's inbox" (not yet a sent/signed quote).
const OPEN_BRIEF_STATUSES = ['new', 'assigned', 'priced'];
const snippet = (s: any, n = 140) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const briefBrand = (pd: any, subject?: any) =>
  (pd?.brand || pd?.brand_name || pd?.company || pd?.advertiser || subject || null) || null;

/**
 * List the OPEN briefs sitting in the agent's inbox (new/assigned/priced — not yet sent/signed),
 * newest first, with brand + a text snippet + the matched talent name (if any) + whether it's
 * already priced. This is the "what's on my plate" tool — pipeline_status gives counts, this gives
 * the actual items. Talent names are resolved from accounts.config so the answer is human-readable.
 */
export async function listOpenBriefs(
  sb: any,
  agentId: string,
  opts: { limit?: number } = {}
): Promise<{ rows: { brand: string | null; snippet: string; status: string; talent: string | null; priced: boolean; date: string }[]; total: number }> {
  const { data } = await sb.from('crm_inbound_messages')
    .select('id, raw_text, subject, parsed_data, brief_status, suggested_account_id, partnership_id, deal_id, created_at')
    .eq('agent_id', agentId)
    .in('brief_status', OPEN_BRIEF_STATUSES)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 25);
  const rows = data || [];
  // Resolve talent names in one shot (tenant-safe: ids come from this agent's own briefs).
  const ids = Array.from(new Set(rows.map((r: any) => r.suggested_account_id).filter(Boolean)));
  const nameById: Record<string, string> = {};
  if (ids.length) {
    const { data: accts } = await sb.from('accounts').select('id, config').in('id', ids);
    for (const a of accts || []) nameById[a.id] = String((a.config as any)?.display_name || (a.config as any)?.username || '');
  }
  return {
    rows: rows.map((r: any) => ({
      brand: briefBrand(r.parsed_data, r.subject),
      snippet: snippet(r.raw_text || r.subject),
      status: r.brief_status,
      talent: r.suggested_account_id ? (nameById[r.suggested_account_id] || null) : null,
      priced: !!(r.partnership_id || r.deal_id),
      date: (r.created_at || '').slice(0, 10),
    })),
    total: rows.length,
  };
}

/**
 * List briefs the agent hasn't been able to ASSOCIATE to a talent yet — "לא ברור למי לשייך".
 * These are open briefs with no matched talent (suggested_account_id is null). Newest first.
 */
export async function listUnassigned(
  sb: any,
  agentId: string,
  opts: { limit?: number } = {}
): Promise<{ rows: { brand: string | null; snippet: string; status: string; date: string }[]; total: number }> {
  const { data } = await sb.from('crm_inbound_messages')
    .select('id, raw_text, subject, parsed_data, brief_status, created_at')
    .eq('agent_id', agentId)
    .in('brief_status', OPEN_BRIEF_STATUSES)
    .is('suggested_account_id', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 25);
  const rows = data || [];
  return {
    rows: rows.map((r: any) => ({
      brand: briefBrand(r.parsed_data, r.subject),
      snippet: snippet(r.raw_text || r.subject),
      status: r.brief_status,
      date: (r.created_at || '').slice(0, 10),
    })),
    total: rows.length,
  };
}

export async function revenueByPeriod(
  sb: any,
  agentId: string,
  opts: { granularity: 'month' | 'week'; sinceMonths?: number }
): Promise<{ buckets: { period: string; total: number; count: number }[] }> {
  const since = sinceIso(opts.sinceMonths ?? 12);
  let q = sb.from('partnerships').select('status, contract_amount, proposal_amount, proposal_date, created_at')
    .eq('agent_id', agentId).eq('status', SIGNED);
  if (since) q = q.gte('created_at', since);
  const { data } = await q;
  const bucket: Record<string, { total: number; count: number }> = {};
  for (const r of data || []) {
    const d = new Date((r as any).proposal_date || (r as any).created_at);
    const key = opts.granularity === 'week'
      ? `${d.getFullYear()}-W${Math.ceil((((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1) / 7)}`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    bucket[key] ??= { total: 0, count: 0 };
    bucket[key].total += Number((r as any).contract_amount ?? (r as any).proposal_amount ?? 0);
    bucket[key].count += 1;
  }
  return {
    buckets: Object.entries(bucket)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => ({ period, ...v })),
  };
}

export async function searchContext(
  sb: any,
  agentId: string,
  query: string,
  filters: { talentId?: string; brand?: string; dealId?: string; sourceTypes?: string[]; sinceMonths?: number; limit?: number } = {}
): Promise<{ chunk_text: string; source_type: string; brand: string | null; similarity: number }[]> {
  const emb = await generateEmbedding(query);
  if (!emb) return [];
  const { data } = await sb.rpc('match_agent_embeddings', {
    p_agent_id: agentId,
    p_embedding: JSON.stringify(emb),
    p_match_count: filters.limit ?? 12,
    p_threshold: 0.20,
    p_talent_id: filters.talentId ?? null,
    p_brand: filters.brand ?? null,
    p_deal_id: filters.dealId ?? null,
    p_source_types: filters.sourceTypes ?? null,
    p_since: sinceIso(filters.sinceMonths),
  });
  return (data || []).map((r: any) => ({
    chunk_text: r.chunk_text,
    source_type: r.source_type,
    brand: r.brand,
    similarity: r.similarity,
  }));
}

export const AGENT_TOOL_SCHEMAS = [
  { name: 'count_contracts', description: 'ספירת עסקאות/חוזים של מיוצג או של כל הרוסטר, אופציונלית בטווח חודשים או לפי סטטוס.',
    parameters: { type: 'object', properties: { talentId: { type: 'string' }, sinceMonths: { type: 'number' }, status: { type: 'string' } } } },
  { name: 'list_contracts', description: 'רשימת עסקאות עם מותג/סכום/סטטוס/תאריך + סכום כולל.',
    parameters: { type: 'object', properties: { talentId: { type: 'string' }, sinceMonths: { type: 'number' }, limit: { type: 'number' } } } },
  { name: 'sum_sales', description: 'סכום מכירות (חתומות אם signedOnly) למיוצג/מותג/טווח.',
    parameters: { type: 'object', properties: { talentId: { type: 'string' }, brand: { type: 'string' }, sinceMonths: { type: 'number' }, signedOnly: { type: 'boolean' } } } },
  { name: 'get_quote_details', description: 'פירוט שורות הצעה (תוצרים, כמות, מחיר) + סכום, לפי dealId או המיוצג.',
    parameters: { type: 'object', properties: { dealId: { type: 'string' }, talentId: { type: 'string' } } } },
  { name: 'talent_stats', description: 'סטטיסטיקות מיוצג: מספר עסקאות, חתומות, מכירות, ממוצע.',
    parameters: { type: 'object', properties: { talentId: { type: 'string' } }, required: ['talentId'] } },
  { name: 'pipeline_status', description: 'תמונת פייפליין: כמה חדשים/מתומחרים/נשלחו/נחתמו (ספירות בלבד).',
    parameters: { type: 'object', properties: {} } },
  { name: 'list_open_briefs', description: 'רשימת הבריפים הפתוחים שעל השולחן (חדש/משויך/מתומחר, טרם נשלחו/נחתמו) — מותג, תקציר, המיוצג המשויך, והאם כבר תומחר. זה הכלי ל"מה פתוח לי / תעשי לי סדר".',
    parameters: { type: 'object', properties: { limit: { type: 'number' } } } },
  { name: 'list_unassigned', description: 'בריפים פתוחים שעדיין לא ברור למי לשייך (אין מיוצג משויך) — מותג + תקציר. זה הכלי ל"אילו הצעות/בריפים לא ברור לשייך".',
    parameters: { type: 'object', properties: { limit: { type: 'number' } } } },
  { name: 'revenue_by_period', description: 'הכנסות לפי חודש/שבוע.',
    parameters: { type: 'object', properties: { granularity: { type: 'string', enum: ['month', 'week'] }, sinceMonths: { type: 'number' } }, required: ['granularity'] } },
  { name: 'search_context', description: 'חיפוש סמנטי בבריפים/תמלולים/הצעות (משמעות ותוכן, לא מספרים).',
    parameters: { type: 'object', properties: { query: { type: 'string' }, talentId: { type: 'string' }, brand: { type: 'string' }, dealId: { type: 'string' }, sourceTypes: { type: 'array', items: { type: 'string' } }, sinceMonths: { type: 'number' } }, required: ['query'] } },
] as const;

const DISPATCH: Record<string, (sb: any, agentId: string, args: any) => Promise<any>> = {
  count_contracts: (sb, a, x) => countContracts(sb, a, x),
  list_contracts: (sb, a, x) => listContracts(sb, a, x),
  sum_sales: (sb, a, x) => sumSales(sb, a, x),
  get_quote_details: (sb, a, x) => getQuoteDetails(sb, a, x),
  talent_stats: (sb, a, x) => talentStats(sb, a, x.talentId),
  pipeline_status: (sb, a) => pipelineStatus(sb, a),
  list_open_briefs: (sb, a, x) => listOpenBriefs(sb, a, x),
  list_unassigned: (sb, a, x) => listUnassigned(sb, a, x),
  revenue_by_period: (sb, a, x) => revenueByPeriod(sb, a, x),
  search_context: (sb, a, x) => searchContext(sb, a, x.query, x),
};

export async function runTool(sb: any, agentId: string, name: string, args: any): Promise<any> {
  const fn = DISPATCH[name];
  if (!fn) throw new Error(`unknown tool: ${name}`);
  return fn(sb, agentId, args || {});
}
