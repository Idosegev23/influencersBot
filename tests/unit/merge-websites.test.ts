import { describe, it, expect } from 'vitest';
import { mergeWebsites } from '@/lib/chatbot/knowledge-retrieval';

const w = (url: string, content: string) => ({ url, title: url, content, scraped_at: '', image_urls: [] }) as any;

const JOIN = 'https://www.buses.org/membership/join/';

describe('mergeWebsites — what actually reaches the prompt', () => {
  it('keeps every distinct passage retrieval selected from one page', () => {
    // The ABA case: the Join page chunks into an intro, a payment address, and
    // the dues table. Keying by URL kept one of the three and dropped the only
    // one carrying a figure.
    const rag = [
      w(JOIN, 'Please make check payments to: American Bus Association, Washington DC'),
      w(JOIN, 'Membership Rates and Deadlines Bus Operator 10 or Less $600 ... $21,050'),
    ];
    const merged = mergeWebsites([], rag);

    expect(merged).toHaveLength(2);
    // Presence assertion: the dues figures must survive the merge. Asserting
    // only "length is 2" would pass on two copies of the address chunk.
    expect(merged.some((m) => /\$21,050/.test(m.content))).toBe(true);
  });

  it('lets a semantically retrieved passage outrank whole pages from the direct search', () => {
    // Direct-search news articles used to go first and consume every website
    // slot, pushing the page that answered the question below the cutoff.
    const direct = [w('https://www.buses.org/news/best-of-2025/', 'A long news article'.repeat(50))];
    const rag = [w(JOIN, 'Bus Operator 10 or Less $600 Due by June 30')];
    const merged = mergeWebsites(direct, rag);

    expect(merged[0].url).toBe(JOIN);
    expect(merged).toHaveLength(2);
  });

  it('drops the whole page when retrieval already selected passages from it', () => {
    const direct = [w(JOIN, 'the entire join page, truncated to 2000 chars elsewhere')];
    const rag = [w(JOIN, 'Bus Operator 21-30 $1,680')];
    const merged = mergeWebsites(direct, rag);

    expect(merged).toHaveLength(1);
    expect(merged[0].content).toContain('$1,680');
  });

  it('still includes direct pages retrieval said nothing about', () => {
    const direct = [w('https://www.buses.org/events/', 'the events calendar')];
    const rag = [w(JOIN, 'dues table')];
    const merged = mergeWebsites(direct, rag);

    expect(merged.map((m) => m.url)).toEqual([JOIN, 'https://www.buses.org/events/']);
  });

  it('collapses a genuinely identical passage', () => {
    const rag = [w(JOIN, 'same passage'), w(JOIN, 'same passage')];
    expect(mergeWebsites([], rag)).toHaveLength(1);
  });
});
