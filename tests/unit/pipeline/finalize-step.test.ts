import { describe, it, expect, vi } from 'vitest';
const updated: any[] = [];
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: { config: { avatar_url: 'x' } } }) }) }),
    update: (patch: any) => ({ eq: async () => { updated.push(patch); return {}; } }),
  }),
}) }));
vi.mock('@/lib/chat-ui/generate-tab-config', () => ({ generateTabConfig: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/processing/generate-chat-config', () => ({ generateAndSaveChatConfig: vi.fn().mockResolvedValue({}) }));
describe('finalizeStep', () => {
  it('merges identity back into config (guard), sets isDemo, and applies archetype from options', async () => {
    updated.length = 0;
    const { finalizeStep } = await import('@/lib/pipeline/steps/finalize');
    const res = await finalizeStep({ jobId: 'j1', accountId: 'a1', username: 'carolinalemkeberlin.il', step: 'finalize', batch: 0, state: { websiteUrl: 'https://carolinalemke.co.il', options: { isDemo: true, archetype: 'brand' } } as any });
    const cfg = updated.find(p => p.config)?.config;
    expect(cfg.username).toBe('carolinalemkeberlin.il');
    expect(cfg.isDemo).toBe(true);
    expect(cfg.archetype).toBe('brand');
    expect(res.status).toBe('advance');
  });

  it('falls back to influencer archetype when no website and none given', async () => {
    updated.length = 0;
    const { finalizeStep } = await import('@/lib/pipeline/steps/finalize');
    await finalizeStep({ jobId: 'j2', accountId: 'a2', username: 'someinfluencer', step: 'finalize', batch: 0, state: { options: { isDemo: true } } as any });
    const cfg = updated.find(p => p.config)?.config;
    expect(cfg.archetype).toBe('influencer');
  });
});
