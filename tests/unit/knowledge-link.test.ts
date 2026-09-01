import { describe, it, expect } from 'vitest';
import { normalizeKnowledgeUrl } from '@/lib/knowledge/link-ingest';

describe('normalizeKnowledgeUrl — what a customer may paste into the link box', () => {
  it('accepts an address with or without a scheme', () => {
    expect(normalizeKnowledgeUrl('https://www.buses.org/events')).toBe('https://www.buses.org/events');
    expect(normalizeKnowledgeUrl('buses.org/events')).toBe('https://buses.org/events');
    expect(normalizeKnowledgeUrl('  https://marketplace.buses.org/  ')).toBe('https://marketplace.buses.org/');
  });

  it('rejects anything that is not a web page, before we spend a fetch on it', () => {
    expect(normalizeKnowledgeUrl('not a url')).toBeNull();
    expect(normalizeKnowledgeUrl('ftp://files.example.com/x')).toBeNull();
    expect(normalizeKnowledgeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeKnowledgeUrl('')).toBeNull();
    expect(normalizeKnowledgeUrl('   ')).toBeNull();
  });

  it('rejects a bare hostname with no dot, which is a typo rather than a site', () => {
    // "localhost" and "buses" both parse as urls once a scheme is bolted on,
    // and both would send a browser run somewhere useless.
    expect(normalizeKnowledgeUrl('localhost')).toBeNull();
    expect(normalizeKnowledgeUrl('buses')).toBeNull();
  });
});
