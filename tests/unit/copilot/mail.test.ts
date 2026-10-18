// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));

import { sendCopilotMail, MAIL_CAP_PER_HOUR, MAIL_TIMEOUT_MS } from '@/lib/copilot/mail';

const ok = { allowed: true, remaining: 5, resetAt: 0, retryAfterMs: 0 };
const opts = { to: ['staff@aba.org'], subject: 's', html: '<p>x</p>' };

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('sendCopilotMail', () => {
  it('sends through the per-association hourly bucket', async () => {
    const limiter = vi.fn(async () => ok);
    const send = vi.fn(async () => ({ success: true }));
    expect(await sendCopilotMail('acc', opts, { limiter, available: () => true, send })).toEqual({ success: true });
    expect(MAIL_CAP_PER_HOUR).toBe(30);
    expect(limiter).toHaveBeenCalledWith(expect.objectContaining({ key: 'rl:copilot:mail:acc', limit: 30, windowMs: 3_600_000 }));
    expect(send).toHaveBeenCalledWith(opts);
  });

  it('skips the send and logs when the cap is reached', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn(async () => ({ success: true }));
    const r = await sendCopilotMail('acc', opts, { limiter: vi.fn(async () => ({ ...ok, allowed: false })), available: () => true, send });
    expect(r).toEqual({ success: false, skipped: 'mail_cap', error: 'mail_cap' });
    expect(send).not.toHaveBeenCalled();
    expect(err.mock.calls.some((c) => c[0] === '[copilot/mail]')).toBe(true);
  });

  it('fails closed when Redis is unavailable or the limiter returns null', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn(async () => ({ success: true }));
    expect(await sendCopilotMail('acc', opts, { limiter: vi.fn(async () => ok), available: () => false, send })).toMatchObject({ success: false, skipped: 'limiter_unavailable' });
    expect(await sendCopilotMail('acc', opts, { limiter: vi.fn(async () => null), available: () => true, send })).toMatchObject({ success: false, skipped: 'limiter_unavailable' });
    expect(send).not.toHaveBeenCalled();
  });

  it('gives up after the timeout and logs, without throwing', async () => {
    vi.useFakeTimers();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn(() => new Promise<any>(() => {}));
    const p = sendCopilotMail('acc', opts, { limiter: vi.fn(async () => ok), available: () => true, send });
    await vi.advanceTimersByTimeAsync(MAIL_TIMEOUT_MS - 1);
    let settled = false;
    p.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toEqual({ success: false, error: 'timeout' });
    expect(MAIL_TIMEOUT_MS).toBe(10_000);
    expect(err.mock.calls.some((c) => c[0] === '[copilot/mail]' && String(c[1]).includes('timed out'))).toBe(true);
  });

  it('turns a thrown send into a failure result', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await sendCopilotMail('acc', opts, { limiter: vi.fn(async () => ok), available: () => true, send: vi.fn(async () => { throw new Error('boom'); }) });
    expect(r).toEqual({ success: false, error: 'boom' });
  });
});
