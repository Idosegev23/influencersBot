import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { OPTIONS } from '@/app/api/widget/events/route';
describe('widget/events CORS', () => {
  it('OPTIONS → 204 + ACAO echo', async () => {
    const req = new NextRequest('https://x/api/widget/events', { method: 'OPTIONS', headers: { origin: 'https://argania-oil.co.il' } });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://argania-oil.co.il');
  });
});
