import { describe, it, expect } from 'vitest';
import { ARCHETYPE_CONFIGS, getArchetypeConfig } from '@/lib/rag/archetypes';

describe('saas_product archetype', () => {
  it('is registered', () => {
    expect(ARCHETYPE_CONFIGS.saas_product).toBeDefined();
  });

  it('ranks knowledge_base above every other entity type', () => {
    const { typeWeights } = getArchetypeConfig('saas_product');
    const kb = typeWeights.knowledge_base ?? 0;
    const others = Object.entries(typeWeights)
      .filter(([type]) => type !== 'knowledge_base')
      .map(([, weight]) => weight ?? 0);

    expect(kb).toBeGreaterThan(0);
    for (const weight of others) expect(kb).toBeGreaterThan(weight);
  });

  it('gives knowledge_base enough room to answer a how-to question', () => {
    // A "where do I click" answer needs the screen entry plus neighbours.
    expect(getArchetypeConfig('saas_product').typeCaps.knowledge_base).toBeGreaterThanOrEqual(10);
  });

  it('still falls back to default for an unknown archetype', () => {
    expect(getArchetypeConfig('not_a_real_archetype')).toEqual(ARCHETYPE_CONFIGS.default);
  });
});
