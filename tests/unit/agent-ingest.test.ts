import { describe, it, expect } from 'vitest';
import { buildAgentChunks } from '@/lib/rag/ingest-agent';

describe('buildAgentChunks (pure)', () => {
  it('embeds brief raw_text + specialTerms + deliverables with stable hashes, drops empties', () => {
    const chunks = buildAgentChunks({
      agentId: 'a1', talentId: 't1', brand: 'Coca-Cola', dealId: null,
      sourceType: 'brief', sourceId: 'b1', date: '2026-07-01',
      texts: [
        { label: 'brief', text: 'קמפיין קיץ לקוקה קולה, 3 רילס ואקסקלוסיביות' },
        { label: 'term',  text: 'בלעדיות למשך 6 חודשים' },
        { label: 'empty', text: '   ' },
        { label: 'dup',   text: 'קמפיין קיץ לקוקה קולה, 3 רילס ואקסקלוסיביות' },
      ],
    });
    expect(chunks.length).toBe(2);                          // empty dropped, dup collapsed
    expect(chunks.every(c => c.source_type === 'brief' && c.source_id === 'b1')).toBe(true);
    expect(chunks[0].chunk_index).toBe(0);
    expect(chunks[1].chunk_index).toBe(1);
    expect(chunks[0].chunk_hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it('returns [] when everything is empty', () => {
    expect(buildAgentChunks({ agentId: 'a', sourceType: 'note', sourceId: 'n', texts: [{ text: '' }] }).length).toBe(0);
  });
});
