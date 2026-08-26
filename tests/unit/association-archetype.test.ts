import { describe, it, expect } from 'vitest';
import {
  RETAIL_TOPICS,
  ASSOCIATION_TOPICS,
  VALID_TOPICS,
  topicsForArchetype,
} from '@/lib/rag/enrich';
import { ARCHETYPE_CONFIGS } from '@/lib/rag/archetypes';

describe('topic vocabulary is scoped by archetype', () => {
  it('gives an association its own vocabulary, not the retail one', () => {
    const { topics } = topicsForArchetype('association');

    // Presence: the association surfaces exist and are filterable.
    expect(topics).toContain('membership');
    expect(topics).toContain('events');
    expect(topics).toContain('advocacy');

    // And the retail categories that would have swallowed them are gone. Before
    // this change every ABA page classified as 'business', which made three
    // topic-filtered tabs render the same list.
    expect(topics).not.toContain('beauty');
    expect(topics).not.toContain('fashion');
    expect(topics).not.toContain('food');
  });

  it('leaves every other archetype on the retail vocabulary it already had', () => {
    for (const archetype of [undefined, null, 'influencer', 'brand', 'service_provider', 'b2b_saas']) {
      const { topics, fallback } = topicsForArchetype(archetype);
      expect(topics).toEqual(RETAIL_TOPICS);
      expect(fallback).toBe('lifestyle');
    }
  });

  it('falls back inside the account vocabulary, never outside it', () => {
    const assoc = topicsForArchetype('association');
    const retail = topicsForArchetype('brand');

    // A fallback the account cannot filter on is a chunk lost to every surface.
    expect(assoc.topics).toContain(assoc.fallback);
    expect(retail.topics).toContain(retail.fallback);
    expect(assoc.fallback).not.toBe(retail.fallback);
  });

  it('exposes every scoped topic through VALID_TOPICS without duplicates', () => {
    for (const t of [...RETAIL_TOPICS, ...ASSOCIATION_TOPICS]) {
      expect(VALID_TOPICS).toContain(t);
    }
    expect(new Set(VALID_TOPICS).size).toBe(VALID_TOPICS.length);
  });
});

describe('association RAG weighting', () => {
  const cfg = ARCHETYPE_CONFIGS.association;

  it('is registered as a first-class archetype', () => {
    expect(cfg).toBeDefined();
    expect(Object.keys(cfg.typeWeights).length).toBeGreaterThan(0);
  });

  it('ranks the website above social, because dues and policy live on the site', () => {
    expect(cfg.typeWeights.website!).toBeGreaterThan(cfg.typeWeights.post!);
    expect(cfg.typeCaps.website!).toBeGreaterThan(cfg.typeCaps.post!);
  });

  it('still keeps social in play, unlike a government ministry', () => {
    // An association campaigns in public; its advocacy wins and event promos are
    // on Instagram and Facebook. A cap of 0 would discard half this account.
    expect(cfg.typeWeights.post!).toBeGreaterThan(0);
    expect(cfg.typeCaps.post!).toBeGreaterThan(0);
    expect(ARCHETYPE_CONFIGS.government_ministry.typeCaps.post).toBe(0);
  });

  it('cannot surface a coupon, a partnership or a product', () => {
    for (const t of ['coupon', 'partnership', 'product'] as const) {
      expect(cfg.typeWeights[t]!).toBeLessThan(0);
      expect(cfg.typeCaps[t]).toBe(0);
    }
  });
});
