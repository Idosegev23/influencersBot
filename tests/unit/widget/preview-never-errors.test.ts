import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The contract this file defends, in Ido's words: "העיקר שלא יהיה לי 404 או 403,
 * שהכל יעבוד לא משנה מאיפה זה בא."
 *
 * Everything this route returns is consumed inside an iframe a prospect is
 * looking at, usually via a link a salesperson sent them. A JSON body or a 4xx
 * there reads as a broken product — which is exactly what happened: a missing
 * config.widget.domain rendered `{"error":"no widget domain registered for this
 * account"}` inside the frame of a live demo link.
 */

const single = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: single,
          order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

async function get(accountId: string) {
  const { GET } = await import('@/app/api/widget/preview/[accountId]/route');
  return GET(
    new Request(`http://bestie.test/api/widget/preview/${accountId}`) as any,
    { params: Promise.resolve({ accountId }) } as any,
  );
}

/** Every refusal must be a rendered page, and must actually say something. */
async function expectRenderedPage(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/html');
  const body = await res.text();
  expect(body.trimStart().startsWith('{')).toBe(false);
  // Presence assertion beside the "not JSON" check: a route returning an empty
  // body would satisfy every negative assertion above and still be broken.
  expect(body).toContain('<h1>');
  expect(body.length).toBeGreaterThan(200);
  return body;
}

beforeEach(() => {
  vi.resetModules();
  single.mockReset();
});

describe('widget preview never answers a demo link with an error', () => {
  it('renders a page when the account does not exist (was: 404 JSON)', async () => {
    single.mockResolvedValue({ data: null });
    const body = await expectRenderedPage(await get('00000000-0000-0000-0000-000000000000'));
    expect(body).toContain('no longer valid');
  });

  it('renders a page when no website is registered (was: 404 JSON in the frame)', async () => {
    single.mockResolvedValue({ data: { config: { username: 'rebarisrael' } } });
    const body = await expectRenderedPage(await get('acct-no-site'));
    expect(body).toContain('No website is registered');
    // The site is missing, but the product being demonstrated is not: the real
    // widget still loads so the link is worth opening.
    expect(body).toContain('widget.js');
  });

  it('renders a page when the demo window has closed (was: 403 JSON)', async () => {
    single.mockResolvedValue({
      data: { config: { widget: { domain: 'example.com' }, demo: { ends_at: '2020-01-01T00:00:00.000Z' } } },
    });
    const body = await expectRenderedPage(await get('acct-expired'));
    expect(body).toContain('This demo has ended');
    // An expired demo must NOT keep serving the assistant it no longer entitles
    // the viewer to — this is the one case where the widget is deliberately absent.
    expect(body).not.toContain('widget.js');
  });
});
