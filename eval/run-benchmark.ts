#!/usr/bin/env npx tsx
/**
 * Production Model Benchmark — Shadow Evaluation
 *
 * Runs 25 multi-turn conversations through two models side-by-side:
 *   A) OpenAI gpt-5.2-2025-12-11  (current production)
 *   B) Gemini 3 Flash preview      (candidate)
 *
 * WHY SHADOW MODE:
 * Shadow / parallel evaluation is safer than switching production traffic.
 * It allows objective measurement of latency, quality and Hebrew fluency
 * without risking user-facing regressions.  Neither model's output reaches
 * real users during the benchmark.
 *
 * HOW IT WORKS:
 * 1. Loads real account data from Supabase (persona, brands, coupons, posts)
 * 2. Builds the EXACT same system prompt + knowledge context as production
 *    (copied verbatim from baseArchetype.ts — no modifications)
 * 3. Generates 25 realistic Hebrew conversation scenarios from the real data
 * 4. Runs each scenario (5 turns) through both models via streaming
 * 5. Measures speed (TTFT, total latency) + quality (continuity, hallucination,
 *    persona fidelity) and outputs eval/summary.json
 *
 * DOES NOT TOUCH: RAG embeddings, persona building, or prompt construction.
 * Only the FINAL text-generation model is swapped.
 *
 * Usage:
 *   npx tsx eval/run-benchmark.ts
 *
 * Environment (reads from .env automatically):
 *   ACCOUNT_ID              — required (default: miranbuzaglo's account)
 *   OPENAI_API_KEY          — required
 *   GEMINI_API_KEY          — required (fallback: GOOGLE_AI_API_KEY)
 *   NEXT_PUBLIC_SUPABASE_URL — required
 *   SUPABASE_SECRET_KEY     — required (or SUPABASE_SERVICE_ROLE_KEY)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// ═══════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════

const ACCOUNT_ID = process.env.ACCOUNT_ID || '4e2a0ce8-8753-4876-973c-00c9e1426e51';
const OPENAI_MODEL = 'gpt-5.2-2025-12-11';
const GEMINI_MODEL = 'gemini-3-flash-preview';
const MAX_TOKENS = 500;
const TURNS_PER_SCENARIO = 5;

const RESULTS_PATH = join(__dirname, 'results.jsonl');
const SUMMARY_PATH = join(__dirname, 'summary.json');
const TRANSCRIPTS_DIR = join(__dirname, 'transcripts');

// ═══════════════════════════════════════════════════════════════════
// Clients
// ═══════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!geminiKey) { console.error('GEMINI_API_KEY required'); process.exit(1); }
const gemini = new GoogleGenAI({ apiKey: geminiKey });

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface AccountData {
  username: string;
  displayName: string;
  personaName: string;
  tone: string;
  topics: string[];
  emojiUsage: string;
  brands: Array<{ name: string; category: string; link?: string }>;
  coupons: Array<{ brand: string; code: string; discount: string; link?: string }>;
  posts: Array<{ caption: string; type: string; hashtags: string[] }>;
  transcriptions: Array<{ text: string }>;
  highlights: Array<{ title: string; content_text?: string }>;
  personaKeywords: string[];
}

interface Scenario {
  id: string;
  category: string;
  turns: string[];
}

interface TurnResult {
  scenarioId: string;
  turnIndex: number;
  provider: string;
  model: string;
  userMessage: string;
  assistantResponse: string;
  ttftMs: number;
  totalMs: number;
  inputChars: number;
  outputChars: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Step 1: Load account data from Supabase
// ═══════════════════════════════════════════════════════════════════

async function loadAccountData(): Promise<AccountData> {
  console.log(`  Loading account ${ACCOUNT_ID}...`);

  const [acctRes, personaRes, partnershipsRes, couponsRes, postsRes, transRes, highlightsRes] = await Promise.all([
    supabase.from('accounts').select('config').eq('id', ACCOUNT_ID).single(),
    supabase.from('chatbot_persona').select('name, tone, topics, emoji_usage, gemini_raw_output').eq('account_id', ACCOUNT_ID).single(),
    supabase.from('partnerships').select('brand_name, category, link').eq('account_id', ACCOUNT_ID).eq('is_active', true),
    supabase.rpc('get_coupons_with_partnerships', { p_account_id: ACCOUNT_ID }),
    supabase.from('instagram_posts').select('caption, type, hashtags').eq('account_id', ACCOUNT_ID).order('posted_at', { ascending: false }).limit(30),
    supabase.from('instagram_transcriptions').select('transcription_text').eq('account_id', ACCOUNT_ID).eq('processing_status', 'completed').order('created_at', { ascending: false }).limit(20),
    supabase.from('instagram_highlights').select('title').eq('account_id', ACCOUNT_ID).limit(20),
  ]);

  if (acctRes.error) throw new Error(`Account load failed: ${acctRes.error.message}`);

  const config = acctRes.data.config || {};
  const persona = personaRes.data || {};
  const partnerships = (partnershipsRes.data || []).map((p: any) => ({
    name: p.brand_name, category: p.category || '', link: p.link,
  }));

  const coupons = (couponsRes.data || []).map((c: any) => {
    let discount = c.description || 'הנחה';
    if (c.discount_type === 'percentage' && c.discount_value) discount = `${c.discount_value}% הנחה`;
    else if (c.discount_type === 'fixed' && c.discount_value) discount = `₪${c.discount_value} הנחה`;
    return { brand: c.brand_name || 'מותג', code: c.code, discount, link: c.link };
  });

  const posts = (postsRes.data || []).filter((p: any) => p.caption).map((p: any) => ({
    caption: p.caption, type: p.type || 'post', hashtags: p.hashtags || [],
  }));

  const transcriptions = (transRes.data || []).filter((t: any) => t.transcription_text).map((t: any) => ({
    text: t.transcription_text,
  }));

  const highlights = (highlightsRes.data || []).map((h: any) => ({ title: h.title }));

  // Extract persona keywords
  const personaKeywords: string[] = [];
  if (persona.topics) personaKeywords.push(...persona.topics);
  if (persona.tone) personaKeywords.push(persona.tone);
  const geminiOutput = persona.gemini_raw_output || {};
  if (geminiOutput.identity?.values) personaKeywords.push(...geminiOutput.identity.values);
  if (geminiOutput.voice?.recurringPhrases) personaKeywords.push(...geminiOutput.voice.recurringPhrases);

  const data: AccountData = {
    username: config.username || 'unknown',
    displayName: config.display_name || config.username || 'המשפיענית',
    personaName: persona.name || config.display_name || 'המשפיענית',
    tone: persona.tone || 'friendly',
    topics: persona.topics || [],
    emojiUsage: persona.emoji_usage || 'moderate',
    brands: partnerships,
    coupons,
    posts,
    transcriptions,
    highlights,
    personaKeywords,
  };

  console.log(`  Username: ${data.username}`);
  console.log(`  Brands: ${data.brands.length}, Coupons: ${data.coupons.length}, Posts: ${data.posts.length}`);
  console.log(`  Transcriptions: ${data.transcriptions.length}, Highlights: ${data.highlights.length}`);

  return data;
}

// ═══════════════════════════════════════════════════════════════════
// Step 2: Build knowledge context (exact copy from baseArchetype.ts)
// ═══════════════════════════════════════════════════════════════════

function buildKnowledgeContext(kb: {
  posts?: any[]; highlights?: any[]; coupons?: any[];
  partnerships?: any[]; transcriptions?: any[]; websites?: any[];
}): string {
  if (!kb) return '📚 **בסיס ידע:** אין מידע זמין כרגע.';

  let context = '📚 **בסיס הידע שלי (השתמש בתוכן המלא, לא להפנות!):**\n';

  if (kb.posts && kb.posts.length > 0) {
    context += `\n📸 **פוסטים (${kb.posts.length}):**\n`;
    kb.posts.slice(0, 5).forEach((p: any, i: number) => {
      const caption = p.caption || 'ללא כיתוב';
      const truncated = caption.length > 800 ? caption.substring(0, 800) + '...' : caption;
      context += `${i + 1}. ${truncated}\n\n`;
    });
  }

  if (kb.highlights && kb.highlights.length > 0) {
    context += `\n✨ **הילייטס (${kb.highlights.length}):**\n`;
    kb.highlights.slice(0, 5).forEach((h: any, i: number) => {
      context += `${i + 1}. "${h.title}"`;
      if (h.content_text && h.content_text.trim().length > 0) {
        const truncated = h.content_text.length > 250
          ? h.content_text.substring(0, 250) + '...'
          : h.content_text;
        context += ` — ${truncated}`;
      }
      context += '\n';
    });
  }

  if (kb.coupons && kb.coupons.length > 0) {
    context += `\n💰 **קופונים זמינים (${kb.coupons.length}) - CRITICAL: שמות המותגים יכולים להיות באנגלית או בעברית:**\n`;
    kb.coupons.forEach((c: any, i: number) => {
      context += `${i + 1}. מותג: ${c.brand || c.code}`;
      if (c.discount && !c.discount.includes('לחץ על הקישור')) {
        context += ` | הנחה: ${c.discount}`;
      }
      if (c.code) context += ` | קוד: ${c.code}`;
      if (c.link) context += ` | LINK: ${c.link}`;
      context += '\n';
    });
    context += `⚠️ חפש מותגים גם בעברית וגם באנגלית (ספרינג=Spring, ארגניה=Argania, ליבס=Leaves, רנואר=Renuar). אם יש LINK — הצג כ-[לחצי כאן](LINK).\n`;
  }

  if (kb.partnerships && kb.partnerships.length > 0) {
    context += `\n🤝 **שיתופי פעולה (${kb.partnerships.length}):**\n`;
    kb.partnerships.slice(0, 5).forEach((p: any, i: number) => {
      context += `${i + 1}. ${p.brand_name || p.name}`;
      if (p.brief) context += ` - ${p.brief.substring(0, 80)}`;
      context += '\n';
    });
  }

  if (kb.transcriptions && kb.transcriptions.length > 0) {
    context += `\n🎥 **תמלולים (${kb.transcriptions.length}):**\n`;
    kb.transcriptions.slice(0, 8).forEach((t: any, i: number) => {
      const text = t.text || t.transcription_text || '';
      const truncated = text.length > 800 ? text.substring(0, 800) + '...' : text;
      context += `${i + 1}. ${truncated}\n\n`;
    });
  }

  return context;
}

// ═══════════════════════════════════════════════════════════════════
// Step 3: Build system prompt (exact copy from baseArchetype.ts)
// ═══════════════════════════════════════════════════════════════════

function buildSystemPrompt(influencerName: string): string {
  return `אתה ${influencerName}, משפיענית שמנהלת שיחה טבעית עם הקהל שלה — כמו חברה, לא כמו מכונת חיפוש.
⚠️ **אל תפתח/י כל הודעה עם כינויי חיבה** ("מאמי", "אהובה", "יקירה"). תפתח/י ישר לעניין. כינוי חיבה מותר לפעמים, לא בכל הודעה.

📜 הקשר שיחה: **תמיד** תבין/י הפניות להיסטוריה ("המתכון", "מה שאמרת", "זה"). השיחה זורמת — אל תתנהג/י כאילו כל הודעה מתחילה מאפס.

💬 סגנון שיחה — פרסונלי ומכוון:
• **שאלות רחבות** ("יש לך מתכון לפסטה?"): רמוז/י שיש לך כמה אפשרויות ותשאל/י שאלה מכוונת — "שמנת או עגבניות? משהו מהיר ליומיום או לאירוח?" — כדי לתת בדיוק מה שצריך.
• **שאלות ספציפיות** ("מה המתכון לרביולי בטטה?"): תן/י תשובה מלאה ומפורטת ישר — אל תשאל/י שאלות מיותרות.
• **תשובות לשאלה שלך** (המשתמש ענה "שמנת" / "לאירוח"): תן/י את התשובה המלאה בהתאם לבחירה, בלי עוד שאלות.
• **אחרי כל תשובה**: הציע/י בקצרה המשך טבעי אחד בתוך הטקסט.
• 1-2 אימוג'ים מקסימום לכל תשובה.

📌 המלצות המשך:
בסוף **כל** תשובה, הוסף שורה אחרונה בפורמט הזה בדיוק:
<<SUGGESTIONS>>הצעה 1|הצעה 2|הצעה 3<</SUGGESTIONS>>

🚨 דיוק מוחלט:
**אל תמציא** מתכונים, מצרכים, מידות, שמות מותגים, או מידע שלא כתוב בבסיס הידע למטה.

🔎 שימוש בבסיס הידע:
1. **יש תוכן למטה** → **חובה לשתף אותו!** גם אם לא מושלם — שתף/י בטבעיות.
2. **בסיס הידע ריק לגמרי** → אמור/י בקצרה ותזמין/י לשלוח DM.
3. 🚫 **לעולם** אל תגיד/י "לא דיברתי על X" כשיש תוכן — שתף/י מה שיש!

⚠️ כללים:
1. **ברכות**: "היי"/"שלום" → ענה חם (1-2 משפטים). **אל תציע** מוצרים/קופונים אלא אם ביקש.
2. **קופונים**: אם אין קופון למותג שביקשו — אמור בכנות, **אל תציע מותגים אחרים**.
3. **מתכונים ותוכן**: כשנותנים מתכון — תן אותו **מלא** עם מצרכים ושלבים. אם יש משהו דומה — הציע אותו!
4. **לינקים**: פורמט [טקסט](URL). העתק URL בדיוק כמו שהוא.

השם שלך: ${influencerName} (לעולם אל תכתוב [שם המשפיענית])`;
}

// ═══════════════════════════════════════════════════════════════════
// Step 4: Generate 25 scenarios from real account data
// ═══════════════════════════════════════════════════════════════════

function generateScenarios(data: AccountData): Scenario[] {
  const scenarios: Scenario[] = [];
  let idx = 0;

  const brandNames = data.brands.map(b => b.name);
  const couponBrands = data.coupons.map(c => c.brand);
  const topicSample = data.topics.slice(0, 5);

  // Cat 1: Greeting + exploration (5)
  const greetings = ['היי', 'שלום', 'אהלן', 'הי מירן', 'בוקר טוב'];
  const explorations = [
    ['ספרי לי קצת על עצמך', 'מה התחומים שלך?', 'מה הדבר הכי חשוב שלמדת?', 'תני טיפ אחד'],
    ['מה חדש אצלך?', 'על מה הפוסט האחרון?', 'ספרי עוד על זה', 'מעניין, מה עוד?'],
    ['מה את הכי אוהבת לעשות?', 'למה דווקא את זה?', 'איך התחלת?', 'מה הטיפ שלך?'],
    ['אני עוקבת חדשה, מה כדאי לדעת?', 'מה התוכן הכי פופולרי שלך?', 'ספרי עוד', 'תודה!'],
    ['ספרי על השגרה שלך', 'ומה בערב?', 'ומה בסופש?', 'טיפ אחרון?'],
  ];
  for (let i = 0; i < 5; i++) {
    scenarios.push({
      id: `greet_${++idx}`,
      category: 'greeting',
      turns: [greetings[i], ...explorations[i]],
    });
  }

  // Cat 2: Coupon-focused (5) — uses REAL brand names
  for (let i = 0; i < 5; i++) {
    const brand = couponBrands[i % couponBrands.length] || brandNames[i % brandNames.length] || 'Spring';
    const otherBrand = brandNames[(i + 3) % brandNames.length] || 'ROOMI';
    scenarios.push({
      id: `coupon_${++idx}`,
      category: 'coupon',
      turns: [
        `יש לך קופון ל${brand}?`,
        'מה בדיוק ההנחה?',
        `ויש משהו דומה ל${otherBrand}?`,
        'מתי פג התוקף?',
        'תודה! עוד קופון אחד?',
      ],
    });
  }

  // Cat 3: Knowledge deep-dive (5) — based on persona topics
  const knowledgeFlows = [
    // Topic: ביוטי/טיפוח
    [`מה את ממליצה ל${brandNames.includes('ARGANIA') ? 'טיפוח שיער' : 'טיפוח'}?`,
     'איזה מוצר הכי שווה?', 'בלי סיליקונים, יש חלופה?', 'כמה עולה?', 'איפה קונים?'],
    // Topic: מתכונים
    ['יש לך מתכון מהיר?', 'ספרי על המצרכים', 'אפשר בלי גלוטן?', 'כמה זמן הכנה?', 'טיפ להגשה?'],
    // Topic: אמהות/ילדים
    ['איזה טיפ יש לך לאמהות?', 'מה עושים כשהילד לא אוכל?', 'ספרי עוד', 'מה עוד עוזר?', 'תודה רבה!'],
    // Topic: אופנה
    [`מה דעתך על ${brandNames.includes('RENUAR') ? 'רנואר' : 'אופנה'}?`,
     'מה הסגנון שלך?', 'טיפ לקנייה חכמה?', 'פריט אחד שחייבים?', 'איפה הכי שווה?'],
    // Topic: טיפוח עור
    [`שמעתי ש${couponBrands.includes('Leaves / K-Care Organics') ? 'K-Care' : 'ויטמין C'} טוב לעור, מה דעתך?`,
     'איזה סרום?', 'רטינול או ניאצינמיד?', 'מה השגרה שלך?', 'תני שגרה מלאה בבקשה'],
  ];
  for (let i = 0; i < 5; i++) {
    scenarios.push({
      id: `knowledge_${++idx}`,
      category: 'knowledge',
      turns: knowledgeFlows[i],
    });
  }

  // Cat 4: Support escalation (3)
  const supportFlows = [
    ['הקופון לא עובד', 'ניסיתי כמה פעמים', 'מה עושים?', 'אפשר לדבר עם נציג?', 'תודה'],
    ['לא קיבלתי את ההזמנה', 'הזמנתי לפני שבוע', 'מספר הזמנה 12345', 'אפשר החזר?', 'תעבירי לנציג בבקשה'],
    ['יש לי בעיה עם המוצר', 'הוא הגיע פגום', 'מה אפשר לעשות?', 'אני רוצה החלפה', 'תודה על העזרה'],
  ];
  for (let i = 0; i < 3; i++) {
    scenarios.push({
      id: `support_${++idx}`,
      category: 'support',
      turns: supportFlows[i],
    });
  }

  // Cat 5: Mixed multi-topic (4)
  const mixedFlows = [
    ['היי, יש קופון?', `מה ההנחה על ${couponBrands[0] || 'Spring'}?`, 'ומה בנושא טיפוח?', 'ספרי עוד על זה', 'תודה רבה!'],
    ['שלום! מה חדש?', 'יש קופונים חדשים?', 'ומה בנושא טיפוח שיער?', 'ספרי עוד', 'איפה קונים?'],
    [`מה דעתך על ${brandNames[0] || 'ARGANIA'}?`, 'ומה בנוגע לטיפוח עור?', 'יש קופון?', 'תודה! עוד טיפ?', 'מעולה!'],
    ['אני מחפשת מתנה', 'תקציב עד 200 שקל', 'משהו לטיפוח', 'יש קופון?', 'מושלם, תודה!'],
  ];
  for (let i = 0; i < 4; i++) {
    scenarios.push({
      id: `mixed_${++idx}`,
      category: 'mixed',
      turns: mixedFlows[i],
    });
  }

  // Cat 6: Edge cases (3)
  const edgeCases = [
    ['?', 'לא הבנתי', 'מה זה?', 'ספרי עוד', 'תודה'],
    ['מה דעתך על הבחירות?', 'ועל הכלכלה?', 'חזרה לנושא — יש קופון?', 'מה ההנחה?', 'תודה!'],
    ['hiiiii', 'do you speak english?', 'ok hebrew then — מה חדש?', 'ספרי עוד', 'אחלה, תודה'],
  ];
  for (let i = 0; i < 3; i++) {
    scenarios.push({
      id: `edge_${++idx}`,
      category: 'edge',
      turns: edgeCases[i],
    });
  }

  return scenarios;
}

// ═══════════════════════════════════════════════════════════════════
// Step 5: Streaming — OpenAI
// ═══════════════════════════════════════════════════════════════════

async function streamOpenAI(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<{ text: string; ttftMs: number; totalMs: number; error?: string }> {
  const start = Date.now();
  let ttft = 0;
  let text = '';
  let firstDelta = true;

  try {
    const stream = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      max_completion_tokens: MAX_TOKENS,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        if (firstDelta) { ttft = Date.now() - start; firstDelta = false; }
        text += delta;
      }
    }

    return { text, ttftMs: ttft, totalMs: Date.now() - start };
  } catch (err: any) {
    return { text, ttftMs: ttft, totalMs: Date.now() - start, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Step 6: Streaming — Gemini (via @google/genai SDK)
// ═══════════════════════════════════════════════════════════════════

async function streamGemini(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<{ text: string; ttftMs: number; totalMs: number; error?: string }> {
  const start = Date.now();
  let ttft = 0;
  let text = '';
  let firstDelta = true;

  try {
    // Separate system from conversation
    const systemParts: string[] = [];
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    for (const m of messages) {
      if (m.role === 'system') {
        systemParts.push(m.content as string);
      } else {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content as string }],
        });
      }
    }

    // Merge consecutive same-role messages (Gemini requires alternating)
    const merged: typeof contents = [];
    for (const c of contents) {
      const last = merged[merged.length - 1];
      if (last && last.role === c.role) {
        last.parts.push(...c.parts);
      } else {
        merged.push({ ...c, parts: [...c.parts] });
      }
    }

    // Gemini requires first message to be 'user'
    if (merged.length > 0 && merged[0].role !== 'user') {
      merged.unshift({ role: 'user', parts: [{ text: '.' }] });
    }

    const streamResult = await gemini.models.generateContentStream({
      model: GEMINI_MODEL,
      contents: merged,
      config: {
        systemInstruction: systemParts.join('\n\n') || undefined,
        maxOutputTokens: MAX_TOKENS,
        // Minimal thinking for fast response
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    for await (const chunk of streamResult) {
      const t = chunk.text;
      if (t) {
        if (firstDelta) { ttft = Date.now() - start; firstDelta = false; }
        text += t;
      }
    }

    return { text, ttftMs: ttft, totalMs: Date.now() - start };
  } catch (err: any) {
    return { text, ttftMs: ttft, totalMs: Date.now() - start, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Step 7: Run a single scenario on one provider
// ═══════════════════════════════════════════════════════════════════

async function runScenario(
  scenario: Scenario,
  provider: 'openai' | 'gemini',
  systemPrompt: string,
  kbContext: string,
): Promise<TurnResult[]> {
  const results: TurnResult[] = [];
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (let t = 0; t < scenario.turns.length; t++) {
    const userMessage = scenario.turns[t];

    // Build user prompt with KB context (exact production shape)
    const userPrompt = `${kbContext}

💬 הודעת המשתמש:
"${userMessage}"

ענה בעברית. אם השאלה רחבה — שאל/י שאלה מכוונת (עם רמז קצר למה שיש לך). אם ברור מה רוצים — תן/י תשובה מלאה.
🚨 אל תמציא תוכן שלא מופיע בבסיס הידע.`;

    // Build messages array: system + history + current user
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: userPrompt },
    ];

    // Call the right provider
    const result = provider === 'openai'
      ? await streamOpenAI(messages)
      : await streamGemini(messages);

    // Update history for continuity
    history.push({ role: 'user', content: userMessage }); // raw user message for history
    history.push({ role: 'assistant', content: result.text });

    results.push({
      scenarioId: scenario.id,
      turnIndex: t,
      provider,
      model: provider === 'openai' ? OPENAI_MODEL : GEMINI_MODEL,
      userMessage,
      assistantResponse: result.text,
      ttftMs: result.ttftMs,
      totalMs: result.totalMs,
      inputChars: userMessage.length,
      outputChars: result.text.length,
      error: result.error,
    });

    // Log metric to JSONL
    const metric = {
      ts: new Date().toISOString(),
      scenario_id: scenario.id,
      provider,
      model: provider === 'openai' ? OPENAI_MODEL : GEMINI_MODEL,
      turn_index: t,
      ttft_ms: result.ttftMs,
      total_ms: result.totalMs,
      input_chars: userMessage.length,
      output_chars: result.text.length,
      error: result.error || null,
    };
    try { appendFileSync(RESULTS_PATH, JSON.stringify(metric) + '\n'); } catch {}

    // Pace — simulate real conversation, don't overload
    await new Promise(r => setTimeout(r, 800));
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// Step 8: Scoring
// ═══════════════════════════════════════════════════════════════════

function scoreContinuity(results: TurnResult[]): number {
  let checks = 0;
  let passed = 0;
  const userEntities: Set<string>[] = [];

  for (const r of results) {
    // Collect entities from user messages
    const words = r.userMessage.match(/[\u0590-\u05FFa-zA-Z]{3,}/g) || [];
    userEntities.push(new Set(words.map(w => w.toLowerCase())));
  }

  // For turns 2+, check if assistant references prior entities
  for (let i = 1; i < results.length; i++) {
    const responseWords = new Set(
      (results[i].assistantResponse.match(/[\u0590-\u05FFa-zA-Z]{3,}/g) || []).map(w => w.toLowerCase())
    );
    for (let j = 0; j < i; j++) {
      for (const entity of userEntities[j]) {
        if (entity.length >= 4) {
          checks++;
          if (responseWords.has(entity)) passed++;
        }
      }
    }
  }

  return checks > 0 ? Math.min(passed / checks, 1) : 1;
}

function scoreConstraintAdherence(results: TurnResult[]): number {
  let constraints = 0;
  let adhered = 0;
  const patterns = [/בלי\s/, /רק\s/, /עד\s\d/, /מקסימום/, /בדיוק/, /ללא\s/];

  for (let i = 0; i < results.length; i++) {
    for (const pat of patterns) {
      if (pat.test(results[i].userMessage)) {
        constraints++;
        const constraintWord = results[i].userMessage.match(pat)?.[0]?.trim();
        if (constraintWord && results[i].assistantResponse.includes(constraintWord)) {
          adhered++;
        } else {
          adhered += 0.5; // partial credit
        }
      }
    }
  }

  return constraints > 0 ? Math.min(adhered / constraints, 1) : 1;
}

function countHallucinations(results: TurnResult[], data: AccountData): number {
  const known = new Set([
    ...data.brands.map(b => b.name.toLowerCase()),
    ...data.coupons.map(c => c.brand.toLowerCase()),
    ...data.coupons.map(c => c.code.toLowerCase()),
  ]);

  let hallucinations = 0;

  for (const r of results) {
    // Check for coupon codes that aren't known
    const codePattern = /קוד[:\s]+([A-Za-z0-9]+)/g;
    let match;
    while ((match = codePattern.exec(r.assistantResponse)) !== null) {
      if (!known.has(match[1].toLowerCase())) hallucinations++;
    }

    // Check quoted brand-like terms
    const quoted = r.assistantResponse.match(/["״]([^"״]+)["״]/g) || [];
    for (const q of quoted) {
      const clean = q.replace(/["״]/g, '').trim().toLowerCase();
      if (clean.length >= 3 && /^[A-Za-z]/.test(clean) && !known.has(clean)) {
        hallucinations++;
      }
    }
  }

  return hallucinations;
}

async function scorePersonaStyle(results: TurnResult[], personaKeywords: string[]): Promise<number> {
  if (personaKeywords.length === 0) return 1;

  const personaRef = personaKeywords.join(', ');
  const assistantText = results.map(r => r.assistantResponse).join('\n').slice(0, 6000);
  if (!assistantText) return 0;

  try {
    const [refEmb, respEmb] = await Promise.all([
      openai.embeddings.create({ model: 'text-embedding-3-small', input: personaRef.slice(0, 8000), dimensions: 1536 }),
      openai.embeddings.create({ model: 'text-embedding-3-small', input: assistantText.slice(0, 8000), dimensions: 1536 }),
    ]);

    const a = refEmb.data[0].embedding;
    const b = respEmb.data[0].embedding;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
  } catch {
    return 0.5;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Step 9: Summary
// ═══════════════════════════════════════════════════════════════════

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 1000) / 1000;
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('='.repeat(70));
  console.log('  SHADOW MODEL BENCHMARK — GPT-5.2 vs Gemini 3 Flash');
  console.log('='.repeat(70));

  // Setup output dirs
  mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
  if (existsSync(RESULTS_PATH)) writeFileSync(RESULTS_PATH, '');

  // Load data
  const data = await loadAccountData();
  const scenarios = generateScenarios(data);
  console.log(`\n  Scenarios: ${scenarios.length}`);
  console.log(`  Turns per scenario: ${TURNS_PER_SCENARIO}`);
  console.log(`  Total API calls: ${scenarios.length * TURNS_PER_SCENARIO * 2}`);

  // Build prompts (same for both models — this is the point)
  const systemPrompt = buildSystemPrompt(data.displayName);
  const kbContext = buildKnowledgeContext({
    posts: data.posts,
    highlights: data.highlights,
    coupons: data.coupons,
    partnerships: data.brands,
    transcriptions: data.transcriptions,
  });

  const providers: Array<'openai' | 'gemini'> = ['openai', 'gemini'];
  const allResults: TurnResult[] = [];
  const allScores = new Map<string, any>();

  for (const provider of providers) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  Provider: ${provider.toUpperCase()} (${provider === 'openai' ? OPENAI_MODEL : GEMINI_MODEL})`);
    console.log(`${'─'.repeat(50)}`);

    for (let i = 0; i < scenarios.length; i++) {
      const s = scenarios[i];
      process.stdout.write(`  [${i + 1}/${scenarios.length}] ${s.id} (${s.category})...`);

      const results = await runScenario(s, provider, systemPrompt, kbContext);
      allResults.push(...results);

      // Save transcript
      const transcript = {
        scenario_id: s.id, category: s.category, provider,
        model: provider === 'openai' ? OPENAI_MODEL : GEMINI_MODEL,
        turns: results.map(r => ({
          turn: r.turnIndex,
          user: r.userMessage,
          assistant: r.assistantResponse,
          ttft_ms: r.ttftMs,
          total_ms: r.totalMs,
          error: r.error || null,
        })),
      };
      writeFileSync(
        join(TRANSCRIPTS_DIR, `${s.id}_${provider}.json`),
        JSON.stringify(transcript, null, 2),
      );

      // Score
      const continuity = scoreContinuity(results);
      const constraint = scoreConstraintAdherence(results);
      const hallucinations = countHallucinations(results, data);
      const persona = await scorePersonaStyle(results, data.personaKeywords);

      allScores.set(`${provider}:${s.id}`, {
        continuity_score: Math.round(continuity * 1000) / 1000,
        constraint_adherence_score: Math.round(constraint * 1000) / 1000,
        hallucination_count: hallucinations,
        persona_style_score: Math.round(persona * 1000) / 1000,
      });

      const errors = results.filter(r => r.error).length;
      const avgTtft = Math.round(results.reduce((a, r) => a + r.ttftMs, 0) / results.length);
      console.log(` ${errors > 0 ? '!' : 'ok'} ttft=${avgTtft}ms hall=${hallucinations}${errors ? ` err=${errors}` : ''}`);

      // Pace between scenarios
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // ─── Build summary ────────────────────────────────────────────
  console.log('\n  Computing summary...');

  const summary: any = {
    generated_at: new Date().toISOString(),
    account_id: ACCOUNT_ID,
    account_username: data.username,
    scenarios_count: scenarios.length,
    turns_per_scenario: TURNS_PER_SCENARIO,
    providers: {} as Record<string, any>,
    recommendation: '',
  };

  for (const provider of providers) {
    const turns = allResults.filter(r => r.provider === provider);
    const ttfts = turns.filter(t => t.ttftMs > 0).map(t => t.ttftMs);
    const totals = turns.map(t => t.totalMs);
    const scenarioIds = [...new Set(turns.map(t => t.scenarioId))];
    const scores = scenarioIds.map(id => allScores.get(`${provider}:${id}`)).filter(Boolean);

    summary.providers[provider] = {
      model: provider === 'openai' ? OPENAI_MODEL : GEMINI_MODEL,
      total_turns: turns.length,
      errors: turns.filter(t => t.error).length,
      avg_ttft_ms: Math.round(avg(ttfts)),
      p95_ttft_ms: Math.round(percentile(ttfts, 95)),
      avg_total_ms: Math.round(avg(totals)),
      p95_total_ms: Math.round(percentile(totals, 95)),
      avg_output_chars: Math.round(avg(turns.map(t => t.outputChars))),
      avg_continuity: avg(scores.map(s => s.continuity_score)),
      avg_constraint_adherence: avg(scores.map(s => s.constraint_adherence_score)),
      avg_hallucination_count: avg(scores.map(s => s.hallucination_count)),
      avg_persona_style: avg(scores.map(s => s.persona_style_score)),
    };
  }

  // Composite: quality 70% + speed 30%
  const oai = summary.providers.openai;
  const gem = summary.providers.gemini;
  const qualityOai = (oai.avg_continuity + oai.avg_constraint_adherence + oai.avg_persona_style) / 3;
  const qualityGem = (gem.avg_continuity + gem.avg_constraint_adherence + gem.avg_persona_style) / 3;
  const maxTtft = Math.max(oai.avg_ttft_ms, gem.avg_ttft_ms) || 1;
  const speedOai = 1 - (oai.avg_ttft_ms / maxTtft);
  const speedGem = 1 - (gem.avg_ttft_ms / maxTtft);
  const compositeOai = qualityOai * 0.7 + speedOai * 0.3;
  const compositeGem = qualityGem * 0.7 + speedGem * 0.3;

  summary.composite = { openai: Math.round(compositeOai * 1000) / 1000, gemini: Math.round(compositeGem * 1000) / 1000 };

  const diff = Math.abs(compositeOai - compositeGem);
  if (diff < 0.05) {
    summary.recommendation = `TIE — Both models perform similarly (delta: ${diff.toFixed(3)}). Prefer the cheaper option.`;
  } else {
    const winner = compositeOai >= compositeGem ? 'openai' : 'gemini';
    summary.recommendation = `WINNER: ${winner} (${Math.max(compositeOai, compositeGem).toFixed(3)} vs ${Math.min(compositeOai, compositeGem).toFixed(3)})`;
  }

  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  // ─── Print results ────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('  BENCHMARK RESULTS');
  console.log('='.repeat(70));

  for (const provider of providers) {
    const s = summary.providers[provider];
    console.log(`\n  ${provider.toUpperCase()} (${s.model})`);
    console.log(`    Turns: ${s.total_turns}  Errors: ${s.errors}`);
    console.log(`    TTFT:     avg=${s.avg_ttft_ms}ms   p95=${s.p95_ttft_ms}ms`);
    console.log(`    Total:    avg=${s.avg_total_ms}ms   p95=${s.p95_total_ms}ms`);
    console.log(`    Output:   avg=${s.avg_output_chars} chars`);
    console.log(`    Continuity:     ${s.avg_continuity}`);
    console.log(`    Constraint:     ${s.avg_constraint_adherence}`);
    console.log(`    Hallucinations: ${s.avg_hallucination_count}`);
    console.log(`    Persona Style:  ${s.avg_persona_style}`);
  }

  console.log(`\n  Composite (quality 70% + speed 30%):`);
  console.log(`    OpenAI: ${summary.composite.openai}  |  Gemini: ${summary.composite.gemini}`);
  console.log(`\n  ${summary.recommendation}`);
  console.log(`\n  Results:     ${RESULTS_PATH}`);
  console.log(`  Transcripts: ${TRANSCRIPTS_DIR}/`);
  console.log(`  Summary:     ${SUMMARY_PATH}`);
  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
