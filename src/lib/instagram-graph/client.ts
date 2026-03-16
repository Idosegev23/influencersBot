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
  const url = `${FB_GRAPH_API_BASE}/${igAccountId}/messages`;

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
  const url = `${FB_GRAPH_API_BASE}/${igAccountId}/messages`;

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
  const url = `${FB_GRAPH_API_BASE}/${igAccountId}/messages`;

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
