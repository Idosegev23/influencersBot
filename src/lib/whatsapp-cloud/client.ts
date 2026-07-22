/**
 * WhatsApp Cloud API — typed client.
 *
 * This wraps the small subset of Meta's Graph API we care about:
 *   • send text messages (for open 24h customer service windows)
 *   • send template messages (to open / re-open conversations)
 *   • send media by URL
 *   • mark inbound messages as read
 *   • download media by media_id
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Credentials are read from env. One central business number per app
 * (WHATSAPP_PHONE_NUMBER_ID). Multi-tenancy lives at the conversation
 * layer, not here.
 */

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
const GRAPH_BASE    = `https://graph.facebook.com/${GRAPH_VERSION}`;

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface WhatsAppSendResult {
  success: boolean;
  wa_message_id?: string;
  contact_wa_id?: string;
  error?: { code?: number; type?: string; message: string; details?: unknown };
  raw?: unknown;
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: number;
  parameters?: Array<
    | { type: 'text'; text: string }
    | { type: 'currency'; currency: { fallback_value: string; code: string; amount_1000: number } }
    | { type: 'date_time'; date_time: { fallback_value: string } }
    | { type: 'image'; image: { link: string } }
    | { type: 'document'; document: { link: string; filename?: string } }
    | { type: 'video'; video: { link: string } }
    | { type: 'payload'; payload: string }
  >;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function getConfig() {
  const token           = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId   = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error(
      'WhatsApp Cloud API not configured: set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID'
    );
  }
  return { token, phoneNumberId };
}

/**
 * Normalise any Israeli / international phone string to E.164 digits
 * (no plus sign) — that's what Meta's `to` field expects.
 */
export function toWaId(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
  if (cleaned.startsWith('0'))  cleaned = '972' + cleaned.slice(1);
  if (cleaned.length === 9)     cleaned = '972' + cleaned; // assume IL if no CC
  return cleaned;
}

async function graphFetch<T = any>(
  path: string,
  init: RequestInit & { phoneNumberIdOverride?: string } = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const { token } = getConfig();
  const { phoneNumberIdOverride: _ignored, ...rest } = init;

  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(rest.headers || {}),
    },
  });

  let data: any = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

function parseSendResponse(ok: boolean, data: any): WhatsAppSendResult {
  if (!ok) {
    const err = data?.error;
    return {
      success: false,
      error: {
        code: err?.code,
        type: err?.type,
        message: err?.message || 'WhatsApp send failed',
        details: err?.error_data || err,
      },
      raw: data,
    };
  }
  return {
    success: true,
    wa_message_id: data?.messages?.[0]?.id,
    contact_wa_id: data?.contacts?.[0]?.wa_id,
    raw: data,
  };
}

// -----------------------------------------------------------------------
// Send: text (only valid inside a 24h customer service window)
// -----------------------------------------------------------------------
export async function sendText(params: {
  to: string;
  body: string;
  previewUrl?: boolean;
  contextMessageId?: string; // reply-to a specific inbound wamid
}): Promise<WhatsAppSendResult> {
  const { phoneNumberId } = getConfig();
  const to = toWaId(params.to);

  const payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      body: params.body,
      preview_url: Boolean(params.previewUrl),
    },
  };
  if (params.contextMessageId) {
    payload.context = { message_id: params.contextMessageId };
  }

  const { ok, data } = await graphFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return parseSendResponse(ok, data);
}

// -----------------------------------------------------------------------
// Send: template (only way to initiate outside a service window)
// -----------------------------------------------------------------------
export async function sendTemplate(params: {
  to: string;
  templateName: string;
  languageCode?: string;          // default 'en_US'
  components?: TemplateComponent[];
}): Promise<WhatsAppSendResult> {
  const { phoneNumberId } = getConfig();
  const to = toWaId(params.to);

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: params.languageCode || 'en_US' },
      ...(params.components ? { components: params.components } : {}),
    },
  };

  const { ok, data } = await graphFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return parseSendResponse(ok, data);
}

// -----------------------------------------------------------------------
// Send: image / document / video / audio by URL
// -----------------------------------------------------------------------
export async function sendMediaByLink(params: {
  to: string;
  type: 'image' | 'document' | 'video' | 'audio' | 'sticker';
  link: string;
  caption?: string;
  filename?: string;  // document only
}): Promise<WhatsAppSendResult> {
  const { phoneNumberId } = getConfig();
  const to = toWaId(params.to);

  const mediaPayload: any = { link: params.link };
  if (params.caption && ['image', 'video', 'document'].includes(params.type)) {
    mediaPayload.caption = params.caption;
  }
  if (params.filename && params.type === 'document') {
    mediaPayload.filename = params.filename;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: params.type,
    [params.type]: mediaPayload,
  };

  const { ok, data } = await graphFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return parseSendResponse(ok, data);
}

// -----------------------------------------------------------------------
// Send: interactive reply buttons (max 3) — 24h service-window message.
// -----------------------------------------------------------------------
export interface InteractiveButton { id: string; title: string; }        // title<=20, id<=256
export interface InteractiveRow { id: string; title: string; description?: string; } // title<=24, desc<=72, id<=200
export interface InteractiveSection { title?: string; rows: InteractiveRow[]; }        // <=10 rows total

export async function sendInteractiveButtons(params: {
  to: string;
  body: string;                 // <=1024
  buttons: InteractiveButton[]; // max 3
  header?: string;
  footer?: string;
}): Promise<WhatsAppSendResult> {
  const { phoneNumberId } = getConfig();
  const to = toWaId(params.to);
  const interactive: any = {
    type: 'button',
    body: { text: params.body },
    action: {
      buttons: params.buttons.slice(0, 3).map((b) => ({
        type: 'reply',
        reply: { id: b.id, title: b.title },
      })),
    },
  };
  if (params.header) interactive.header = { type: 'text', text: params.header };
  if (params.footer) interactive.footer = { text: params.footer };

  const { ok, data } = await graphFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    }),
  });
  return parseSendResponse(ok, data);
}

// -----------------------------------------------------------------------
// Send: interactive sectioned list (single button opens it) — 24h window.
// -----------------------------------------------------------------------
export async function sendInteractiveList(params: {
  to: string;
  body: string;                 // <=4096
  buttonLabel: string;          // <=20
  sections: InteractiveSection[]; // <=10 rows total
  header?: string;
  footer?: string;
}): Promise<WhatsAppSendResult> {
  const { phoneNumberId } = getConfig();
  const to = toWaId(params.to);
  const interactive: any = {
    type: 'list',
    body: { text: params.body },
    action: {
      button: params.buttonLabel,
      sections: params.sections.map((s) => ({
        ...(s.title ? { title: s.title } : {}),
        rows: s.rows.map((r) => ({
          id: r.id,
          title: r.title,
          ...(r.description ? { description: r.description } : {}),
        })),
      })),
    },
  };
  if (params.header) interactive.header = { type: 'text', text: params.header };
  if (params.footer) interactive.footer = { text: params.footer };

  const { ok, data } = await graphFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    }),
  });
  return parseSendResponse(ok, data);
}

// -----------------------------------------------------------------------
// Mark inbound message as read (shows blue ticks on the user's side)
// -----------------------------------------------------------------------
export async function markAsRead(waMessageId: string): Promise<boolean> {
  const { phoneNumberId } = getConfig();
  const { ok } = await graphFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: waMessageId,
    }),
  });
  return ok;
}

// -----------------------------------------------------------------------
// React to an inbound message (👀 = "got it, working on it"). Empty emoji removes it.
// -----------------------------------------------------------------------
export async function sendReaction(params: { to: string; messageId: string; emoji: string }): Promise<boolean> {
  const { phoneNumberId } = getConfig();
  const { ok } = await graphFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toWaId(params.to),
      type: 'reaction',
      reaction: { message_id: params.messageId, emoji: params.emoji },
    }),
  });
  return ok;
}

// -----------------------------------------------------------------------
// Typing indicator (official). Sending it also marks the message as read.
// Auto-clears after ~25s or when the next message is sent. Requires a recent
// inbound wamid. Gated by Graph API version — if it 400s, keep the 👀 reaction.
// -----------------------------------------------------------------------
export async function sendTyping(waMessageId: string): Promise<boolean> {
  const { phoneNumberId } = getConfig();
  const { ok } = await graphFetch(`/${phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: waMessageId,
      typing_indicator: { type: 'text' },
    }),
  });
  return ok;
}

// -----------------------------------------------------------------------
// Media download: two-step — fetch metadata then download bytes.
// -----------------------------------------------------------------------
export async function getMediaUrl(mediaId: string): Promise<string | null> {
  const { ok, data } = await graphFetch<{ url?: string }>(`/${mediaId}`);
  return ok ? data.url ?? null : null;
}

export async function downloadMedia(mediaId: string): Promise<{
  bytes: ArrayBuffer;
  mimeType: string | null;
} | null> {
  const url = await getMediaUrl(mediaId);
  if (!url) return null;
  const { token } = getConfig();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return {
    bytes: await res.arrayBuffer(),
    mimeType: res.headers.get('content-type'),
  };
}
