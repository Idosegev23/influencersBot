import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';

// GET - Get conversation analytics
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Get account_id
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('legacy_influencer_id', influencer.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Build date filter
    let eventsQuery = supabase
      .from('events')
      .select('*')
      .eq('account_id', account.id);

    if (startDate) {
      eventsQuery = eventsQuery.gte('created_at', startDate);
    }
    if (endDate) {
      eventsQuery = eventsQuery.lte('created_at', endDate);
    }

    const { data: events, error: eventsError } = await eventsQuery;

    if (eventsError) {
      console.error('Events error:', eventsError);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    // Analyze conversation patterns
    const messageEvents = events?.filter(e => e.type === 'message_received') || [];
    const decisionEvents = events?.filter(e => e.type === 'decision_made') || [];
    const responseEvents = events?.filter(e => e.type === 'response_sent') || [];

    // Get unique sessions
    const uniqueSessions = new Set(messageEvents.map(e => e.session_id).filter(Boolean));
    const totalConversations = uniqueSessions.size;

    // Calculate messages per conversation
    const sessionMessageCounts: Record<string, number> = {};
    messageEvents.forEach(e => {
      if (e.session_id) {
        sessionMessageCounts[e.session_id] = (sessionMessageCounts[e.session_id] || 0) + 1;
      }
    });

    const messageCounts = Object.values(sessionMessageCounts);
    const avgMessagesPerConversation = messageCounts.length > 0
      ? messageCounts.reduce((a, b) => a + b, 0) / messageCounts.length
      : 0;

    // Intent distribution from decision events
    const intentCounts: Record<string, number> = {};
    decisionEvents.forEach(e => {
      const intent = e.payload?.intent || 'unknown';
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
    });

    const intentDistribution = Object.entries(intentCounts)
      .map(([intent, count]) => ({
        intent,
        count,
        percentage: totalConversations > 0 ? Math.round((count / totalConversations) * 100 * 10) / 10 : 0
      }))
      .sort((a, b) => b.count - a.count);

    // Response time analysis
    const responseTimes = responseEvents
      .map(e => e.payload?.latencyMs)
      .filter(t => typeof t === 'number' && t > 0);

    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

    // Success metrics
    const couponEvents = events?.filter(e => e.type === 'coupon_copied') || [];
    const supportEvents = events?.filter(e => e.type === 'support_started') || [];
    const satisfiedEvents = events?.filter(e => e.type === 'user_satisfied') || [];
    const unsatisfiedEvents = events?.filter(e => e.type === 'user_unsatisfied') || [];

    const successfulConversations = new Set([
      ...couponEvents.map(e => e.session_id),
      ...supportEvents.map(e => e.session_id),
      ...satisfiedEvents.map(e => e.session_id)
    ].filter(Boolean)).size;

    const successRate = totalConversations > 0
      ? Math.round((successfulConversations / totalConversations) * 100 * 10) / 10
      : 0;

    // Conversation outcomes
    const outcomes = {
      couponCopied: new Set(couponEvents.map(e => e.session_id).filter(Boolean)).size,
      supportStarted: new Set(supportEvents.map(e => e.session_id).filter(Boolean)).size,
      satisfied: satisfiedEvents.length,
      unsatisfied: unsatisfiedEvents.length,
    };

    // Peak hours analysis
    const hourCounts: Record<number, number> = {};
    messageEvents.forEach(e => {
      const hour = new Date(e.created_at).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const peakHours = Object.entries(hourCounts)
      .map(([hour, count]) => ({
        hour: parseInt(hour),
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Day of week analysis
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayCounts: Record<number, number> = {};
    messageEvents.forEach(e => {
      const day = new Date(e.created_at).getDay();
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });

    const conversationsByDay = dayNames.map((name, index) => ({
      day: name,
      count: dayCounts[index] || 0
    }));

    // Conversation length distribution
    const lengthBuckets = {
      short: 0,  // 1-2 messages
      medium: 0, // 3-5 messages
      long: 0,   // 6+ messages
    };

    Object.values(sessionMessageCounts).forEach(count => {
      if (count <= 2) lengthBuckets.short++;
      else if (count <= 5) lengthBuckets.medium++;
      else lengthBuckets.long++;
    });

    return NextResponse.json({
      overview: {
        totalConversations,
        totalMessages: messageEvents.length,
        avgMessagesPerConversation: Math.round(avgMessagesPerConversation * 10) / 10,
        avgResponseTime,
        successRate,
        successfulConversations,
      },
      intentDistribution,
      outcomes,
      peakHours,
      conversationsByDay,
      conversationLengths: lengthBuckets,
    });
  } catch (error) {
    console.error('Get conversation analytics error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversation analytics' }, { status: 500 });
  }
}

