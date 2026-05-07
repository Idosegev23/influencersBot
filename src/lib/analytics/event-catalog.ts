/**
 * Single source of truth for which events get persisted to Supabase
 * (vs. fired only to GA4/Meta/TikTok). Each entry maps a logical event
 * name to a category bucket — used by the dashboard rollup queries to
 * group engagement vs. conversion vs. navigation activity.
 */

export type EventCategory =
  | 'session'
  | 'engagement'
  | 'navigation'
  | 'conversion'
  | 'exit'
  | 'system';

export type EventSurface = 'chat' | 'widget' | 'shared';

export interface EventDef {
  category: EventCategory;
  surface: EventSurface;
}

export const EVENT_CATALOG: Record<string, EventDef> = {
  // Session lifecycle
  session_start: { category: 'session', surface: 'shared' },
  session_end: { category: 'session', surface: 'shared' },

  // Chat engagement
  chat_message_sent: { category: 'engagement', surface: 'chat' },
  chat_message_received: { category: 'engagement', surface: 'chat' },
  suggestion_pill_clicked: { category: 'engagement', surface: 'chat' },
  conversation_starter_clicked: { category: 'engagement', surface: 'chat' },
  dynamic_cta_clicked: { category: 'engagement', surface: 'shared' },

  // Navigation
  tab_changed: { category: 'navigation', surface: 'chat' },
  tab_view: { category: 'navigation', surface: 'chat' },

  // Conversions
  lead_form_submitted: { category: 'conversion', surface: 'shared' },
  meeting_request_initiated: { category: 'conversion', surface: 'chat' },
  meeting_request_submitted: { category: 'conversion', surface: 'chat' },
  support_form_submitted: { category: 'conversion', surface: 'chat' },
  support_ticket_submitted: { category: 'conversion', surface: 'chat' },
  coupon_copied: { category: 'conversion', surface: 'chat' },
  product_clicked: { category: 'engagement', surface: 'chat' },

  // Widget
  widget_loaded: { category: 'session', surface: 'widget' },
  widget_opened: { category: 'engagement', surface: 'widget' },
  widget_closed: { category: 'engagement', surface: 'widget' },
  widget_message_sent: { category: 'engagement', surface: 'widget' },
  widget_message_received: { category: 'engagement', surface: 'widget' },
  widget_lead_submitted: { category: 'conversion', surface: 'widget' },

  // Exit tracking
  external_link_clicked: { category: 'exit', surface: 'shared' },
  back_to_instagram_clicked: { category: 'exit', surface: 'shared' },
  back_to_website_clicked: { category: 'exit', surface: 'shared' },
};

export function isAllowedEvent(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(EVENT_CATALOG, name);
}

export function eventCategory(name: string): EventCategory {
  return EVENT_CATALOG[name]?.category ?? 'system';
}

export function eventSurface(name: string): EventSurface {
  return EVENT_CATALOG[name]?.surface ?? 'shared';
}

export const EXIT_EVENT_KINDS = ['external', 'back_to_ig', 'back_to_site'] as const;
export type ExitEventKind = (typeof EXIT_EVENT_KINDS)[number];
