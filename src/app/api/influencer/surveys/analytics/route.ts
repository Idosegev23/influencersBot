import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/influencer/surveys/analytics
 * Get NPS and CSAT analytics for an account
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('owner_user_id', user.id)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams;
    const entityType = searchParams.get('entityType') || null;
    const entityId = searchParams.get('entityId') || null;

    // Calculate NPS
    const { data: npsData } = await supabase.rpc('calculate_nps', {
      p_account_id: account.id,
      p_entity_type: entityType,
      p_entity_id: entityId,
    });

    const nps = npsData?.[0] || {
      nps_score: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      total_responses: 0,
    };

    // Calculate CSAT
    const { data: csatData } = await supabase.rpc('calculate_csat', {
      p_account_id: account.id,
      p_entity_type: entityType,
      p_entity_id: entityId,
    });

    const csat = csatData?.[0] || {
      csat_score: 0,
      satisfied: 0,
      total_responses: 0,
    };

    // Get recent feedback
    const { data: recentFeedback } = await supabase
      .from('satisfaction_surveys')
      .select('score, feedback, completed_at, survey_type')
      .eq('account_id', account.id)
      .eq('status', 'completed')
      .not('feedback', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      nps,
      csat,
      recent_feedback: recentFeedback || [],
    });
  } catch (error) {
    console.error('GET /api/influencer/surveys/analytics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
