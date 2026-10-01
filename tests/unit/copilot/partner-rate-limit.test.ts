// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../../middleware';

function call(path: string, headers: Record<string, string>) {
  return middleware(new NextRequest(`https://app.test${path}`, { method: 'POST', headers }));
}

async function hammer(n: number, path: string, headers: Record<string, string>) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) statuses.push((await call(path, headers)).status);
  return statuses;
}

describe('middleware: partner API rate limit', () => {
  it('gives /api/partner its own 600/min bucket, keyed per bearer token', async () => {
    const a = { authorization: 'Bearer cpk_rate_A', 'x-forwarded-for': '10.0.0.1' };
    const statuses = await hammer(601, '/api/partner/v1/events', a);
    expect(statuses.slice(0, 600).every((s) => s !== 429)).toBe(true);
    expect(statuses[600]).toBe(429);
    // Same IP, another partner key: its own bucket.
    expect((await call('/api/partner/v1/events', { authorization: 'Bearer cpk_rate_B', 'x-forwarded-for': '10.0.0.1' })).status).not.toBe(429);
    // The partner traffic did not consume the admin bucket for that IP.
    expect((await call('/api/admin/anything', { 'x-forwarded-for': '10.0.0.1' })).status).not.toBe(429);
  });

  it('falls back to the client IP when there is no bearer token', async () => {
    const statuses = await hammer(601, '/api/partner/v1/session', { 'x-forwarded-for': '10.0.0.2' });
    expect(statuses[599]).not.toBe(429);
    expect(statuses[600]).toBe(429);
    expect((await call('/api/partner/v1/session', { 'x-forwarded-for': '10.0.0.3' })).status).not.toBe(429);
  });
});
