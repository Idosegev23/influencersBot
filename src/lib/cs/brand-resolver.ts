import { supabase as supabaseAdmin } from '@/lib/supabase';

export interface BrandCandidate {
  accountId: string;
  displayName: string;
  username: string;
  domain: string | null;
  score: number; // 0..1 fuzzy similarity — informational only: used to rank/narrow, never to gate.
}

export interface BrandResolution {
  kind: 'none' | 'single' | 'multi';
  candidates: BrandCandidate[];
}

// Brain-led sizing. The whole CS feature is brain-led — brand matching should be too: the LLM
// natively handles "ארגן"→Argania, "פאשה"→Studio Pasha, typos, and Hebrew/English. Code's job is
// to hand it CS-enabled candidates, not gatekeep with a hard similarity threshold.
//   - MAX_INLINE: at or below this many CS-enabled brands, return the WHOLE roster — no score
//     gate at all. The query is irrelevant to narrowing at this scale; the brain reads the full
//     list (injected into the system prompt too, see cs-context.ts) and disambiguates itself.
//   - TOP_K: once the roster exceeds MAX_INLINE, fuzzy-narrow to this many by trigram score so the
//     prompt/tool payload stays bounded. This is a shortlist, never a hard threshold cutoff.
export const MAX_INLINE = 25;
export const TOP_K = 12;

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function trigrams(s: string): Set<string> {
  const t = ` ${normalize(s)} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

// Dice coefficient over character trigrams: language-agnostic (works for Hebrew + English).
export function trigramSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

function toCandidate(row: any): BrandCandidate {
  const cfg = row.config || {};
  const domain = cfg.widget?.domain || cfg.domain || null;
  return {
    accountId: row.id,
    displayName: cfg.display_name || cfg.username || row.id,
    username: cfg.username || '',
    domain,
    score: 0,
  };
}

// Vocabulary strings a query is ranked against for one brand. `aliases` is OPTIONAL — an extra
// signal when a brand has hand-picked nicknames configured, never a dependency: display_name /
// username / domain alone are always enough for a brand to be findable and bindable.
function vocabularyOf(row: any): string[] {
  const cfg = row.config || {};
  const cs = cfg.whatsapp_cs || {};
  const vocab: string[] = [];
  if (cfg.display_name) vocab.push(cfg.display_name);
  if (cfg.username) vocab.push(cfg.username);
  if (Array.isArray(cs.aliases)) vocab.push(...cs.aliases); // optional extra signal, never required
  const domain = cfg.widget?.domain || cfg.domain;
  if (domain) vocab.push(String(domain).replace(/\.[a-z.]+$/i, '')); // strip TLD
  return vocab.filter(Boolean);
}

async function fetchCsEnabledRows(): Promise<any[]> {
  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('id, config')
    .filter('config->whatsapp_cs->>enabled', 'eq', 'true');
  if (error) {
    console.warn('[brand-resolver] fetch failed', error);
    return [];
  }
  return (data as any[]) || [];
}

// Shared loader for both resolveBrand() and the unbound system-prompt injection (cs-context.ts) —
// DRY: one DB-scoped source of truth for "which brands is Bestie CS allowed to talk about".
// Scores are always 0 here — there's no query to rank against yet.
export async function listCsEnabledBrands(): Promise<BrandCandidate[]> {
  const rows = await fetchCsEnabledRows();
  return rows.map(toCandidate);
}

// Returning-memory preference (§6.3 step #1) wins near-ties (within 0.05 score); otherwise raw
// fuzzy score orders the list. This ordering is informational for the brain — never a gate — but
// it does guarantee a previously-engaged brand isn't silently dropped by the TOP_K narrowing below.
function orderCandidates(candidates: BrandCandidate[], prefer: Set<string>): BrandCandidate[] {
  return [...candidates].sort((a, b) => {
    const ap = prefer.has(a.accountId) ? 1 : 0;
    const bp = prefer.has(b.accountId) ? 1 : 0;
    if (Math.abs(a.score - b.score) < 0.05 && ap !== bp) return bp - ap;
    return b.score - a.score;
  });
}

export async function resolveBrand(
  query: string,
  opts?: { preferAccountIds?: string[] },
): Promise<BrandResolution> {
  const rows = await fetchCsEnabledRows();
  if (rows.length === 0) return { kind: 'none', candidates: [] };

  const q = normalize(query);
  const prefer = new Set(opts?.preferAccountIds || []);
  const scored: BrandCandidate[] = rows.map((row) => {
    const c = toCandidate(row);
    c.score = q ? Math.max(0, ...vocabularyOf(row).map((v) => trigramSimilarity(q, v))) : 0;
    return c;
  });

  // Small roster: hand the brain EVERYTHING, no score gate — it disambiguates from the shopper's
  // message and conversation context far better than a code-side trigram threshold ever could.
  if (scored.length <= MAX_INLINE) {
    const candidates = orderCandidates(scored, prefer);
    return { kind: candidates.length === 1 ? 'single' : 'multi', candidates };
  }

  // Large roster: fuzzy-narrow to a bounded shortlist so the prompt/tool payload stays small — a
  // top-K cut by score, never a hard threshold that could exclude the brand the shopper meant.
  const candidates = orderCandidates(scored, prefer).slice(0, TOP_K);
  return { kind: candidates.length === 1 ? 'single' : 'multi', candidates };
}
