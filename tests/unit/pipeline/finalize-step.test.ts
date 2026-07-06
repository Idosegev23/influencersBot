import { describe, it, expect, vi } from 'vitest';
const updated: any[] = [];
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { config: { avatar_url: 'x' } } }) }) }),
    update: (patch: any) => ({ eq: async () => { updated.push(patch); return {}; } }),
  }),
}) }));
vi.mock('@/lib/chat-ui/generate-tab-config', () => ({ generateTabConfig: vi.fn().mockResolvedValue(undefined) }));
describe('finalizeStep', () => {
  it('merges identity back into config (guard) and sets isDemo', async () => {
    const { finalizeStep } = await import('@/lib/pipeline/steps/finalize');
    const res = await finalizeStep({ jobId: 'j1', accountId: 'a1', username: 'carolinalemkeberlin.il', step: 'finalize', batch: 0, state: { websiteUrl: 'https://carolinalemke.co.il', options: { isDemo: true } } as any });
    const cfg = updated.find(p => p.config)?.config;
    expect(cfg.username).toBe('carolinalemkeberlin.il');
    expect(cfg.isDemo).toBe(true);
    expect(res.status).toBe('advance');
  });
});
