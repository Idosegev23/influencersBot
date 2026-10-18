// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { isExcluded, toCopilotSources, retrieveAssociationSources } from '@/lib/copilot/sources';

const src = (id: string, url: string | null, extra: Partial<any> = {}) => ({
  sourceId: id, documentId: `doc-${id}`, entityType: 'website', title: `T ${id}`, excerpt: `text ${id}`,
  updatedAt: '2026-10-01', confidence: 0.5, metadata: url ? { url } : {}, ...extra,
});

describe('isExcluded', () => {
  it('matches full-URL and path prefixes', () => {
    const rules = ['https://buses.org/archive/', '/members-only'];
    expect(isExcluded('https://buses.org/archive/2019/x', rules)).toBe(true);
    expect(isExcluded('HTTPS://BUSES.ORG/archive/x', rules)).toBe(true);
    expect(isExcluded('https://buses.org/members-only/dues', rules)).toBe(true);
    expect(isExcluded('https://buses.org/events/', rules)).toBe(false);
    expect(isExcluded(null, rules)).toBe(false);
    expect(isExcluded('https://buses.org/x', ['junk'])).toBe(false);
  });
});

describe('toCopilotSources', () => {
  it('drops excluded and url-less website sources, dedupes, numbers from 1', () => {
    const out = toCopilotSources([
      src('a', 'https://buses.org/archive/old'),
      src('b', 'https://buses.org/membership/'),
      src('c', 'https://buses.org/membership/'),
      src('d', null),
      src('e', null, { entityType: 'knowledge_base', documentId: 'kb-1' }),
    ] as any, ['/archive']);
    expect(out.map((s) => [s.n, s.id, s.url])).toEqual([[1, 'b', 'https://buses.org/membership/'], [2, 'e', null]]);
  });
  it('caps the count and trims excerpts', () => {
    const many = Array.from({ length: 12 }, (_, i) => src(String(i), `https://buses.org/p${i}`, { excerpt: 'x'.repeat(2000) }));
    const out = toCopilotSources(many as any, []);
    expect(out).toHaveLength(8);
    expect(out[0].excerpt.length).toBe(1200);
  });
});

describe('retrieveAssociationSources', () => {
  it('over-fetches, disables the inferred time window, and filters before returning', async () => {
    const retrieve = vi.fn(async () => ({ sources: [src('a', 'https://buses.org/archive/x'), src('b', 'https://buses.org/events/')], debug: {} }));
    const out = await retrieveAssociationSources('acc', 'upcoming events', ['/archive'], { retrieve: retrieve as any });
    expect(retrieve).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc', query: 'upcoming events', topK: 24, timeWindow: {}, archetype: 'association' }));
    expect(out.map((s) => s.url)).toEqual(['https://buses.org/events/']);
  });
});

describe('isExcluded canonicalisation', () => {
  it('ignores scheme and www and matches http rules by host and path', () => {
    const rules = ['https://buses.org/archive'];
    expect(isExcluded('https://www.buses.org/archive/x', rules)).toBe(true);
    expect(isExcluded('http://buses.org/archive/y', rules)).toBe(true);
    expect(isExcluded('https://buses.org/events/', rules)).toBe(false);
    expect(isExcluded('https://other.org/archive/x', rules)).toBe(false);
  });
  it('collapses repeated slashes in path rules and page URLs', () => {
    expect(isExcluded('https://buses.org//archive/x', ['/archive'])).toBe(true);
    expect(isExcluded('https://buses.org/events/', ['/archive'])).toBe(false);
  });
  it('percent-decodes so encoded Hebrew paths match decoded rules', () => {
    expect(isExcluded('https://buses.org/%D7%9E%D7%99%D7%93%D7%A2/x', ['/מידע'])).toBe(true);
    expect(isExcluded('https://buses.org/%D7%90%D7%97%D7%A8/x', ['/מידע'])).toBe(false);
  });
  it('fails closed on an unparsable URL when rules exist, keeps it when none', () => {
    expect(isExcluded('not a url', ['/archive'])).toBe(true);
    expect(isExcluded('not a url', [])).toBe(false);
  });
});

describe('toCopilotSources canonical dedupe', () => {
  it('collapses /p and /p/ to one source, first wins', () => {
    const out = toCopilotSources([
      src('a', 'https://buses.org/p'),
      src('b', 'https://buses.org/p/'),
      src('c', 'https://buses.org/q'),
    ] as any, []);
    expect(out.map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('isExcluded fails closed on malformed percent-escapes', () => {
  it('excludes a page with a bad segment even when a decoded rule would match the good segment', () => {
    expect(isExcluded('https://buses.org/%D7%9E%D7%99%D7%93%D7%A2/%zz', ['/מידע'])).toBe(true);
    expect(isExcluded('https://buses.org/%D7%90%D7%97%D7%A8/%zz', ['/מידע'])).toBe(true);
  });
  it('excludes a malformed page under any rule set, keeps it with no rules', () => {
    expect(isExcluded('https://buses.org/events/%zz', ['/archive'])).toBe(true);
    expect(isExcluded('https://buses.org/events/%zz', ['https://other.org/x'])).toBe(true);
    expect(isExcluded('https://buses.org/events/%zz', [])).toBe(false);
  });
  it('still keeps a well-formed page under a non-matching rule', () => {
    expect(isExcluded('https://buses.org/events/', ['/archive'])).toBe(false);
  });
});

describe('toCopilotSources keeps distinct query strings apart', () => {
  it('does not collapse index.php?id=1 and ?id=2, but still collapses identical queries', () => {
    const out = toCopilotSources([
      src('a', 'https://buses.org/index.php?id=1'),
      src('b', 'https://buses.org/index.php?id=2'),
      src('c', 'https://buses.org/index.php?id=1'),
    ] as any, []);
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
  });
});
