/**
 * GET /api/scraping/status
 * מחזיר מצב נוכחי של job סריקה
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireInfluencerAuth } from '@/lib/auth/middleware';
import { cookies } from 'next/headers';

const ADMIN_COOKIE_NAME = 'influencerbot_admin_session';

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE_NAME);
  return session?.value === 'authenticated';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    // Check authentication (admin or influencer)
    const isAdmin = await checkAdminAuth();
    
    if (!isAdmin) {
      // Regular influencer auth
      const authResult = await requireInfluencerAuth(request);
      if (authResult instanceof NextResponse) {
        return authResult;
      }
      // accountId will be validated from job if needed
    }

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Load job with full details (without account_id filter for admin)
    let jobQuery = supabase
      .from('scraping_jobs')
      .select('*')
      .eq('id', jobId);

    const { data: job, error } = await jobQuery.single();

    if (error || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Calculate progress percentage
    const progress = job.current_step && job.total_steps
      ? Math.round((job.current_step / job.total_steps) * 100)
      : 0;

    // Estimate time remaining
    let estimatedRemaining = null;
    if (job.status === 'running' && job.started_at) {
      const elapsed = Date.now() - new Date(job.started_at).getTime();
      const avgTimePerStep = elapsed / job.current_step;
      const stepsRemaining = job.total_steps - job.current_step;
      estimatedRemaining = Math.round((avgTimePerStep * stepsRemaining) / 1000); // seconds
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      currentStep: job.current_step,
      totalSteps: job.total_steps,
      progress,
      stepStatuses: job.step_statuses,
      results: job.results,
      
      // Timing
      startedAt: job.started_at,
      completedAt: job.completed_at,
      estimatedCompletion: job.estimated_completion,
      estimatedRemaining,
      
      // Stats
      totalPostsScraped: job.total_posts_scraped,
      totalCommentsScraped: job.total_comments_scraped,
      totalHashtagsTracked: job.total_hashtags_tracked,
      
      // Error
      errorMessage: job.error_message,
      errorStep: job.error_step,
      
      // Metadata
      jobType: job.job_type,
      triggeredBy: job.triggered_by,
      createdAt: job.created_at,
    });

  } catch (error: any) {
    console.error('[Scraping Status] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
