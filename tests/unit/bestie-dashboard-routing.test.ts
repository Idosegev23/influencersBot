import { describe, it, expect } from 'vitest';
import { buildScreenLink } from '@/lib/bestie/dashboard/routing';
import { listCustomerScreens } from '@/lib/bestie/screen-inventory';

const known = [
  '/influencer/[username]/chatbot-settings',
  '/influencer/[username]/coupons',
];

describe('buildScreenLink', () => {
  it('turns a route into a real href for this account', () => {
    const link = buildScreenLink('/influencer/[username]/coupons', 'argania', null, known);
    expect(link!.href).toBe('/influencer/argania/coupons');
  });

  it('knows when the customer is already on that screen', () => {
    const link = buildScreenLink(
      '/influencer/[username]/coupons', 'argania', '/influencer/[username]/coupons', known
    );
    expect(link!.isCurrentScreen).toBe(true);
  });

  it('refuses a route that does not exist', () => {
    // Sending someone to a deleted screen is worse than not linking at all.
    expect(buildScreenLink('/influencer/[username]/deleted', 'argania', null, known)).toBeNull();
  });

  it('refuses anything outside the dashboard', () => {
    expect(buildScreenLink('/admin/accounts', 'argania', null, known)).toBeNull();
    expect(buildScreenLink('https://evil.example.com', 'argania', null, known)).toBeNull();
  });

  it('validates against the real route tree, not a hand-written list', () => {
    const real = listCustomerScreens().map(s => s.route);
    expect(buildScreenLink('/influencer/[username]/chatbot-settings', 'argania', null, real)).not.toBeNull();
  });
});
