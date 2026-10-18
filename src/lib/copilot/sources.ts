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

export function isExcluded(url: string | null, rules: string[]): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  let path = '';
  try { path = new URL(url).pathname.toLowerCase(); } catch { path = ''; }
  return rules.some((raw) => {
    if (typeof raw !== 'string' || !raw) return false;
    const r = raw.toLowerCase().replace(/\/+$/, '');
    if (r.startsWith('http')) return u.startsWith(r);
    if (r.startsWith('/')) return path.startsWith(r);
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
    const key = url ?? `doc:${s.documentId}`;
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
    entityTypes: ['website', 'document', 'knowledge_base', 'post', 'transcription'] as any,
  });
  return toCopilotSources(sources ?? [], rules);
}
