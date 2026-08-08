import { describe, it, expect } from 'vitest';
import {
  LONG_CONTEXT_THRESHOLD_TOKENS,
  estimateCostUsd,
  priceFor,
} from '@/lib/costs/pricing';

describe('LONG_CONTEXT_THRESHOLD_TOKENS', () => {
  it('is 128K — the point where gpt-5.4 switches to long-context rates', () => {
    expect(LONG_CONTEXT_THRESHOLD_TOKENS).toBe(128_000);
  });
});

describe('priceFor', () => {
  it('resolves a dated model id to its family', () => {
    // OpenAI bills against dated snapshots; the price table is keyed by family.
    expect(priceFor('gpt-5.4-2026-03-05')).toEqual(priceFor('gpt-5.4'));
  });

  it('knows the models this codebase actually calls', () => {
    for (const m of ['gpt-5.4', 'gpt-5.5', 'gpt-5-nano', 'gpt-5.4-nano', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'text-embedding-3-large', 'text-embedding-3-small']) {
      const p = priceFor(m);
      expect(p, m).toBeTruthy();
      expect(p!.inputPerM, m).toBeGreaterThan(0);
    }
  });

  it('returns null for an unknown model rather than guessing a price', () => {
    expect(priceFor('some-future-model')).toBeNull();
  });

  it('prices long context above standard input', () => {
    const p = priceFor('gpt-5.4')!;
    expect(p.longContextInputPerM).toBeGreaterThan(p.inputPerM);
  });

  it('prices cached input below standard input', () => {
    const p = priceFor('gpt-5.4')!;
    expect(p.cachedInputPerM).toBeLessThan(p.inputPerM);
  });
});

describe('estimateCostUsd', () => {
  it('charges standard rates below the long-context threshold', () => {
    const p = priceFor('gpt-5.4')!;
    const cost = estimateCostUsd({ model: 'gpt-5.4', inputTokens: 10_000, outputTokens: 1_000 });
    expect(cost).toBeCloseTo((10_000 / 1e6) * p.inputPerM + (1_000 / 1e6) * p.outputPerM, 8);
  });

  it('charges long-context rates on BOTH input and output once the prompt crosses the threshold', () => {
    // The 25 July bill carries a distinct `output, long context` line item ($0.551)
    // alongside `input, long context` — output switches rate too, it is not input-only.
    const p = priceFor('gpt-5.4')!;
    const cost = estimateCostUsd({ model: 'gpt-5.4', inputTokens: 143_000, outputTokens: 500 });
    expect(cost).toBeCloseTo(
      (143_000 / 1e6) * p.longContextInputPerM + (500 / 1e6) * p.longContextOutputPerM,
      8
    );
  });

  it('bills cached input at the cached rate, and only the uncached remainder at full rate', () => {
    const p = priceFor('gpt-5.4')!;
    const cost = estimateCostUsd({
      model: 'gpt-5.4', inputTokens: 10_000, cachedInputTokens: 4_000, outputTokens: 0,
    });
    expect(cost).toBeCloseTo((6_000 / 1e6) * p.inputPerM + (4_000 / 1e6) * p.cachedInputPerM, 8);
  });

  it('never double-charges when cached exceeds total input', () => {
    const cost = estimateCostUsd({
      model: 'gpt-5.4', inputTokens: 1_000, cachedInputTokens: 5_000, outputTokens: 0,
    });
    expect(cost).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 for an unknown model instead of inventing a number', () => {
    expect(estimateCostUsd({ model: 'mystery', inputTokens: 1e6, outputTokens: 1e6 })).toBe(0);
  });

  it('returns 0 for a zero-token turn', () => {
    expect(estimateCostUsd({ model: 'gpt-5.4', inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it('tolerates missing/negative token counts', () => {
    expect(estimateCostUsd({ model: 'gpt-5.4', inputTokens: -5, outputTokens: undefined as any })).toBe(0);
  });

  it('reproduces the 25 July incident to the right order of magnitude', () => {
    // That day billed 52.5M input tokens on gpt-5.4, ~32M of it long-context, for $205.53.
    // A rough reconstruction should land in the same ballpark, not 10x off.
    const longCtx = estimateCostUsd({ model: 'gpt-5.4', inputTokens: 32_000_000, outputTokens: 0 });
    const normal = estimateCostUsd({ model: 'gpt-5.4', inputTokens: 20_500_000, outputTokens: 400_000 });
    const total = longCtx + normal;
    expect(total).toBeGreaterThan(100);
    expect(total).toBeLessThan(400);
  });
});
