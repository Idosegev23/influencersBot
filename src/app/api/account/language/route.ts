import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/account/language?username=X
 *
 * Tiny public endpoint that returns the account's UI language. Used by the
 * influencer-side login page (which doesn't have auth yet and therefore
 * can't call /api/influencer/nav-features) so it can render itself in the
 * right language before the operator has logged in.
 *
 * Returns only `{ language }` — no PII, no account id, nothing that
 * could leak across accounts.
 */
export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  if (!username) {
    return NextResponse.json({ language: 'he' });
  }
  try {
    const { data } = await supabase
      .from('accounts')
      .select('language')
      .eq('config->>username', username)
      .maybeSingle();
    const language = (data as any)?.language === 'en' ? 'en' : 'he';
    return NextResponse.json({ language });
  } catch {
    return NextResponse.json({ language: 'he' });
  }
}
