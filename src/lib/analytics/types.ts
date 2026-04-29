/**
 * Strongly-typed event names + standard parameter shape for the unified
 * analytics dispatcher.
 */

export type AnalyticsEventName =
  // Acquisition
  | 'page_load'
  | 'arrival'
  | 'qr_scan_detected'
  | 'returning_visitor'
  | 'consent_shown'
  | 'consent_given'
  | 'consent_declined'
  // Identity & Session
  | 'client_init'
  | 'session_start'
  | 'identify'
  | 'session_end'
  // Navigation
  | 'route_change'
  | 'tab_changed'
  | 'tab_first_view'
  | 'scroll_depth'
  | 'viewport_focus'
  | 'viewport_blur'
  // Chat
  | 'chat_input_focused'
  | 'chat_input_typed'
  | 'chat_message_sent'
  | 'chat_message_received'
  | 'chat_message_error'
  | 'starter_pill_clicked'
  | 'suggestion_pill_clicked'
  | 'topic_pill_clicked'
  // Services
  | 'services_loaded'
  | 'service_card_opened'
  | 'service_modal_closed'
  | 'service_ask_clicked'
  | 'service_brief_opened'
  | 'service_brief_step'
  | 'service_brief_submitted'
  // ForYou
  | 'foryou_loaded'
  | 'case_study_clicked'
  | 'highlight_clicked'
  | 'reel_clicked'
  // Lead capture
  | 'lead_popup_triggered'
  | 'lead_popup_closed_no_submit'
  | 'lead_field_focused'
  | 'lead_field_filled'
  | 'lead_consent_toggled'
  | 'lead_topic_chip_selected'
  | 'lead_form_submitted'
  | 'lead_submit_failed'
  // Meeting
  | 'meeting_intent_detected'
  | 'meeting_pill_shown'
  | 'meeting_pill_clicked'
  | 'meeting_request_initiated'
  | 'meeting_request_submitted'
  // Handoff
  | 'handoff_button_shown'
  | 'handoff_button_clicked'
  | 'handoff_form_opened'
  | 'handoff_field_filled'
  | 'handoff_form_submitted'
  | 'handoff_form_closed_no_submit'
  | 'itamar_replied'
  | 'handoff_fallback_triggered'
  // Conversation analytics
  | 'conversation_quality'
  | 'topic_classified'
  | 'intent_classified'
  // External
  | 'instagram_profile_clicked'
  | 'whatsapp_link_clicked'
  | 'phone_clicked'
  | 'email_clicked'
  | 'external_link_clicked'
  // Support
  | 'support_form_opened'
  | 'support_form_step'
  | 'support_form_submitted'
  | 'support_form_closed_no_submit'
  // Coupons / Brands / Products
  | 'brand_card_opened'
  | 'brand_card_closed'
  | 'coupon_revealed'
  | 'coupon_copied'
  | 'coupon_redeemed_clicked'
  | 'product_card_clicked'
  | 'product_buy_clicked'
  // Content / Discover / Topics
  | 'content_browse_loaded'
  | 'content_filter_changed'
  | 'content_card_clicked'
  | 'topic_card_clicked'
  | 'topic_question_clicked'
  | 'discovery_category_opened'
  // Share / link
  | 'share_clicked'
  | 'copy_link_clicked'
  // Widget (third-party embed)
  | 'widget_loaded'
  | 'widget_opened'
  | 'widget_closed'
  | 'widget_message_sent'
  | 'widget_message_received'
  | 'widget_lead_submitted'
  // Errors & perf
  | 'js_error'
  | 'unhandled_promise_rejection'
  | 'api_error'
  | 'slow_response'
  | 'chat_stream_aborted';

export type EventParams = Record<string, string | number | boolean | null | undefined | string[]>;

/** Standard envelope every event ships with (set automatically). */
export interface GlobalParams {
  client_id?: string;
  session_id?: string | null;
  account_id?: string;
  is_returning?: boolean;
  is_conference?: boolean;
  first_source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  current_path?: string;
  current_tab?: string;
  viewport_w?: number;
  viewport_h?: number;
  is_mobile?: boolean;
  is_pwa?: boolean;
  language?: string;
  time_in_session_sec?: number;
}
