import { createClient } from '@/lib/supabase';

// Note: Apify's Instagram scraper has limitations on searching mentions
// This is a simplified implementation that tracks hashtags and user posts

type MentionData = {
  platform: 'instagram';
  mention_type: 'tag' | 'hashtag' | 'caption';
  post_url?: string;
  post_id?: string;
  author_username?: string;
  author_followers?: number;
  content?: string;
  image_url?: string;
  likes_count?: number;
  comments_count?: number;
  shares_count?: number;
  detected_at: Date;
};

/**
 * Track Instagram mentions for an account
 * 
 * Note: Instagram's API is restrictive. This implementation:
 * 1. Tracks branded hashtags
 * 2. Monitors the influencer's own posts for engagement
 * 3. Can be extended with Instagram Graph API for tagged posts
 */
export async function trackInstagramMentions(accountId: string, instagramUsername: string, brandHashtags: string[] = []) {
  console.log(`Tracking Instagram mentions for @${instagramUsername}`);

  const mentions: MentionData[] = [];

  try {
    // 1. Track branded hashtags
    if (brandHashtags.length > 0) {
      for (const hashtag of brandHashtags) {
        const hashtagMentions = await trackHashtag(hashtag);
        mentions.push(...hashtagMentions);
      }
    }

    // 2. Monitor influencer's own posts for high engagement
    const ownPostMentions = await trackOwnPosts(instagramUsername);
    mentions.push(...ownPostMentions);

    // 3. Save mentions to database
    if (mentions.length > 0) {
      await saveMentions(accountId, mentions);
    }

    // 4. Generate alerts for important mentions
    await generateAlerts(accountId);

    console.log(`Tracked ${mentions.length} mentions for @${instagramUsername}`);
    return { success: true, count: mentions.length };
  } catch (error) {
    console.error('Failed to track Instagram mentions:', error);
    throw error;
  }
}

/**
 * Track posts with a specific hashtag
 * 
 * Note: This requires Apify's Instagram scraper with hashtag search
 * For now, this is a placeholder that would use Apify
 */
async function trackHashtag(hashtag: string): Promise<MentionData[]> {
  console.log(`Tracking hashtag: ${hashtag}`);

  // TODO: Implement Apify hashtag search
  // const { posts } = await scrapeInstagramHashtag(hashtag);
  
  // Placeholder: In production, this would scrape Instagram for the hashtag
  // and return posts that mention it
  
  return [];
}

/**
 * Monitor influencer's own posts for high engagement
 * This helps identify viral content
 */
async function trackOwnPosts(username: string): Promise<MentionData[]> {
  // TODO: Implement using Apify
  // const { posts } = await scrapeInstagramProfile(username, { posts_limit: 10 });
  
  // Filter for high-engagement posts (above average)
  // and create "mentions" for tracking
  
  return [];
}

/**
 * Save mentions to database
 */
async function saveMentions(accountId: string, mentions: MentionData[]) {
  const supabase = createClient();

  const records = mentions.map(mention => ({
    account_id: accountId,
    platform: mention.platform,
    mention_type: mention.mention_type,
    post_url: mention.post_url,
    post_id: mention.post_id,
    author_username: mention.author_username,
    author_followers: mention.author_followers,
    content: mention.content,
    image_url: mention.image_url,
    likes_count: mention.likes_count || 0,
    comments_count: mention.comments_count || 0,
    shares_count: mention.shares_count || 0,
    engagement_score: calculateEngagementScore(
      mention.likes_count || 0,
      mention.comments_count || 0,
      mention.shares_count || 0
    ),
    sentiment: 'unknown', // TODO: Add sentiment analysis
    detected_at: mention.detected_at.toISOString(),
  }));

  const { error } = await supabase
    .from('social_listening_mentions')
    .insert(records);

  if (error) {
    console.error('Failed to save mentions:', error);
    throw error;
  }
}

/**
 * Generate alerts for important mentions
 */
async function generateAlerts(accountId: string) {
  const supabase = createClient();

  // Get recent mentions that haven't been alerted yet
  const { data: mentions, error } = await supabase
    .from('social_listening_mentions')
    .select('*')
    .eq('account_id', accountId)
    .gte('detected_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
    .order('detected_at', { ascending: false });

  if (error || !mentions) {
    console.error('Failed to fetch mentions for alerts:', error);
    return;
  }

  const alerts: any[] = [];

  for (const mention of mentions) {
    // Check if alert already exists
    const { data: existingAlert } = await supabase
      .from('social_listening_alerts')
      .select('id')
      .eq('mention_id', mention.id)
      .single();

    if (existingAlert) continue; // Already alerted

    // High engagement alert
    if (mention.engagement_score > 1000) {
      alerts.push({
        account_id: accountId,
        mention_id: mention.id,
        alert_type: 'high_engagement',
        severity: mention.engagement_score > 5000 ? 'high' : 'medium',
        title: 'אזכור עם אינטראקציה גבוהה',
        message: `פוסט מ-@${mention.author_username} קיבל ${mention.engagement_score} נקודות אינטראקציה`,
      });
    }

    // Negative sentiment alert
    if (mention.sentiment === 'negative') {
      alerts.push({
        account_id: accountId,
        mention_id: mention.id,
        alert_type: 'negative_sentiment',
        severity: 'high',
        title: 'אזכור עם סנטימנט שלילי',
        message: `פוסט מ-@${mention.author_username} זוהה כשלילי`,
      });
    }

    // Influencer mention (author has many followers)
    if (mention.author_followers && mention.author_followers > 10000) {
      alerts.push({
        account_id: accountId,
        mention_id: mention.id,
        alert_type: 'influencer_mention',
        severity: mention.author_followers > 100000 ? 'high' : 'medium',
        title: 'אזכור ממשפיען',
        message: `@${mention.author_username} (${mention.author_followers.toLocaleString()} עוקבים) הזכיר אותך`,
      });
    }
  }

  // Save alerts
  if (alerts.length > 0) {
    const { error: alertError } = await supabase
      .from('social_listening_alerts')
      .insert(alerts);

    if (alertError) {
      console.error('Failed to save alerts:', alertError);
    } else {
      console.log(`Generated ${alerts.length} alerts`);
    }
  }
}

/**
 * Calculate engagement score
 */
function calculateEngagementScore(likes: number, comments: number, shares: number): number {
  return likes + (comments * 2) + (shares * 3);
}

/**
 * Analyze sentiment (placeholder)
 * TODO: Integrate with sentiment analysis API
 */
export async function analyzeSentiment(text: string): Promise<'positive' | 'neutral' | 'negative'> {
  // Placeholder: Simple keyword-based sentiment
  const positiveKeywords = ['אהבתי', 'מדהים', 'מושלם', 'love', 'amazing', 'perfect', '❤️', '😍', '🔥'];
  const negativeKeywords = ['לא אהבתי', 'גרוע', 'אכזבה', 'hate', 'terrible', 'disappointed', '😡', '👎'];

  const textLower = text.toLowerCase();

  const positiveCount = positiveKeywords.filter(kw => textLower.includes(kw)).length;
  const negativeCount = negativeKeywords.filter(kw => textLower.includes(kw)).length;

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

/**
 * Get branded hashtags for an account
 */
export async function getBrandedHashtags(accountId: string): Promise<string[]> {
  const supabase = createClient();

  // Get hashtags from partnerships
  const { data: partnerships } = await supabase
    .from('partnerships')
    .select('brand_name, campaign_name')
    .eq('account_id', accountId)
    .eq('status', 'active');

  const hashtags: string[] = [];

  partnerships?.forEach(p => {
    // Generate hashtag from brand name
    const brandHashtag = p.brand_name.replace(/\s+/g, '').toLowerCase();
    hashtags.push(`#${brandHashtag}`);

    // Generate hashtag from campaign name if exists
    if (p.campaign_name) {
      const campaignHashtag = p.campaign_name.replace(/\s+/g, '').toLowerCase();
      hashtags.push(`#${campaignHashtag}`);
    }
  });

  return [...new Set(hashtags)]; // Remove duplicates
}
