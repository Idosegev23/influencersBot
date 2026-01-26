import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

// GET - Get audience analytics
export async function GET(req: NextRequest) {
  try {
    // Auth check with cookie-based auth (no RLS loop)
    const auth = await requireInfluencerAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Use account_id from auth (for legacy influencers, account_id = influencer_id)
    const accountId = auth.accountId;

    // Build date filter
    const dateFilter: Record<string, string> = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;

    // Get total conversations (unique sessions)
    const { data: sessions, error: sessionsError } = await supabase
      .from('events')
      .select('session_id', { count: 'exact' })
      .eq('account_id', accountId)
      .eq('type', 'message_received');

    if (sessionsError) {
      console.error('Sessions error:', sessionsError);
    }

    const uniqueSessions = new Set(sessions?.map(s => s.session_id).filter(Boolean));
    const totalConversations = uniqueSessions.size;

    // Get message counts
    const { count: totalMessages, error: messagesError } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('type', 'message_received');

    if (messagesError) {
      console.error('Messages error:', messagesError);
    }

    // Get coupon events
    const { data: couponEvents, error: couponError } = await supabase
      .from('events')
      .select('payload, session_id')
      .eq('account_id', accountId)
      .eq('type', 'coupon_copied');

    if (couponError) {
      console.error('Coupon events error:', couponError);
    }

    const uniqueCouponUsers = new Set(couponEvents?.map(e => e.session_id).filter(Boolean));
    const couponCopiedCount = couponEvents?.length || 0;

    // Get support requests
    const { count: supportCount, error: supportError } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('type', 'support_started');

    if (supportError) {
      console.error('Support error:', supportError);
    }

    // Get satisfaction scores from events
    const { data: satisfactionEvents, error: satisfactionError } = await supabase
      .from('events')
      .select('payload')
      .eq('account_id', accountId)
      .eq('type', 'user_satisfied')
      .or('type.eq.user_unsatisfied');

    if (satisfactionError) {
      console.error('Satisfaction error:', satisfactionError);
    }

    const satisfiedCount = satisfactionEvents?.filter(e => e.payload?.satisfied === true).length || 0;
    const unsatisfiedCount = satisfactionEvents?.filter(e => e.payload?.satisfied === false).length || 0;
    const totalFeedback = satisfiedCount + unsatisfiedCount;
    const satisfactionRate = totalFeedback > 0 ? (satisfiedCount / totalFeedback) * 100 : 0;

    // Get conversation activity over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: dailyActivity, error: activityError } = await supabase
      .from('events')
      .select('created_at, session_id')
      .eq('account_id', accountId)
      .eq('type', 'message_received')
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (activityError) {
      console.error('Activity error:', activityError);
    }

    // Group by day
    const activityByDay: Record<string, Set<string>> = {};
    dailyActivity?.forEach(event => {
      const date = new Date(event.created_at).toISOString().split('T')[0];
      if (!activityByDay[date]) {
        activityByDay[date] = new Set();
      }
      if (event.session_id) {
        activityByDay[date].add(event.session_id);
      }
    });

    const conversationsOverTime = Object.entries(activityByDay).map(([date, sessions]) => ({
      date,
      count: sessions.size
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Calculate engagement metrics
    const avgMessagesPerSession = totalConversations > 0 
      ? (totalMessages || 0) / totalConversations 
      : 0;

    const conversionRate = totalConversations > 0
      ? (uniqueCouponUsers.size / totalConversations) * 100
      : 0;

    return NextResponse.json({
      overview: {
        totalConversations,
        totalMessages: totalMessages || 0,
        avgMessagesPerSession: Math.round(avgMessagesPerSession * 10) / 10,
        couponCopiedCount,
        uniqueCouponUsers: uniqueCouponUsers.size,
        conversionRate: Math.round(conversionRate * 10) / 10,
        supportRequests: supportCount || 0,
        satisfactionRate: Math.round(satisfactionRate * 10) / 10,
        satisfiedCount,
        unsatisfiedCount,
      },
      conversationsOverTime,
    });
  } catch (error) {
    console.error('Get audience analytics error:', error);
    return NextResponse.json({ error: 'Failed to fetch audience analytics' }, { status: 500 });
  }
}

