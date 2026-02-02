/**
 * POST /api/scraping/start
 * יוצר job חדש לסריקת Instagram מלאה
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireInfluencerAuth } from '@/lib/auth/middleware';

export async function POST(request: Request) {
  try {
    // Authentication
    const authResult = await requireInfluencerAuth(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { accountId } = authResult;
    const body = await request.json();
    const { username, jobType = 'full_rebuild' } = body;

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    console.log(`[Scraping Start] Creating job for @${username}, account: ${accountId}`);

    const supabase = await createClient();

    // Check if there's already a running job for this account
    const { data: existingJobs } = await supabase
      .from('scraping_jobs')
      .select('id, status, current_step')
      .eq('account_id', accountId)
      .eq('status', 'running')
      .limit(1);

    if (existingJobs && existingJobs.length > 0) {
      console.log('[Scraping Start] Found existing running job:', existingJobs[0].id);
      return NextResponse.json({
        jobId: existingJobs[0].id,
        nextStep: existingJobs[0].current_step + 1,
        resumed: true,
      });
    }

    // Initialize step statuses
    const stepStatuses = [
      { step: 1, name: 'Instagram Posts', nameHe: 'סריקת פוסטים', description: '500 פוסטים אחרונים', status: 'pending' },
      { step: 2, name: 'Comments', nameHe: 'סריקת תגובות', description: '150 פוסטים × 50 תגובות', status: 'pending' },
      { step: 3, name: 'Profile', nameHe: 'פרופיל', description: 'bio, followers, category', status: 'pending' },
      { step: 4, name: 'Hashtags', nameHe: 'האשטגים', description: '20 hashtags × 30 posts', status: 'pending' },
      { step: 5, name: 'Search', nameHe: 'חיפוש', description: 'מיקום בשוק', status: 'pending' },
      { step: 6, name: 'Preprocessing', nameHe: 'עיבוד מידע', description: 'ניתוח, clustering, timeline', status: 'pending' },
      { step: 7, name: 'Gemini Persona', nameHe: 'בניית פרסונה', description: 'Gemini Pro - קול, ידע, גבולות', status: 'pending' },
    ];

    // Create the job using SQL function
    const { data: job, error } = await supabase
      .from('scraping_jobs')
      .insert({
        account_id: accountId,
        status: 'pending',
        current_step: 0,
        total_steps: 7,
        step_statuses: stepStatuses,
        job_type: jobType,
        triggered_by: 'manual',
        results: {},
      })
      .select()
      .single();

    if (error) {
      console.error('[Scraping Start] Error creating job:', error);
      return NextResponse.json(
        { error: 'Failed to create scraping job', details: error.message },
        { status: 500 }
      );
    }

    console.log('[Scraping Start] Job created:', job.id);

    return NextResponse.json({
      jobId: job.id,
      nextStep: 1,
      totalSteps: 7,
      message: 'Job created successfully. Start with step 1.',
    });

  } catch (error: any) {
    console.error('[Scraping Start] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
