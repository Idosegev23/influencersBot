import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/pipeline/steps/index', () => ({ hasInstagram: () => false }));
const buildFromWeb = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/ai/persona-from-website', () => ({ buildPersonaFromWebsite: buildFromWeb }));
vi.mock('@/lib/scraping/preprocessing', () => ({ preprocessInstagramData: vi.fn() }));
vi.mock('@/lib/ai/gemini-persona-builder', () => ({ buildPersonaWithGemini: vi.fn(), savePersonaToDatabase: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { config: {} } }) }) }) }) }) }));
describe('persona-build website branch', () => {
  it('uses buildPersonaFromWebsite when no instagram', async () => {
    const { personaBuildStep } = await import('@/lib/pipeline/steps/persona-build');
    const res = await personaBuildStep({ jobId: 'j', accountId: 'a', username: 's.com', step: 'persona-build', batch: 0, state: { websiteUrl: 'https://s.com', options: {} } as any });
    expect(buildFromWeb).toHaveBeenCalledWith('a');
    expect(res.status).toBe('advance');
  });
});
