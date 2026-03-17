/**
 * Instagram Graph API Client
 * לקוח API לתקשורת ישירה עם Instagram Graph API — DMs, סטוריז, insights
 * מחליף/משלים את Respond.io לתקשורת נייטיבית עם אינסטגרם
 */

const GRAPH_API_VERSION = 'v22.0';
const GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;
const FB_GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ============================================
// Types
// ============================================

export interface IGWebhookEntry {
  id: string; // Instagram Business Account ID
  time: number;
  messaging?: IGMessagingEvent[];
  changes?: IGChangeEvent[];
}

export interface IGMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: 'image' | 'video' | 'audio' | 'file';
      payload: { url: string };
    }>;
    is_echo?: boolean;
    quick_reply?: { payload: string };
  };
  read?: { watermark: number };
  reaction?: {
    mid: string;
    action: 'react' | 'unreact';
    reaction?: string; // emoji
  };
  postback?: {
    mid: string;
    title: string;
    payload: string;
  };
}

export interface IGChangeEvent {
  field: string; // 'comments', 'live_comments', 'story_insights', etc.
  value: Record<string, any>;
}

export interface IGWebhookPayload {
  object: 'instagram'; // Always 'instagram' for IG webhooks
  entry: IGWebhookEntry[];
}

export interface IGSendMessageResponse {
  recipient_id: string;
  message_id: string;
}

export interface IGUserProfile {
  id: string;
  name?: string;
  username?: string;
  profile_pic?: string;
  follower_count?: number;
  is_business_account?: boolean;
  biography?: string;
  media_count?: number;
}

export interface IGStoryInsight {
  id: string;
  impressions: number;
  reach: number;
  replies: number;
  exits: number;
  taps_forward: number;
  taps_back: number;
}

// ============================================
// API Client
// ============================================

async function graphRequest<T>(
  url: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: any,
  accessToken?: string,
): Promise<T> {
  const token = accessToken || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    throw new Error('[Instagram Graph] Missing access token');
  }

  const separator = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${separator}access_token=${token}`;

  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(fullUrl, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
    throw new Error(`[Instagram Graph] API error: ${errorMsg}`);
  }

  return response.json() as Promise<T>;
}

// ============================================
// Messaging — Send Messages via Instagram DM
// ============================================

/**
 * Send a text message to an Instagram user via DM
 * Uses the Instagram Send API (part of Messenger Platform for Instagram)
 */
export async function sendInstagramDM(
  recipientId: string,
  text: string,
  igAccountId: string,
  accessToken?: string,
): Promise<IGSendMessageResponse> {
  const url = `${GRAPH_API_BASE}/${igAccountId}/messages`;

  return graphRequest<IGSendMessageResponse>(url, 'POST', {
    recipient: { id: recipientId },
    message: { text },
  }, accessToken);
}

/**
 * Send a message with quick reply buttons
 */
export async function sendInstagramQuickReply(
  recipientId: string,
  text: string,
  quickReplies: Array<{ title: string; payload: string }>,
  igAccountId: string,
  accessToken?: string,
): Promise<IGSendMessageResponse> {
  const url = `${GRAPH_API_BASE}/${igAccountId}/messages`;

  return graphRequest<IGSendMessageResponse>(url, 'POST', {
    recipient: { id: recipientId },
    message: {
      text,
      quick_replies: quickReplies.map(qr => ({
        content_type: 'text',
        title: qr.title,
        payload: qr.payload,
      })),
    },
  }, accessToken);
}

/**
 * Send an image via DM
 */
export async function sendInstagramImage(
  recipientId: string,
  imageUrl: string,
  igAccountId: string,
  accessToken?: string,
): Promise<IGSendMessageResponse> {
  const url = `${GRAPH_API_BASE}/${igAccountId}/messages`;

  return graphRequest<IGSendMessageResponse>(url, 'POST', {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: 'image',
        payload: { url: imageUrl },
      },
    },
  }, accessToken);
}

/**
 * Send a long text message, splitting for Instagram's 1000 char limit
 */
export async function sendLongInstagramDM(
  recipientId: string,
  text: string,
  igAccountId: string,
  accessToken?: string,
  delayBetweenMs: number = 500,
): Promise<IGSendMessageResponse[]> {
  const chunks = splitMessageForInstagram(text);
  const results: IGSendMessageResponse[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenMs));
    }
    const result = await sendInstagramDM(recipientId, chunks[i], igAccountId, accessToken);
    results.push(result);
  }

  return results;
}

/**
 * Send a long text message with quick reply buttons on the last chunk
 * Quick replies only attach to the final message (Instagram shows them below the latest message)
 */
export async function sendLongInstagramDMWithQuickReplies(
  recipientId: string,
  text: string,
  quickReplies: Array<{ title: string; payload: string }>,
  igAccountId: string,
  accessToken?: string,
  delayBetweenMs: number = 500,
): Promise<IGSendMessageResponse[]> {
  const chunks = splitMessageForInstagram(text);
  const results: IGSendMessageResponse[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenMs));
    }

    const isLastChunk = i === chunks.length - 1;

    if (isLastChunk && quickReplies.length > 0) {
      // Attach quick replies to last chunk
      const result = await sendInstagramQuickReply(
        recipientId, chunks[i], quickReplies, igAccountId, accessToken,
      );
      results.push(result);
    } else {
      const result = await sendInstagramDM(recipientId, chunks[i], igAccountId, accessToken);
      results.push(result);
    }
  }

  return results;
}

// ============================================
// Rich Messages — Generic Template, Reactions, Media Share
// ============================================

export interface GenericTemplateElement {
  title: string;             // max 80 chars
  subtitle?: string;         // max 80 chars
  image_url?: string;
  default_action?: {
    type: 'web_url';
    url: string;
  };
  buttons?: Array<{
    type: 'web_url' | 'postback';
    title: string;           // max 20 chars
    url?: string;            // for web_url
    payload?: string;        // for postback
  }>;
}

/**
 * Send a Generic Template (structured card or horizontal carousel)
 * Up to 10 elements, each with image + title + subtitle + up to 3 buttons
 * Mobile-only — desktop Instagram won't render these
 */
export async function sendGenericTemplate(
  recipientId: string,
  elements: GenericTemplateElement[],
  igAccountId: string,
  accessToken?: string,
): Promise<IGSendMessageResponse> {
  const url = `${GRAPH_API_BASE}/${igAccountId}/messages`;

  return graphRequest<IGSendMessageResponse>(url, 'POST', {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: elements.slice(0, 10), // Instagram max 10 elements
        },
      },
    },
  }, accessToken);
}

/**
 * Send a reaction (emoji) to a message
 */
export async function sendReaction(
  recipientId: string,
  messageId: string,
  reaction: string,
  igAccountId: string,
  accessToken?: string,
): Promise<void> {
  const url = `${GRAPH_API_BASE}/${igAccountId}/messages`;

  await graphRequest(url, 'POST', {
    recipient: { id: recipientId },
    sender_action: 'react',
    payload: {
      message_id: messageId,
      reaction,
    },
  }, accessToken);
}

/**
 * Share an influencer's own Instagram post via DM
 * The app user must own the post
 */
export async function sendMediaShare(
  recipientId: string,
  postId: string,
  igAccountId: string,
  accessToken?: string,
): Promise<IGSendMessageResponse> {
  const url = `${GRAPH_API_BASE}/${igAccountId}/messages`;

  return graphRequest<IGSendMessageResponse>(url, 'POST', {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: 'MEDIA_SHARE',
        payload: { id: postId },
      },
    },
  }, accessToken);
}

// ============================================
// Ice Breakers & Persistent Menu (one-time config)
// ============================================

/**
 * Set Ice Breakers — up to 4 FAQ questions shown when user opens DM for first time
 * For Instagram Business Login tokens, uses graph.instagram.com
 */
export async function setIceBreakers(
  igAccountId: string,
  questions: Array<{ question: string; payload: string }>,
  accessToken: string,
): Promise<void> {
  const url = `${GRAPH_API_BASE}/${igAccountId}/messenger_profile`;

  await graphRequest(url, 'POST', {
    platform: 'instagram',
    ice_breakers: [
      {
        call_to_actions: questions.slice(0, 4).map(q => ({
          question: q.question,
          payload: q.payload,
        })),
      },
    ],
  }, accessToken);
}

/**
 * Set Persistent Menu — always-visible menu in DM conversation
 * For Instagram Business Login tokens, uses graph.instagram.com
 * Max 5 items recommended
 */
export async function setPersistentMenu(
  igAccountId: string,
  menuItems: Array<{
    type: 'postback' | 'web_url';
    title: string;
    payload?: string;
    url?: string;
  }>,
  accessToken: string,
): Promise<void> {
  const url = `${GRAPH_API_BASE}/${igAccountId}/messenger_profile`;

  await graphRequest(url, 'POST', {
    platform: 'instagram',
    persistent_menu: [
      {
        locale: 'default',
        call_to_actions: menuItems.slice(0, 5),
      },
    ],
  }, accessToken);
}

/**
 * Delete Ice Breakers configuration
 */
export async function deleteIceBreakers(
  igAccountId: string,
  accessToken: string,
): Promise<void> {
  const url = `${GRAPH_API_BASE}/${igAccountId}/messenger_profile`;

  await graphRequest(url, 'DELETE', {
    fields: ['ice_breakers'],
  }, accessToken);
}

/**
 * Delete Persistent Menu configuration
 */
export async function deletePersistentMenu(
  igAccountId: string,
  accessToken: string,
): Promise<void> {
  const url = `${GRAPH_API_BASE}/${igAccountId}/messenger_profile`;

  await graphRequest(url, 'DELETE', {
    fields: ['persistent_menu'],
    platform: 'instagram',
  }, accessToken);
}

// ============================================
// Profile & Media
// ============================================

/**
 * Get Instagram user profile info
 */
export async function getUserProfile(
  igUserId: string,
  accessToken?: string,
): Promise<IGUserProfile> {
  const fields = 'id,name,username,profile_pic,follower_count,is_business_account,biography,media_count';
  const url = `${GRAPH_API_BASE}/${igUserId}?fields=${fields}`;
  return graphRequest<IGUserProfile>(url, 'GET', undefined, accessToken);
}

/**
 * Get story insights for a specific story
 */
export async function getStoryInsights(
  storyId: string,
  accessToken?: string,
): Promise<IGStoryInsight> {
  const metrics = 'impressions,reach,replies,exits,taps_forward,taps_back';
  const url = `${GRAPH_API_BASE}/${storyId}/insights?metric=${metrics}`;
  const result = await graphRequest<{ data: any[] }>(url, 'GET', undefined, accessToken);

  const insights: any = { id: storyId };
  for (const metric of result.data || []) {
    insights[metric.name] = metric.values?.[0]?.value || 0;
  }
  return insights as IGStoryInsight;
}

/**
 * Get all active stories for an Instagram account
 */
export async function getStories(
  igUserId: string,
  accessToken?: string,
): Promise<any[]> {
  const url = `${GRAPH_API_BASE}/${igUserId}/stories?fields=id,media_type,media_url,timestamp`;
  const result = await graphRequest<{ data: any[] }>(url, 'GET', undefined, accessToken);
  return result.data || [];
}

// ============================================
// Content Fetching — Posts, Comments, Insights
// ============================================

export interface IGMediaItem {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  permalink?: string;
  children?: { data: Array<{ id: string; media_type: string; media_url: string }> };
}

export interface IGComment {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  like_count?: number;
}

/**
 * Get all media (posts/reels) for an account — handles pagination
 */
export async function getAllMedia(
  igUserId: string,
  accessToken: string,
  limit: number = 500,
  delayMs: number = 500,
): Promise<IGMediaItem[]> {
  const allMedia: IGMediaItem[] = [];
  const fields = 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink';
  let url: string | null = `${GRAPH_API_BASE}/${igUserId}/media?fields=${fields}&limit=25`;

  while (url && allMedia.length < limit) {
    const result = await graphRequest<{ data: IGMediaItem[]; paging?: { next?: string } }>(
      url, 'GET', undefined, accessToken
    );
    allMedia.push(...(result.data || []));
    url = result.paging?.next || null;

    if (url) await new Promise(r => setTimeout(r, delayMs));
    console.log(`  [Graph] Fetched ${allMedia.length} media items...`);
  }

  return allMedia.slice(0, limit);
}

/**
 * Get carousel children (individual media items in a carousel post)
 */
export async function getCarouselChildren(
  mediaId: string,
  accessToken: string,
): Promise<Array<{ id: string; media_type: string; media_url: string }>> {
  const url = `${GRAPH_API_BASE}/${mediaId}/children?fields=id,media_type,media_url`;
  const result = await graphRequest<{ data: any[] }>(url, 'GET', undefined, accessToken);
  return result.data || [];
}

/**
 * Get comments for a media item — handles pagination
 */
export async function getMediaComments(
  mediaId: string,
  accessToken: string,
  limit: number = 50,
): Promise<IGComment[]> {
  const allComments: IGComment[] = [];
  let url: string | null = `${GRAPH_API_BASE}/${mediaId}/comments?fields=id,text,username,timestamp,like_count&limit=25`;

  while (url && allComments.length < limit) {
    const result = await graphRequest<{ data: IGComment[]; paging?: { next?: string } }>(
      url, 'GET', undefined, accessToken
    );
    allComments.push(...(result.data || []));
    url = result.paging?.next || null;
  }

  return allComments.slice(0, limit);
}

/**
 * Get full profile with correct v22.0 field names
 */
export async function getFullProfile(
  igUserId: string,
  accessToken: string,
): Promise<{
  id: string;
  name: string;
  username: string;
  biography: string;
  followers_count: number;
  media_count: number;
  profile_picture_url: string;
  website?: string;
}> {
  const fields = 'id,name,username,biography,followers_count,media_count,profile_picture_url,website';
  const url = `${GRAPH_API_BASE}/${igUserId}?fields=${fields}`;
  return graphRequest(url, 'GET', undefined, accessToken);
}

// ============================================
// Webhook Verification
// ============================================

/**
 * Verify webhook signature from Meta
 * Meta signs webhook payloads with the app secret using HMAC-SHA256
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret?: string,
): boolean {
  const secret = appSecret || process.env.INSTAGRAM_APP_SECRET;
  if (!secret) {
    console.warn('[Instagram Graph] No app secret configured, skipping signature verification');
    return true;
  }

  if (!signature?.startsWith('sha256=')) {
    return false;
  }

  // Use crypto for HMAC verification
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return `sha256=${expectedSignature}` === signature;
}

// ============================================
// Message Splitting (Instagram 1000 char limit)
// ============================================

const INSTAGRAM_MAX_LENGTH = 1000;

function splitMessageForInstagram(text: string): string[] {
  if (text.length <= INSTAGRAM_MAX_LENGTH) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split('\n\n');
  let current = '';

  for (const para of paragraphs) {
    if (current && (current + '\n\n' + para).length > INSTAGRAM_MAX_LENGTH) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }

  if (current.trim()) {
    if (current.length > INSTAGRAM_MAX_LENGTH) {
      const sentences = current.match(/[^.!?]+[.!?]+\s*/g) || [current];
      let sentenceChunk = '';
      for (const sentence of sentences) {
        if ((sentenceChunk + sentence).length > INSTAGRAM_MAX_LENGTH) {
          if (sentenceChunk) chunks.push(sentenceChunk.trim());
          sentenceChunk = sentence;
        } else {
          sentenceChunk += sentence;
        }
      }
      if (sentenceChunk.trim()) chunks.push(sentenceChunk.trim());
    } else {
      chunks.push(current.trim());
    }
  }

  return chunks;
}
