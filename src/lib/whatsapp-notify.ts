/**
 * WhatsApp Cloud API — notification module.
 *
 * One function per Meta template. Each function:
 *   • is typed to the exact variable slots of its template
 *   • is fire-and-forget: catches its own errors, never throws
 *   • respects the master env flag `WHATSAPP_NOTIFY_ENABLED`
 *     (so the whole module can be toggled off while templates are PENDING)
 *   • persists the outbound message to `whatsapp_messages` for auditability
 *
 * Template status (as of 2026-04-16):
 *   APPROVED: follower_welcome_v2, follower_support_confirmation,
 *             brand_support_ticket
 *   PENDING : follower_coupon_delivery_v3, influencer_weekly_digest_v2,
 *             influencer_welcome_v2
 *
 * Contract: callers MUST pass a phone in E.164-ish form (international
 * digits). `toWaId()` in client.ts normalises Israeli locals.
 */

import { sendTemplate, toWaId, type WhatsAppSendResult } from '@/lib/whatsapp-cloud/client';
import { createClient } from '@/lib/supabase';

// ---------------------------------------------------------------------
// Master toggle + per-template flags
// ---------------------------------------------------------------------
// Set `WHATSAPP_NOTIFY_ENABLED=true` once all 6 templates are APPROVED.
// Per-template flags allow a gradual rollout (e.g. turn on the approved
// ones today, the pending ones later).
const MASTER = process.env.WHATSAPP_NOTIFY_ENABLED === 'true';

function flag(name: string, defaultOn = true): boolean {
  if (!MASTER) return false;
  const v = process.env[`WHATSAPP_TEMPLATE_${name.toUpperCase()}`];
  if (v === 'false') return false;
  if (v === 'true') return true;
  return defaultOn;
}

const LANG = 'he';

// ---------------------------------------------------------------------
// Persistence helper — mirror outbound into whatsapp_messages for audit.
// Failures here are swallowed; a missed log must never break a send.
// ---------------------------------------------------------------------
async function persistOutbound(args: {
  to: string;
  templateName: string;
  result: WhatsAppSendResult;
}): Promise<void> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!phoneNumberId) return;

    const supabase = createClient();
    const wa_id = toWaId(args.to);

    // Upsert contact
    const { data: contact } = await supabase
      .from('whatsapp_contacts')
      .upsert({ wa_id, phone_e164: `+${wa_id}` }, { onConflict: 'wa_id' })
      .select('id')
      .single();
    if (!contact) return;

    // Upsert conversation
    const nowIso = new Date().toISOString();
    const { data: convo } = await supabase
      .from('whatsapp_conversations')
      .upsert(
        {
          phone_number_id: phoneNumberId,
          contact_id: contact.id,
          status: 'active',
          last_outbound_at: nowIso,
        },
        { onConflict: 'phone_number_id,contact_id' }
      )
      .select('id')
      .single();
    if (!convo) return;

    await supabase.from('whatsapp_messages').insert({
      conversation_id: convo.id,
      direction: 'outbound',
      wa_message_id: args.result.wa_message_id ?? null,
      message_type: 'template',
      template_name: args.templateName,
      template_language: LANG,
      status: args.result.success ? 'sent' : 'failed',
      sent_at: args.result.success ? nowIso : null,
      failed_at: args.result.success ? null : nowIso,
      error_code: args.result.error?.code ?? null,
      error_message: args.result.error?.message ?? null,
      payload: args.result.raw ?? {},
    });
  } catch (err) {
    console.warn('[whatsapp-notify] persistOutbound failed (non-fatal):', err);
  }
}

// ---------------------------------------------------------------------
// Generic runner — DRY wrapper around sendTemplate + persist + guard
// ---------------------------------------------------------------------
type TParam = { type: 'text'; text: string };

async function runTemplate(args: {
  templateName: string;
  flagName: string;
  to: string;
  headerParams?: string[];
  bodyParams?: string[];
  urlButtonParam?: string;   // for single URL button with `{{1}}` in URL
}): Promise<WhatsAppSendResult> {
  if (!flag(args.flagName)) {
    return {
      success: false,
      error: { message: `template disabled by flag: ${args.flagName}` },
    };
  }

  const components: any[] = [];
  if (args.headerParams?.length) {
    components.push({
      type: 'header',
      parameters: args.headerParams.map<TParam>((t) => ({ type: 'text', text: t })),
    });
  }
  if (args.bodyParams?.length) {
    components.push({
      type: 'body',
      parameters: args.bodyParams.map<TParam>((t) => ({ type: 'text', text: t })),
    });
  }
  if (args.urlButtonParam != null) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: 0,
      parameters: [{ type: 'text', text: args.urlButtonParam }],
    });
  }

  try {
    const result = await sendTemplate({
      to: args.to,
      templateName: args.templateName,
      languageCode: LANG,
      components,
    });
    // Best-effort persistence; never blocks result.
    void persistOutbound({ to: args.to, templateName: args.templateName, result });
    if (!result.success) {
      console.warn(
        `[whatsapp-notify] ${args.templateName} → ${args.to} failed:`,
        result.error
      );
    }
    return result;
  } catch (err) {
    const result: WhatsAppSendResult = {
      success: false,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
    console.error(`[whatsapp-notify] ${args.templateName} threw:`, err);
    return result;
  }
}

// =====================================================================
// 1) follower_welcome_v2 — new follower opted-in to WhatsApp
//    Category: MARKETING  |  Vars: header {{1}}, body {{1}} {{2}}, url {{1}}
//    Trigger: POST /api/chat/lead (opt-in branch)
// =====================================================================
export async function sendFollowerWelcome(p: {
  to: string;
  followerFirstName: string;   // e.g. "מיכל"
  influencerName: string;      // e.g. "דניאל"
  influencerUsername: string;  // URL slug, e.g. "danielamit"
}): Promise<WhatsAppSendResult> {
  return runTemplate({
    templateName: 'follower_welcome_v2',
    flagName: 'FOLLOWER_WELCOME',
    to: p.to,
    headerParams: [p.influencerName],
    bodyParams: [p.followerFirstName, p.influencerName],
    urlButtonParam: p.influencerUsername,
  });
}

// =====================================================================
// 2) follower_support_confirmation — follower submitted a support form
//    Category: UTILITY  |  Vars: body {{1}}{{2}}{{3}}{{4}}  |  no buttons
//    Trigger: POST /api/support (after insert)
// =====================================================================
export async function sendFollowerSupportConfirmation(p: {
  to: string;
  followerFirstName: string;
  brand: string;
  orderNumber: string;
  issueType: string;
}): Promise<WhatsAppSendResult> {
  return runTemplate({
    templateName: 'follower_support_confirmation',
    flagName: 'FOLLOWER_SUPPORT_CONFIRMATION',
    to: p.to,
    bodyParams: [p.followerFirstName, p.brand, p.orderNumber, p.issueType],
  });
}

// =====================================================================
// 3) follower_coupon_delivery_v3 — deliver a coupon after the user
//    copied it in chat (opt-in to WhatsApp).
//    Category: UTILITY  |  Vars: body {{1}}..{{5}}, url {{1}}
//    Trigger: POST /api/track  (event_type = 'coupon_copied')
// =====================================================================
export async function sendFollowerCouponDelivery(p: {
  to: string;
  followerFirstName: string;
  brand: string;
  benefit: string;       // "20% הנחה"
  code: string;          // "DANIEL20"
  expiresOn: string;     // "30.04.2026"
  influencerUsername: string; // URL button {{1}}
}): Promise<WhatsAppSendResult> {
  return runTemplate({
    templateName: 'follower_coupon_delivery_v3',
    flagName: 'FOLLOWER_COUPON_DELIVERY',
    to: p.to,
    bodyParams: [p.followerFirstName, p.brand, p.benefit, p.code, p.expiresOn],
    urlButtonParam: p.influencerUsername,
  });
}

// =====================================================================
// 4) brand_support_ticket — notify the brand a follower submitted a ticket
//    Category: UTILITY  |  Vars: body {{1}}..{{7}}
//    Trigger: POST /api/support
// =====================================================================
export async function sendBrandSupportTicket(p: {
  to: string;
  brand: string;
  followerName: string;
  followerPhone: string;
  orderNumber: string;
  issueType: string;
  description: string;
  influencerName: string;
}): Promise<WhatsAppSendResult> {
  return runTemplate({
    templateName: 'brand_support_ticket',
    flagName: 'BRAND_SUPPORT_TICKET',
    to: p.to,
    bodyParams: [
      p.brand,
      p.followerName,
      p.followerPhone,
      p.orderNumber,
      p.issueType,
      p.description,
      p.influencerName,
    ],
  });
}

// =====================================================================
// 5) influencer_weekly_digest_v2 — weekly summary (Sun 09:00 IL)
//    Category: UTILITY  |  Vars: body {{1}}{{2}}{{3}}{{4}}, url {{1}}
//    Trigger: /api/cron/weekly-digest
// =====================================================================
export async function sendInfluencerWeeklyDigest(p: {
  to: string;
  influencerFirstName: string;
  newFollowersThisWeek: number;
  conversations: number;
  couponsGiven: number;
  influencerUsername: string;
}): Promise<WhatsAppSendResult> {
  return runTemplate({
    templateName: 'influencer_weekly_digest_v2',
    flagName: 'INFLUENCER_WEEKLY_DIGEST',
    to: p.to,
    bodyParams: [
      p.influencerFirstName,
      String(p.newFollowersThisWeek),
      String(p.conversations),
      String(p.couponsGiven),
    ],
    urlButtonParam: p.influencerUsername,
  });
}

// =====================================================================
// 6) influencer_welcome_v2 — new influencer account activated
//    Category: UTILITY  |  Vars: body {{1}}, url {{1}}
//    Trigger: /api/admin/accounts/finalize
// =====================================================================
export async function sendInfluencerWelcome(p: {
  to: string;
  influencerFirstName: string;
  influencerUsername: string;
}): Promise<WhatsAppSendResult> {
  return runTemplate({
    templateName: 'influencer_welcome_v2',
    flagName: 'INFLUENCER_WELCOME',
    to: p.to,
    bodyParams: [p.influencerFirstName],
    urlButtonParam: p.influencerUsername,
  });
}

// ---------------------------------------------------------------------
// Fire-and-forget helper. Use when you want to trigger a template from
// an API handler without awaiting it (don't block the user's response).
// Example: `fireAndForget(sendFollowerWelcome({...}))`
// ---------------------------------------------------------------------
export function fireAndForget<T>(p: Promise<T>): void {
  void p.catch((err) => console.error('[whatsapp-notify] fireAndForget error:', err));
}
