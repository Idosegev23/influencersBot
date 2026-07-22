import { describe, it, expect, vi, beforeEach } from 'vitest';

const publishJSON = vi.fn();
vi.mock('@/lib/pipeline/qstash', () => ({
  getQStash: () => ({ publishJSON: (...a: any[]) => publishJSON(...a) }),
}));

describe('publishCsDrain', () => {
  beforeEach(() => { vi.clearAllMocks(); publishJSON.mockResolvedValue({}); });

  it('publishes a drain trigger targeting /api/cs/wa-worker with a colon-free bucket id', async () => {
    const { publishCsDrain } = await import('@/lib/cs/wa-cs-publish');
    await publishCsDrain('972500000000');
    const payload = publishJSON.mock.calls[0][0];
    expect(payload.url).toMatch(/\/api\/cs\/wa-worker$/);
    expect(payload.body).toEqual({ drain: true, waId: '972500000000' });
    expect(payload.retries).toBe(3);
    expect(payload.deduplicationId).not.toContain(':');
    expect(payload.deduplicationId).toMatch(/^csdrain_972500000000_\d+$/);
  });

  it('force uses a unique id so a continuation is never swallowed', async () => {
    const { publishCsDrain } = await import('@/lib/cs/wa-cs-publish');
    await publishCsDrain('x', { force: true });
    expect(publishJSON.mock.calls[0][0].deduplicationId).toMatch(/^csdrain_x_f_\d+$/);
  });

  it('retries a transient publish blip 3x before throwing', async () => {
    publishJSON.mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce({});
    const { publishCsDrain } = await import('@/lib/cs/wa-cs-publish');
    await publishCsDrain('x');
    expect(publishJSON).toHaveBeenCalledTimes(2);
  });
});
