import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { OPTIONS } from '@/app/api/widget/recommendations/click/route';

describe('recommendations/click CORS', () => {
  it('answers OPTIONS preflight with 204 and ACAO echoing the origin', async () => {
    const req = new NextRequest('https://bestie.ldrsgroup.com/api/widget/recommendations/click', {
      method: 'OPTIONS',
      headers: { origin: 'https://argania-oil.co.il' },
    });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://argania-oil.co.il');
    expect(res.headers.get('access-control-allow-methods') || '').toContain('POST');
  });
});
