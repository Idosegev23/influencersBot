/**
 * Rebuild personas for ALL active accounts using GPT-5.2 Pro
 * Run with: npx tsx --tsconfig tsconfig.json scripts/rebuild-all-personas.ts
 *
 * Requires .env.local with OPENAI_API_KEY + SUPABASE vars
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// The full Hebrew persona builder prompt (same as in gemini-persona-builder.ts)
const PERSONA_BUILDER_PROMPT = `
אתה מערכת לבניית פרסונת ידע וקול אנושי על בסיס תוכן מאינסטגרם.

המטרה:
לבנות פרסונה עברית בלבד, שתוכל לענות לשאלות משתמשים בעתיד אך ורק על סמך המידע שסופק, ללא המצאות, ללא ידע חיצוני וללא הרחבות.

קלט:
תקבל JSON מאוחד של תוכן מחשבון אינסטגרם אחד, כולל:
- פרופיל
- פוסטים ורילסים
- תמלולי וידאו (transcriptions)
- תגובות ותגובות בעל החשבון
- אתרים (websites)
- הקשר האשטגים
- הקשר חיפוש

חוקים מחייבים:
1. מותר להשתמש אך ורק במידע שבקלט
2. אם אין מידע מספק, יש לציין זאת במפורש
3. אין להמציא דעות, עובדות או ידע כללי
4. יש להבחין בין עובדה לפרשנות מבוססת דפוס
5. כל התשובות העתידיות חייבות לשקף את הקול, הסגנון והגבולות של היוצר

משימות:

א. בניית פרסונה
ב. קול וסגנון
ג. מפת ידע
ד. גבולות
ה. זמן והתפתחות
ו. מדיניות תשובה
ז. זיהוי מוצרים, קופונים ומותגים

פלט:
החזר JSON מובנה הכולל: identity, voice, knowledgeMap, boundaries, evolution, responsePolicy, products, coupons, brands.

חשוב מאוד:
- אל תמציא מידע שלא קיים בנתונים
- אם אין מספיק מידע על נושא מסוים, ציין זאת במפורש
- שמור על עקביות בין הסעיפים השונים
- התשובה צריכה להיות בעברית בלבד
`;

async function buildPersonaForAccount(accountId: string, accountName: string) {
  console.log(`\n  Loading data for ${accountName}...`);

  // Load existing preprocessing_data from chatbot_persona if available
  const { data: persona } = await supabase
    .from('chatbot_persona')
    .select('preprocessing_data, gemini_raw_output')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!persona) {
    console.log(`  No persona record found, skipping`);
    return false;
  }

  // Use existing preprocessing data
  let preprocessedData = persona.preprocessing_data;

  if (!preprocessedData || Object.keys(preprocessedData).length === 0) {
    console.log(`  No preprocessing data found, building from scratch...`);

    // Load raw data from DB
    const [postsRes, transRes, commentsRes] = await Promise.all([
      supabase.from('instagram_posts').select('caption, hashtags, like_count, comments_count, taken_at, media_type')
        .eq('account_id', accountId).order('taken_at', { ascending: false }).limit(100),
      supabase.from('video_transcriptions').select('id, transcription, media_id')
        .eq('account_id', accountId).limit(500),
      supabase.from('instagram_comments').select('text, is_owner_reply, created_at')
        .eq('account_id', accountId).limit(200),
    ]);

    const posts = postsRes.data || [];
    const transcriptions = transRes.data || [];
    const comments = commentsRes.data || [];

    if (posts.length === 0 && transcriptions.length === 0) {
      console.log(`  No content found, skipping`);
      return false;
    }

    preprocessedData = {
      stats: {
        totalPosts: posts.length,
        totalComments: comments.length,
        totalLikes: posts.reduce((s, p) => s + (p.like_count || 0), 0),
        timeRange: { from: posts[posts.length - 1]?.taken_at, to: posts[0]?.taken_at },
      },
      topTerms: [],
      topics: [],
      timeline: [],
      ownerReplies: {
        ratio: comments.filter(c => c.is_owner_reply).length / Math.max(comments.length, 1),
        commonPhrases: [],
        replyPatterns: [],
      },
      faqCandidates: [],
      boundaries: { answeredTopics: [], uncertainTopics: [], avoidedTopics: [] },
      websites: [],
      transcriptions: transcriptions.map(t => ({ id: t.id, text: t.transcription, media_id: t.media_id })),
      posts: posts.map(p => ({ caption: p.caption || '', hashtags: p.hashtags || [], likes: p.like_count })),
    };
  }

  // Get profile data
  const { data: profile } = await supabase
    .from('instagram_profile_history')
    .select('username, full_name, bio, followers_count, category')
    .eq('account_id', accountId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Truncate data to fit context window (~500KB max for GPT-5.2 Pro)
  const MAX_INPUT_CHARS = 400_000;

  // Truncate transcriptions (biggest source of data)
  if (preprocessedData.transcriptions?.length > 0) {
    const maxTranscriptions = 150;
    preprocessedData.transcriptions = preprocessedData.transcriptions.slice(0, maxTranscriptions);
    // Truncate each transcription text
    preprocessedData.transcriptions = preprocessedData.transcriptions.map((t: any) => ({
      ...t,
      text: typeof t.text === 'string' ? t.text.substring(0, 2000) : t.text,
    }));
  }

  // Truncate posts
  if (preprocessedData.posts?.length > 50) {
    preprocessedData.posts = preprocessedData.posts.slice(0, 50);
  }

  // Truncate topTerms
  if (preprocessedData.topTerms?.length > 80) {
    preprocessedData.topTerms = preprocessedData.topTerms.slice(0, 80);
  }

  const inputData = {
    profile: profile ? {
      username: profile.username,
      fullName: profile.full_name,
      bio: profile.bio,
      followersCount: profile.followers_count,
      category: profile.category,
    } : null,
    ...preprocessedData,
  };

  let inputJson = JSON.stringify(inputData, null, 2);

  // If still too large, do a final truncation
  if (inputJson.length > MAX_INPUT_CHARS) {
    console.log(`  Data too large (${Math.round(inputJson.length / 1024)}KB), further truncating...`);
    // Remove timeline, ownerReplies details, websites
    delete inputData.timeline;
    delete inputData.websites;
    if (inputData.ownerReplies) {
      inputData.ownerReplies = { ratio: inputData.ownerReplies.ratio, commonPhrases: [], replyPatterns: [] };
    }
    // Further truncate transcriptions
    if (inputData.transcriptions?.length > 80) {
      inputData.transcriptions = inputData.transcriptions.slice(0, 80);
    }
    inputJson = JSON.stringify(inputData, null, 2);
  }

  // Last resort: hard truncate
  if (inputJson.length > MAX_INPUT_CHARS) {
    inputJson = inputJson.substring(0, MAX_INPUT_CHARS);
  }

  const fullPrompt = `${PERSONA_BUILDER_PROMPT}

נתונים מעובדים:
${inputJson}

אנא החזר JSON מובנה בלבד (ללא טקסט נוסף).`;

  const inputSize = fullPrompt.length;
  console.log(`  Input size: ${Math.round(inputSize / 1024)}KB`);
  console.log(`  Building persona with GPT-5.2 Pro...`);

  try {
    const response = await Promise.race([
      openai.responses.create({
        model: 'gpt-5.2-pro',
        input: fullPrompt,
        reasoning: { effort: 'high' },
        text: { verbosity: 'high' },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout 600s')), 600000)),
    ]);

    // Extract text from response
    let text: string | null = null;
    const rawOutput = (response as any).output;

    if (typeof rawOutput === 'string') {
      text = rawOutput;
    } else if (Array.isArray(rawOutput)) {
      const messageObj = rawOutput.find((item: any) => item.type === 'message');
      if (messageObj?.content && Array.isArray(messageObj.content)) {
        const textContent = messageObj.content.find((c: any) => c.type === 'output_text' || c.text);
        text = textContent?.text;
      }
    }

    if (!text) {
      console.log(`  Failed to extract text from GPT response`);
      return false;
    }

    // Parse JSON
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
    else if (jsonText.startsWith('```')) jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');

    const parsed = JSON.parse(jsonText);

    if (!parsed.identity || !parsed.voice) {
      console.log(`  Invalid persona structure`);
      return false;
    }

    // Save to DB
    const { error: saveError } = await supabase
      .from('chatbot_persona')
      .update({
        voice_rules: parsed.voice,
        knowledge_map: parsed.knowledgeMap,
        boundaries: parsed.boundaries,
        evolution: parsed.evolution,
        response_policy: parsed.responsePolicy,
        gemini_raw_output: { raw: text, parsed },
        preprocessing_data: preprocessedData,
        metadata: {
          products: parsed.products || [],
          coupons: parsed.coupons || [],
          brands: parsed.brands || [],
          extractedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', accountId);

    if (saveError) {
      console.log(`  Save error: ${saveError.message}`);
      return false;
    }

    console.log(`  Persona built! Topics: ${parsed.knowledgeMap?.coreTopics?.length || 0}, Products: ${parsed.products?.length || 0}, Brands: ${parsed.brands?.length || 0}`);
    return true;

  } catch (err: any) {
    console.log(`  Error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('Rebuilding ALL personas with GPT-5.2 Pro\n');

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, config, status')
    .eq('status', 'active')
    .order('created_at');

  if (error || !accounts) {
    console.error('Failed to fetch accounts:', error?.message);
    process.exit(1);
  }

  // Filter to accounts that have personas (skip website-only accounts)
  const { data: personaAccounts } = await supabase
    .from('chatbot_persona')
    .select('account_id');

  const personaAccountIds = new Set((personaAccounts || []).map(p => p.account_id));
  const accountsWithPersona = accounts.filter(a => personaAccountIds.has(a.id));

  console.log(`Found ${accountsWithPersona.length} accounts with personas (out of ${accounts.length} active)\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < accountsWithPersona.length; i++) {
    const acc = accountsWithPersona[i];
    const cfg = (acc.config || {}) as Record<string, any>;
    const name = cfg.display_name || cfg.username || acc.id;
    console.log(`[${i + 1}/${accountsWithPersona.length}] ${name}`);

    const ok = await buildPersonaForAccount(acc.id, name);
    if (ok) success++;
    else failed++;
  }

  console.log('\n' + '='.repeat(40));
  console.log(`Complete: ${success} succeeded, ${failed} failed out of ${accountsWithPersona.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
