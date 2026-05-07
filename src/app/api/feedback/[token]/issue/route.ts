/**
 * Customer reports an issue from the feedback page.
 *
 * Multipart: `body` (text, ≤1500 chars), optional `file` (image, ≤10MB).
 * Files go to the public `support-attachments` bucket under the
 * ticket's prefix — same convention as the agent send-image flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { findTicketByFeedbackToken } from '@/lib/shipment/feedback-token';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BODY = 1500;
const MAX_BYTES = 10 * 1024 * 1024;
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
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const ticket = await findTicketByFeedbackToken(token);
  if (!ticket) return NextResponse.json({ error: 'invalid_token' }, { status: 404 });

  // Idempotent — once responded, lock the form.
  if (ticket.feedback_status === 'positive' || ticket.feedback_status === 'issue') {
    return NextResponse.json({ ok: true, already_responded: true, feedback_status: ticket.feedback_status });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_form' }, { status: 400 });
  }

  const body = (form.get('body') || '').toString().trim().slice(0, MAX_BODY);
  if (!body) return NextResponse.json({ error: 'empty_body' }, { status: 400 });

  const file = form.get('file');

  let attachmentUrl: string | null = null;
  let attachmentFilename: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'too_large', message: 'הקובץ גדול מ-10MB' }, { status: 400 });
    }
    const ctype = file.type || 'application/octet-stream';
    if (!ctype.startsWith('image/')) {
      return NextResponse.json({ error: 'not_image', message: 'אפשר לצרף רק תמונות' }, { status: 400 });
    }
    const fname = safeFilename(file.name || 'image');
    const objectPath = `${ticket.id}/feedback-${Date.now()}-${fname}`;
    try {
      const storage = getStorageClient();
      const { error: upErr } = await storage.storage.from(BUCKET).upload(objectPath, file, {
        contentType: ctype,
        cacheControl: '604800',
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = storage.storage.from(BUCKET).getPublicUrl(objectPath);
      attachmentUrl = pub.publicUrl;
      attachmentFilename = fname;
    } catch (e) {
      console.warn('[feedback issue] upload failed (non-fatal):', e);
      // Continue without attachment rather than failing the whole flow.
    }
  }

  const now = new Date().toISOString();
  await supabase
    .from('support_requests')
    .update({
      feedback_status: 'issue',
      feedback_responded_at: now,
      status: 'in_progress',
      updated_at: now,
    })
    .eq('id', ticket.id);

  await supabase.from('support_ticket_history').insert({
    ticket_id: ticket.id,
    account_id: ticket.account_id,
    action: 'customer_feedback',
    actor: ticket.customer_name || 'הלקוחה',
    body_text: body,
    note: 'issue',
    attachment_url: attachmentUrl,
    attachment_filename: attachmentFilename,
  });

  return NextResponse.json({ ok: true, feedback_status: 'issue' });
}
