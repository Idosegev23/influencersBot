/**
 * Server-side conversion API dispatcher.
 *
 * Mirrors the most important client events (lead, schedule, contact)
 * to Meta Conversions API and TikTok Events API so iOS 14.5+ blocked
 * client pixels still get reliable signal. Each platform has its own
 * env token; if either is missing we no-op for that platform without
 * breaking the caller.
 *
 * The same `event_id` is sent client + server → Meta and TikTok
 * deduplicate automatically.
 */

import crypto from 'node:crypto';

const META_PIXEL_ID = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID;
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN;
const META_CAPI_TEST_CODE = process.env.META_CAPI_TEST_CODE; // for the Meta Events Manager test tab

const TIKTOK_PIXEL_ID = process.env.TIKTOK_PIXEL_ID || process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
const TIKTOK_EVENTS_TOKEN = process.env.TIKTOK_EVENTS_TOKEN;

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export interface ServerEventInput {
  /** Client-side event_id for dedup; if absent, server generates one. */
  eventId?: string;
  /** Our canonical event name (e.g. lead_form_submitted). */
  eventName: string;
  /** Override Meta event name if our default mapping is wrong. */
  metaEventName?: string;
  /** Override TikTok event name if our default mapping is wrong. */
  tiktokEventName?: string;
  /** Visitor identity — we hash on the way out. */
  email?: string | null;
  phone?: string | null;
  externalId?: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Source URL the visitor was on when the conversion fired. */
  eventSourceUrl?: string;
  /** Any additional event-level params to forward. */
  customData?: Record<string, any>;
  /** Visitor's IP + UA — use req.headers if available, helps Meta match. */
  clientIpAddress?: string;
  clientUserAgent?: string;
  /** Optional value/currency for revenue events. */
  value?: number;
  currency?: string;
}

const META_EVENT_DEFAULT: Record<string, string> = {
  lead_form_submitted: 'Lead',
  service_brief_submitted: 'Lead',
  meeting_request_submitted: 'Schedule',
  handoff_form_submitted: 'Contact',
  itamar_replied: 'Contact',
};
const TIKTOK_EVENT_DEFAULT: Record<string, string> = {
  lead_form_submitted: 'SubmitForm',
  service_brief_submitted: 'CompleteRegistration',
  meeting_request_submitted: 'Contact',
  handoff_form_submitted: 'Contact',
  itamar_replied: 'Contact',
};

export async function emitServerConversion(input: ServerEventInput): Promise<{
  meta: { ok: boolean; status?: number; error?: any };
  tiktok: { ok: boolean; status?: number; error?: any };
}> {
  const eventId = input.eventId || `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const eventTime = Math.floor(Date.now() / 1000);

  const emEmail = input.email ? sha256(input.email) : undefined;
  const emPhone = input.phone ? sha256(input.phone.replace(/\D/g, '')) : undefined;

  const metaEventName = input.metaEventName || META_EVENT_DEFAULT[input.eventName] || input.eventName;
  const tiktokEventName =
    input.tiktokEventName || TIKTOK_EVENT_DEFAULT[input.eventName] || input.eventName;

  const metaResult = await sendMetaCAPI({
    eventName: metaEventName,
    eventId,
    eventTime,
    eventSourceUrl: input.eventSourceUrl,
    emEmail,
    emPhone,
    externalId: input.externalId,
    firstName: input.firstName ? sha256(input.firstName) : undefined,
    lastName: input.lastName ? sha256(input.lastName) : undefined,
    clientIpAddress: input.clientIpAddress,
    clientUserAgent: input.clientUserAgent,
    customData: input.customData,
    value: input.value,
    currency: input.currency,
  });

  const ttkResult = await sendTikTokEvents({
    eventName: tiktokEventName,
    eventId,
    eventTime,
    eventSourceUrl: input.eventSourceUrl,
    emEmail,
    emPhone,
    externalId: input.externalId,
    clientIpAddress: input.clientIpAddress,
    clientUserAgent: input.clientUserAgent,
    customData: input.customData,
    value: input.value,
    currency: input.currency,
  });

  return { meta: metaResult, tiktok: ttkResult };
}

// ---------------------------------------------------------------------------
// Meta Conversions API
// ---------------------------------------------------------------------------

async function sendMetaCAPI(args: {
  eventName: string;
  eventId: string;
  eventTime: number;
  eventSourceUrl?: string;
  emEmail?: string;
  emPhone?: string;
  externalId?: string;
  firstName?: string;
  lastName?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  customData?: Record<string, any>;
  value?: number;
  currency?: string;
}): Promise<{ ok: boolean; status?: number; error?: any }> {
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) {
    return { ok: false, error: 'meta_capi_not_configured' };
  }
  const userData: Record<string, any> = {};
  if (args.emEmail) userData.em = [args.emEmail];
  if (args.emPhone) userData.ph = [args.emPhone];
  if (args.externalId) userData.external_id = [args.externalId];
  if (args.firstName) userData.fn = [args.firstName];
  if (args.lastName) userData.ln = [args.lastName];
  if (args.clientIpAddress) userData.client_ip_address = args.clientIpAddress;
  if (args.clientUserAgent) userData.client_user_agent = args.clientUserAgent;

  const event: Record<string, any> = {
    event_name: args.eventName,
    event_time: args.eventTime,
    event_id: args.eventId,
    action_source: 'website',
    user_data: userData,
  };
  if (args.eventSourceUrl) event.event_source_url = args.eventSourceUrl;
  const customData: Record<string, any> = { ...(args.customData || {}) };
  if (args.value !== undefined) customData.value = args.value;
  if (args.currency) customData.currency = args.currency;
  if (Object.keys(customData).length) event.custom_data = customData;

  const url = `https://graph.facebook.com/v22.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`;
  const body: Record<string, any> = { data: [event] };
  if (META_CAPI_TEST_CODE) body.test_event_code = META_CAPI_TEST_CODE;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: txt.slice(0, 400) };
    }
    return { ok: true, status: res.status };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'meta_capi_threw' };
  }
}

// ---------------------------------------------------------------------------
// TikTok Events API v2 (Pixel)
// ---------------------------------------------------------------------------

async function sendTikTokEvents(args: {
  eventName: string;
  eventId: string;
  eventTime: number;
  eventSourceUrl?: string;
  emEmail?: string;
  emPhone?: string;
  externalId?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  customData?: Record<string, any>;
  value?: number;
  currency?: string;
}): Promise<{ ok: boolean; status?: number; error?: any }> {
  if (!TIKTOK_PIXEL_ID || !TIKTOK_EVENTS_TOKEN) {
    return { ok: false, error: 'tiktok_events_not_configured' };
  }

  const userData: Record<string, any> = {};
  if (args.emEmail) userData.email = args.emEmail;
  if (args.emPhone) userData.phone = args.emPhone;
  if (args.externalId) userData.external_id = args.externalId;
  if (args.clientIpAddress) userData.ip = args.clientIpAddress;
  if (args.clientUserAgent) userData.user_agent = args.clientUserAgent;

  const properties: Record<string, any> = { ...(args.customData || {}) };
  if (args.value !== undefined) properties.value = args.value;
  if (args.currency) properties.currency = args.currency;

  const payload = {
    event_source: 'web',
    event_source_id: TIKTOK_PIXEL_ID,
    data: [
      {
        event: args.eventName,
        event_time: args.eventTime,
        event_id: args.eventId,
        page: args.eventSourceUrl ? { url: args.eventSourceUrl } : undefined,
        user: userData,
        properties,
      },
    ],
  };

  try {
    const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': TIKTOK_EVENTS_TOKEN,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: txt.slice(0, 400) };
    }
    return { ok: true, status: res.status };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'tiktok_events_threw' };
  }
}
