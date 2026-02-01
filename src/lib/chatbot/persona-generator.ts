import { createClient } from '@/lib/supabase';
import { scrapeInstagramProfile } from '@/lib/apify';
import { buildPersonaWithGemini } from '@/lib/gemini-chat';
import type { ApifyPostData } from '@/types';

type InstagramData = {
  username: string;
  bio?: string;
  followers: number;
  following: number;
  posts_count: number;
  engagement_rate?: number;
  top_hashtags?: string[];
  top_topics?: string[];
};

type IMAIData = {
  category?: string;
  niche?: string[];
  audience_demographics?: any;
  content_style?: string;
};

/**
 * Generate chatbot persona from Instagram + IMAI data
 */
export async function generatePersona(accountId: string, instagramData: InstagramData, imaiData?: IMAIData) {
  const supabase = createClient();

  // Analyze bio for tone & style
  const tone = analyzeTone(instagramData.bio || '');
  const interests = extractInterests(instagramData.bio || '', instagramData.top_topics || []);
  const responseStyle = determineResponseStyle(instagramData, imaiData);

  // Determine emoji usage from bio
  const emojiUsage = analyzeEmojiUsage(instagramData.bio || '');

  // Generate greeting message
  const greetingMessage = generateGreeting(accountId, instagramData);

  // Generate FAQ from common topics
  const faq = generateBasicFAQ(accountId, instagramData, imaiData);

  // Create persona
  const { data, error } = await supabase
    .from('chatbot_persona')
    .upsert({
      account_id: accountId,
      name: instagramData.username,
      tone,
      language: 'he', // Default to Hebrew
      bio: instagramData.bio,
      description: `משפיען/ת בתחום ${imaiData?.category || 'תוכן דיגיטלי'} עם ${instagramData.followers.toLocaleString()} עוקבים`,
      interests,
      topics: instagramData.top_topics || [],
      response_style: responseStyle,
      emoji_usage: emojiUsage,
      greeting_message: greetingMessage,
      faq,
      instagram_username: instagramData.username,
      instagram_followers: instagramData.followers,
      instagram_following: instagramData.following,
      instagram_posts_count: instagramData.posts_count,
      instagram_engagement_rate: instagramData.engagement_rate,
      instagram_data: instagramData as any,
      instagram_last_synced: new Date().toISOString(),
      imai_data: imaiData as any,
      imai_last_synced: imaiData ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'account_id',
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

/**
 * Analyze tone from bio text
 */
function analyzeTone(bio: string): 'friendly' | 'professional' | 'casual' | 'formal' | 'enthusiastic' {
  const bioLower = bio.toLowerCase();

  // Check for professional keywords
  if (bioLower.includes('מקצוע') || bioLower.includes('professional') || bioLower.includes('עסק')) {
    return 'professional';
  }

  // Check for enthusiasm
  if (bio.includes('!') && bio.split('!').length > 2) {
    return 'enthusiastic';
  }

  // Check for formal language
  if (bioLower.includes('שותפויות') || bioLower.includes('collaboration') || bioLower.includes('עבודה')) {
    return 'formal';
  }

  // Check for casual language
  if (bioLower.includes('כיף') || bioLower.includes('fun') || bioLower.includes('😎')) {
    return 'casual';
  }

  // Default to friendly
  return 'friendly';
}

/**
 * Extract interests from bio and topics
 */
function extractInterests(bio: string, topics: string[]): string[] {
  const interests = new Set<string>();

  // Common interest keywords
  const interestKeywords = {
    'אופנה': ['אופנה', 'fashion', 'style', 'outfit'],
    'יופי': ['יופי', 'beauty', 'מייקאפ', 'makeup'],
    'אוכל': ['אוכל', 'food', 'מתכונים', 'recipes'],
    'ספורט': ['ספורט', 'fitness', 'אימון', 'workout'],
    'נסיעות': ['נסיעות', 'travel', 'טיול', 'trip'],
    'טכנולוגיה': ['טכנולוגיה', 'tech', 'גאדג\'טים', 'gadgets'],
    'משפחה': ['משפחה', 'family', 'הורות', 'parenting'],
    'בריאות': ['בריאות', 'health', 'wellness', 'תזונה'],
  };

  const bioLower = bio.toLowerCase();

  for (const [interest, keywords] of Object.entries(interestKeywords)) {
    if (keywords.some(keyword => bioLower.includes(keyword))) {
      interests.add(interest);
    }
  }

  // Add topics
  topics.forEach(topic => interests.add(topic));

  return Array.from(interests);
}

/**
 * Determine response style based on data
 */
function determineResponseStyle(instagram: InstagramData, imai?: IMAIData): string {
  // If high engagement, probably entertaining
  if (instagram.engagement_rate && instagram.engagement_rate > 5) {
    return 'entertaining';
  }

  // If professional category, be helpful
  if (imai?.category?.includes('Business') || imai?.category?.includes('Education')) {
    return 'helpful';
  }

  // Default to friendly & helpful
  return 'helpful';
}

/**
 * Analyze emoji usage in bio
 */
function analyzeEmojiUsage(bio: string): 'none' | 'minimal' | 'moderate' | 'heavy' {
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojiCount = (bio.match(emojiRegex) || []).length;
  const wordCount = bio.split(/\s+/).length;

  if (emojiCount === 0) return 'none';
  if (emojiCount / wordCount < 0.05) return 'minimal';
  if (emojiCount / wordCount < 0.15) return 'moderate';
  return 'heavy';
}

/**
 * Generate personalized greeting message
 */
function generateGreeting(accountId: string, instagram: InstagramData): string {
  const greetings = [
    `היי! 👋 אני הבוט של ${instagram.username}. איך אוכל לעזור לך היום?`,
    `שלום! 😊 שמחה לדבר איתך! מה מעניין אותך?`,
    `היי שם! 🌟 יש לך שאלות? אני כאן בשבילך!`,
  ];

  // Pick random greeting
  return greetings[Math.floor(Math.random() * greetings.length)];
}

/**
 * Generate basic FAQ
 */
function generateBasicFAQ(accountId: string, instagram: InstagramData, imai?: IMAIData): any[] {
  return [
    {
      question: 'מי את/ה?',
      answer: `אני ${instagram.username}, משפיען/ת בתחום ${imai?.category || 'תוכן דיגיטלי'} עם ${instagram.followers.toLocaleString()} עוקבים באינסטגרם! 🌟`,
    },
    {
      question: 'יש לכם שת"פים פעילים?',
      answer: 'כן! יש לי כמה שת"פים מעניינים. רוצה לשמוע עליהם?',
    },
    {
      question: 'יש קופון?',
      answer: 'בטח! יש לי קופונים מעולים עבורך. תגיד/י לי מה מעניין אותך ואני אמצא את הקופון המושלם!',
    },
    {
      question: 'איך ליצור קשר?',
      answer: `אפשר לכתוב לי כאן בצ'אט או לעקוב אחריי באינסטגרם: @${instagram.username} 📱`,
    },
  ];
}

/**
 * Calculate engagement rate from posts
 */
function calculateEngagementRate(posts: ApifyPostData[], followersCount: number): number {
  if (posts.length === 0 || followersCount === 0) return 0;

  const totalEngagement = posts.reduce((sum, post) => {
    return sum + (post.likesCount || 0) + (post.commentsCount || 0);
  }, 0);

  const avgEngagement = totalEngagement / posts.length;
  const engagementRate = (avgEngagement / followersCount) * 100;

  return Math.round(engagementRate * 100) / 100; // Round to 2 decimals
}

/**
 * Extract hashtags from posts
 */
function extractHashtags(posts: ApifyPostData[]): string[] {
  const hashtagCounts = new Map<string, number>();

  posts.forEach(post => {
    const caption = post.caption || '';
    const hashtags = caption.match(/#[\w\u0590-\u05ff]+/g) || [];
    
    hashtags.forEach(tag => {
      const count = hashtagCounts.get(tag) || 0;
      hashtagCounts.set(tag, count + 1);
    });
  });

  // Sort by frequency and return top 10
  return Array.from(hashtagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);
}

/**
 * Extract topics from posts (simple keyword analysis)
 */
function extractTopics(posts: ApifyPostData[]): string[] {
  const topics = new Set<string>();
  
  const topicKeywords: Record<string, string[]> = {
    'אופנה': ['אופנה', 'fashion', 'style', 'outfit', 'look', 'ootd'],
    'יופי': ['יופי', 'beauty', 'מייקאפ', 'makeup', 'skin', 'עור'],
    'אוכל': ['אוכל', 'food', 'מתכון', 'recipe', 'טעים', 'delicious'],
    'ספורט': ['ספורט', 'fitness', 'אימון', 'workout', 'gym', 'training'],
    'נסיעות': ['נסיעות', 'travel', 'טיול', 'trip', 'vacation', 'חופשה'],
    'טכנולוגיה': ['טכנולוגיה', 'tech', 'גאדג\'ט', 'gadget', 'app'],
    'משפחה': ['משפחה', 'family', 'הורות', 'parenting', 'ילדים', 'kids'],
    'בריאות': ['בריאות', 'health', 'wellness', 'תזונה', 'nutrition'],
    'עיצוב': ['עיצוב', 'design', 'דקור', 'decor', 'home', 'בית'],
  };

  posts.forEach(post => {
    const text = (post.caption || '').toLowerCase();
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        topics.add(topic);
      }
    }
  });

  return Array.from(topics);
}

/**
 * Sync Instagram data and regenerate persona WITH GEMINI PRO
 */
export async function syncInstagramAndRegeneratePersona(accountId: string, username: string) {
  try {
    console.log(`🔍 Starting Instagram sync for @${username}`);
    
    // Fetch real data from Instagram via Apify
    const { profile, posts } = await scrapeInstagramProfile(username, { 
      posts_limit: 50,
    });

    console.log(`✅ Scraped ${posts.length} posts from @${username}`);

    // Calculate engagement rate
    const engagement_rate = calculateEngagementRate(posts, profile.followersCount);

    // Extract hashtags and topics
    const top_hashtags = extractHashtags(posts);
    const top_topics = extractTopics(posts);

    // Build Instagram data
    const instagramData: InstagramData = {
      username: profile.username,
      bio: profile.biography,
      followers: profile.followersCount,
      following: profile.followingCount,
      posts_count: profile.postsCount,
      engagement_rate,
      top_hashtags,
      top_topics,
    };

    console.log('📊 Instagram data analyzed:', {
      username: instagramData.username,
      followers: instagramData.followers,
      engagement_rate: instagramData.engagement_rate,
      topics: instagramData.top_topics,
      hashtags_count: top_hashtags.length,
    });

    // Extract recent post captions for AI analysis
    const recentPosts = posts.slice(0, 20).map(post => post.caption || '').filter(Boolean);

    console.log('🤖 Building deep persona with Gemini Pro...');

    // Use Gemini Pro to build a DEEP, intelligent persona
    const aiPersona = await buildPersonaWithGemini({
      username: profile.username,
      bio: profile.biography || '',
      interests: top_topics,
      recentPosts,
      customDirectives: [
        'תמיד דבר בגוף ראשון כנציג של המשפיען',
        'גלה בהתחלה שאתה הבוט של המשפיען, אבל בצורה חמה ונעימה',
        'כששואלים על דברים אישיים שלא ציינתי - תענה בעדינות שזה פרטי',
      ],
    });

    console.log('✨ Gemini Pro persona built successfully!');

    // Merge AI persona with Instagram data and save
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('chatbot_persona')
      .upsert({
        account_id: accountId,
        name: profile.username,
        
        // AI-generated fields (from Gemini Pro)
        tone: determineTone(aiPersona.conversationStyle),
        bio: profile.biography || '',
        interests: top_topics,
        directives: aiPersona.dosList || [
          'תמיד דבר בגוף ראשון כנציג של המשפיען',
          'גלה בהתחלה שאתה הבוט של המשפיען',
        ],
        greeting_message: aiPersona.responseExamples?.greeting || `היי! אני הבוט של ${profile.username} 😊`,
        
        // Instagram analytics
        instagram_username: profile.username,
        instagram_followers: profile.followersCount,
        instagram_following: profile.followingCount,
        instagram_posts_count: profile.postsCount,
        instagram_engagement_rate: engagement_rate,
        instagram_data: instagramData as any,
        instagram_last_synced: new Date().toISOString(),
        
        // AI persona data (for reference)
        ai_persona_data: aiPersona as any,
        
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'account_id',
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Failed to save persona:', error);
      throw error;
    }

    console.log('💾 Persona saved to DB!');
    return data;
  } catch (error) {
    console.error('❌ Failed to sync Instagram data:', error);
    throw new Error('Failed to sync Instagram profile. Please try again.');
  }
}

/**
 * Map AI conversation style to our tone options
 */
function determineTone(conversationStyle: string): 'friendly' | 'professional' | 'casual' | 'enthusiastic' | 'formal' {
  const style = conversationStyle.toLowerCase();
  
  if (style.includes('חם') || style.includes('ידידות')) return 'friendly';
  if (style.includes('מקצוע')) return 'professional';
  if (style.includes('סלנג') || style.includes('חופשי')) return 'casual';
  if (style.includes('נלהב') || style.includes('אנרגט')) return 'enthusiastic';
  if (style.includes('פורמל')) return 'formal';
  
  return 'friendly'; // default
}

/**
 * Sync IMAI data and update persona
 */
export async function syncIMAIData(accountId: string, instagramUsername: string) {
  // TODO: Integrate with IMAI API
  // For now, this is a placeholder
  console.log('IMAI sync not yet implemented');
  
  return {
    category: 'Fashion & Beauty',
    niche: ['Fashion', 'Lifestyle', 'Beauty'],
    content_style: 'Visual & Aspirational',
  };
}
