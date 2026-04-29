/**
 * Unified analytics dispatcher: every event we care about goes through
 * track() and is fanned out to gtag (GA4), fbq (Meta), and ttq (TikTok).
 *
 * Each pixel receives the appropriate event name per its convention:
 *   - GA4:    snake_case standard or custom
 *   - Meta:   PascalCase standard (Lead, Schedule, ViewContent…) when we
 *             have a mapping, otherwise trackCustom with the original name
 *   - TikTok: PascalCase standard event name, otherwise the original
 *
 * The same set of params flows to all three; client-side identity bits
 * (client_id, session_id, attribution) are merged in automatically.
 */

import type { AnalyticsEventName, EventParams, GlobalParams } from './types';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    ttq?: {
      track: (event: string, params?: any, options?: any) => void;
      identify: (params: any) => void;
      page: () => void;
      [k: string]: any;
    };
    dataLayer?: any[];
    __debugTrack?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Mappings — our event name → each pixel's expected name
// ---------------------------------------------------------------------------

const META_EVENT_MAP: Partial<Record<AnalyticsEventName, string>> = {
  page_load: 'PageView',
  lead_form_submitted: 'Lead',
  service_brief_submitted: 'Lead',
  support_form_submitted: 'Lead',
  widget_lead_submitted: 'Lead',
  meeting_request_submitted: 'Schedule',
  meeting_request_initiated: 'InitiateCheckout',
  service_card_opened: 'ViewContent',
  reel_clicked: 'ViewContent',
  case_study_clicked: 'ViewContent',
  highlight_clicked: 'ViewContent',
  brand_card_opened: 'ViewContent',
  product_card_clicked: 'ViewContent',
  topic_question_clicked: 'ViewContent',
  content_card_clicked: 'ViewContent',
  product_buy_clicked: 'AddToCart',
  coupon_revealed: 'ViewContent',
  coupon_copied: 'AddToCart',
  coupon_redeemed_clicked: 'AddToCart',
  handoff_form_submitted: 'Contact',
  whatsapp_link_clicked: 'Contact',
  phone_clicked: 'Contact',
  email_clicked: 'Contact',
};

const TIKTOK_EVENT_MAP: Partial<Record<AnalyticsEventName, string>> = {
  page_load: 'Pageview',
  lead_form_submitted: 'SubmitForm',
  service_brief_submitted: 'CompleteRegistration',
  support_form_submitted: 'SubmitForm',
  widget_lead_submitted: 'SubmitForm',
  meeting_request_submitted: 'Contact',
  meeting_request_initiated: 'AddToCart',
  service_card_opened: 'ViewContent',
  reel_clicked: 'ViewContent',
  case_study_clicked: 'ViewContent',
  highlight_clicked: 'ViewContent',
  brand_card_opened: 'ViewContent',
  product_card_clicked: 'ViewContent',
  topic_question_clicked: 'ViewContent',
  content_card_clicked: 'ViewContent',
  product_buy_clicked: 'AddToCart',
  coupon_revealed: 'ViewContent',
  coupon_copied: 'AddToCart',
  coupon_redeemed_clicked: 'AddToCart',
  handoff_form_submitted: 'Contact',
  whatsapp_link_clicked: 'Contact',
  phone_clicked: 'Contact',
  email_clicked: 'Contact',
};

const GA4_EVENT_MAP: Partial<Record<AnalyticsEventName, string>> = {
  page_load: 'page_view',
  lead_form_submitted: 'generate_lead',
  service_brief_submitted: 'generate_lead',
  support_form_submitted: 'generate_lead',
  widget_lead_submitted: 'generate_lead',
  meeting_request_submitted: 'schedule',
  handoff_form_submitted: 'contact',
  coupon_copied: 'select_promotion',
  coupon_redeemed_clicked: 'select_promotion',
  product_buy_clicked: 'select_item',
  product_card_clicked: 'view_item',
  brand_card_opened: 'view_item',
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const CLIENT_ID_KEY = 'ldrs_track_client_id';
const ATTRIBUTION_KEY = 'ldrs_track_attribution';
const SESSION_START_KEY = 'ldrs_track_session_start';
const VISIT_COUNT_KEY = 'ldrs_track_visit_count';
const FIRST_VISIT_KEY = 'ldrs_track_first_visit';

function safeLs<T>(key: string, fallback: T | null = null): T | null {
  try {
    if (typeof window === 'undefined') return fallback;
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function safeLsSet(key: string, value: any): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage unavailable */
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getClientId(): string {
  let id = safeLs<string>(CLIENT_ID_KEY);
  if (!id) {
    id = uuid();
    safeLsSet(CLIENT_ID_KEY, id);
  }
  return id;
}

export function isReturningVisitor(): { returning: boolean; visitCount: number; firstVisit: string | null } {
  const visitCount = safeLs<number>(VISIT_COUNT_KEY) || 0;
  const firstVisit = safeLs<string>(FIRST_VISIT_KEY);
  return {
    returning: visitCount > 0,
    visitCount,
    firstVisit,
  };
}

export function bumpVisitCount(): void {
  const current = safeLs<number>(VISIT_COUNT_KEY) || 0;
  safeLsSet(VISIT_COUNT_KEY, current + 1);
  if (!safeLs<string>(FIRST_VISIT_KEY)) {
    safeLsSet(FIRST_VISIT_KEY, new Date().toISOString());
  }
}

export interface Attribution {
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer_host?: string;
  referrer?: string;
  landing_path?: string;
  arrival_at?: string;
}

export function captureAttribution(): Attribution {
  if (typeof window === 'undefined') return {};
  const existing = safeLs<Attribution>(ATTRIBUTION_KEY);
  if (existing && existing.arrival_at) return existing;
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const ref = document.referrer || '';
  let referrerHost = '';
  try {
    if (ref) referrerHost = new URL(ref).host;
  } catch {
    /* invalid */
  }
  const attribution: Attribution = {
    source: params.get('source') || undefined,
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_term: params.get('utm_term') || undefined,
    utm_content: params.get('utm_content') || undefined,
    referrer: ref || undefined,
    referrer_host: referrerHost || undefined,
    landing_path: url.pathname,
    arrival_at: new Date().toISOString(),
  };
  safeLsSet(ATTRIBUTION_KEY, attribution);
  return attribution;
}

export function getAttribution(): Attribution {
  return safeLs<Attribution>(ATTRIBUTION_KEY) || {};
}

export function startSession(): { sessionStart: string } {
  let s = safeLs<string>(SESSION_START_KEY);
  if (!s) {
    s = new Date().toISOString();
    safeLsSet(SESSION_START_KEY, s);
  }
  return { sessionStart: s };
}

export function endSession(): void {
  try {
    window.localStorage.removeItem(SESSION_START_KEY);
  } catch {
    /* */
  }
}

export function getTimeInSession(): number {
  const start = safeLs<string>(SESSION_START_KEY);
  if (!start) return 0;
  return Math.round((Date.now() - new Date(start).getTime()) / 1000);
}

// ---------------------------------------------------------------------------
// Global state injected into every event
// ---------------------------------------------------------------------------

let _accountId: string | undefined;
let _sessionId: string | null = null;
let _currentTab: string | undefined;

export function setAnalyticsContext(ctx: {
  accountId?: string;
  sessionId?: string | null;
  currentTab?: string;
}): void {
  if (ctx.accountId !== undefined) _accountId = ctx.accountId;
  if (ctx.sessionId !== undefined) _sessionId = ctx.sessionId;
  if (ctx.currentTab !== undefined) _currentTab = ctx.currentTab;
}

function buildGlobals(): GlobalParams {
  if (typeof window === 'undefined') return {};
  const attribution = getAttribution();
  const isPwa =
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    (window.navigator as any).standalone === true;
  return {
    client_id: getClientId(),
    session_id: _sessionId,
    account_id: _accountId,
    current_path: window.location.pathname + window.location.search,
    current_tab: _currentTab,
    is_conference: !!(
      attribution.source === 'conf' ||
      new URL(window.location.href).searchParams.get('source') === 'conf'
    ),
    first_source: attribution.source,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    utm_term: attribution.utm_term,
    utm_content: attribution.utm_content,
    viewport_w: window.innerWidth,
    viewport_h: window.innerHeight,
    is_mobile: window.innerWidth < 768,
    is_pwa: isPwa,
    language: (window.navigator?.language || 'he').slice(0, 2),
    time_in_session_sec: getTimeInSession(),
  };
}

// Generate a stable event_id so server-side de-dups against client-side.
export function eventId(prefix = 'evt'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------

export function track(name: AnalyticsEventName, params: EventParams = {}): void {
  if (typeof window === 'undefined') return;
  const merged: EventParams = { ...buildGlobals(), ...params };

  // Strip undefined and convert arrays to comma-strings (gtag is fussy)
  const clean: Record<string, any> = {};
  for (const k of Object.keys(merged)) {
    const v = (merged as any)[k];
    if (v === undefined || v === null) continue;
    clean[k] = Array.isArray(v) ? v.join(',') : v;
  }

  // Debug
  if (window.__debugTrack) {
    // eslint-disable-next-line no-console
    console.log(`[track] ${name}`, clean);
  }

  // 1) GA4 via gtag
  if (window.gtag) {
    const ga4 = GA4_EVENT_MAP[name] || name;
    try {
      window.gtag('event', ga4, clean);
    } catch (err) {
      console.warn('[track] gtag error', err);
    }
  }

  // 2) Meta Pixel
  if (window.fbq) {
    const meta = META_EVENT_MAP[name];
    try {
      if (meta) {
        window.fbq('track', meta, clean);
      } else {
        window.fbq('trackCustom', name, clean);
      }
    } catch (err) {
      console.warn('[track] fbq error', err);
    }
  }

  // 3) TikTok Pixel
  if (window.ttq && typeof window.ttq.track === 'function') {
    const ttkEvent = TIKTOK_EVENT_MAP[name] || name;
    try {
      window.ttq.track(ttkEvent, clean);
    } catch (err) {
      console.warn('[track] ttq error', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Identify — call after the visitor submits a form so the pixels can match
// across devices (Meta Advanced Matching / TikTok identify).
// ---------------------------------------------------------------------------

async function sha256(value: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  const buf = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function identify(input: {
  email?: string | null;
  phone?: string | null;
  externalId?: string;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<{ email_sha256?: string; phone_sha256?: string }> {
  if (typeof window === 'undefined') return {};
  const email_sha256 = input.email ? await sha256(input.email) : undefined;
  const phone_sha256 = input.phone ? await sha256(input.phone.replace(/\D/g, '')) : undefined;
  const external_id = input.externalId || getClientId();

  // Meta Advanced Matching
  if (window.fbq) {
    try {
      window.fbq('init', process.env.NEXT_PUBLIC_META_PIXEL_ID || '', {
        em: email_sha256,
        ph: phone_sha256,
        external_id,
        fn: input.firstName ? await sha256(input.firstName) : undefined,
        ln: input.lastName ? await sha256(input.lastName) : undefined,
      });
    } catch {
      /* */
    }
  }

  // TikTok identify
  if (window.ttq && typeof window.ttq.identify === 'function') {
    try {
      window.ttq.identify({
        email: email_sha256,
        phone_number: phone_sha256,
        external_id,
      });
    } catch {
      /* */
    }
  }

  // GA4: set user_id for cross-device join
  if (window.gtag) {
    try {
      window.gtag('set', { user_id: external_id });
    } catch {
      /* */
    }
  }

  track('identify', {
    email_sha256: email_sha256 || null,
    phone_sha256: phone_sha256 || null,
    external_id,
  });

  return { email_sha256, phone_sha256 };
}

// Convenience flag: enable in console with localStorage.setItem('ldrs_track_debug', '1')
if (typeof window !== 'undefined') {
  try {
    if (window.localStorage.getItem('ldrs_track_debug') === '1') {
      window.__debugTrack = true;
    }
  } catch {
    /* */
  }
}
