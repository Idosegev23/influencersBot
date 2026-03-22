import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/influencer/profile?username=...
 * Get account profile data — wrapper around accounts table
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: account, error } = await supabase
      .from('accounts')
      .select('id, instagram_username, config, status, type, created_at')
      .eq('instagram_username', username)
      .single();

    if (error || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: account.id,
      username: account.instagram_username,
      displayName: account.config?.display_name || account.instagram_username,
      type: account.type,
      status: account.status,
      config: account.config || {},
    });
  } catch (error) {
    console.error('[Profile] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
