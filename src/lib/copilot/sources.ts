/**
 * Retrieval for the association assistant. Calls the hybrid retriever
 * directly (not the sandwich bot's knowledge bundle, which mixes in pages
 * that bypass any filter) so association staff exclusions hold before the
 * model sees a single source.
 */
import { retrieveContext } from '@/lib/rag';
import type { RetrievedSource } from '@/lib/rag/types';

export interface CopilotSource {
  n: number;
  id: string;
  title: string;
  url: string | null;
  excerpt: string;
  entityType: string;
}

const MAX_SOURCES = 8;
const MAX_EXCERPT = 1200;

interface Canonical {
  host: string;
  path: string;
}

/** Lowercase, percent-decode, collapse repeated slashes, strip trailing slashes. */
function normalizePath(raw: string): string {
  let s = raw;
  try { s = decodeURIComponent(s); } catch { /* keep encoded form */ }
  s = s.toLowerCase().replace(/\/{2,}/g, '/');
  if (s.length > 1) s = s.replace(/\/+$/, '');
  if (s === '') s = '/';
  return s;
}

/**
 * Canonical host and path for a URL. Returns null when the string cannot be
 * parsed. A bare path ("/archive") is accepted with an empty host.
 */
function canonical(url: string): Canonical | null {
  try {
    const u = new URL(url);
    return { host: u.hostname.toLowerCase().replace(/^www\./, ''), path: normalizePath(u.pathname) };
  } catch {
    if (url.startsWith('/')) return { host: '', path: normalizePath(url.split(/[?#]/)[0]) };
    return null;
  }
}

/**
 * True when the page URL falls under a staff exclusion rule. An `http…` rule
 * matches by host and path prefix (scheme and www ignored). A `/…` rule matches
 * by path prefix. A page URL that cannot be parsed is excluded whenever any
 * rule exists (fail closed). A null URL is not excluded here; the caller
 * drops website sources without a URL.
 */
export function isExcluded(url: string | null, rules: string[]): boolean {
  if (!url) return false;
  const page = canonical(url);
  if (!page) return rules.length > 0;
  return rules.some((raw) => {
    if (typeof raw !== 'string') return false;
    const rule = raw.trim();
    if (!rule) return false;
    if (rule.toLowerCase().startsWith('http')) {
      const r = canonical(rule);
      return r !== null && r.host === page.host && page.path.startsWith(r.path);
    }
    if (rule.startsWith('/')) {
      const r = canonical(rule);
      return r !== null && page.path.startsWith(r.path);
    }
    return false;
  });
}

function urlOf(s: RetrievedSource): string | null {
  const v = (s.metadata as Record<string, unknown> | undefined)?.url;
  return typeof v === 'string' && v ? v : null;
}

export function toCopilotSources(raw: RetrievedSource[], rules: string[], max = MAX_SOURCES): CopilotSource[] {
  const seen = new Set<string>();
  const out: CopilotSource[] = [];
  for (const s of raw) {
    const url = urlOf(s);
    if (s.entityType === 'website' && !url) continue;
    if (isExcluded(url, rules)) continue;
    const c = url ? canonical(url) : null;
    const key = c ? `${c.host}|${c.path}` : `doc:${s.documentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ n: out.length + 1, id: s.sourceId, title: s.title || url || 'Untitled', url, excerpt: (s.excerpt || '').slice(0, MAX_EXCERPT), entityType: s.entityType });
    if (out.length >= max) break;
  }
  return out;
}

export async function retrieveAssociationSources(
  accountId: string, query: string, rules: string[],
  deps: { retrieve?: typeof retrieveContext } = {},
): Promise<CopilotSource[]> {
  const retrieve = deps.retrieve ?? retrieveContext;
  const { sources } = await retrieve({
    accountId, query, topK: 24, archetype: 'association', timeWindow: {},
    entityTypes: ['website', 'document', 'knowledge_base', 'post', 'transcription'],
  });
  return toCopilotSources(sources ?? [], rules);
}
