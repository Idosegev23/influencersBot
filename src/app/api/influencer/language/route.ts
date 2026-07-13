import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';
import { normalizeLang } from '@/lib/i18n/dashboard';

/**
 * POST /api/influencer/language   { language: 'he' | 'en' }
 *
 * Sets the dashboard language for the authenticated account (accounts.language).
 * This is the write side of the per-account language the dashboard already reads
 * via /api/influencer/nav-features.
 */
export async function POST(request: NextRequest) {
  const auth = await requireInfluencerAuth(request);
  if (!auth.authorized) return auth.response!;

  const body = await request.json().catch(() => ({}));
  const language = normalizeLang(body?.language);
  if (!language) {
    return NextResponse.json({ error: 'Invalid language (expected "he" or "en")' }, { status: 400 });
  }

  const { error } = await supabase
    .from('accounts')
    .update({ language })
    .eq('id', auth.accountId);

  if (error) {
    console.error('[influencer/language] update failed:', error.message);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, language });
}
