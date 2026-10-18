/**
 * Every Co-Pilot mail to association staff (contact notes, escalations) goes
 * through here: one per-association hourly cap and a hard send timeout, so a
 * flood of visitors cannot flood a staff inbox or hold a request open on Gmail.
 * The cap fails closed: without Redis no mail is sent.
 */
import crypto from 'node:crypto';
import { redisSlidingWindowRateLimit, isRedisAvailable } from '@/lib/redis';
import { sendEmail, type SendEmailOptions } from '@/lib/email';

export const MAIL_CAP_PER_HOUR = 30;
export const MAIL_TIMEOUT_MS = 10_000;
const HOUR_MS = 60 * 60 * 1000;

export type CopilotMailResult = { success: boolean; error?: string; skipped?: 'mail_cap' | 'limiter_unavailable' };

const log = (...a: unknown[]) => console.error('[copilot/mail]', ...a);

export async function sendCopilotMail(
  accountId: string,
  options: SendEmailOptions,
  deps: { send?: typeof sendEmail; limiter?: typeof redisSlidingWindowRateLimit; available?: () => boolean; timeoutMs?: number } = {},
): Promise<CopilotMailResult> {
  const send = deps.send ?? sendEmail;
  const limiter = deps.limiter ?? redisSlidingWindowRateLimit;
  const available = deps.available ?? isRedisAvailable;
  const timeoutMs = deps.timeoutMs ?? MAIL_TIMEOUT_MS;

  let r: Awaited<ReturnType<typeof redisSlidingWindowRateLimit>> = null;
  try {
    if (available()) {
      r = await limiter({ key: `rl:copilot:mail:${accountId}`, limit: MAIL_CAP_PER_HOUR, windowMs: HOUR_MS, identifier: crypto.randomUUID() });
    }
  } catch (e) {
    log('limiter threw', accountId, e);
  }
  if (!r) {
    log('mail limiter unavailable, not sending', accountId);
    return { success: false, skipped: 'limiter_unavailable', error: 'limiter_unavailable' };
  }
  if (!r.allowed) {
    log('mail cap reached, not sending', accountId);
    return { success: false, skipped: 'mail_cap', error: 'mail_cap' };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<CopilotMailResult>((resolve) => {
    timer = setTimeout(() => {
      log(`send timed out after ${timeoutMs}ms`, accountId);
      resolve({ success: false, error: 'timeout' });
    }, timeoutMs);
  });
  try {
    const sent = send(options).then(
      (res) => ({ success: !!res?.success, ...(res?.error ? { error: res.error } : {}) }),
      (e: unknown) => ({ success: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return await Promise.race([sent, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
