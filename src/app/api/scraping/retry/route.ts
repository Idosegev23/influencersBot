/**
 * POST /api/scraping/retry
 * מאפס שלב שנכשל ומאפשר ניסיון חוזר
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobId, step } = body;

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

    if (!jobId || !step) {
      return NextResponse.json(
        { error: 'jobId and step are required' },
        { status: 400 }
      );
    }

    console.log(`[Scraping Retry] Retrying step ${step} for job ${jobId}`);

    const supabase = await createClient();

    // Load job (without account_id filter for admin)
    let jobQuery = supabase
      .from('scraping_jobs')
      .select('*')
      .eq('id', jobId);

    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Validate step number
    if (step < 1 || step > 7) {
      return NextResponse.json(
        { error: 'Invalid step number' },
        { status: 400 }
      );
    }

    // Update step status to 'pending' (reset)
    const stepStatuses = [...(job.step_statuses || [])];
    const stepIndex = step - 1;

    if (stepStatuses[stepIndex]) {
      stepStatuses[stepIndex] = {
        ...stepStatuses[stepIndex],
        status: 'pending',
        error: null,
        startedAt: null,
        completedAt: null,
        duration: null,
      };
    }

    // Update job status
    const updates: any = {
      step_statuses: stepStatuses,
      retry_count: (job.retry_count || 0) + 1,
    };

    // If job was failed, reset it to running
    if (job.status === 'failed') {
      updates.status = 'running';
      updates.error_message = null;
      updates.error_step = null;
    }

    const { error: updateError } = await supabase
      .from('scraping_jobs')
      .update(updates)
      .eq('id', jobId);

    if (updateError) {
      console.error('[Scraping Retry] Error updating job:', updateError);
      return NextResponse.json(
        { error: 'Failed to reset step', details: updateError.message },
        { status: 500 }
      );
    }

    console.log(`[Scraping Retry] Step ${step} reset successfully`);

    return NextResponse.json({
      success: true,
      message: `Step ${step} has been reset and is ready to retry`,
      jobId,
      step,
      retryCount: updates.retry_count,
    });

  } catch (error: any) {
    console.error('[Scraping Retry] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
