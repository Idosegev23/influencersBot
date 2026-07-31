import { describe, it, expect } from 'vitest';
import {
  VERTICALS,
  VERTICAL_IDS,
  getVertical,
  categoryLabel,
  categoryKeys,
  verticalForArchetype,
  type VerticalId,
} from '@/lib/catalog/verticals';

describe('vertical registry shape', () => {
  it('exposes every declared id exactly once', () => {
    const ids = VERTICALS.map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([...VERTICAL_IDS].sort());
  });

  it('covers the markets we actually scan', () => {
    for (const id of ['fashion', 'beauty', 'food', 'home', 'sports', 'jewelry', 'electronics', 'health', 'baby_kids', 'pets', 'saas', 'services', 'general'] as VerticalId[]) {
      expect(VERTICAL_IDS).toContain(id);
    }
  });

  it('gives every vertical a bilingual label, categories, subcategories and extraction rules', () => {
    for (const v of VERTICALS) {
      expect(v.label.he.length).toBeGreaterThan(0);
      expect(v.label.en.length).toBeGreaterThan(0);
      expect(Object.keys(v.categories).length).toBeGreaterThanOrEqual(3);
      expect(v.subcategories.length).toBeGreaterThanOrEqual(5);
      expect(v.extractionRules.trim().length).toBeGreaterThan(0);
    }
  });

  it('gives every category a bilingual label', () => {
    for (const v of VERTICALS) {
      for (const [key, label] of Object.entries(v.categories)) {
        expect(label.he, `${v.id}.${key}.he`).toBeTruthy();
        expect(label.en, `${v.id}.${key}.en`).toBeTruthy();
      }
    }
  });

  it('always offers an "other" bucket so the extractor has a legal fallback', () => {
    for (const v of VERTICALS) expect(Object.keys(v.categories)).toContain('other');
  });

  it('keeps category keys machine-safe (lowercase snake_case)', () => {
    for (const v of VERTICALS) {
      for (const key of Object.keys(v.categories)) expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
      for (const sub of v.subcategories) expect(sub).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe('getVertical', () => {
  it('resolves a known id', () => {
    expect(getVertical('fashion').id).toBe('fashion');
  });

  it('falls back to general for unknown, empty or missing ids', () => {
    expect(getVertical('nope' as VerticalId).id).toBe('general');
    expect(getVertical(undefined).id).toBe('general');
    expect(getVertical('').id).toBe('general');
  });
});

describe('categoryLabel', () => {
  it('returns the Hebrew label by default', () => {
    expect(categoryLabel('fashion', 'women')).toBe('נשים');
    expect(categoryLabel('beauty', 'hair_care')).toBe('טיפוח שיער');
    expect(categoryLabel('food', 'spices')).toBe('תבלינים');
  });

  it('returns the English label when asked', () => {
    expect(categoryLabel('fashion', 'women', 'en')).toBe('Women');
  });

  it('falls back across verticals before humanising an unknown key', () => {
    // 'hair_care' is a beauty key; a fashion account that yielded one should still read well.
    expect(categoryLabel('fashion', 'hair_care')).toBe('טיפוח שיער');
    // genuinely unknown → de-snake the key rather than render a raw slug
    expect(categoryLabel('fashion', 'weird_thing')).toBe('weird thing');
  });

  it('tolerates an empty category', () => {
    expect(categoryLabel('fashion', '')).toBe('');
  });
});

describe('categoryKeys', () => {
  it('lists the vertical category enum in declaration order', () => {
    const keys = categoryKeys('fashion');
    expect(keys[0]).toBe('women');
    expect(keys).toContain('other');
  });
});

describe('verticalForArchetype', () => {
  it('suggests a sensible default per account archetype', () => {
    expect(verticalForArchetype('service_provider')).toBe('services');
    expect(verticalForArchetype('tech_creator')).toBe('saas');
    expect(verticalForArchetype('government_ministry')).toBe('general');
  });

  it('falls back to general for brand/influencer, which sell anything', () => {
    expect(verticalForArchetype('brand')).toBe('general');
    expect(verticalForArchetype('influencer')).toBe('general');
    expect(verticalForArchetype(undefined)).toBe('general');
  });
});
