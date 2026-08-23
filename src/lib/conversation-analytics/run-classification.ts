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
      // The anti-join lives in SQL (migration 081). Filtering already-classified
      // sessions in JS after LIMIT is what stalled the first backfill at 100 of
      // 3,605 rows: every round re-fetched the same newest page, found it fully
      // classified, and reported nothing left to do.
      const { data: pending, error } = await supabase.rpc('pending_classification_sessions', {
        p_account_id: accountId,
        p_since: sinceIso ?? null,
        p_limit: limit,
        p_settle_minutes: SETTLE_MINUTES,
        p_max_attempts: MAX_ATTEMPTS,
      });
      if (error) throw new Error(`fetchPendingSessions: ${error.message}`);
      if (!pending || pending.length === 0) return [];

      const ids = pending.map((s: any) => s.id);
      const { data: msgs, error: msgErr } = await supabase
        .from('chat_messages')
        .select('session_id, role, content, intent, created_at')
        .in('session_id', ids)
        .order('created_at', { ascending: true });
      if (msgErr) throw new Error(`fetchPendingSessions messages: ${msgErr.message}`);

      const bySession = new Map<string, any[]>();
      for (const m of msgs || []) {
        const arr = bySession.get(m.session_id) || [];
        arr.push(m);
        bySession.set(m.session_id, arr);
      }

      return pending.map((s: any) => {
        const rows = bySession.get(s.id) || [];
        return {
          id: s.id,
          accountId,
          channel: channelOf(s.anon_id),
          startedAt: s.created_at,
          messages: rows.map((m: any) => ({ role: m.role, content: m.content || '' })),
          intentHints: rows.map((m: any) => m.intent).filter(Boolean),
        } as SessionForClassification;
      });
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
