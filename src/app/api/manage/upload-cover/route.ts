/**
 * POST /api/manage/upload-cover — widget cover-image upload from the
 * customer manage panel. Auth = manage session cookie (accountId comes from
 * the session, never from the client). Stores the image in the public
 * `support-attachments` bucket (same one the widget support form already
 * uses) under {accountId}/widget-cover/, saves the public URL to
 * config.widget.coverImage, and returns it.
 *
 * DELETE /api/manage/upload-cover — clears config.widget.coverImage.
 * The widget then renders a plain white header (no gradient fallback).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateManageSession } from '@/lib/manage/auth';
import { randomUUID } from 'crypto';

const MAX_BYTES = 5 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

async function saveCoverToConfig(supabase: any, accountId: string, url: string | null) {
  const { data: account } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();
  const config: any = account?.config || {};
  const widget: any = config.widget || {};
  if (url) widget.coverImage = url;
  else delete widget.coverImage;
  const { error } = await supabase
    .from('accounts')
    .update({ config: { ...config, widget } })
    .eq('id', accountId);
  if (error) throw new Error(error.message);
}

export async function POST(req: NextRequest) {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 5MB)' }, { status: 400 });
    }
    const ext = EXT_BY_TYPE[file.type];
    if (!ext) {
      return NextResponse.json({ error: 'פורמט לא נתמך — רק JPG / PNG / WebP' }, { status: 400 });
    }

    const supabase = await createClient();
    const path = `${session.accountId}/widget-cover/${randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase
      .storage
      .from('support-attachments')
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (upErr) {
      console.error('[ManageUploadCover] storage error:', upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from('support-attachments').getPublicUrl(path);
    const url = pub?.publicUrl || null;
    if (!url) {
      return NextResponse.json({ error: 'failed to resolve public URL' }, { status: 500 });
    }

    await saveCoverToConfig(supabase, session.accountId, url);
    return NextResponse.json({ success: true, url });
  } catch (err: any) {
    console.error('[ManageUploadCover] error:', err);
    return NextResponse.json({ error: err?.message || 'internal error' }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = await createClient();
    await saveCoverToConfig(supabase, session.accountId, null);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[ManageUploadCover] delete error:', err);
    return NextResponse.json({ error: err?.message || 'internal error' }, { status: 500 });
  }
}
