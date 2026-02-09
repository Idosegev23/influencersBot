/**
 * Preprocessing Pipeline - עיבוד מידע לפני Gemini
 * מבצע ניתוחים וחישובים על המידע הגולמי מ-Instagram
 */

import { createClient } from '@/lib/supabase/server';

// ============================================
// Type Definitions
// ============================================

export interface PreprocessedData {
  // Statistics
  stats: {
    totalPosts: number;
    timeRange: { start: string; end: string };
    avgEngagement: number;
    topPerformingType: 'post' | 'reel' | 'carousel' | 'video';
    avgLikes: number;
    avgComments: number;
    avgViews: number;
  };

  // Content Analysis
  topTerms: string[]; // 50-200 מילים חוזרות
  topics: Topic[]; // 8-12 נושאים מקובצים

  // Timeline
  timeline: TimelineBucket[]; // פילוח לפי חודשים

  // Owner Behavior
  ownerReplies: {
    ratio: number; // % תגובות
    avgResponseTime: string;
    commonPhrases: string[];
    replyPatterns: string[];
  };

  // FAQ Candidates
  faqCandidates: Array<{
    question: string;
    askedCount: number;
    ownerAnswer?: string;
    confidence: number;
  }>;

  // Boundaries
  boundaries: {
    mentionedTopics: string[];
    unmentionedTopics: string[];
    unansweredQuestions: string[];
  };

  // ⚡ Website data (bio links, linkis, etc.)
  websites: Array<{
    url: string;
    title?: string;
    content: string;
  }>;

  // ⚡ Transcriptions (loaded from DB)
  transcriptions: Array<{
    id: string;
    media_id: string;
    text: string;
    created_at: string;
  }>;

  // ⚡ Raw data for Gemini
  posts?: any[];
  comments?: any[];
}

export interface Topic {
  name: string;
  frequency: number; // 0-1
  posts: number;
  keywords: string[];
  avgEngagement: number;
}

export interface TimelineBucket {
  month: string; // YYYY-MM
  posts: number;
  avgEngagement: number;
  topTopics: string[];
  toneChange?: string;
}

// ============================================
// Main Preprocessing Function
// ============================================

export async function preprocessInstagramData(accountId: string): Promise<PreprocessedData> {
  console.log(`[Preprocessing] Starting for account: ${accountId}`);

  const supabase = await createClient();

  // Load data from database
  const [posts, comments, profile, websites, transcriptions] = await Promise.all([
    loadPosts(supabase, accountId),
    loadComments(supabase, accountId),
    loadProfile(supabase, accountId),
    loadWebsites(supabase, accountId), // ⚡ Load website data (linkis, etc.)
    loadTranscriptions(supabase, accountId), // ⚡ Load transcriptions
  ]);

  console.log(`[Preprocessing] Loaded ${posts.length} posts, ${comments.length} comments, ${websites.length} websites, ${transcriptions.length} transcriptions`);

  // Calculate stats
  const stats = calculateStats(posts);

  // Extract top terms
  const topTerms = await calculateTopTerms(posts, 200);

  // Cluster topics
  const topics = await clusterTopics(posts, topTerms);

  // Build timeline
  const timeline = buildTimeline(posts, topics);

  // Analyze owner replies
  const ownerReplies = analyzeOwnerReplies(comments, profile?.username || '');

  // Extract FAQ candidates
  const faqCandidates = await extractFAQ(comments, ownerReplies);

  // Identify boundaries
  const boundaries = identifyBoundaries(posts, comments, topics);

  // Format websites for Gemini
  const formattedWebsites = websites.map(w => ({
    url: w.url,
    title: w.page_title,
    content: w.page_content,
  }));

  console.log(`[Preprocessing] Complete: ${topTerms.length} terms, ${topics.length} topics, ${faqCandidates.length} FAQ candidates, ${formattedWebsites.length} websites`);

  return {
    stats,
    topTerms,
    topics,
    timeline,
    ownerReplies,
    faqCandidates,
    boundaries,
    websites: formattedWebsites, // ⚡ Include websites (linkis, etc.)!
    transcriptions, // ⚡ Include transcriptions from DB
    posts, // ⚡ Include raw posts for Gemini!
    comments, // ⚡ Include raw comments for context
  };
}

// ============================================
// Data Loading Functions
// ============================================

async function loadPosts(supabase: any, accountId: string) {
  const { data, error } = await supabase
    .from('instagram_posts')
    .select('*')
    .eq('account_id', accountId)
    .order('posted_at', { ascending: false });

  if (error) {
    console.error('[Preprocessing] Error loading posts:', error);
    return [];
  }

  return data || [];
}

async function loadComments(supabase: any, accountId: string) {
  const { data, error } = await supabase
    .from('instagram_comments')
    .select('*')
    .eq('account_id', accountId)
    .order('commented_at', { ascending: false });

  if (error) {
    console.error('[Preprocessing] Error loading comments:', error);
    return [];
  }

  return data || [];
}

async function loadProfile(supabase: any, accountId: string) {
  const { data, error } = await supabase
    .from('instagram_profile_history')
    .select('*')
    .eq('account_id', accountId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('[Preprocessing] Error loading profile:', error);
    return null;
  }

  return data;
}

async function loadWebsites(supabase: any, accountId: string) {
  const { data, error } = await supabase
    .from('instagram_bio_websites')
    .select('*')
    .eq('account_id', accountId)
    .order('scraped_at', { ascending: false });

  if (error) {
    console.error('[Preprocessing] Error loading websites:', error);
    return [];
  }

  return data || [];
}

async function loadTranscriptions(supabase: any, accountId: string) {
  const { data, error } = await supabase
    .from('instagram_transcriptions')
    .select('id, source_type, source_id, transcription_text, language, created_at')
    .eq('account_id', accountId)
    .eq('processing_status', 'completed')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Preprocessing] Error loading transcriptions:', error);
    return [];
  }

  return (data || []).map(t => ({
    id: t.id,
    media_id: t.source_id, // Using source_id as media_id
    text: t.transcription_text || '',
    created_at: t.created_at,
  }));
}

// ============================================
// Statistics Calculation
// ============================================

function calculateStats(posts: any[]): PreprocessedData['stats'] {
  if (posts.length === 0) {
    return {
      totalPosts: 0,
      timeRange: { start: '', end: '' },
      avgEngagement: 0,
      topPerformingType: 'post',
      avgLikes: 0,
      avgComments: 0,
      avgViews: 0,
    };
  }

  const sortedByDate = [...posts].sort((a, b) => 
    new Date(a.posted_at).getTime() - new Date(b.posted_at).getTime()
  );

  const totalLikes = posts.reduce((sum, p) => sum + (p.likes_count || 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
  const totalViews = posts.reduce((sum, p) => sum + (p.views_count || 0), 0);
  const totalEngagement = posts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0);

  // Find top performing type
  const typeEngagement = new Map<string, number[]>();
  posts.forEach(post => {
    const type = post.type || 'post';
    if (!typeEngagement.has(type)) {
      typeEngagement.set(type, []);
    }
    typeEngagement.get(type)!.push(post.engagement_rate || 0);
  });

  let topType: any = 'post';
  let maxAvgEngagement = 0;
  typeEngagement.forEach((engagements, type) => {
    const avg = engagements.reduce((a, b) => a + b, 0) / engagements.length;
    if (avg > maxAvgEngagement) {
      maxAvgEngagement = avg;
      topType = type;
    }
  });

  return {
    totalPosts: posts.length,
    timeRange: {
      start: sortedByDate[0].posted_at,
      end: sortedByDate[sortedByDate.length - 1].posted_at,
    },
    avgEngagement: totalEngagement / posts.length,
    topPerformingType: topType,
    avgLikes: totalLikes / posts.length,
    avgComments: totalComments / posts.length,
    avgViews: totalViews / posts.filter(p => p.views_count).length || 0,
  };
}

// ============================================
// Top Terms Extraction
// ============================================

async function calculateTopTerms(posts: any[], limit: number = 200): Promise<string[]> {
  const termFrequency = new Map<string, number>();

  // Hebrew and English stop words
  const stopWords = new Set([
    'של', 'את', 'על', 'עם', 'אל', 'כל', 'לא', 'או', 'זה', 'היא', 'הוא', 'אני', 'אנחנו',
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with', 'to', 'for',
    'של', 'מה', 'איך', 'למה', 'כמה', 'איפה', 'מתי', 'מי',
  ]);

  posts.forEach(post => {
    const text = (post.caption || '').toLowerCase();
    
    // Extract words (Hebrew and English)
    const words = text.match(/[\u0590-\u05ff]{2,}|[a-z]{3,}/gi) || [];
    
    words.forEach(word => {
      const cleaned = word.trim();
      if (cleaned.length > 2 && !stopWords.has(cleaned)) {
        termFrequency.set(cleaned, (termFrequency.get(cleaned) || 0) + 1);
      }
    });
  });

  // Sort by frequency and take top N
  return Array.from(termFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

// ============================================
// Topic Clustering
// ============================================

async function clusterTopics(posts: any[], topTerms: string[]): Promise<Topic[]> {
  // Simple keyword-based clustering
  // In production, this could use ML clustering (k-means, etc.)
  
  const topicCandidates = new Map<string, Set<number>>();

  // For each top term, find which posts contain it
  topTerms.forEach(term => {
    posts.forEach((post, idx) => {
      const text = (post.caption || '').toLowerCase();
      if (text.includes(term)) {
        if (!topicCandidates.has(term)) {
          topicCandidates.set(term, new Set());
        }
        topicCandidates.get(term)!.add(idx);
      }
    });
  });

  // Group similar terms into topics
  const topics: Topic[] = [];
  const usedTerms = new Set<string>();

  topTerms.forEach(mainTerm => {
    if (usedTerms.has(mainTerm)) return;

    const mainPosts = topicCandidates.get(mainTerm) || new Set();
    if (mainPosts.size < 3) return; // Skip if less than 3 posts

    // Find related terms (co-occur in many posts)
    const relatedTerms = [mainTerm];
    topTerms.forEach(otherTerm => {
      if (otherTerm === mainTerm || usedTerms.has(otherTerm)) return;
      
      const otherPosts = topicCandidates.get(otherTerm) || new Set();
      const overlap = Array.from(mainPosts).filter(p => otherPosts.has(p)).length;
      
      // If 50%+ overlap, consider them related
      if (overlap / mainPosts.size > 0.5) {
        relatedTerms.push(otherTerm);
        usedTerms.add(otherTerm);
      }
    });

    usedTerms.add(mainTerm);

    // Calculate engagement for this topic
    const topicPosts = Array.from(mainPosts).map(idx => posts[idx]);
    const avgEngagement = topicPosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / topicPosts.length;

    topics.push({
      name: capitalizeFirst(mainTerm),
      frequency: mainPosts.size / posts.length,
      posts: mainPosts.size,
      keywords: relatedTerms.slice(0, 10),
      avgEngagement,
    });
  });

  // Sort by frequency and take top 12
  return topics
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 12);
}

// ============================================
// Timeline Building
// ============================================

function buildTimeline(posts: any[], topics: Topic[]): TimelineBucket[] {
  const buckets = new Map<string, any[]>();

  posts.forEach(post => {
    const date = new Date(post.posted_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!buckets.has(monthKey)) {
      buckets.set(monthKey, []);
    }
    buckets.get(monthKey)!.push(post);
  });

  // Convert to timeline buckets
  const timeline: TimelineBucket[] = [];
  
  Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([month, monthPosts]) => {
      const avgEngagement = monthPosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / monthPosts.length;
      
      // Find top topics for this month
      const monthTopics = topics
        .map(topic => {
          const matchCount = monthPosts.filter(post => {
            const text = (post.caption || '').toLowerCase();
            return topic.keywords.some(kw => text.includes(kw.toLowerCase()));
          }).length;
          return { topic: topic.name, count: matchCount };
        })
        .filter(t => t.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(t => t.topic);

      timeline.push({
        month,
        posts: monthPosts.length,
        avgEngagement,
        topTopics: monthTopics,
      });
    });

  return timeline;
}

// ============================================
// Owner Replies Analysis
// ============================================

function analyzeOwnerReplies(comments: any[], ownerUsername: string): PreprocessedData['ownerReplies'] {
  const ownerComments = comments.filter(c => c.is_owner_reply === true || c.author_username === ownerUsername);
  
  if (ownerComments.length === 0) {
    return {
      ratio: 0,
      avgResponseTime: 'N/A',
      commonPhrases: [],
      replyPatterns: [],
    };
  }

  // Calculate reply ratio
  const totalComments = comments.length;
  const ratio = (ownerComments.length / totalComments) * 100;

  // Extract common phrases
  const phrases = new Map<string, number>();
  
  ownerComments.forEach(comment => {
    const text = comment.text || '';
    
    // Extract phrases (2-4 words)
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = words.slice(i, i + 3).join(' ').toLowerCase();
      if (phrase.length > 5) {
        phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
      }
    }
  });

  const commonPhrases = Array.from(phrases.entries())
    .filter(([_, count]) => count >= 3) // Appears at least 3 times
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([phrase]) => phrase);

  // Identify reply patterns
  const replyPatterns: string[] = [];
  
  const startsWithQuestion = ownerComments.filter(c => /^(איזה|מה|איך|למה|האם|את|מי)/.test(c.text || '')).length;
  if (startsWithQuestion / ownerComments.length > 0.3) {
    replyPatterns.push('שואל שאלות נגדיות');
  }

  const hasEmojis = ownerComments.filter(c => /[\u{1F600}-\u{1F64F}]/u.test(c.text || '')).length;
  if (hasEmojis / ownerComments.length > 0.5) {
    replyPatterns.push('משתמש באמוג\'י');
  }

  const shortReplies = ownerComments.filter(c => (c.text || '').split(/\s+/).length < 10).length;
  if (shortReplies / ownerComments.length > 0.6) {
    replyPatterns.push('תשובות קצרות');
  }

  return {
    ratio: Math.round(ratio * 100) / 100,
    avgResponseTime: 'N/A', // Would need timestamp analysis
    commonPhrases,
    replyPatterns,
  };
}

// ============================================
// FAQ Extraction
// ============================================

async function extractFAQ(comments: any[], ownerReplies: any): Promise<PreprocessedData['faqCandidates']> {
  // Find questions in comments
  const questionPatterns = [
    /^(איזה|מה|איך|למה|האם|את|מי|כמה|מתי|איפה)\s/,
    /\?$/,
  ];

  const questions = new Map<string, { count: number; answers: string[] }>();

  comments.forEach(comment => {
    const text = comment.text || '';
    
    // Check if it's a question
    const isQuestion = questionPatterns.some(pattern => pattern.test(text));
    
    if (isQuestion && text.length > 10 && text.length < 200) {
      // Normalize the question
      const normalized = text.trim().toLowerCase();
      
      if (!questions.has(normalized)) {
        questions.set(normalized, { count: 0, answers: [] });
      }
      
      const entry = questions.get(normalized)!;
      entry.count++;
      
      // Find if owner replied to this
      // This is simplified - in production would need better parent-child matching
      if (comment.is_owner_reply) {
        entry.answers.push(text);
      }
    }
  });

  // Convert to FAQ candidates
  return Array.from(questions.entries())
    .filter(([_, data]) => data.count >= 2) // Asked at least twice
    .map(([question, data]) => ({
      question: capitalizeFirst(question),
      askedCount: data.count,
      ownerAnswer: data.answers[0],
      confidence: data.answers.length > 0 ? 0.8 : 0.5,
    }))
    .sort((a, b) => b.askedCount - a.askedCount)
    .slice(0, 30); // Top 30 FAQs
}

// ============================================
// Boundaries Identification
// ============================================

function identifyBoundaries(posts: any[], comments: any[], topics: Topic[]): PreprocessedData['boundaries'] {
  // Mentioned topics
  const mentionedTopics = topics.map(t => t.name);

  // Find unanswered questions
  const allQuestions = comments.filter(c => {
    const text = c.text || '';
    return /\?$/.test(text) || /^(איזה|מה|איך|למה|האם)/.test(text);
  });

  const ownerRepliedTo = new Set(
    comments
      .filter(c => c.is_owner_reply && c.parent_comment_id)
      .map(c => c.parent_comment_id)
  );

  const unansweredQuestions = allQuestions
    .filter(q => !ownerRepliedTo.has(q.id))
    .map(q => q.text)
    .slice(0, 20);

  // Unmentioned topics - these would ideally come from domain knowledge
  // For now, we'll just note it as empty
  const unmentionedTopics: string[] = [];

  return {
    mentionedTopics,
    unmentionedTopics,
    unansweredQuestions,
  };
}

// ============================================
// Helper Functions
// ============================================

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================
// Export for Step 6 (Preprocessing step in orchestrator)
// ============================================

export async function runPreprocessing(accountId: string): Promise<PreprocessedData> {
  return await preprocessInstagramData(accountId);
}
