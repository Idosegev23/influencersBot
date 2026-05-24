/**
 * Widget Attachment Upload — receives file from support form, stores it in
 * the public `support-attachments` bucket, returns a permanent URL the visitor
 * will attach to their ticket. Files live under {accountId}/{uuid}.{ext}.
 *
 * POST /api/widget/upload — multipart/form-data with `file` + `accountId`.
 *
 * Size cap 10MB, type whitelist (jpg/png/gif/webp/pdf). Larger / other types =
 * 400 — surfaces a clean error in the widget instead of an upload that silently
 * fails downstream.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
]);
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req.headers.get('origin') || '*') });
}

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get('origin') || '*');
  try {
    const form = await req.formData();
    const accountId = String(form.get('accountId') || '');
    const file = form.get('file');

    if (!accountId || !(file instanceof File)) {
      return NextResponse.json({ error: 'accountId + file required' }, { status: 400, headers });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'file too large (max 10MB)' }, { status: 400, headers });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'unsupported file type — allowed: jpg, png, gif, webp, pdf' }, { status: 400, headers });
    }

    const ext = EXT_BY_TYPE[file.type] || 'bin';
    const path = `${accountId}/${randomUUID()}.${ext}`;
    const supabase = await createClient();
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase
      .storage
      .from('support-attachments')
      .upload(path, bytes, { contentType: file.type, upsert: false });

    if (upErr) {
      console.error('[Widget Upload] storage error:', upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500, headers });
    }

    const { data: pub } = supabase.storage.from('support-attachments').getPublicUrl(path);
    return NextResponse.json({
      success: true,
      url: pub?.publicUrl || null,
      path: path,
      filename: file.name || path.split('/').pop(),
      contentType: file.type,
      size: file.size,
    }, { headers });
  } catch (err: any) {
    console.error('[Widget Upload] error:', err);
    return NextResponse.json({ error: err?.message || 'internal error' }, { status: 500, headers });
  }
}
