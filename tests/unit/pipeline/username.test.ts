import { describe, it, expect } from 'vitest';
import { normalizeIgUsername } from '@/lib/pipeline/username';

describe('normalizeIgUsername', () => {
  it('strips @, URLs, query strings, slashes', () => {
    expect(normalizeIgUsername('@freesbe.israel')).toBe('freesbe.israel');
    expect(normalizeIgUsername('freesbe.israel/?hl=he')).toBe('freesbe.israel');
    expect(normalizeIgUsername('https://www.instagram.com/holidayfinder_/?hl=he')).toBe('holidayfinder_');
    expect(normalizeIgUsername('instagram.com/kikomilanoisrael/')).toBe('kikomilanoisrael');
    expect(normalizeIgUsername('  sodastreamil  ')).toBe('sodastreamil');
    expect(normalizeIgUsername('')).toBe('');
  });
});
