import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/api-helpers';
import { AudienceAnalytics } from '@/lib/analytics/audience';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await context.params;

    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const supabase = await createClient();

    // Get account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, owner_user_id')
      .eq('name', username)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'חשבון לא נמצא' },
        { status: 404 }
      );
    }

    // Check access
    if (account.owner_user_id !== authResult.user.id) {
      return NextResponse.json(
        { error: 'אין הרשאה לצפות בנתונים' },
        { status: 403 }
      );
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');

    const analytics = new AudienceAnalytics(supabase);

    // Get all audience data
    const [overview, growthData, demographics, engagement, topContent] = await Promise.all([
      analytics.getOverview(account.id),
      analytics.getGrowthData(account.id, days),
      analytics.getDemographics(account.id),
      analytics.getEngagementMetrics(account.id),
      analytics.getTopContent(account.id, 9),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        overview,
        growth: growthData,
        demographics,
        engagement,
        top_content: topContent,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/influencer/[username]/analytics/audience:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}
