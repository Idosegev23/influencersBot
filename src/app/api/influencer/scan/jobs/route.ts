/**
 * GET /api/influencer/scan/jobs
 * קבלת סריקות של המשפיען
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user's account
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's account
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('owner_user_id', user.id)
      .single();

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Get scan jobs
    const { data: jobs, error } = await supabase
      .from('scan_jobs')
      .select('*')
      .eq('account_id', account.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(`Failed to fetch jobs: ${error.message}`);
    }

    return NextResponse.json({
      jobs: jobs || [],
    });

  } catch (error: any) {
    console.error('[API] /influencer/scan/jobs error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
