import { describe, it, expect, vi, beforeEach } from 'vitest';

// classifyTopicsWithLLM labels a batch BY POSITION: the caller writes topics[j] onto chunk j.
// Measured 2026-09-27: the model sometimes returns 14 topics for 15 texts (gemini-3.5-flash on
// 1 of 5 batches). Every chunk after the gap then took its neighbour's label, silently. A
// short (or long) answer must be refused so the batch stays visibly unclassified.
const H = { text: '' };
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent: async () => ({ text: H.text }) }; },
}));

import { classifyTopicsWithLLM } from '@/lib/rag/enrich';

const chunks = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `t${i}`, entityType: 'post' }));

describe('classifyTopicsWithLLM — one topic per text', () => {
  beforeEach(() => { H.text = ''; });

  it('returns the topics when there is exactly one per text', async () => {
    H.text = JSON.stringify({ topics: ['beauty', 'food', 'beauty'] });
    expect(await classifyTopicsWithLLM(chunks(3), ['beauty', 'food'], 'beauty')).toEqual(['beauty', 'food', 'beauty']);
  });

  it('refuses a short answer instead of shifting every later label', async () => {
    H.text = JSON.stringify({ topics: ['beauty', 'food'] });
    await expect(classifyTopicsWithLLM(chunks(3), ['beauty', 'food'], 'beauty')).rejects.toThrow(/2 topics for 3/);
  });

  it('refuses a long answer too', async () => {
    H.text = JSON.stringify({ topics: ['beauty', 'food', 'food', 'beauty'] });
    await expect(classifyTopicsWithLLM(chunks(3), ['beauty', 'food'], 'beauty')).rejects.toThrow(/4 topics for 3/);
  });
});
