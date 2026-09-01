import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/support/email-deliverability', () => ({
  verifyEmail: async (raw: string) =>
    raw.includes('gmail.com.il')
      ? { status: 'undeliverable', email: raw, reason: 'no_mx', suggestion: 'gmail.com' }
      : { status: 'ok', email: raw },
}));

import { POST, OPTIONS } from '@/app/api/widget/validate-email/route';

const post = (body: unknown, origin = 'https://argania-oil.co.il') =>
  POST(new Request('http://x/api/widget/validate-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  }) as any);

describe('POST /api/widget/validate-email', () => {
  it('reports the suggestion for a dead domain', async () => {
    const res = await post({ email: 'lililevy42@gmail.com.il' });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: 'undeliverable', suggestion: 'gmail.com',
    });
  });

  it('reports ok for a good address', async () => {
    const res = await post({ email: 'a@gmail.com' });
    await expect(res.json()).resolves.toMatchObject({ status: 'ok' });
  });

  it('echoes the request origin so an embedded widget can read the response', async () => {
    const res = await post({ email: 'a@gmail.com' }, 'https://shop.example');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://shop.example');
  });

  it('answers the CORS preflight', async () => {
    const res = await OPTIONS(new Request('http://x', {
      method: 'OPTIONS', headers: { origin: 'https://shop.example' },
    }) as any);
    expect(res.status).toBe(204);
  });

  it('rejects a missing email with 400 rather than guessing', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it('rejects an oversized payload without calling the verifier', async () => {
    const res = await post({ email: 'a'.repeat(400) + '@gmail.com' });
    expect(res.status).toBe(400);
  });

  it('answers unknown rather than 500 when the body is not JSON', async () => {
    // A validator that 500s must not take the form down with it, and 'unknown' never blocks.
    const res = await POST(new Request('http://x', {
      method: 'POST', headers: { origin: 'https://shop.example' }, body: 'not json',
    }) as any);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: 'unknown' });
  });
});
