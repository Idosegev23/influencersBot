import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/scraping/youtubeScraper', () => ({ getYoutubeChannel: vi.fn(), getYoutubeVideos: vi.fn().mockResolvedValue([]), getYoutubeTranscript: vi.fn() }));
vi.mock('@/lib/scraping/tiktokScraper', () => ({ getTiktokProfile: vi.fn(), getTiktokVideos: vi.fn().mockResolvedValue([]), getTiktokTranscript: vi.fn() }));
vi.mock('@/lib/pipeline/state', () => ({ setCount: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));

describe('social scan steps', () => {
  it('youtube-scan skips (advance) when no youtube source', async () => {
    const { youtubeScanStep } = await import('@/lib/pipeline/steps/youtube-scan');
    const res = await youtubeScanStep({ jobId: 'j', accountId: 'a', username: 'u', step: 'youtube-scan', batch: 0, state: { options: {} } } as any);
    expect(res.status).toBe('advance');
  });
  it('tiktok-scan skips (advance) when no tiktok source', async () => {
    const { tiktokScanStep } = await import('@/lib/pipeline/steps/tiktok-scan');
    const res = await tiktokScanStep({ jobId: 'j', accountId: 'a', username: 'u', step: 'tiktok-scan', batch: 0, state: { options: {} } } as any);
    expect(res.status).toBe('advance');
  });

  it('enrich mode: youtube-scan skips when enriching only tiktok (even with a youtube source)', async () => {
    const { youtubeScanStep } = await import('@/lib/pipeline/steps/youtube-scan');
    const res = await youtubeScanStep({ jobId: 'j', accountId: 'a', username: 'u', step: 'youtube-scan', batch: 0, state: { options: { youtube: '@x', enrichSources: ['tiktok'] } } } as any);
    expect(res.status).toBe('advance');
  });

  it('enrichSkips: no enrichSources → runs all; else only listed sources run', async () => {
    const { enrichSkips } = await import('@/lib/pipeline/steps/index');
    const ctx = (enrichSources?: string[]) => ({ state: { options: enrichSources ? { enrichSources } : {} } } as any);
    expect(enrichSkips(ctx(), 'youtube')).toBe(false); // full scan
    expect(enrichSkips(ctx(['tiktok']), 'tiktok')).toBe(false); // the enriched source runs
    expect(enrichSkips(ctx(['tiktok']), 'youtube')).toBe(true); // others skip
    expect(enrichSkips(ctx(['tiktok']), 'instagram')).toBe(true);
    expect(enrichSkips(ctx(['tiktok']), 'website')).toBe(true);
  });
});
