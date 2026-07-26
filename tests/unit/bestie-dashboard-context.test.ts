import { describe, it, expect } from 'vitest';
import { normalizeCurrentRoute } from '@/lib/bestie/dashboard/context';

describe('normalizeCurrentRoute', () => {
  it('maps a real dashboard path to its route-tree form', () => {
    expect(normalizeCurrentRoute('/influencer/argania/chatbot-settings'))
      .toBe('/influencer/[username]/chatbot-settings');
    expect(normalizeCurrentRoute('/influencer/studiopasha_fashion/analytics'))
      .toBe('/influencer/[username]/analytics');
  });

  it('handles the account root', () => {
    expect(normalizeCurrentRoute('/influencer/argania')).toBe('/influencer/[username]');
  });

  it('keeps nested segments', () => {
    expect(normalizeCurrentRoute('/influencer/argania/documents/upload'))
      .toBe('/influencer/[username]/documents/upload');
  });

  it('strips query strings and trailing slashes', () => {
    expect(normalizeCurrentRoute('/influencer/argania/analytics?tab=x'))
      .toBe('/influencer/[username]/analytics');
    expect(normalizeCurrentRoute('/influencer/argania/analytics/'))
      .toBe('/influencer/[username]/analytics');
  });

  it('leaves non-dashboard paths alone by returning null', () => {
    expect(normalizeCurrentRoute('/admin/accounts')).toBeNull();
    expect(normalizeCurrentRoute('/')).toBeNull();
    expect(normalizeCurrentRoute(null)).toBeNull();
    expect(normalizeCurrentRoute('')).toBeNull();
  });

  it('does not mistake /influencer/insights for an account route', () => {
    // /influencer/insights is a real screen, not a username.
    expect(normalizeCurrentRoute('/influencer/insights')).toBe('/influencer/insights');
  });
});
