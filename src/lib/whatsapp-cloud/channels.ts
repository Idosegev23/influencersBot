import { supabase } from '@/lib/supabase';
import { redisGet, redisSet, redisDel } from '@/lib/redis';
import { readToken } from '@/lib/whatsapp-cloud/channel-tokens';

/**
 * A business WhatsApp number. NOT to be confused with whatsapp_cs_sessions.channel,
 * which is the MEDIUM (whatsapp|instagram|widget|web_chat).
 */
export interface WaChannel {
  id: string;
  accountId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  token: string;
  status: string;
  paymentReady: boolean;
}

/** What we put in Redis: everything EXCEPT the token and the secret id. */
type CachedChannel = Omit<WaChannel, 'token'> & { tokenSecretId: string };

const TTL_SECONDS = 60;
const cacheKey = (kind: 'acct' | 'pnid' | 'id', v: string) => `wa:chan:${kind}:${v}`;
const RESOLVABLE = new Set(['active', 'pending']);

function toCached(row: any): CachedChannel {
  return {
    id: row.id,
    accountId: row.account_id,
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id,
    displayPhoneNumber: row.display_phone_number ?? null,
    verifiedName: row.verified_name ?? null,
    tokenSecretId: row.token_secret_id,
    status: row.status,
    paymentReady: Boolean(row.payment_ready),
  };
}

async function hydrate(cached: CachedChannel): Promise<WaChannel> {
  const { tokenSecretId, ...rest } = cached;
  return { ...rest, token: await readToken(tokenSecretId) };
}

async function lookup(kind: 'acct' | 'pnid' | 'id', column: string, value: string): Promise<WaChannel | null> {
  const key = cacheKey(kind, value);

  const hit = await redisGet<string>(key).catch(() => null);
  if (hit) {
    try {
      return await hydrate(typeof hit === 'string' ? (JSON.parse(hit) as CachedChannel) : (hit as CachedChannel));
    } catch {
      /* corrupt cache entry — fall through to the database */
    }
  }

  const { data, error } = await supabase
    .from('whatsapp_channels')
    .select('id, account_id, waba_id, phone_number_id, display_phone_number, verified_name, token_secret_id, status, payment_ready')
    .eq(column, value)
    .maybeSingle();
  if (error) throw new Error(`channel lookup failed (${column}=${value}): ${error.message}`);
  if (!data) return null;
  if (!RESOLVABLE.has((data as any).status)) return null;

  const cached = toCached(data);
  // The token is deliberately absent from the cached payload — it is decrypted per read.
  await redisSet(key, JSON.stringify(cached), TTL_SECONDS).catch(() => {});
  return hydrate(cached);
}

/**
 * Outbound sends for a known account. THROWS — a missing channel must never silently
 * become a send from Bestie's number (spec D4).
 */
export async function resolveChannelByAccount(accountId: string): Promise<WaChannel> {
  const ch = await lookup('acct', 'account_id', accountId);
  if (!ch) throw new Error(`no WhatsApp channel for account ${accountId}`);
  return ch;
}

/** Inbound routing. Null for an unknown number — the webhook logs and still returns 200. */
export async function resolveChannelByPhoneNumberId(pnid: string): Promise<WaChannel | null> {
  if (!pnid) return null;
  return lookup('pnid', 'phone_number_id', pnid);
}

/**
 * Queued work carries the channel id, not the whole channel — the drain worker rehydrates
 * it here. THROWS: a queued job whose channel vanished must fail loudly, never fall back
 * to sending from Bestie's number on someone else's behalf.
 */
export async function resolveWaChannelById(waChannelId: string): Promise<WaChannel> {
  const ch = await lookup('id', 'id', waChannelId);
  if (!ch) throw new Error(`WhatsApp channel ${waChannelId} not found or not active`);
  return ch;
}

/**
 * Bestie's own number. Internal ops (CRM notifies, pipeline alerts, trial reminders)
 * call this explicitly at the send site — explicit, but not threaded through call stacks
 * that have no tenant concept.
 */
export async function getBestieChannel(): Promise<WaChannel> {
  const accountId = process.env.BESTIE_ACCOUNT_ID;
  if (!accountId) throw new Error('BESTIE_ACCOUNT_ID is not set — cannot resolve Bestie WhatsApp channel');
  return resolveChannelByAccount(accountId);
}

export async function invalidateChannelCache(
  channel: { accountId: string; phoneNumberId: string },
): Promise<void> {
  await redisDel(cacheKey('acct', channel.accountId), cacheKey('pnid', channel.phoneNumberId)).catch(() => {});
}
