/**
 * Instagram Graph API — DM Chat Handler
 * מעבד הודעות DM שמגיעות ישירות מ-Instagram Graph API webhook
 * "אותו מוח (SandwichBot), ערוץ חדש — Instagram Graph API נייטיב"
 *
 * ההבדל מ-Respond.io handler:
 * - מקבל פורמט webhook של Meta (לא Respond.io)
 * - שולח תשובות ישירות דרך Graph API (לא דרך Respond.io)
 * - תומך ב-rich messages (quick replies, images)
 */

import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { processSandwichMessageWithMetadata } from '@/lib/chatbot/sandwichBot';
import { buildPersonalityFromDB } from '@/lib/chatbot/personality-wrapper';
import { updateRollingSummary } from '@/lib/chatbot/conversation-memory';
import {
  sendLongInstagramDM,
  sendLongInstagramDMWithQuickReplies,
  sendGenericTemplate,
  sendReaction,
  type IGMessagingEvent,
  type GenericTemplateElement,
} from './client';

// ============================================
// Types
// ============================================

interface DMProcessResult {
  success: boolean;
  response?: string;
  senderId?: string;
  error?: string;
}

// ============================================
// Main DM Handler
// ============================================

/**
 * Process an incoming Instagram DM message from Graph API webhook
 * Similar flow to Respond.io handler but with native Graph API format
 */
export async function processInstagramGraphDM(
  event: IGMessagingEvent,
  igAccountId: string,
): Promise<DMProcessResult> {
  const senderId = event.sender.id;
  const recipientId = event.recipient.id; // Our IG account
  const messageText = event.message?.text;
  const messageId = event.message?.mid;
  const postbackPayload = event.message?.quick_reply?.payload; // Carries postback/menu payload

  // Skip echo messages (messages we sent)
  if (event.message?.is_echo) {
    return { success: true };
  }

  // Skip non-text messages for now (attachments, reactions, etc.)
  if (!messageText) {
    console.log(`[IG Graph DM] Skipping non-text message from ${senderId}`);
    return { success: true };
  }

  console.log(`[IG Graph DM] Processing DM from ${senderId}: "${messageText.slice(0, 50)}..."`);

  const supabase = await createClient();

  // Dedup: skip if this message ID was already processed (Meta sends duplicate webhooks)
  if (messageId && !messageId.startsWith('postback_')) {
    const { data: existing } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('meta_mid', messageId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log(`[IG Graph DM] Skipping duplicate message ${messageId}`);
      return { success: true };
    }
  }

  try {
    // 1. Find which influencer account this IG account belongs to
    const accountId = await resolveAccountFromIGId(supabase, igAccountId);
    if (!accountId) {
      console.error(`[IG Graph DM] No account found for IG account ${igAccountId}`);
      return { success: false, error: `No account mapped for IG ${igAccountId}` };
    }

    // 2. Get or create DM session (keyed by sender + account via thread_id)
    const threadId = `dm_ig_graph_${senderId}_${accountId}`;
    const session = await getOrCreateSession(supabase, threadId, accountId, senderId);
    const sessionUUID = session.id; // actual UUID from DB

    // 3. Load account info + conversation history + personality
    // DM prioritizes quality over speed — load more history for better understanding
    const [accountData, historyData] = await Promise.all([
      supabase
        .from('accounts')
        .select('config')
        .eq('id', accountId)
        .single()
        .then(r => r.data),
      supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionUUID)
        .order('created_at', { ascending: false })
        .limit(20)
        .then(r => r.data),
    ]);

    const config = accountData?.config || {};

    // Check if DM bot is enabled for this account (default: disabled)
    if (config.dm_bot_enabled !== true) {
      console.log(`[IG Graph DM] Bot not enabled for account ${accountId}, skipping`);
      return { success: true };
    }

    const username = config.username || 'influencer';
    const influencerName = config.display_name || config.username || 'Influencer';

    const conversationHistory = (historyData || [])
      .reverse()
      .map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // 4. Load personality
    const personalityConfig = await buildPersonalityFromDB(accountId).catch(() => null);

    // Prepend rolling summary if available
    if (session?.rolling_summary) {
      conversationHistory.unshift({
        role: 'assistant' as const,
        content: `[סיכום שיחה קודמת: ${session.rolling_summary}]`,
      });
    }

    // 5. Process through SandwichBot — SAME engine as widget, social, and Respond.io DM
    let fullText = '';
    let responseId: string | null = null;

    const sandwichResult = await processSandwichMessageWithMetadata({
      userMessage: messageText,
      accountId,
      username,
      influencerName,
      conversationHistory,
      rollingSummary: session?.rolling_summary || undefined,
      personalityConfig: personalityConfig || undefined,
      previousResponseId: session?.last_response_id || null,
      mode: 'dm', // Same DM mode as Respond.io handler
      onToken: (token: string) => {
        fullText += token;
      },
    });

    if (!fullText && sandwichResult.response) {
      fullText = sandwichResult.response;
    }
    responseId = sandwichResult.responseId || null;

    // Extract suggestions for quick reply buttons, then strip markdown
    const { cleanText, suggestions } = parseSuggestionsFromResponse(fullText);
    fullText = stripMarkdownForDM(cleanText);

    const archetype = sandwichResult.metadata?.archetype || 'general';

    console.log(`[IG Graph DM] SandwichBot response for sender ${senderId}:`, {
      archetype,
      confidence: sandwichResult.metadata.confidence,
      responseLength: fullText.length,
      suggestions: suggestions.length,
    });

    // 6. Send reply via Instagram Graph API
    const accessToken = await getAccessTokenForAccount(supabase, accountId);

    // Convert suggestions to Instagram quick reply buttons (max 13, 20 chars each)
    const quickReplies = suggestions
      .slice(0, 13)
      .map(s => ({ title: truncateForIG(s, 20), payload: s }));

    if (quickReplies.length > 0) {
      await sendLongInstagramDMWithQuickReplies(
        senderId, fullText, quickReplies, igAccountId, accessToken || undefined,
      );
    } else {
      await sendLongInstagramDM(senderId, fullText, igAccountId, accessToken || undefined);
    }

    // 6b. React with ❤️ to the user's message (fire-and-forget)
    if (messageId) {
      sendReaction(senderId, messageId, '❤️', igAccountId, accessToken || undefined).catch(() => {});
    }

    // 6c. Send rich cards based on archetype or postback (Phase 2+3+5)
    await sendRichCardsIfRelevant({
      archetype,
      messageText,
      postbackPayload,
      senderId,
      accountId,
      igAccountId,
      accessToken: accessToken || undefined,
      supabase,
    }).catch(err => {
      console.error('[IG Graph DM] Rich cards error (non-blocking):', err.message);
    });

    // 7. Save messages + update session
    const msgCount = (session?.message_count || 0) + 2;
    await Promise.all([
      supabase.from('chat_messages').insert({
        session_id: sessionUUID,
        role: 'user',
        content: messageText,
        ...(messageId ? { meta_mid: messageId } : {}),
      }),
      supabase.from('chat_messages').insert({
        session_id: sessionUUID,
        role: 'assistant',
        content: fullText,
      }),
      supabase
        .from('chat_sessions')
        .update({
          ...(responseId ? { last_response_id: responseId } : {}),
          message_count: msgCount,
        })
        .eq('id', sessionUUID),
    ]);

    // 8. Update rolling summary — DM prioritizes understanding, so update every exchange
    // (unlike widget which only updates every 6 messages for speed)
    updateRollingSummary(
      sessionUUID,
      [...conversationHistory, { role: 'user', content: messageText }, { role: 'assistant', content: fullText }],
    ).catch(err => console.error('[IG Graph DM] Summary update failed:', err));

    return {
      success: true,
      response: fullText,
      senderId,
    };
  } catch (error: any) {
    console.error(`[IG Graph DM] Error processing DM from sender ${senderId}:`, error.message);

    // Try to send error message back
    try {
      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
      if (accessToken) {
        await sendLongInstagramDM(
          senderId,
          'מצטער, לא הצלחתי לעבד את ההודעה. נסה שוב בעוד רגע',
          igAccountId,
          accessToken,
        );
      }
    } catch {
      // Ignore send error
    }

    return { success: false, error: error.message, senderId };
  }
}

// ============================================
// Helpers
// ============================================

/**
 * Resolve which influencer account an Instagram Business Account ID belongs to
 */
async function resolveAccountFromIGId(
  supabase: any,
  igAccountId: string,
): Promise<string | null> {
  // Check ig_graph_connections table first
  const { data: connection } = await supabase
    .from('ig_graph_connections')
    .select('account_id')
    .eq('ig_business_account_id', igAccountId)
    .eq('is_active', true)
    .single();

  if (connection?.account_id) return connection.account_id;

  // Fallback: if there's only one active account, use it
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('type', 'creator')
    .eq('status', 'active')
    .limit(2);

  if (accounts?.length === 1) {
    return accounts[0].id;
  }

  return null;
}

/**
 * Get or create a DM session
 * Uses thread_id (text) for lookup, id is a proper UUID
 */
async function getOrCreateSession(
  supabase: any,
  threadId: string,
  accountId: string,
  senderId: string,
): Promise<any> {
  // Look up by thread_id (text column)
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('thread_id', threadId)
    .single();

  if (session) return session;

  // Create new session with proper UUID
  const newId = randomUUID();
  const { data: newSession } = await supabase
    .from('chat_sessions')
    .insert({
      id: newId,
      thread_id: threadId,
      account_id: accountId,
      message_count: 0,
    })
    .select('*')
    .single();

  return newSession || { id: newId, message_count: 0 };
}

/**
 * Get the access token for a specific account
 */
async function getAccessTokenForAccount(
  supabase: any,
  accountId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('ig_graph_connections')
    .select('access_token')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .single();

  return data?.access_token || process.env.INSTAGRAM_ACCESS_TOKEN || null;
}

/**
 * Strip markdown for Instagram DM (same as Respond.io handler)
 */
function stripMarkdownForDM(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_]+)_(?!_)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[\-\*]\s+/gm, '▸ ')
    .replace(/^[\-\*]{3,}$/gm, '')
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================
// Suggestion Parsing & Rich Message Helpers
// ============================================

/**
 * Parse <<SUGGESTIONS>> tags from SandwichBot response
 * Returns clean text (without tags) + array of suggestion strings
 */
function parseSuggestionsFromResponse(text: string): { cleanText: string; suggestions: string[] } {
  const match = text.match(/<<SUGGESTIONS>>([\s\S]*?)<<\/SUGGESTIONS>>/);
  const cleanText = text.replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();
  if (!match) return { cleanText, suggestions: [] };
  const suggestions = match[1].split('|').map((s: string) => s.trim()).filter(Boolean);
  return { cleanText, suggestions };
}

/**
 * Truncate text for Instagram limits (titles, buttons)
 */
function truncateForIG(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1) + '…';
}

// ============================================
// Rich Cards — Coupons, Products, Issues
// ============================================

/** Keywords that indicate a product issue */
const ISSUE_KEYWORDS = ['בעיה', 'לא עובד', 'שבור', 'החלפה', 'החזרה', 'תקלה', 'פגום', 'לא מרוצ', 'נהרס'];

/** Keywords that indicate product discovery */
const PRODUCT_KEYWORDS = ['מוצר', 'ממליצ', 'שווה', 'לקנות', 'אהבת', 'גלו', 'המלצ', 'הכי טוב', 'מומלץ'];

/** Postback payloads from persistent menu & ice breakers that force specific rich cards */
const MENU_POSTBACK_MAP: Record<string, 'discover' | 'coupons' | 'issue' | 'brand_select'> = {
  menu_discover: 'discover',
  menu_coupons: 'coupons',
  menu_products: 'discover',
  menu_product_issue: 'brand_select', // Show brand selection first (like social chat)
  menu_chat: 'discover',
  icebreaker_coupon: 'coupons',
  icebreaker_best_product: 'discover',
  icebreaker_whats_new: 'discover',
  icebreaker_product_issue: 'brand_select', // Show brand selection first
  product_issue_return: 'issue',
  product_issue_quality: 'issue',
};

/**
 * Send rich cards (Generic Template) based on archetype, message content, or postback payload
 * Called after text response — cards are supplementary visual enhancement
 */
async function sendRichCardsIfRelevant(params: {
  archetype: string;
  messageText: string;
  postbackPayload?: string;
  senderId: string;
  accountId: string;
  igAccountId: string;
  accessToken?: string;
  supabase: any;
}): Promise<void> {
  const { archetype, messageText, postbackPayload, senderId, accountId, igAccountId, accessToken, supabase } = params;
  const lowerMessage = messageText.toLowerCase();

  // --- Menu / Ice Breaker postback: force specific rich cards ---
  // Check for dynamic brand_issue_* payload first
  const isBrandIssue = postbackPayload?.startsWith('brand_issue_');
  const forcedAction = isBrandIssue
    ? 'issue' as const
    : (postbackPayload ? MENU_POSTBACK_MAP[postbackPayload] : undefined);

  if (forcedAction === 'discover') {
    const productElements = await buildProductCarousel(supabase, accountId);
    if (productElements.length > 0) {
      await sendGenericTemplate(senderId, productElements, igAccountId, accessToken);
    }
    return;
  }

  if (forcedAction === 'coupons') {
    const couponElements = await buildCouponCards(supabase, accountId);
    if (couponElements.length > 0) {
      await sendGenericTemplate(senderId, couponElements, igAccountId, accessToken);
    } else {
      // No coupons in DB — send a friendly button template instead
      await sendGenericTemplate(senderId, [{
        title: 'אין קופונים פעילים כרגע',
        subtitle: 'עקבו אחרינו — קופונים חדשים בקרוב!',
        buttons: [{ type: 'postback', title: 'גלו מוצרים ⭐', payload: 'menu_discover' }],
      }], igAccountId, accessToken);
    }
    return;
  }

  // Brand selection step — show brands as carousel (like social chat's problem tab step 1)
  if (forcedAction === 'brand_select') {
    const brandElements = await buildBrandSelectionForIssue(supabase, accountId);
    if (brandElements.length > 0) {
      await sendGenericTemplate(senderId, brandElements, igAccountId, accessToken);
    } else {
      // No brands — fall back to generic issue card
      const issueElements = await buildProductIssueCards(supabase, accountId);
      if (issueElements.length > 0) {
        await sendGenericTemplate(senderId, issueElements, igAccountId, accessToken);
      }
    }
    return;
  }

  if (forcedAction === 'issue') {
    // If brand-specific issue, extract brand name from payload
    const brandName = isBrandIssue ? decodeURIComponent(postbackPayload!.replace('brand_issue_', '')) : undefined;
    const issueElements = await buildProductIssueCards(supabase, accountId, brandName);
    if (issueElements.length > 0) {
      await sendGenericTemplate(senderId, issueElements, igAccountId, accessToken);
    }
    return;
  }

  // --- Keyword-based detection (organic messages, not postbacks) ---

  // Product Issue — show brand selection (like social chat's problem tab)
  const isProductIssue = ISSUE_KEYWORDS.some(kw => lowerMessage.includes(kw));
  if (isProductIssue) {
    const brandElements = await buildBrandSelectionForIssue(supabase, accountId);
    if (brandElements.length > 0) {
      await sendGenericTemplate(senderId, brandElements, igAccountId, accessToken);
    } else {
      // No brands — show generic issue card
      const elements = await buildProductIssueCards(supabase, accountId);
      if (elements.length > 0) {
        await sendGenericTemplate(senderId, elements, igAccountId, accessToken);
      }
    }
    return;
  }

  // Coupon Cards
  if (archetype === 'coupons') {
    const couponElements = await buildCouponCards(supabase, accountId);
    if (couponElements.length > 0) {
      await sendGenericTemplate(senderId, couponElements, igAccountId, accessToken);
    }
    return;
  }

  // Product Discovery Carousel
  const isProductQuery = PRODUCT_KEYWORDS.some(kw => lowerMessage.includes(kw));
  if (isProductQuery) {
    const productElements = await buildProductCarousel(supabase, accountId);
    if (productElements.length > 0) {
      await sendGenericTemplate(senderId, productElements, igAccountId, accessToken);
    }
  }
}

/**
 * Build coupon card elements for Generic Template
 * Queries active coupons + partnership brand info
 */
async function buildCouponCards(
  supabase: any,
  accountId: string,
): Promise<GenericTemplateElement[]> {
  // Fetch active coupons with partnership info
  const { data: coupons } = await supabase
    .from('coupons')
    .select('code, description, discount_type, discount_value, tracking_url, partnership_id')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .or('end_date.is.null,end_date.gte.' + new Date().toISOString())
    .limit(5);

  if (!coupons?.length) return [];

  // Batch fetch partnership info for brand names + logos + links
  const partnershipIds = [...new Set(coupons.map((c: any) => c.partnership_id).filter(Boolean))];
  let partnerships: Record<string, any> = {};

  if (partnershipIds.length > 0) {
    const { data: partnerData } = await supabase
      .from('partnerships')
      .select('id, brand_name, link, short_link, brand_logo_id')
      .in('id', partnershipIds);

    if (partnerData) {
      // Fetch brand logo URLs
      const logoIds = partnerData.map((p: any) => p.brand_logo_id).filter(Boolean);
      let logos: Record<string, string> = {};
      if (logoIds.length > 0) {
        const { data: logoData } = await supabase
          .from('brand_logos')
          .select('id, logo_url')
          .in('id', logoIds);
        if (logoData) {
          logos = Object.fromEntries(logoData.map((l: any) => [l.id, l.logo_url]));
        }
      }

      partnerships = Object.fromEntries(
        partnerData.map((p: any) => [p.id, { ...p, logo_url: logos[p.brand_logo_id] }])
      );
    }
  }

  return coupons.map((coupon: any) => {
    const partner = partnerships[coupon.partnership_id] || {};
    const brandName = partner.brand_name || 'קופון';
    const discount = formatDiscount(coupon.discount_type, coupon.discount_value);
    const link = coupon.tracking_url || partner.short_link || partner.link;

    const element: GenericTemplateElement = {
      title: truncateForIG(brandName, 80),
      subtitle: truncateForIG(`${discount} | קוד: ${coupon.code}`, 80),
    };

    if (partner.logo_url) {
      element.image_url = partner.logo_url;
    }

    const buttons: GenericTemplateElement['buttons'] = [];
    if (link) {
      buttons.push({ type: 'web_url', title: truncateForIG('לחנות 🛍️', 20), url: link });
    }
    buttons.push({
      type: 'postback',
      title: truncateForIG('עוד פרטים', 20),
      payload: `coupon_details_${coupon.code}`,
    });
    element.buttons = buttons;

    return element;
  });
}

/**
 * Build product carousel from Instagram posts with images
 */
async function buildProductCarousel(
  supabase: any,
  accountId: string,
): Promise<GenericTemplateElement[]> {
  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('id, caption, media_urls, post_url, thumbnail_url, likes_count')
    .eq('account_id', accountId)
    .not('media_urls', 'is', null)
    .order('likes_count', { ascending: false })
    .limit(5);

  if (!posts?.length) return [];

  return posts
    .filter((p: any) => p.media_urls?.length > 0 || p.thumbnail_url)
    .map((post: any) => {
      const caption = post.caption || '';
      const firstLine = caption.split('\n')[0] || 'פוסט';
      const imageUrl = post.media_urls?.[0] || post.thumbnail_url;

      const element: GenericTemplateElement = {
        title: truncateForIG(firstLine, 80),
        ...(imageUrl ? { image_url: imageUrl } : {}),
      };

      if (post.post_url) {
        element.default_action = { type: 'web_url', url: post.post_url };
        element.buttons = [
          { type: 'web_url', title: truncateForIG('צפה בפוסט ⟩', 20), url: post.post_url },
        ];
      }

      return element;
    });
}

/**
 * Build brand selection carousel for issue flow (like social chat's "בעיה בהזמנה" tab step 1)
 * Shows each brand as a card with "בחר" button
 */
async function buildBrandSelectionForIssue(
  supabase: any,
  accountId: string,
): Promise<GenericTemplateElement[]> {
  const { data: partnerships } = await supabase
    .from('partnerships')
    .select('id, brand_name, brand_logo_id, link')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .limit(10);

  if (!partnerships?.length) return [];

  // Deduplicate by brand name
  const seen = new Set<string>();
  const unique = partnerships.filter((p: any) => {
    const key = p.brand_name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Fetch logos
  const logoIds = unique.map((p: any) => p.brand_logo_id).filter(Boolean);
  let logos: Record<string, string> = {};
  if (logoIds.length > 0) {
    const { data: logoData } = await supabase
      .from('brand_logos')
      .select('id, logo_url')
      .in('id', logoIds);
    if (logoData) {
      logos = Object.fromEntries(logoData.map((l: any) => [l.id, l.logo_url]));
    }
  }

  return unique.slice(0, 10).map((p: any) => {
    const logoUrl = logos[p.brand_logo_id];
    const element: GenericTemplateElement = {
      title: truncateForIG(p.brand_name, 80),
      subtitle: 'לחצו לפתיחת פנייה',
      buttons: [{
        type: 'postback',
        title: truncateForIG('בחר מותג', 20),
        payload: `brand_issue_${encodeURIComponent(p.brand_name)}`,
      }],
    };
    if (logoUrl) element.image_url = logoUrl;
    return element;
  });
}

/**
 * Build product issue cards with action buttons
 * If brandName is provided, shows brand-specific options
 */
async function buildProductIssueCards(
  supabase: any,
  accountId: string,
  brandName?: string,
): Promise<GenericTemplateElement[]> {
  // Find the specific brand or fallback to first active partnership
  let partnershipQuery = supabase
    .from('partnerships')
    .select('brand_name, brand_contact_email, brand_contact_phone, link')
    .eq('account_id', accountId)
    .eq('is_active', true);

  if (brandName) {
    partnershipQuery = partnershipQuery.ilike('brand_name', brandName);
  }

  const { data: activePartnership } = await partnershipQuery.limit(1).single();

  const displayBrand = activePartnership?.brand_name || brandName || 'המוצר';

  const buttons: GenericTemplateElement['buttons'] = [
    { type: 'postback', title: truncateForIG('החלפה/החזרה', 20), payload: 'product_issue_return' },
    { type: 'postback', title: truncateForIG('בעיה באיכות', 20), payload: 'product_issue_quality' },
  ];

  // Add brand contact link if available
  if (activePartnership?.link) {
    buttons.push({
      type: 'web_url',
      title: truncateForIG('שירות לקוחות', 20),
      url: activePartnership.link,
    });
  }

  return [{
    title: truncateForIG(`פנייה בנושא ${displayBrand}`, 80),
    subtitle: 'בחרי מה הכי מתאים:',
    buttons,
  }];
}

/**
 * Format discount for display
 */
function formatDiscount(type: string, value: number): string {
  switch (type) {
    case 'percentage': return `${value}% הנחה`;
    case 'fixed': return `₪${value} הנחה`;
    case 'free_shipping': return 'משלוח חינם';
    default: return `${value} הנחה`;
  }
}
