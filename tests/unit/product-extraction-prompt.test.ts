import { describe, it, expect } from 'vitest';
import { buildExtractionPrompt } from '@/lib/recommendations/extract-products';
import { VERTICALS, getVertical } from '@/lib/catalog/verticals';

describe('buildExtractionPrompt', () => {
  it('builds a prompt for every registered vertical without throwing', () => {
    for (const v of VERTICALS) {
      const p = buildExtractionPrompt(v.id);
      expect(p.length).toBeGreaterThan(200);
    }
  });

  it('injects the vertical category enum, and only that vertical of the enum', () => {
    const fashion = buildExtractionPrompt('fashion');
    expect(fashion).toContain('women, men, kids');
    // cosmetics-only keys must not leak into a fashion prompt's enum
    expect(fashion).not.toContain('lip_care');

    const beauty = buildExtractionPrompt('beauty');
    expect(beauty).toContain('lip_care');
    expect(beauty).not.toContain('swimwear');
  });

  it('injects the vertical subcategory vocabulary', () => {
    expect(buildExtractionPrompt('fashion')).toContain('tank_tops');
    expect(buildExtractionPrompt('food')).toContain('spice_blend');
  });

  it('injects the vertical-specific extraction rules verbatim', () => {
    for (const v of VERTICALS) {
      const firstRuleLine = v.extractionRules.trim().split('\n')[0];
      expect(buildExtractionPrompt(v.id)).toContain(firstRuleLine);
    }
  });

  it('keeps the shared rules that are true for every market', () => {
    const p = buildExtractionPrompt('fashion');
    expect(p).toContain('isProductPage'); // catalog/listing page guard
    expect(p).toContain('isOnSale');
    expect(p).toContain('schema.org'); // structured-data grounding instruction
  });

  it('falls back to the general vertical for an unknown id', () => {
    const unknown = buildExtractionPrompt('nope' as any);
    expect(unknown).toContain(getVertical('general').extractionRules.trim().split('\n')[0]);
  });

  it('tells the model to return JSON only', () => {
    expect(buildExtractionPrompt('fashion')).toMatch(/JSON/);
  });

  it('suppresses volume extraction for verticals where volume is meaningless', () => {
    // fashion.attributes.volume === false
    expect(buildExtractionPrompt('fashion')).toMatch(/volume ו-volumeMl אינם רלוונטיים/);
    // beauty.attributes.volume === true — it should actively ask for the conversion
    expect(buildExtractionPrompt('beauty')).toContain('volumeMl');
  });
});
