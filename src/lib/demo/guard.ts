/**
 * Server-side enforcement of the demo window.
 *
 * The lock screen in the UI is the sales pitch; THIS is the lock. Without a
 * server-side refusal, anyone who opens devtools keeps talking to the bot after
 * the demo has expired, and the whole feature is decoration.
 *
 * Every guarded route already resolves its own account, so the cheap path is
 * `demoAccessFromConfig(cfg)` on the object the route is holding. Routes that
 * genuinely have nothing to hand (the widget preview proxy) use the
 * `*ByAccountId` lookup instead.
 *
 * Guarded entry points:
 *   /api/chat/stream, /api/chat/sandwich, /api/chat/init,
 *   /api/widget/chat, /api/widget/preview/[accountId]
 *
 * `/api/influencer/profile` is deliberately NOT guarded — the lock screen needs
 * the brand name and avatar in order to render, and that route already strips
 * secrets via sanitizeInfluencerForClient.
 */

import { resolveDemoAccess, type DemoAccess } from './access';

export const DEMO_EXPIRED_CODE = 'demo_expired';

/** Shape returned to clients on refusal — the UI switches to the lock screen on this code. */
export interface DemoExpiredBody {
  error: typeof DEMO_EXPIRED_CODE;
  message: string;
  endsAt: string | null;
}

export function demoExpiredBody(access: DemoAccess): DemoExpiredBody {
  return {
    error: DEMO_EXPIRED_CODE,
    message: 'תקופת ההתנסות בדמו הסתיימה',
    endsAt: access.endsAt,
  };
}

/** The window for an account whose config the caller already has in hand. */
export function demoAccessFromConfig(config: unknown, now?: Date): DemoAccess {
  return resolveDemoAccess({ config }, now);
}

/** True when this config belongs to a timed demo whose window has closed. */
export function isConfigDemoLocked(config: unknown, now?: Date): boolean {
  return demoAccessFromConfig(config, now).state === 'locked';
}

/**
 * The window for an account we only know by id.
 *
 * Fails OPEN on any lookup error, matching the rule in access.ts: a database
 * hiccup must not put a sales screen in front of a paying customer.
 */
export async function demoAccessByAccountId(
  supabase: { from: (t: string) => any },
  accountId: string,
  now?: Date,
): Promise<DemoAccess> {
  try {
    const { data } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', accountId)
      .single();
    return resolveDemoAccess({ config: data?.config }, now);
  } catch {
    return { state: 'open', endsAt: null, daysLeft: null };
  }
}
