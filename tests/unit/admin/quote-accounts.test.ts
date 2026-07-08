import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: async () => null }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: async () => ({
          data: [
            {
              id: 'acc-1',
              config: {
                scan_mode: 'quote',
                display_name: 'Carolina Lemke',
                username: 's.com',
                website_url: 'https://s.com',
              },
            },
          ],
          error: null,
        }),
      }),
    }),
  }),
}));

describe('GET /api/admin/quote-accounts', () => {
  it('returns the mapped list of quote accounts', async () => {
    const { GET } = await import('@/app/api/admin/quote-accounts/route');
    const json = await (await GET()).json();
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(1);
    expect(json[0].accountId).toBe('acc-1');
    expect(json[0].display_name).toBe('Carolina Lemke');
    expect(json[0].username).toBe('s.com');
    expect(json[0].website_url).toBe('https://s.com');
  });
});
