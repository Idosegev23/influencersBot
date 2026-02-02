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

    console.log(`[Admin Check] Looking for jobs with username: ${username}`);

    // Strategy: Find the most recent job for this username (across ALL accounts)
    // This is better than finding account first, because there might be multiple accounts
    const { data: jobsWithAccounts, error: jobsError } = await supabase
      .from('scraping_jobs')
      .select(`
        *,
        accounts!inner(id, type, status, config, created_at)
      `)
      .eq('accounts.type', 'creator')
      .eq('accounts.config->>username', username)
      .order('created_at', { ascending: false })
      .limit(1);

    console.log(`[Admin Check] Found ${jobsWithAccounts?.length || 0} jobs for username ${username}`);

    if (jobsError) {
      console.error('[Admin Check] Database error:', jobsError);
    }

    // If no jobs found, check if there's at least an account
    if (!jobsWithAccounts || jobsWithAccounts.length === 0) {
      console.log(`[Admin Check] No jobs found, checking for account only...`);
      
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, type, status, config, created_at')
        .eq('type', 'creator')
        .eq('config->>username', username)
        .order('created_at', { ascending: false })
        .limit(1);

      const account = accounts && accounts.length > 0 ? accounts[0] : null;

      if (!account) {
        console.log(`[Admin Check] No account found for username: ${username}`);
        return NextResponse.json({
          exists: false,
          account: null,
          job: null,
        });
      }

      console.log(`[Admin Check] Found account without jobs:`, account.id);
      
      return NextResponse.json({
        exists: true,
        account: {
          id: account.id,
          username,
          status: account.status,
          createdAt: account.created_at,
        },
        job: null,
      });
    }

    // Found job - extract account and job data
    const jobData = jobsWithAccounts[0];
    const accountData = jobData.accounts;

    console.log(`[Admin Check] Found job:`, jobData.id, `Status: ${jobData.status}, Step: ${jobData.current_step}`);
    console.log(`[Admin Check] Associated account:`, accountData.id);

    return NextResponse.json({
      exists: true,
      account: {
        id: accountData.id,
        username,
        status: accountData.status,
        createdAt: accountData.created_at,
      },
      job: {
        id: jobData.id,
        status: jobData.status,
        current_step: jobData.current_step,
        total_steps: jobData.total_steps,
        error_step: jobData.error_step,
        error_message: jobData.error_message,
        started_at: jobData.started_at,
        completed_at: jobData.completed_at,
        total_posts_scraped: jobData.total_posts_scraped,
        total_comments_scraped: jobData.total_comments_scraped,
        total_hashtags_tracked: jobData.total_hashtags_tracked,
      },
    });

  } catch (error: any) {
    console.error('[Admin Check Account] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
