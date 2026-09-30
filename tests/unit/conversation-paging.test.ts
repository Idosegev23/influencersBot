import { describe, it, expect, vi } from 'vitest';
import { pageAll, PAGE_SIZE } from '@/lib/conversation-analytics/paging';

// PostgREST returns at most 1,000 rows however large a `.limit()` is asked for.
// Argania's August is 2,011 classified conversations; the report page read the
// first 1,000 and drew its charts from half the month.
describe('pageAll', () => {
  const source = (n: number) => {
    const rows = Array.from({ length: n }, (_, i) => i);
    return vi.fn(async (from: number, to: number) => rows.slice(from, to + 1));
  };

  it('reads past the first page', async () => {
    const fetchPage = source(2011);
    const got = await pageAll(fetchPage);
    expect(got).toHaveLength(2011);
    expect(got[2010]).toBe(2010);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('asks for one more page when the last one is exactly full', async () => {
    const fetchPage = source(PAGE_SIZE);
    expect(await pageAll(fetchPage)).toHaveLength(PAGE_SIZE);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('stops at the row ceiling instead of reading without bound', async () => {
    const got = await pageAll(source(5000), 2500);
    expect(got).toHaveLength(2500);
  });

  it('returns nothing from an empty source in a single call', async () => {
    const fetchPage = source(0);
    expect(await pageAll(fetchPage)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
