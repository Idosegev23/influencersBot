/**
 * OpenAI token pricing, used to turn a turn's `usage` into dollars for `cost_tracking`
 * and the budget alerts.
 *
 * These rates were not copied from a docs page — they were DERIVED from this org's own
 * billing, by dividing `/v1/organization/costs` line items by `/v1/organization/usage`
 * token counts over 2026-07-14..2026-08-01. gpt-5.4's base rates come from 2026-07-30, a
 * day with no long-context line item, so the arithmetic is unambiguous; they land on exact
 * round numbers ($2.50 / $0.25 / $15.00 per 1M), which is the confirmation that the
 * derivation is right.
 *
 * Re-derive with the same method if OpenAI changes prices — an unknown model deliberately
 * yields $0 rather than a guess, so a stale table under-reports instead of inventing
 * numbers.
 */

/**
 * Above this prompt size, gpt-class models switch to long-context rates — exactly 2x for
 * both input and output. This is what made 2026-07-25 cost $205: 29.7M of that day's
 * 52.5M input tokens crossed the line, at double price, because an un-capped
 * `previous_response_id` chain kept resending the whole conversation.
 */
export const LONG_CONTEXT_THRESHOLD_TOKENS = 128_000;

export interface ModelPricing {
  /** USD per 1M uncached input tokens. */
  inputPerM: number;
  /** USD per 1M cached input tokens. */
  cachedInputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
  /** USD per 1M input tokens once the prompt crosses the long-context threshold. */
  longContextInputPerM: number;
  /** USD per 1M output tokens on a long-context request. */
  longContextOutputPerM: number;
}

const PRICES: Record<string, ModelPricing> = {
  // GPT-5.6 family (launch pricing 2026-07-09, cut 2026-07-30; cached assumed 10% of input,
  // long-context assumed 2x like 5.4/5.5 — NOT yet confirmed from our own billing, re-derive
  // once real 5.6 line items appear in /v1/organization/costs).
  'gpt-5.6-sol': {
    inputPerM: 5, cachedInputPerM: 0.5, outputPerM: 30,
    longContextInputPerM: 10, longContextOutputPerM: 60,
  },
  'gpt-5.6-terra': {
    inputPerM: 2, cachedInputPerM: 0.2, outputPerM: 12,
    longContextInputPerM: 4, longContextOutputPerM: 24,
  },
  'gpt-5.6-luna': {
    inputPerM: 0.2, cachedInputPerM: 0.02, outputPerM: 1.2,
    longContextInputPerM: 0.4, longContextOutputPerM: 2.4,
  },
  'gpt-5.4': {
    inputPerM: 2.5, cachedInputPerM: 0.25, outputPerM: 15,
    longContextInputPerM: 5, longContextOutputPerM: 30,
  },
  'gpt-5.5': {
    inputPerM: 5, cachedInputPerM: 0.5, outputPerM: 30,
    longContextInputPerM: 10, longContextOutputPerM: 60,
  },
  'gpt-5.4-mini': {
    inputPerM: 0.75, cachedInputPerM: 0.075, outputPerM: 4.5,
    longContextInputPerM: 1.5, longContextOutputPerM: 9,
  },
  'gpt-5.4-nano': {
    inputPerM: 0.2, cachedInputPerM: 0.02, outputPerM: 1.25,
    longContextInputPerM: 0.4, longContextOutputPerM: 2.5,
  },
  'gpt-5-nano': {
    inputPerM: 0.05, cachedInputPerM: 0.005, outputPerM: 0.4,
    longContextInputPerM: 0.1, longContextOutputPerM: 0.8,
  },
  'text-embedding-3-large': {
    inputPerM: 0.13, cachedInputPerM: 0.13, outputPerM: 0,
    longContextInputPerM: 0.13, longContextOutputPerM: 0,
  },
  'text-embedding-3-small': {
    inputPerM: 0.02, cachedInputPerM: 0.02, outputPerM: 0,
    longContextInputPerM: 0.02, longContextOutputPerM: 0,
  },
};

/**
 * Pricing for a model id. OpenAI bills against dated snapshots
 * (`gpt-5.4-2026-03-05`), so the trailing date is stripped to find the family.
 * Returns null for anything unrecognised — the caller must not invent a price.
 */
export function priceFor(model: string | null | undefined): ModelPricing | null {
  if (!model) return null;
  if (PRICES[model]) return PRICES[model];
  // Strip a trailing -YYYY-MM-DD snapshot suffix.
  const family = model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  return PRICES[family] ?? null;
}

/**
 * Cost in USD for one model call.
 *
 * `inputTokens` is OpenAI's total, which is INCLUSIVE of `cachedInputTokens`; only the
 * remainder is billed at the full rate. Long-context rates apply to the whole request once
 * the prompt crosses the threshold.
 */
export function estimateCostUsd(params: {
  model: string | null | undefined;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
}): number {
  const p = priceFor(params.model);
  if (!p) return 0;

  const input = Math.max(0, params.inputTokens ?? 0);
  const cached = Math.min(Math.max(0, params.cachedInputTokens ?? 0), input);
  const output = Math.max(0, params.outputTokens ?? 0);
  const uncached = input - cached;

  const long = input >= LONG_CONTEXT_THRESHOLD_TOKENS;
  const inRate = long ? p.longContextInputPerM : p.inputPerM;
  const outRate = long ? p.longContextOutputPerM : p.outputPerM;

  return (uncached / 1e6) * inRate + (cached / 1e6) * p.cachedInputPerM + (output / 1e6) * outRate;
}
