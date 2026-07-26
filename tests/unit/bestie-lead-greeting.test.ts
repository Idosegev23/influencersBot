import { describe, it, expect } from 'vitest';
import { introTemplateParams } from '@/lib/bestie/lead-greeting';

describe('introTemplateParams', () => {
  it('uses the first name when there is one', () => {
    expect(introTemplateParams('ישראל')).toEqual(['ישראל']);
  });

  it('falls back to a neutral greeting rather than an empty parameter', () => {
    // Meta rejects an empty template parameter outright, so "" must never ship.
    expect(introTemplateParams(null)).toEqual(['שלום']);
    expect(introTemplateParams('')).toEqual(['שלום']);
    expect(introTemplateParams('   ')).toEqual(['שלום']);
  });

  it('strips what Meta rejects inside a parameter', () => {
    // Error 132018: no newlines, tabs, or long runs of spaces.
    expect(introTemplateParams('דנה\nכהן')).toEqual(['דנה כהן']);
    expect(introTemplateParams('דנה\t\tכהן')).toEqual(['דנה כהן']);
    expect(introTemplateParams('דנה      כהן')).toEqual(['דנה כהן']);
    expect(introTemplateParams('  דנה  ')).toEqual(['דנה']);
  });
});
