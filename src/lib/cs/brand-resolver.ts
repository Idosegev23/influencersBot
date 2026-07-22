import { supabase as supabaseAdmin } from '@/lib/supabase';

export interface BrandCandidate {
  accountId: string;
  displayName: string;
  username: string;
  domain: string | null;
  score: number; // 0..1 fuzzy similarity
}

export interface BrandResolution {
  kind: 'none' | 'single' | 'multi';
  candidates: BrandCandidate[];
}

// Confidence cut-offs for the disambiguation policy (§6.3).
const MATCH_THRESHOLD = 0.34; // below this a term is not a candidate at all
const SINGLE_THRESHOLD = 0.62; // one candidate this strong AND clear of #2 → confirm directly
const MAX_MULTI = 5; // interactive list cap

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

// Vocabulary strings a query is matched against for one brand.
function vocabularyOf(row: any): string[] {
  const cfg = row.config || {};
  const cs = cfg.whatsapp_cs || {};
  const vocab: string[] = [];
  if (cfg.display_name) vocab.push(cfg.display_name);
  if (cfg.username) vocab.push(cfg.username);
  if (Array.isArray(cs.aliases)) vocab.push(...cs.aliases);
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

// Vocabulary source for callers that need the full CS-enabled brand list
// (e.g. building an admin picker). Scores are always 0 here — no query to match against.
export async function listCsEnabledBrands(): Promise<BrandCandidate[]> {
  const rows = await fetchCsEnabledRows();
  return rows.map(toCandidate);
}

export async function resolveBrand(
  query: string,
  opts?: { preferAccountIds?: string[] },
): Promise<BrandResolution> {
  const q = normalize(query);
  if (!q) return { kind: 'none', candidates: [] };

  const rows = await fetchCsEnabledRows();
  const prefer = new Set(opts?.preferAccountIds || []);

  const scored: BrandCandidate[] = rows
    .map((row) => {
      const best = Math.max(0, ...vocabularyOf(row).map((v) => trigramSimilarity(q, v)));
      const c = toCandidate(row);
      c.score = best;
      return c;
    })
    .filter((c) => c.score >= MATCH_THRESHOLD)
    .sort((a, b) => {
      // Returning-memory preference wins ties (and near-ties within 0.05).
      const ap = prefer.has(a.accountId) ? 1 : 0;
      const bp = prefer.has(b.accountId) ? 1 : 0;
      if (Math.abs(a.score - b.score) < 0.05 && ap !== bp) return bp - ap;
      return b.score - a.score;
    })
    .slice(0, MAX_MULTI);

  if (scored.length === 0) return { kind: 'none', candidates: [] };

  const top = scored[0];
  const second = scored[1];
  const clearLead = !second || top.score - second.score >= 0.12;
  if (scored.length === 1 || (top.score >= SINGLE_THRESHOLD && clearLead)) {
    return { kind: 'single', candidates: [top] };
  }
  return { kind: 'multi', candidates: scored };
}
