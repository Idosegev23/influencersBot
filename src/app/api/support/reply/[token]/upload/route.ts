/**
 * Upload an attachment for a customer reply. Token in the URL is the
 * auth — same token the customer used to access the reply page.
 *
 * POST /api/support/reply/[token]/upload
 *   multipart/form-data with field "file"
 *
 * Validates token, file size + type, pushes to the public
 * `support-attachments` bucket, returns { url, filename }. The reply
 * page then includes those in the subsequent POST to
 * /api/support/reply/[token].
 *
 * Limits:
 *   • 10 MB per file
 *   • images / pdf only — no exec, no scripts
 */

import { NextRequest, NextResponse } from 'next/server';
import { findTicketByReplyToken } from '@/lib/support/reply-token';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_PREFIXES = ['image/', 'application/pdf'];
const BUCKET = 'support-attachments';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('supabase service env not configured');
  return createClient(url, key);
}

function safeFilename(raw: string): string {
  return raw
    .replace(/[<>"\\/?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'upload';
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const ticket = await findTicketByReplyToken(token);
  if (!ticket) {
    return NextResponse.json({ error: 'invalid token' }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no file field' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'empty file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 10MB)' }, { status: 400 });
  }

  const ctype = file.type || 'application/octet-stream';
  if (!ALLOWED_PREFIXES.some((p) => ctype.startsWith(p))) {
    return NextResponse.json({ error: 'unsupported file type' }, { status: 400 });
  }

  const name = safeFilename(file.name || 'upload');
  // Path: <ticket_id>/<timestamp>-<filename>. Per-ticket prefix keeps
  // files together; timestamp avoids collisions if the customer uploads
  // two files with the same name.
  const objectPath = `${ticket.id}/${Date.now()}-${name}`;

  const supabase = getServiceClient();
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file, {
      contentType: ctype,
      cacheControl: '604800',
      upsert: false,
    });
  if (uploadErr) {
    console.error('[reply upload] storage error:', uploadErr);
    return NextResponse.json({ error: 'upload failed' }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return NextResponse.json({
    url: pub.publicUrl,
    filename: name,
    contentType: ctype,
    size: file.size,
  });
}
