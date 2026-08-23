/**
 * Stage 1: classify every settled, unclassified session for one account.
 *
 * Idempotent by construction — the selection query excludes sessions that
 * already have a row, and `conversation_classifications.session_id` is UNIQUE,
 * so a concurrent run collides at the DB rather than double-billing.
 *
 * A retro backfill is this same function with a wider `sinceIso`. There is no
 * separate backfill code path.
 */

import { supabase } from '@/lib/supabase';
import { buildProductIndex, type CatalogProduct, type ProductIndex } from './product-resolver';
import { classifySession, type ClassificationRow, type SessionForClassification } from './classify';
import { callClassifyModel } from './openai-call';

export const DEFAULT_BUDGET_USD = 5;
export const SETTLE_MINUTES = 30;
export const MAX_ATTEMPTS = 3;

export function channelOf(anonId: string | null | undefined): 'web' | 'whatsapp' | 'instagram' | 'unknown' {
  if (!anonId) return 'unknown';
  if (anonId.startsWith('wa_')) return 'whatsapp';
  if (anonId.startsWith('ig_')) return 'instagram';
  return 'web';
}

export interface RunDeps {
  fetchPendingSessions: (accountId: string, sinceIso: string | undefined, limit: number) => Promise<SessionForClassification[]>;
  fetchCatalog: (accountId: string) => Promise<CatalogProduct[]>;
  classify: (s: SessionForClassification, index: ProductIndex) => Promise<ClassificationRow>;
  saveRows: (rows: ClassificationRow[]) => Promise<number>;
}

export async function runClassification(opts: {
  accountId: string;
  sinceIso?: string;
  limit?: number;
  budgetUsd?: number;
  deps?: Partial<RunDeps>;
}): Promise<{ classified: number; skipped: number; failed: number; spentUsd: number; stoppedOnBudget: boolean }> {
  const limit = opts.limit ?? 300;
  const budget = opts.budgetUsd ?? DEFAULT_BUDGET_USD;
  const deps: RunDeps = { ...defaultDeps(), ...(opts.deps || {}) } as RunDeps;

  const sessions = await deps.fetchPendingSessions(opts.accountId, opts.sinceIso, limit);
  if (!sessions.length) {
    return { classified: 0, skipped: 0, failed: 0, spentUsd: 0, stoppedOnBudget: false };
  }

  const index = buildProductIndex(await deps.fetchCatalog(opts.accountId));

  const rows: ClassificationRow[] = [];
  let spentUsd = 0;
  let stoppedOnBudget = false;

  for (const s of sessions) {
    if (spentUsd >= budget) { stoppedOnBudget = true; break; }
    const row = await deps.classify(s, index);
    spentUsd += row.cost_usd || 0;
    rows.push(row);
  }

  if (rows.length) await deps.saveRows(rows);

  const failed = rows.filter((r) => r.status === 'failed').length;
  return {
    classified: rows.length - failed,
    skipped: sessions.length - rows.length,
    failed,
    spentUsd,
    stoppedOnBudget,
  };
}

function defaultDeps(): RunDeps {
  return {
    async fetchPendingSessions(accountId, sinceIso, limit) {
      const settledBefore = new Date(Date.now() - SETTLE_MINUTES * 60_000).toISOString();

      let q = supabase
        .from('chat_sessions')
        .select('id, anon_id, created_at, last_turn_at, chat_messages(role, content, intent, created_at)')
        .eq('account_id', accountId)
        .lt('last_turn_at', settledBefore)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (sinceIso) q = q.gte('created_at', sinceIso);

      const { data, error } = await q;
      if (error) throw new Error(`fetchPendingSessions: ${error.message}`);

      const ids = (data || []).map((s: any) => s.id);
      if (!ids.length) return [];

      // Exclude anything already classified, or failed past the attempt cap.
      const { data: done } = await supabase
        .from('conversation_classifications')
        .select('session_id, status, attempts')
        .in('session_id', ids);

      const blocked = new Set(
        (done || [])
          .filter((d: any) => d.status !== 'failed' || d.attempts >= MAX_ATTEMPTS)
          .map((d: any) => d.session_id)
      );

      return (data || [])
        .filter((s: any) => !blocked.has(s.id))
        .map((s: any) => {
          const msgs = (s.chat_messages || [])
            .slice()
            .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
          return {
            id: s.id,
            accountId,
            channel: channelOf(s.anon_id),
            startedAt: s.created_at,
            messages: msgs.map((m: any) => ({ role: m.role, content: m.content || '' })),
            intentHints: msgs.map((m: any) => m.intent).filter(Boolean),
          } as SessionForClassification;
        })
        .filter((s: SessionForClassification) => s.messages.some((m) => m.role === 'user'));
    },

    async fetchCatalog(accountId) {
      const { data } = await supabase
        .from('widget_products')
        .select('id, name, name_he, slug, category')
        .eq('account_id', accountId);
      return (data || []) as CatalogProduct[];
    },

    classify(s, index) {
      return classifySession(s, index, { callModel: callClassifyModel });
    },

    async saveRows(rows) {
      const { error } = await supabase
        .from('conversation_classifications')
        .upsert(rows, { onConflict: 'session_id' });
      if (error) throw new Error(`saveRows: ${error.message}`);
      return rows.length;
    },
  };
}
