import { describe, it, expect } from 'vitest';
import { buildComplementaryPrompt, parseComplementaryIds } from '@/lib/recommendations/complementary';

const CATALOG = [
  { id: 'a', name: 'INTENSIVE Shampoo' },
  { id: 'b', name: 'INTENSIVE Mask' },
  { id: 'c', name: 'Red Fiber Serum' },
];

describe('parseComplementaryIds', () => {
  it('keeps only real catalog ids, max 3', () => {
    const out = JSON.stringify({ ids: ['b', 'c', 'zzz', 'a'] });
    expect(parseComplementaryIds(out, ['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
  });
  it('drops the added product itself if echoed', () => {
    const out = JSON.stringify({ ids: ['a', 'b'] });
    expect(parseComplementaryIds(out, ['a', 'b'], 'a')).toEqual(['b']);
  });
  it('returns [] on malformed output', () => {
    expect(parseComplementaryIds('not json', ['a'])).toEqual([]);
  });
});

describe('buildComplementaryPrompt', () => {
  it('lists the catalog names+ids and names the added product', () => {
    const { instructions, input } = buildComplementaryPrompt({ id: 'a', name: 'INTENSIVE Shampoo' }, CATALOG);
    expect(input).toContain('INTENSIVE Shampoo');
    expect(input).toContain('[id:b]');
    expect(instructions.toLowerCase()).toContain('complement');
  });
});
