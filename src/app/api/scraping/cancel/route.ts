/**
 * DELETE /api/scraping/cancel
 * מבטל job סריקה ומוחק את כל הנתונים הקשורים
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

export async function DELETE(request: Request) {
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
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get job to find account_id
    const { data: job, error: jobError } = await supabase
      .from('scraping_jobs')
      .select('account_id')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      console.error('[Scraping Cancel] Job not found:', jobError);
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const accountId = job.account_id;

    console.log(`[Scraping Cancel] Deleting job ${jobId} and all data for account ${accountId}`);

    // Delete all data in reverse order (to respect foreign keys)
    // The CASCADE on account deletion will handle most of this, but we'll be explicit

    // 1. Delete comments (references posts)
    await supabase
      .from('instagram_comments')
      .delete()
      .eq('account_id', accountId);

    // 2. Delete posts
    await supabase
      .from('instagram_posts')
      .delete()
      .eq('account_id', accountId);

    // 3. Delete hashtags
    await supabase
      .from('instagram_hashtags')
      .delete()
      .eq('account_id', accountId);

    // 4. Delete profile history
    await supabase
      .from('instagram_profile_history')
      .delete()
      .eq('account_id', accountId);

    // 5. Delete persona
    await supabase
      .from('chatbot_persona')
      .delete()
      .eq('account_id', accountId);

    // 6. Delete scraping job
    await supabase
      .from('scraping_jobs')
      .delete()
      .eq('id', jobId);

    // Note: We DON'T delete the account here - that's handled separately
    // if the user explicitly wants to delete the account

    console.log(`[Scraping Cancel] Successfully deleted all data for job ${jobId}`);

    return NextResponse.json({
      success: true,
      message: 'Job and associated data deleted successfully',
    });

  } catch (error: any) {
    console.error('[Scraping Cancel] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
