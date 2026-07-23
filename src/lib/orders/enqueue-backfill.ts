// Kick off a FULL order backfill in the background. The heavy work (paginate ALL of a store's
// orders into brand_orders) runs in the QStash-triggered /api/cs/orders-backfill route (maxDuration
// 300s) — NOT inline in a request — because a big catalog takes minutes. This is the durable fix for
// "order not found" on older orders: the 10-min sync cron only keeps the recent ~1000 fresh, so
// without a full backfill on connect the rest of a store's history is never cached (and QuickShop has
// no order_number filter, so an order MUST be in brand_orders to be found).
import { getQStash } from '@/lib/pipeline/qstash';

const BASE_URL = process.env.PIPELINE_BASE_URL || 'https://influencers-bot.vercel.app';

export async function enqueueOrdersBackfill(accountId: string): Promise<{ queued: boolean; error?: string }> {
  try {
    await getQStash().publishJSON({
      url: `${BASE_URL}/api/cs/orders-backfill`,
      body: { accountId },
      retries: 2,
    });
    return { queued: true };
  } catch (e) {
    console.error('[enqueueOrdersBackfill] failed', (e as Error).message);
    return { queued: false, error: (e as Error).message };
  }
}
