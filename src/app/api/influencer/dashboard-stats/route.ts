import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';

async function checkAuth(username: string): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(`influencer_session_${username}`);
  return authCookie?.value === 'authenticated';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const isAuth = await checkAuth(username);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    const accountId = influencer.id;

    // Fetch all data in parallel
    const [
      sessionsResult,
      partnershipsResult,
      couponsResult,
      postsStatsResult,
      recentPostsResult,
      profileHistoryResult,
      documentsResult,
      eventsStatsResult,
      highlightsResult,
      personaResult,
    ] = await Promise.all([
      // Chat sessions summary
      supabase
        .from('chat_sessions')
        .select('id, message_count, created_at, updated_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false }),

      // Partnerships with all fields
      supabase
        .from('partnerships')
        .select('*', { count: 'exact' })
        .eq('account_id', accountId)
        .order('created_at', { ascending: false }),

      // Coupons
      supabase
        .from('coupons')
        .select('id, code, brand_name, brand_category, discount_type, discount_value, copy_count, usage_count, is_active, partnership_id')
        .eq('account_id', accountId),

      // Instagram posts aggregate stats
      supabase
        .from('instagram_posts')
        .select('likes_count, comments_count, views_count, engagement_rate, type, is_sponsored, posted_at')
        .eq('account_id', accountId),

      // Recent posts with full data (top 6 by engagement)
      supabase
        .from('instagram_posts')
        .select('id, shortcode, type, caption, likes_count, comments_count, views_count, engagement_rate, posted_at, thumbnail_url, is_sponsored')
        .eq('account_id', accountId)
        .order('posted_at', { ascending: false })
        .limit(6),

      // Profile history for follower trend
      supabase
        .from('instagram_profile_history')
        .select('followers_count, following_count, posts_count, snapshot_date, full_name, bio, is_verified, category, profile_pic_url')
        .eq('account_id', accountId)
        .order('snapshot_date', { ascending: true }),

      // Documents & chunks count
      supabase
        .from('documents')
        .select('id, entity_type, status, chunk_count', { count: 'exact' })
        .eq('account_id', accountId),

      // Events for analytics (last 30 days)
      supabase
        .from('events')
        .select('type, category, created_at, payload, metadata')
        .eq('account_id', accountId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false }),

      // Highlights count
      supabase
        .from('instagram_highlights')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId),

      // Chatbot persona
      supabase
        .from('chatbot_persona')
        .select('name, tone, response_style, topics')
        .eq('account_id', accountId)
        .single(),
    ]);

    // --- Process sessions ---
    const sessions = sessionsResult.data || [];
    const totalSessions = sessions.length;
    const totalMessages = sessions.reduce((sum, s) => sum + (s.message_count || 0), 0);
    const avgMessagesPerSession = totalSessions > 0 ? Math.round((totalMessages / totalSessions) * 10) / 10 : 0;
    const recentSessions = sessions.slice(0, 8);

    // --- Process partnerships ---
    const partnerships = partnershipsResult.data || [];
    const activePartnerships = partnerships.filter((p) => p.status === 'active' || p.is_active);
    const totalRevenue = partnerships.reduce((sum, p) => sum + (Number(p.contract_amount) || 0), 0);
    const pendingRevenue = partnerships
      .filter((p) => p.status === 'proposal' || p.status === 'negotiation')
      .reduce((sum, p) => sum + (Number(p.proposal_amount) || Number(p.contract_amount) || 0), 0);

    // --- Process coupons ---
    const coupons = couponsResult.data || [];
    const activeCoupons = coupons.filter((c) => c.is_active !== false);
    const totalCouponCopies = coupons.reduce((sum, c) => sum + (c.copy_count || 0), 0);

    // --- Process Instagram posts ---
    const allPosts = postsStatsResult.data || [];
    const totalPosts = allPosts.length;
    const totalLikes = allPosts.reduce((sum, p) => sum + (p.likes_count || 0), 0);
    const totalComments = allPosts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
    const totalViews = allPosts.reduce((sum, p) => sum + (p.views_count || 0), 0);
    const avgEngagement = totalPosts > 0
      ? Math.round((allPosts.reduce((sum, p) => sum + (Number(p.engagement_rate) || 0), 0) / totalPosts) * 100) / 100
      : 0;
    const sponsoredPosts = allPosts.filter((p) => p.is_sponsored).length;
    const postsByType: Record<string, number> = {};
    allPosts.forEach((p) => {
      postsByType[p.type] = (postsByType[p.type] || 0) + 1;
    });

    // --- Process profile history for follower trend ---
    const profileHistory = profileHistoryResult.data || [];
    const latestProfile = profileHistory.length > 0 ? profileHistory[profileHistory.length - 1] : null;
    const followersTrend = profileHistory.map((p) => ({
      date: p.snapshot_date,
      followers: p.followers_count,
      following: p.following_count,
      posts: p.posts_count,
    }));
    // Calculate growth
    let followersGrowth = 0;
    if (profileHistory.length >= 2) {
      const oldest = profileHistory[0].followers_count || 0;
      const newest = profileHistory[profileHistory.length - 1].followers_count || 0;
      followersGrowth = newest - oldest;
    }

    // --- Process documents ---
    const documents = documentsResult.data || [];
    const totalDocuments = documentsResult.count || documents.length;
    const totalChunks = documents.reduce((sum, d) => sum + (d.chunk_count || 0), 0);
    const docsByType: Record<string, number> = {};
    documents.forEach((d) => {
      docsByType[d.entity_type] = (docsByType[d.entity_type] || 0) + 1;
    });

    // --- Process events ---
    const events = eventsStatsResult.data || [];
    const messagesReceived = events.filter((e) => e.type === 'message_received').length;
    const responsesSent = events.filter((e) => e.type === 'response_sent').length;
    const quickActions = events.filter((e) => e.type === 'quick_action_clicked').length;

    // Average response time from events metadata
    const responseTimes = events
      .filter((e) => e.type === 'response_sent' && e.metadata?.latencyMs)
      .map((e) => e.metadata.latencyMs);
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
      : 0;

    // Daily activity (last 30 days)
    const dailyActivity: Record<string, { messages: number; responses: number }> = {};
    events.forEach((e) => {
      const day = e.created_at.split('T')[0];
      if (!dailyActivity[day]) dailyActivity[day] = { messages: 0, responses: 0 };
      if (e.type === 'message_received') dailyActivity[day].messages++;
      if (e.type === 'response_sent') dailyActivity[day].responses++;
    });

    // Convert to sorted array
    const dailyActivityArray = Object.entries(dailyActivity)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Total tokens used
    const totalTokens = events
      .filter((e) => e.type === 'response_sent' && e.metadata?.tokens?.totalTokens)
      .reduce((sum, e) => sum + (e.metadata.tokens.totalTokens || 0), 0);

    // --- Highlights ---
    const highlightsCount = highlightsResult.count || 0;

    // --- Persona ---
    const persona = personaResult.data || null;

    return NextResponse.json({
      influencer: {
        id: influencer.id,
        username: influencer.username,
        display_name: influencer.display_name,
        avatar_url: influencer.avatar_url,
        bio: influencer.bio,
        is_verified: influencer.is_verified,
        category: influencer.category,
        plan: influencer.plan,
      },
      instagram: {
        followers: latestProfile?.followers_count || influencer.followers_count || 0,
        following: latestProfile?.following_count || 0,
        totalPosts: latestProfile?.posts_count || totalPosts,
        scrapedPosts: totalPosts,
        totalLikes,
        totalComments,
        totalViews,
        avgEngagement,
        sponsoredPosts,
        postsByType,
        highlightsCount,
        followersTrend,
        followersGrowth,
      },
      recentPosts: (recentPostsResult.data || []).map((p) => ({
        id: p.id,
        shortcode: p.shortcode,
        type: p.type,
        caption: p.caption?.substring(0, 120) || '',
        likes: p.likes_count || 0,
        comments: p.comments_count || 0,
        views: p.views_count || 0,
        engagement: Number(p.engagement_rate) || 0,
        postedAt: p.posted_at,
        thumbnail: p.thumbnail_url,
        isSponsored: p.is_sponsored || false,
      })),
      chat: {
        totalSessions,
        totalMessages,
        avgMessagesPerSession,
        recentSessions: recentSessions.map((s) => ({
          id: s.id,
          messageCount: s.message_count || 0,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        })),
      },
      partnerships: {
        total: partnerships.length,
        active: activePartnerships.length,
        totalRevenue,
        pendingRevenue,
        list: partnerships.slice(0, 6).map((p) => ({
          id: p.id,
          brandName: p.brand_name,
          status: p.status,
          contractAmount: Number(p.contract_amount) || 0,
          category: p.category,
          couponCode: p.coupon_code,
          startDate: p.start_date,
          endDate: p.end_date,
        })),
      },
      coupons: {
        total: coupons.length,
        active: activeCoupons.length,
        totalCopies: totalCouponCopies,
        list: coupons.map((c) => ({
          id: c.id,
          code: c.code,
          brandName: c.brand_name,
          discountType: c.discount_type,
          discountValue: Number(c.discount_value),
          copyCount: c.copy_count || 0,
          isActive: c.is_active,
          partnershipId: c.partnership_id,
        })),
      },
      botKnowledge: {
        totalDocuments,
        totalChunks,
        docsByType,
        hasPersona: !!persona,
        personaTone: persona?.tone || null,
      },
      analytics: {
        messagesReceived,
        responsesSent,
        quickActions,
        avgResponseTimeMs: avgResponseTime,
        totalTokens,
        dailyActivity: dailyActivityArray,
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard stats' }, { status: 500 });
  }
}
