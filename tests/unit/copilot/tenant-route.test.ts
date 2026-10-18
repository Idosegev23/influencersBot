// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireTenant = vi.fn();
vi.mock('@/lib/copilot/auth', () => ({ requireTenant: (...a: any[]) => requireTenant(...a) }));

let assocConfig: Record<string, any> = {};
let assocBranding: Record<string, unknown> = {};
let assocNull = false;
vi.mock('@/lib/copilot/association', () => ({
  loadAssociation: async () =>
    assocNull ? null : { accountId: 'acc', partnerId: 'pA', industry: null, branding: assocBranding, openingQuestions: [], config: assocConfig },
}));

let partnerRow: any = null;
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: table === 'partners' && partnerRow && partnerRow.id === id ? partnerRow : null }) }) }),
    }),
  },
}));

import { GET } from '@/app/api/partner/v1/tenant/route';

const ASSOC = { partnerId: 'pA', accountId: 'acc', host: 'aba.copilot.test' };
const PARTNER = { partnerId: 'pA', accountId: null, host: 'app.copilot.test' };

function req() {
  return new Request('http://x/api/partner/v1/tenant', { method: 'GET' }) as any;
}

beforeEach(() => {
  requireTenant.mockReset();
  requireTenant.mockResolvedValue(ASSOC);
  assocNull = false;
  assocBranding = { primary: '#0b2a4a' };
  assocConfig = {
    display_name: 'American Bus Association',
    username: 'aba',
    website_url: 'https://www.buses.org/',
    copilot: { opening_questions: ['How do I join?'], allowed_origins: ['https://members.buses.org'] },
  };
  partnerRow = { id: 'pA', name: 'Multiview', branding: { logo: 'x.png' } };
});

describe('GET /tenant', () => {
  it('asks for either host kind', async () => {
    await GET(req());
    expect(requireTenant).toHaveBeenCalledWith(expect.anything(), { association: false });
  });

  it('returns the full association shape with origins from website_url and config', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=60');
    expect(await res.json()).toEqual({
      kind: 'association',
      name: 'American Bus Association',
      branding: { primary: '#0b2a4a' },
      openingQuestions: ['How do I join?'],
      allowedOrigins: ['https://www.buses.org', 'https://members.buses.org'],
    });
  });

  it('falls back to username for the name', async () => {
    delete assocConfig.display_name;
    expect((await (await GET(req())).json()).name).toBe('aba');
  });

  it('drops invalid allowed_origins entries', async () => {
    assocConfig.copilot.allowed_origins = ['javascript:x', 'not a url', 'ftp://files.buses.org', 42, 'https://members.buses.org/path?q=1'];
    expect((await (await GET(req())).json()).allowedOrigins).toEqual(['https://www.buses.org', 'https://members.buses.org']);
  });

  it('falls back to suggested_questions and caps at 6 strings', async () => {
    delete assocConfig.copilot.opening_questions;
    assocConfig.suggested_questions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 7];
    expect((await (await GET(req())).json()).openingQuestions).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('answers 404 when the association cannot be loaded', async () => {
    assocNull = true;
    expect((await GET(req())).status).toBe(404);
  });

  it('returns the partner name and branding on a partner host', async () => {
    requireTenant.mockResolvedValue(PARTNER);
    const res = await GET(req());
    expect(await res.json()).toEqual({ kind: 'partner', name: 'Multiview', branding: { logo: 'x.png' }, openingQuestions: [], allowedOrigins: [] });
  });

  it('answers 404 when the partner row is missing', async () => {
    requireTenant.mockResolvedValue(PARTNER);
    partnerRow = null;
    expect((await GET(req())).status).toBe(404);
  });

  it('passes through a tenant refusal', async () => {
    requireTenant.mockResolvedValue(Response.json({ error: 'host_not_owned' }, { status: 403 }));
    expect((await GET(req())).status).toBe(403);
  });

  it('names no vendors in the body', async () => {
    const text = JSON.stringify(await (await GET(req())).json()).toLowerCase();
    for (const v of ['openai', 'gemini', 'anthropic', 'claude', 'gpt', 'supabase', 'apify']) expect(text).not.toContain(v);
  });
});
