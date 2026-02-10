/**
 * Rebuild Persona ONLY (without re-scanning)
 * Uses existing data from database to regenerate persona
 */

import { createClient } from '@supabase/supabase-js';
import { buildPersonaWithGemini, savePersonaToDatabase } from '../src/lib/ai/gemini-persona-builder';
import type { PreprocessedData } from '../src/lib/ai/gemini-persona-builder';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const USERNAME = 'miranbuzaglo';

async function main() {
  console.log('============================================================');
  console.log('🔄 [Rebuild Persona] Starting persona rebuild...');
  console.log(`📍 Target: @${USERNAME}`);
  console.log('============================================================\n');

  // 1. Get account
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('*')
    .eq('config->>username', USERNAME)
    .single();

  if (accountError || !account) {
    throw new Error(`Account not found: ${accountError?.message}`);
  }

  console.log(`✅ Found account: ${account.id}`);
  console.log(`📊 Display name: ${account.display_name}`);

  // 2. Fetch all existing content from database
  console.log('\n📚 Loading existing content from database...');

  const [postsResult, highlightsResult, storiesResult, transcriptionsResult] = await Promise.all([
    supabase
      .from('instagram_posts')
      .select('*')
      .eq('account_id', account.id)
      .order('taken_at', { ascending: false })
      .limit(150),
    
    supabase
      .from('instagram_highlights')
      .select('*')
      .eq('account_id', account.id),
    
    supabase
      .from('instagram_stories')
      .select('*')
      .eq('account_id', account.id)
      .order('taken_at', { ascending: false })
      .limit(100),
    
    supabase
      .from('video_transcriptions')
      .select('*')
      .eq('account_id', account.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const posts = postsResult.data || [];
  const highlights = highlightsResult.data || [];
  const stories = storiesResult.data || [];
  const transcriptions = transcriptionsResult.data || [];

  console.log(`📝 Posts: ${posts.length}`);
  console.log(`✨ Highlights: ${highlights.length}`);
  console.log(`📖 Stories: ${stories.length}`);
  console.log(`🎬 Transcriptions: ${transcriptions.length}`);

  // 3. Build preprocessed data structure
  console.log('\n🔄 Preparing data for persona generation...');
  
  const preprocessedData: PreprocessedData = {
    stats: {
      totalPosts: posts.length,
      totalComments: posts.reduce((sum, p) => sum + (p.comments_count || 0), 0),
      totalLikes: posts.reduce((sum, p) => sum + (p.like_count || 0), 0),
      avgEngagement: posts.length > 0 
        ? posts.reduce((sum, p) => sum + ((p.like_count || 0) + (p.comments_count || 0)), 0) / posts.length 
        : 0,
      timespan: {
        earliest: posts[posts.length - 1]?.taken_at || new Date().toISOString(),
        latest: posts[0]?.taken_at || new Date().toISOString(),
      },
    },
    
    topTerms: extractTopTerms(posts, transcriptions),
    
    topics: extractTopics(posts, transcriptions),
    
    timeline: buildTimeline(posts),
    
    ownerReplies: {
      ratio: 0,
      total: 0,
      avgLength: 0,
      samples: [],
      commonPhrases: [],
      replyPatterns: [],
    },
    
    contentPatterns: {
      postTypes: analyzePostTypes(posts),
      captionPatterns: analyzeCaptionPatterns(posts),
      hashtagUsage: extractHashtags(posts),
      emojiUsage: extractEmojis(posts),
      mentionPatterns: extractMentions(posts),
    },
    
    products: [],
    coupons: [],
    brands: [],
    faqCandidates: [],
    boundaries: {
      answeredTopics: [],
      uncertainTopics: [],
      avoidedTopics: [],
    },
    websites: [],
    transcriptions: [],
  };

  console.log(`✅ Preprocessed data ready`);
  console.log(`📊 Total terms: ${preprocessedData.topTerms.length}`);
  console.log(`📊 Total topics: ${preprocessedData.topics.length}`);

  // 4. Build persona with GPT-5.2 Pro
  console.log('\n🧠 Building persona with GPT-5.2 Pro...');
  console.log('⏳ This may take up to 10 minutes with reasoning effort: high');
  
  const persona = await buildPersonaWithGemini(preprocessedData, {
    username: account.username,
    full_name: account.display_name,
    bio: account.bio,
    followers_count: account.followers_count,
    category: account.category,
  });

  console.log('\n✅ Persona generated successfully!');
  console.log(`🎭 Identity: ${persona.identity.who.substring(0, 100)}...`);
  console.log(`🎯 Target Audience: ${persona.identity.targetAudience}`);
  console.log(`📝 Voice tone: ${persona.voice.tone.substring(0, 100)}...`);
  console.log(`📚 Core topics: ${persona.knowledgeMap.coreTopics.length}`);

  // 5. Save to database
  console.log('\n💾 Saving persona to database...');
  await savePersonaToDatabase(account.id, persona);

  console.log('\n============================================================');
  console.log('🎉 [Rebuild Persona] Completed successfully!');
  console.log('============================================================\n');
}

// Helper functions
function extractTopTerms(posts: any[], transcriptions: any[]) {
  const termCounts = new Map<string, number>();
  
  // From posts
  posts.forEach(post => {
    const text = post.caption || '';
    const words = text.split(/\s+/).filter((w: string) => w.length > 2);
    words.forEach((word: string) => {
      const cleaned = word.toLowerCase().replace(/[^\u0590-\u05FFa-z]/g, '');
      if (cleaned.length > 2) {
        termCounts.set(cleaned, (termCounts.get(cleaned) || 0) + 1);
      }
    });
  });
  
  // From transcriptions
  transcriptions.forEach(t => {
    const words = (t.transcription || '').split(/\s+/).filter((w: string) => w.length > 2);
    words.forEach((word: string) => {
      const cleaned = word.toLowerCase().replace(/[^\u0590-\u05FFa-z]/g, '');
      if (cleaned.length > 2) {
        termCounts.set(cleaned, (termCounts.get(cleaned) || 0) + 1);
      }
    });
  });
  
  return Array.from(termCounts.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 200);
}

function extractTopics(posts: any[], transcriptions: any[]) {
  // Simple topic extraction based on keywords
  const topics = [
    { name: 'הורות', keywords: ['ילד', 'תינוק', 'בייבי', 'הורות', 'אמא'] },
    { name: 'יופי וטיפוח', keywords: ['עור', 'טיפוח', 'קרם', 'שיער', 'איפור'] },
    { name: 'אופנה', keywords: ['בגד', 'אאוטפיט', 'נעליים', 'סטייל', 'שמלה'] },
    { name: 'אוכל', keywords: ['מתכון', 'אוכל', 'בישול', 'ארוחה', 'טעים'] },
    { name: 'לייף סטייל', keywords: ['בית', 'שגרה', 'יום', 'חיים', 'רוטינה'] },
  ];
  
  return topics.map(topic => {
    const matchingPosts = posts.filter(post => {
      const text = (post.caption || '').toLowerCase();
      return topic.keywords.some(kw => text.includes(kw));
    });
    
    return {
      name: topic.name,
      frequency: matchingPosts.length,
      posts: matchingPosts.length,
      keywords: topic.keywords,
    };
  }).filter(t => t.frequency > 0);
}

function buildTimeline(posts: any[]) {
  const byMonth = new Map<string, any[]>();
  
  posts.forEach(post => {
    const month = post.taken_at?.substring(0, 7) || '2026-01';
    if (!byMonth.has(month)) {
      byMonth.set(month, []);
    }
    byMonth.get(month)!.push(post);
  });
  
  return Array.from(byMonth.entries()).map(([month, monthPosts]) => ({
    month,
    posts: monthPosts.length,
    avgEngagement: monthPosts.reduce((sum, p) => sum + ((p.like_count || 0) + (p.comments_count || 0)), 0) / monthPosts.length,
    topTopics: ['general'],
  }));
}

function analyzePostTypes(posts: any[]) {
  const types = new Map<string, number>();
  posts.forEach(post => {
    const type = post.media_type || 'unknown';
    types.set(type, (types.get(type) || 0) + 1);
  });
  
  return Array.from(types.entries()).map(([type, count]) => ({ type, count }));
}

function analyzeCaptionPatterns(posts: any[]) {
  const lengths = posts.map(p => (p.caption || '').length);
  return {
    avgLength: lengths.reduce((a, b) => a + b, 0) / lengths.length,
    minLength: Math.min(...lengths),
    maxLength: Math.max(...lengths),
  };
}

function extractHashtags(posts: any[]) {
  const tags = new Map<string, number>();
  posts.forEach(post => {
    const matches = (post.caption || '').match(/#[\u0590-\u05FFa-zA-Z0-9_]+/g) || [];
    matches.forEach((tag: string) => {
      tags.set(tag, (tags.get(tag) || 0) + 1);
    });
  });
  
  return Array.from(tags.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
}

function extractEmojis(posts: any[]) {
  const emojis = new Map<string, number>();
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  
  posts.forEach(post => {
    const matches = (post.caption || '').match(emojiRegex) || [];
    matches.forEach((emoji: string) => {
      emojis.set(emoji, (emojis.get(emoji) || 0) + 1);
    });
  });
  
  return Array.from(emojis.entries())
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

function extractMentions(posts: any[]) {
  const mentions = new Map<string, number>();
  posts.forEach(post => {
    const matches = (post.caption || '').match(/@[a-zA-Z0-9_.]+/g) || [];
    matches.forEach((mention: string) => {
      mentions.set(mention, (mentions.get(mention) || 0) + 1);
    });
  });
  
  return Array.from(mentions.entries())
    .map(([mention, count]) => ({ mention, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

// Run
main().catch(console.error);
