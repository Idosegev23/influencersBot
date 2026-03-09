/**
 * Respond.io API Client
 * לקוח API לתקשורת עם Respond.io — שליחת הודעות, ניהול אנשי קשר, ניהול שיחות
 */

const RESPONDIO_BASE_URL = process.env.RESPONDIO_BASE_URL || 'https://api.respond.io/v2';
const RESPONDIO_API_KEY = process.env.RESPONDIO_API_KEY || '';

// ============================================
// Types
// ============================================

export interface RespondioContact {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  customFields?: Record<string, any>;
  channels?: RespondioChannel[];
}

export interface RespondioChannel {
  id: number;
  type: string; // 'instagram', 'whatsapp', 'facebook', etc.
  name?: string;
}

export interface RespondioMessage {
  id: string;
  contactId: number;
  channelId: number;
  type: string;
  text?: string;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
}

export interface SendMessageParams {
  identifier: string; // "id:123" or "phone:+972..." or "email:..."
  channelId?: number | null;
  messageType: 'text' | 'attachment' | 'email' | 'whatsapp_template';
  text?: string;
  attachmentUrl?: string;
  attachmentType?: 'image' | 'video' | 'file' | 'audio';
  subject?: string;
}

export interface WebhookPayload {
  event: string;
  data: {
    contact?: {
      id: number;
      firstName?: string;
      lastName?: string;
      channels?: Array<{
        id: number;
        type: string;
        identifier?: string;
      }>;
      tags?: string[];
      customFields?: Record<string, any>;
    };
    message?: {
      id: string;
      type: string;
      text?: string;
      channelId: number;
      direction: 'incoming' | 'outgoing';
    };
    conversation?: {
      id: number;
      status: string;
    };
  };
}

// ============================================
// API Client
// ============================================

async function apiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body?: any,
): Promise<T> {
  if (!RESPONDIO_API_KEY) {
    throw new Error('[Respond.io] Missing RESPONDIO_API_KEY environment variable');
  }

  const url = `${RESPONDIO_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${RESPONDIO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`[Respond.io] API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

// ============================================
// Contact Management
// ============================================

/**
 * Get a contact by identifier (id, email, or phone)
 */
export async function getContact(identifier: string): Promise<RespondioContact> {
  return apiRequest<RespondioContact>(`/contact/by_identifier`, 'POST', { identifier });
}

/**
 * Create or update a contact
 */
export async function createOrUpdateContact(params: {
  identifier: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  customFields?: Array<{ name: string; value: any }>;
  tags?: string[];
}): Promise<RespondioContact> {
  return apiRequest<RespondioContact>('/contact/create_or_update', 'POST', params);
}

/**
 * Add tags to a contact
 */
export async function addContactTags(identifier: string, tags: string[]): Promise<void> {
  await apiRequest('/contact/tags/add', 'POST', { identifier, tags });
}

/**
 * List contact channels (to find Instagram channel)
 */
export async function listContactChannels(identifier: string): Promise<RespondioChannel[]> {
  const result = await apiRequest<{ channels: RespondioChannel[] }>(
    '/contact/channels',
    'POST',
    { identifier },
  );
  return result.channels || [];
}

// ============================================
// Messaging
// ============================================

/**
 * Send a message to a contact — the core function for responding to Instagram DMs
 */
export async function sendMessage(params: SendMessageParams): Promise<RespondioMessage> {
  const payload: any = {
    identifier: params.identifier,
    channelId: params.channelId ?? null, // null = use last interacted channel
    messageType: params.messageType,
  };

  if (params.text) payload.text = params.text;
  if (params.attachmentUrl) payload.attachmentUrl = params.attachmentUrl;
  if (params.attachmentType) payload.attachmentType = params.attachmentType;
  if (params.subject) payload.subject = params.subject;

  return apiRequest<RespondioMessage>('/message/send', 'POST', payload);
}

/**
 * Send a text message — convenience wrapper
 */
export async function sendTextMessage(
  contactId: number,
  text: string,
  channelId?: number | null,
): Promise<RespondioMessage> {
  return sendMessage({
    identifier: `id:${contactId}`,
    channelId: channelId ?? null,
    messageType: 'text',
    text,
  });
}

/**
 * Get messages for a contact (conversation history)
 */
export async function listMessages(
  identifier: string,
  limit: number = 20,
): Promise<RespondioMessage[]> {
  const result = await apiRequest<{ messages: RespondioMessage[] }>(
    '/message/list',
    'POST',
    { identifier, limit },
  );
  return result.messages || [];
}

// ============================================
// Conversation Management
// ============================================

/**
 * Assign conversation to a user (or unassign)
 */
export async function assignConversation(
  identifier: string,
  assignee: string | null,
): Promise<void> {
  await apiRequest('/conversation/assign', 'POST', {
    identifier,
    assignee: assignee ?? 'null',
  });
}

/**
 * Update conversation status (open/close)
 */
export async function updateConversationStatus(
  identifier: string,
  status: 'open' | 'close',
  category?: string,
  summary?: string,
): Promise<void> {
  await apiRequest('/conversation/status', 'POST', {
    identifier,
    status,
    ...(category ? { category } : {}),
    ...(summary ? { summary } : {}),
  });
}

// ============================================
// Workspace
// ============================================

/**
 * List all communication channels in workspace
 */
export async function listChannels(): Promise<RespondioChannel[]> {
  const result = await apiRequest<{ channels: RespondioChannel[] }>('/workspace/channels', 'GET');
  return result.channels || [];
}

/**
 * Find Instagram channel from workspace
 */
export async function findInstagramChannel(): Promise<RespondioChannel | null> {
  const channels = await listChannels();
  return channels.find(c => c.type === 'instagram') || null;
}

// ============================================
// Message Splitting (Instagram 1000 char limit)
// ============================================

const INSTAGRAM_MAX_LENGTH = 1000;

/**
 * Split long messages for Instagram's character limit
 */
export function splitMessageForInstagram(text: string): string[] {
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
    // If single paragraph is too long, split by sentences
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

/**
 * Send a long message, automatically splitting for Instagram
 */
export async function sendLongTextMessage(
  contactId: number,
  text: string,
  channelId?: number | null,
  delayBetweenMs: number = 500,
): Promise<RespondioMessage[]> {
  const chunks = splitMessageForInstagram(text);
  const results: RespondioMessage[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenMs));
    }
    const result = await sendTextMessage(contactId, chunks[i], channelId);
    results.push(result);
  }

  return results;
}
