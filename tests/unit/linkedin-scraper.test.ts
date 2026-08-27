import { describe, it, expect } from 'vitest';
import { normalizeLinkedInUrl, normalizeLinkedInPost } from '@/lib/scraping/linkedinScraper';

describe('normalizeLinkedInUrl', () => {
  it('accepts the shapes a human pastes for a company', () => {
    const canonical = 'https://www.linkedin.com/company/american-bus-association';
    expect(normalizeLinkedInUrl('https://www.linkedin.com/company/american-bus-association/')).toBe(canonical);
    expect(normalizeLinkedInUrl('american-bus-association')).toBe(canonical);
    expect(normalizeLinkedInUrl('@american-bus-association')).toBe(canonical);
  });

  it('refuses a personal profile rather than coercing it', () => {
    // The company endpoint 400s on /in/, and silently turning a person into a
    // company would attach the wrong organisation's content to an account.
    expect(normalizeLinkedInUrl('https://www.linkedin.com/in/some-person')).toBe('');
  });

  it('refuses an unrelated url instead of inventing a slug from it', () => {
    expect(normalizeLinkedInUrl('https://example.com/company/foo')).toBe('');
    expect(normalizeLinkedInUrl('')).toBe('');
  });
});

describe('normalizeLinkedInPost', () => {
  const raw = {
    id: '7498455467145404416',
    url: 'https://www.linkedin.com/posts/american-bus-association_motorcoach-activity-7498455467145404416',
    datePublished: '2026-08-26T19:04:57.915Z',
    text: 'The road to EPA 2027 is still evolving — and operators are watching closely.',
  };

  it('maps what LinkedIn actually returns', () => {
    const p = normalizeLinkedInPost(raw)!;
    expect(p.id).toBe('7498455467145404416');
    expect(p.text).toContain('EPA 2027');
    expect(p.publishedAt).toBe('2026-08-26T19:04:57.915Z');
  });

  it('drops a post with no text', () => {
    // LinkedIn gives no engagement and no images, so a textless post carries
    // literally nothing — storing it would add an empty RAG chunk.
    expect(normalizeLinkedInPost({ id: '1', text: '   ' })).toBeNull();
    expect(normalizeLinkedInPost({ text: 'no id' })).toBeNull();
  });
});
