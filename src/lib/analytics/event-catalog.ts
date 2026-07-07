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

  // Conversation starters / suggestion pills
  starter_pill_clicked: { category: 'engagement', surface: 'chat' },
  suggestion_pill_clicked: { category: 'engagement', surface: 'chat' },
  conversation_starter_clicked: { category: 'engagement', surface: 'chat' },
  meeting_pill_clicked: { category: 'engagement', surface: 'chat' },

  // Dynamic CTAs / cards (every clickable element the bot/page renders)
  dynamic_cta_clicked: { category: 'engagement', surface: 'shared' },
  product_card_clicked: { category: 'engagement', surface: 'chat' },
  product_buy_clicked: { category: 'engagement', surface: 'chat' },
  brand_card_opened: { category: 'engagement', surface: 'chat' },
  service_card_opened: { category: 'engagement', surface: 'chat' },
  topic_question_clicked: { category: 'engagement', surface: 'chat' },
  topic_card_clicked: { category: 'engagement', surface: 'chat' },
  case_study_clicked: { category: 'engagement', surface: 'chat' },
  reel_clicked: { category: 'engagement', surface: 'chat' },
  highlight_clicked: { category: 'engagement', surface: 'chat' },
  content_card_clicked: { category: 'engagement', surface: 'chat' },
  discovery_category_opened: { category: 'engagement', surface: 'chat' },

  // Navigation
  tab_changed: { category: 'navigation', surface: 'chat' },
  tab_view: { category: 'navigation', surface: 'chat' },

  // Conversions
  lead_form_submitted: { category: 'conversion', surface: 'shared' },
  meeting_request_initiated: { category: 'conversion', surface: 'chat' },
  meeting_request_submitted: { category: 'conversion', surface: 'chat' },
  support_form_submitted: { category: 'conversion', surface: 'chat' },
  support_ticket_submitted: { category: 'conversion', surface: 'chat' },
  coupon_revealed: { category: 'conversion', surface: 'chat' },
  coupon_copied: { category: 'conversion', surface: 'chat' },
  coupon_redeemed_clicked: { category: 'conversion', surface: 'chat' },
  product_clicked: { category: 'engagement', surface: 'chat' },

  // Widget — lifecycle & engagement
  widget_loaded: { category: 'session', surface: 'widget' },
  widget_opened: { category: 'engagement', surface: 'widget' },
  widget_closed: { category: 'engagement', surface: 'widget' },
  widget_proactive_opened: { category: 'engagement', surface: 'widget' },
  widget_new_chat_clicked: { category: 'engagement', surface: 'widget' },
  widget_message_sent: { category: 'engagement', surface: 'widget' },
  widget_message_received: { category: 'engagement', surface: 'widget' },
  widget_message_rated: { category: 'engagement', surface: 'widget' },
  widget_chip_clicked: { category: 'engagement', surface: 'widget' },
  widget_intent_classified: { category: 'engagement', surface: 'widget' },
  // Widget — product cards (the actual names widget.js emits; were being
  // dropped because only the chat-surface product_card_clicked existed)
  widget_product_click: { category: 'engagement', surface: 'widget' },
  // Widget — bot-proposed actions
  widget_action_proposed: { category: 'engagement', surface: 'widget' },
  widget_action_confirmed: { category: 'engagement', surface: 'widget' },
  widget_action_dismissed: { category: 'engagement', surface: 'widget' },
  // Widget — brand-personalized bubble tooltip (mobile-only, once per visitor)
  widget_tooltip_shown: { category: 'engagement', surface: 'widget' },
  widget_navigate_confirmed: { category: 'navigation', surface: 'widget' },
  // Widget — support module
  widget_support_opened: { category: 'engagement', surface: 'widget' },
  widget_support_submitted: { category: 'conversion', surface: 'widget' },
  widget_support_success: { category: 'conversion', surface: 'widget' },
  widget_support_failed: { category: 'system', surface: 'widget' },
  widget_support_attached: { category: 'engagement', surface: 'widget' },
  widget_human_handoff_opened: { category: 'engagement', surface: 'widget' },
  // Widget — leads module
  widget_lead_submitted: { category: 'conversion', surface: 'widget' },
  widget_lead_opened: { category: 'engagement', surface: 'widget' },
  widget_lead_success: { category: 'conversion', surface: 'widget' },
  widget_lead_failed: { category: 'system', surface: 'widget' },
  // Widget — bookings / demo
  widget_book_demo_opened: { category: 'engagement', surface: 'widget' },
  widget_book_demo_success: { category: 'conversion', surface: 'widget' },
  widget_book_demo_failed: { category: 'system', surface: 'widget' },
  // Widget — order lookup
  widget_order_lookup_opened: { category: 'engagement', surface: 'widget' },
  widget_order_lookup_result: { category: 'engagement', surface: 'widget' },
  widget_order_lookup_failed: { category: 'system', surface: 'widget' },
  // Widget — transcript & voice
  widget_transcript_requested: { category: 'engagement', surface: 'widget' },
  widget_voice_started: { category: 'engagement', surface: 'widget' },
  widget_voice_result: { category: 'engagement', surface: 'widget' },
  widget_voice_error: { category: 'system', surface: 'widget' },
  // Widget — purchase conversion (detected on client-site thank-you page)
  widget_conversion_detected: { category: 'conversion', surface: 'widget' },

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
