/**
 * GET /api/admin/accounts/check
 * בודק אם account קיים לפי username ומחזיר את הסטטוס שלו
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

const ADMIN_COOKIE_NAME = 'influencerbot_admin_session';

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE_NAME);
  return session?.value === 'authenticated';
}

export async function GET(request: Request) {
  try {
    // Check admin authentication
    const isAdmin = await checkAdminAuth();
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'username is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if account exists
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, type, status, config, created_at')
      .eq('type', 'creator')
      .eq('config->>username', username)
      .single();

    if (accountError || !account) {
      return NextResponse.json({
        exists: false,
        account: null,
        job: null,
      });
    }

    // Check if there's an active or failed job
    const { data: job, error: jobError } = await supabase
      .from('scraping_jobs')
      .select('*')
      .eq('account_id', account.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      exists: true,
      account: {
        id: account.id,
        username,
        status: account.status,
        createdAt: account.created_at,
      },
      job: job || null,
    });

  } catch (error: any) {
    console.error('[Admin Check Account] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
