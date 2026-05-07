/**
 * Send an image (with optional caption) from the agent to the customer.
 *
 * Like send-text, this is a free-form WhatsApp message — only allowed
 * within the 24-hour customer service window. Uploads the image to the
 * shared `support-attachments` bucket, then sends `type:'image'` via
 * the WhatsApp Cloud API with the public URL.
 *
 * POST /api/influencer/[username]/support-tickets/[id]/send-image
 *   multipart/form-data:
 *     file:     image (≤10MB, image/* only)
 *     caption?: string (≤1024 chars — Meta's media caption cap)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase as serviceSupabase, getInfluencerByUsername } from '@/lib/supabase';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { getAgentSession } from '@/lib/auth/agent-auth';
import { sendMediaByLink } from '@/lib/whatsapp-cloud/client';
import { getServiceWindow } from '@/lib/support/service-window';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_CAPTION = 1024;
const BUCKET = 'support-attachments';

function safeFilename(raw: string): string {
  return raw
    .replace(/[<>"\\/?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'upload';
}

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('supabase service env not configured');
  return createClient(url, key);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; id: string }> },
) {
  const { username, id } = await ctx.params;

  const isInfluencer = await checkInfluencerAuth(username);
  const isAdmin = (await requireAdminAuth()) === null;
  if (!isInfluencer && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_form', message: 'נדרש multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  const caption = (form.get('caption') || '').toString().trim().slice(0, MAX_CAPTION);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no_file', message: 'לא צורף קובץ' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'empty', message: 'הקובץ ריק' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'too_large', message: 'הקובץ גדול מ-10MB' }, { status: 400 });
  }
  const ctype = file.type || 'application/octet-stream';
  if (!ctype.startsWith('image/')) {
    return NextResponse.json({ error: 'not_image', message: 'מותר רק תמונות' }, { status: 400 });
  }

  const { data: ticket } = await serviceSupabase
    .from('support_requests')
    .select('id, customer_phone')
    .eq('id', id)
    .eq('account_id', influencer.id)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!ticket.customer_phone) {
    return NextResponse.json({ error: 'no_phone', message: 'אין טלפון לפנייה הזו' }, { status: 400 });
  }

  const window = await getServiceWindow(influencer.id, ticket.customer_phone);
  if (!window.withinWindow) {
    return NextResponse.json(
      {
        error: 'window_closed',
        message:
          'חלון 24 שעות סגור — לא ניתן לשלוח תמונה ללא תבנית. בקשי מהלקוחה לכתוב הודעה כלשהי, או שלחי תבנית סטטוס.',
        window,
      },
      { status: 409 },
    );
  }

  // Upload image to storage
  const storage = getStorageClient();
  const fname = safeFilename(file.name || 'image');
  const objectPath = `${ticket.id}/agent-${Date.now()}-${fname}`;
  const { error: upErr } = await storage.storage.from(BUCKET).upload(objectPath, file, {
    contentType: ctype,
    cacheControl: '604800',
    upsert: false,
  });
  if (upErr) {
    console.error('[send-image] storage error:', upErr);
    return NextResponse.json({ error: 'upload_failed', message: 'העלאה לאחסון נכשלה' }, { status: 500 });
  }
  const { data: pub } = storage.storage.from(BUCKET).getPublicUrl(objectPath);
  const publicUrl = pub.publicUrl;

  const agent = await getAgentSession(username);

  const result = await sendMediaByLink({
    to: ticket.customer_phone,
    type: 'image',
    link: publicUrl,
    caption: caption || undefined,
  });

  await serviceSupabase.from('support_ticket_history').insert({
    ticket_id: ticket.id,
    account_id: influencer.id,
    action: 'agent_image',
    actor: agent?.display_name || username,
    actor_agent_id: agent?.agent_id || null,
    body_text: caption || null,
    attachment_url: publicUrl,
    attachment_filename: fname,
    whatsapp_message_id: result.wa_message_id || null,
    note: result.success ? null : `Send failed: ${result.error?.message || 'unknown'}`,
  });

  if (result.success) {
    await serviceSupabase
      .from('support_requests')
      .update({
        last_customer_notified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket.id);
  }

  return NextResponse.json({
    ok: result.success,
    url: publicUrl,
    error: result.success ? null : result.error?.message || 'send_failed',
    wa_message_id: result.wa_message_id || null,
  });
}
