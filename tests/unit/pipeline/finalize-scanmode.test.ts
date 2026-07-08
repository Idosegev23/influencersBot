import { describe, it, expect, vi } from 'vitest';
const updated: any[] = [];
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: {} } }) }) }), update: (p: any) => ({ eq: async () => { updated.push(p); return {}; } }) }) }) }));
vi.mock('@/lib/chat-ui/generate-tab-config', () => ({ generateTabConfig: vi.fn() }));
vi.mock('@/lib/processing/generate-chat-config', () => ({ generateAndSaveChatConfig: vi.fn() }));
describe('finalize scan_mode', () => {
  it('writes scan_mode and scanned_categories', async () => {
    updated.length = 0;
    const { finalizeStep } = await import('@/lib/pipeline/steps/finalize');
    await finalizeStep({ jobId: 'j', accountId: 'a', username: 's.com', step: 'finalize', batch: 0, state: { websiteUrl: 'https://s.com', options: { isDemo: true, scanMode: 'quote', categories: [{ pathPattern: '/', cap: 30 }], archetype: 'brand' } } as any });
    const cfg = updated.find(p => p.config)?.config;
    expect(cfg.scan_mode).toBe('quote');
    expect(cfg.scanned_categories[0].cap).toBe(30);
  });
});
