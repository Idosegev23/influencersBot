import { describe, it, expect } from 'vitest';
import { isUnchangedChunkSet } from '@/lib/rag/ingest';

const h = (n: number) => String(n).padStart(32, 'a');

describe('isUnchangedChunkSet — the guard that stops a re-scan re-embedding itself', () => {
  it('says unchanged when the same hashes come back', () => {
    // Presence assertion: this is the case that must return TRUE, otherwise the
    // fast path never fires and the ABA stall comes straight back.
    expect(isUnchangedChunkSet([h(1), h(2), h(3)], [h(3), h(1), h(2)])).toBe(true);
  });

  it('says unchanged when the document repeats a chunk the store holds once', () => {
    // The trap: incoming has 3 entries, the store has 2 rows. A length compare
    // reports a change on every single run and re-embeds the document forever.
    expect(isUnchangedChunkSet([h(1), h(2)], [h(1), h(2), h(1)])).toBe(true);
  });

  it('says changed when any chunk is new, removed, or edited', () => {
    expect(isUnchangedChunkSet([h(1), h(2)], [h(1), h(2), h(9)])).toBe(false); // added
    expect(isUnchangedChunkSet([h(1), h(2)], [h(1)])).toBe(false);             // removed
    expect(isUnchangedChunkSet([h(1), h(2)], [h(1), h(9)])).toBe(false);       // edited
  });

  it('never calls an empty store unchanged', () => {
    // A document whose chunks are missing must be re-ingested, not skipped —
    // otherwise the fast path would permanently entrench the broken state.
    expect(isUnchangedChunkSet([], [])).toBe(false);
    expect(isUnchangedChunkSet([], [h(1)])).toBe(false);
  });
});
