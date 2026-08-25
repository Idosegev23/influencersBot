/**
 * Draining a batch without letting one bad row hold the queue hostage.
 *
 * The original drain treated an insert failure as "leave the batch in the
 * buffer, never lose events". On 2026-08-19 a `click` event captured form text
 * truncated mid-emoji, leaving an unpaired UTF-16 surrogate — legal JSON,
 * illegal Postgres text. PostgREST rejected the whole 500-row batch, the drain
 * put it back, and did so again every minute for six days. The buffer grew to
 * Upstash's 100 MiB per-key ceiling, after which every widget event was
 * silently dropped. The guarantee ate itself: refusing to lose one row lost
 * them all.
 *
 * The invariant here is different, and the one that actually holds: **the
 * queue always advances.** A row Postgres will not accept is set aside for
 * inspection instead of being retried forever, and everything behind it gets
 * through.
 *
 * Bisection rather than row-by-row retry: a 500-row batch with a single
 * offender costs ~20 round trips instead of 501.
 */

export interface InsertResult {
  ok: boolean;
  error?: string;
}

export type BatchInsert<T> = (rows: T[]) => Promise<InsertResult>;

export interface QuarantinedRow<T> {
  row: T;
  reason: string;
}

export interface DrainBatchResult<T> {
  inserted: number;
  quarantined: QuarantinedRow<T>[];
}

export async function drainBatch<T>(
  rows: T[],
  insert: BatchInsert<T>,
): Promise<DrainBatchResult<T>> {
  const quarantined: QuarantinedRow<T>[] = [];
  let inserted = 0;

  async function attempt(slice: T[]): Promise<void> {
    if (slice.length === 0) return;

    const res = await insert(slice);
    if (res.ok) {
      inserted += slice.length;
      return;
    }

    // A single row that the database refuses: set it aside and move on. This
    // is the only place a row leaves the pipeline, and it leaves with its
    // reason attached so the cause is diagnosable rather than guessed at.
    if (slice.length === 1) {
      quarantined.push({ row: slice[0], reason: res.error || 'insert rejected' });
      return;
    }

    const mid = Math.floor(slice.length / 2);
    await attempt(slice.slice(0, mid));
    await attempt(slice.slice(mid));
  }

  await attempt(rows);
  return { inserted, quarantined };
}

/** Redis list holding rows the database refused, with the reason. */
export function quarantineKey(): string {
  return 'wev:quarantine';
}
