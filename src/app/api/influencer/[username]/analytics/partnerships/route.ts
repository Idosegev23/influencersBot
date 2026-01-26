import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/api-helpers';
import { PartnershipAnalytics } from '@/lib/analytics/partnerships';

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
      .select('id, owner_user_id, name')
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

    const analytics = new PartnershipAnalytics(supabase);

    // Get all partnerships data
    const [overview, pipeline, monthlyRevenue, upcomingDeadlines] =
      await Promise.all([
        analytics.getOverview(account.id),
        analytics.getPipeline(account.id),
        analytics.getMonthlyRevenue(account.id, 12),
        analytics.getUpcomingDeadlines(account.id, 30),
      ]);

    // Get all partnerships for library
    const { data: partnerships } = await supabase
      .from('partnerships')
      .select('*')
      .eq('account_id', account.id)
      .order('created_at', { ascending: false });

    // Get calendar events (current month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const calendarEvents = await analytics.getPartnershipsForCalendar(
      account.id,
      startOfMonth.toISOString().split('T')[0],
      endOfMonth.toISOString().split('T')[0]
    );

    return NextResponse.json({
      success: true,
      data: {
        overview,
        pipeline,
        monthly_revenue: monthlyRevenue,
        upcoming_deadlines: upcomingDeadlines,
        partnerships: partnerships || [],
        calendar_events: calendarEvents,
      },
    });
  } catch (error) {
    console.error(
      'Error in GET /api/influencer/[username]/analytics/partnerships:',
      error
    );
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}
