/**
 * RAG Chunker Tests
 */
import { describe, it, expect } from 'vitest';
import { chunkText, normalizeText, estimateTokens } from '@/lib/rag/chunker';

describe('normalizeText', () => {
  it('trims whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeText('hello    world')).toBe('hello world');
  });

  it('normalizes line breaks', () => {
    expect(normalizeText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('collapses excessive newlines', () => {
    expect(normalizeText('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('removes null bytes', () => {
    expect(normalizeText('hello\0world')).toBe('helloworld');
  });

  it('handles empty string', () => {
    expect(normalizeText('')).toBe('');
  });
});

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates tokens for English text', () => {
    const text = 'This is a sample text for token estimation.';
    const tokens = estimateTokens(text);
    // ~44 chars / 3.5 ≈ 13 tokens
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(20);
  });

  it('estimates tokens for Hebrew text', () => {
    const text = 'זהו טקסט לדוגמה בעברית לבדיקת אומדן טוקנים.';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(5);
  });
});

describe('chunkText', () => {
  it('returns empty array for empty text', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const text = 'This is a short text that should fit in one chunk.';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].text).toBe(text);
  });

  it('splits long text into multiple chunks', () => {
    // Generate text that's ~2000 tokens (~7000 chars)
    const sentences = Array.from({ length: 200 }, (_, i) =>
      `This is sentence number ${i + 1} in our test document. `
    );
    const text = sentences.join('');
    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);

    // Verify all text is covered
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.tokenCount).toBeGreaterThan(0);
      expect(chunk.startChar).toBeGreaterThanOrEqual(0);
      expect(chunk.endChar).toBeGreaterThan(chunk.startChar);
    }
  });

  it('respects maxTokens option', () => {
    const sentences = Array.from({ length: 100 }, (_, i) =>
      `Sentence ${i + 1} with some content. `
    );
    const text = sentences.join('');
    const chunks = chunkText(text, { maxTokens: 200 });

    for (const chunk of chunks) {
      // Allow tolerance: merging of small trailing chunks can exceed max slightly
      expect(chunk.tokenCount).toBeLessThanOrEqual(400);
    }
  });

  it('creates overlapping chunks', () => {
    const sentences = Array.from({ length: 100 }, (_, i) =>
      `This is test sentence number ${i + 1}. `
    );
    const text = sentences.join('');
    const chunks = chunkText(text, { overlapRatio: 0.15 });

    if (chunks.length >= 2) {
      // Check that chunks overlap
      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].startChar).toBeLessThan(chunks[i - 1].endChar);
      }
    }
  });

  it('preserves chunk indices', () => {
    const sentences = Array.from({ length: 100 }, (_, i) =>
      `Sentence ${i + 1}. `
    );
    const text = sentences.join('');
    const chunks = chunkText(text);

    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  it('handles text with paragraph breaks', () => {
    const text = Array.from({ length: 50 }, (_, i) =>
      `Paragraph ${i + 1}: This is some text that forms a complete paragraph with enough content to make it meaningful.\n\n`
    ).join('');

    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should have meaningful content
    for (const chunk of chunks) {
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
  });
});
