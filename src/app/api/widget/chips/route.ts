/**
 * Widget Smart Chips API — page-aware + history-aware starter prompts
 * POST /api/widget/chips
 *
 * Phase 1 of widget v4. Chips are short Hebrew prompts shown above the
 * input field — they help cold visitors start a conversation.
 *
 * Priority chain:
 *   1. accounts.config.widget.chips_overrides[pagePattern] (manual pin)
 *   2. in-memory cache (24h TTL on initial mode only)
 *   3. OpenAI gpt-5.4 via Responses API (strict json_schema)
 *   4. accounts.config.suggested_questions (DB fallback)
 *   5. hardcoded defaults
 *
 * Two modes:
 *   - 'initial':  fired on widget load. Cacheable.
 *   - 'follow_up': fired after each bot response. Never cached (depends on conversation).
 *
 * Engine consistency: same model as the widget chat itself (gpt-5.4 from
 * `baseArchetype.ts:CHAT_MODEL`). No model mixing — chips, chat, and Bestie
 * all run on the same brain.
 *
 * Bestie blast radius: zero. Widget-only route, widget-only config keys.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cacheGet, cacheSet } from '@/lib/cache';
import OpenAI from 'openai';

// Same model as the widget chat (baseArchetype.CHAT_MODEL). Cache absorbs the
// extra latency: typical hit rate ≥80% per (account, page-pattern, returning).
const CHIPS_MODEL = 'gpt-5.4';
const CHIPS_TIMEOUT_MS = 12000;
const CHIPS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_CHIPS = 4;

// ============================================
// CORS
// ============================================

function getCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

// ============================================
// Page pattern heuristics
// ============================================

type PagePattern = 'home' | 'product_page' | 'category_page' | 'cart' | 'about' | 'contact' | 'other';

function detectPagePattern(pagePath: string): PagePattern {
  const p = (pagePath || '').toLowerCase();
  if (!p || p === '/' || p === '/home' || p === '/index' || p === '/index.html') return 'home';
  if (/^\/products?\//.test(p) || /\/product\//.test(p)) return 'product_page';
  if (/^\/(shop|store|catalog|category|categories|collection|collections)/.test(p)) return 'category_page';
  if (/cart|checkout|basket/.test(p)) return 'cart';
  if (/about|מי-אנחנו|אודות/.test(p)) return 'about';
  if (/contact|צור-קשר|קשר/.test(p)) return 'contact';
  return 'other';
}

// ============================================
// Defaults (used when nothing else is available)
// ============================================

const DEFAULT_CHIPS: Record<PagePattern, string[]> = {
  home: ['מה הכי חם?', 'יש מבצעים?', 'ספרי על המותג'],
  product_page: ['מתאים לי?', 'יש קופון?', 'כמה זמן משלוח?'],
  category_page: ['מה הכי נמכר?', 'מה החדש?', 'מה במבצע?'],
  cart: ['יש קוד הנחה?', 'משלוח חינם?', 'מתי יגיע?'],
  about: ['ספרי על המייסדים', 'מה הסיפור?', 'מאיפה המוצרים?'],
  contact: ['איך מזמינים?', 'מתי משיבים?', 'יש שירות לקוחות?'],
  other: ['מה הכי חם?', 'יש מבצעים?', 'איך אפשר לעזור?'],
};

// ============================================
// gpt-5.4 chip generator (OpenAI Responses API + strict json_schema)
// ============================================

let _client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (_client) return _client;
  if (!process.env.OPENAI_API_KEY) return null;
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

interface ChipsContext {
  brandName: string;
  brandSummary?: string;
  pagePattern: PagePattern;
  pageTitle?: string;
  isReturning: boolean;
  lastTopic?: string | null;
  productSamples?: string[];
  lang: string;
  mode: 'initial' | 'follow_up';
  lastUserMsg?: string | null;
  lastBotMsg?: string | null;
}

async function generateChips(ctx: ChipsContext): Promise<string[] | null> {
  const client = getClient();
  if (!client) return null;

  const targetCount = ctx.mode === 'follow_up' ? 3 : MAX_CHIPS;
  // Resolve the chip-output language. `ctx.lang` flows in from the widget
  // (`document.documentElement.lang` || 'he'). Anything we don't have a
  // dedicated prompt for falls back to Hebrew to preserve existing behavior.
  const chipLang = (ctx.lang || 'he').toLowerCase().startsWith('en') ? 'en' : 'he';
  const instructions = chipLang === 'en'
    ? (ctx.mode === 'follow_up'
        ? `Generate ${targetCount} short English chips for follow-up conversation on a commercial website chat. Each chip is a short question/request (max 6 words) the visitor would tap right after the bot's reply. Aim for precise relevance to the conversation context.`
        : `Generate ${targetCount} short English chips as conversation starters for a brand website chat. Each chip is a question (max 6 words) an anonymous visitor would tap to start a chat. They must feel native to the brand and the page type the visitor is on.`)
    : (ctx.mode === 'follow_up'
        ? `אתה מייצר ${targetCount} צ'יפסים קצרים בעברית להמשך שיחה בצ'אט באתר מסחרי. כל צ'יפ הוא שאלה/בקשה קצרה (עד 6 מילים) שהמבקר/ת היה/יתה מקליק/ה עכשיו אחרי תשובת הבוט. תכוון/י לדיוק על הקשר השיחה.`
        : `אתה מייצר ${targetCount} צ'יפסים קצרים בעברית בתור שאלות פתיחה לצ'אט באתר מותג. כל צ'יפ הוא שאלה (עד 6 מילים) שלקוח/ה אנונימי/ת היה/יתה מקליק/ה כדי להתחיל שיחה. הם צריכים להרגיש native למותג ולסוג העמוד שהמבקר/ת רואה.`);

  const input =
    ctx.mode === 'follow_up'
      ? `Brand: ${ctx.brandName}
Page type: ${ctx.pagePattern}
Last user message: ${ctx.lastUserMsg || ''}
Last bot reply: ${ctx.lastBotMsg || ''}`
      : `Brand: ${ctx.brandName}
${ctx.brandSummary ? `Description: ${ctx.brandSummary}\n` : ''}Page type: ${ctx.pagePattern}
Page title: ${ctx.pageTitle || ''}
Returning visitor: ${ctx.isReturning}
Last topic: ${ctx.lastTopic || 'none'}
${ctx.productSamples?.length ? `Sample products: ${ctx.productSamples.slice(0, 5).join(', ')}` : ''}
Language: ${ctx.lang}`;

  try {
    const response = await Promise.race([
      client.responses.create({
        model: CHIPS_MODEL,
        instructions,
        input,
        text: {
          format: {
            type: 'json_schema',
            name: 'widget_chips',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                chips: {
                  type: 'array',
                  items: { type: 'string' },
                  description: `${targetCount} short ${chipLang === 'en' ? 'English' : 'Hebrew'} chip strings, max 6 words each`,
                },
              },
              required: ['chips'],
              additionalProperties: false,
            },
          },
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('chips timeout')), CHIPS_TIMEOUT_MS),
      ),
    ]);

    const parsed = JSON.parse((response as any).output_text || '{}');
    const chips: string[] = Array.isArray(parsed?.chips)
      ? parsed.chips.filter((c: any) => typeof c === 'string' && c.trim())
      : [];
    if (!chips.length) return null;
    return chips.slice(0, MAX_CHIPS).map((c) => c.trim());
  } catch (err: any) {
    console.warn('[widget/chips] gpt-5.4 generation failed:', err?.message || err);
    return null;
  }
}

// ============================================
// POST handler
// ============================================

interface ChipsRequest {
  accountId: string;
  pageUrl?: string;
  pageTitle?: string;
  pagePath?: string;
  isReturning?: boolean;
  lastTopic?: string | null;
  lang?: string;
  mode?: 'initial' | 'follow_up';
  lastUserMsg?: string;
  lastBotMsg?: string;
}

interface ChipsResponse {
  chips: string[];
  cached: boolean;
  source: 'override' | 'cache' | 'llm' | 'fallback' | 'disabled';
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  const corsHeaders = getCorsHeaders(origin);

  let body: ChipsRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400, headers: corsHeaders });
  }

  const { accountId, pagePath = '/', isReturning = false, lastTopic = null, lang = 'he', mode = 'initial' } = body;

  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400, headers: corsHeaders });
  }

  const pagePattern = detectPagePattern(pagePath);

  // 1. Load account config
  const supabase = await createClient();
  const { data: account } = await supabase
    .from('accounts')
    .select('config, language')
    .eq('id', accountId)
    .single();

  const config: any = account?.config || {};
  const widgetConfig: any = config.widget || {};
  // Account language is authoritative — `lang` from the request body comes
  // from <html lang> which the embedding site may not set correctly.
  const effectiveLang = account?.language || lang || 'he';

  // Disabled by store owner
  if (widgetConfig.chips_enabled === false) {
    return NextResponse.json<ChipsResponse>(
      { chips: [], cached: false, source: 'disabled' },
      { headers: corsHeaders },
    );
  }

  // 2. Manual override (highest priority)
  const overrides = widgetConfig.chips_overrides as Record<string, string[]> | undefined;
  if (overrides && Array.isArray(overrides[pagePattern]) && overrides[pagePattern].length) {
    return NextResponse.json<ChipsResponse>(
      { chips: overrides[pagePattern].slice(0, MAX_CHIPS), cached: false, source: 'override' },
      { headers: corsHeaders },
    );
  }

  // 3. Cache lookup (initial mode only — follow_up depends on live conversation)
  const cacheKey = `chips:${accountId}:${pagePattern}:${isReturning ? 1 : 0}:${effectiveLang}`;
  if (mode === 'initial') {
    const hit = cacheGet<string[]>(cacheKey);
    if (hit?.value && hit.value.length) {
      return NextResponse.json<ChipsResponse>(
        { chips: hit.value, cached: true, source: 'cache' },
        { headers: corsHeaders },
      );
    }
  }

  // 4. Sample a few products for Flash context (helps brand-relevance)
  const { data: productSamples } = await supabase
    .from('widget_products')
    .select('name')
    .eq('account_id', accountId)
    .eq('is_available', true)
    .order('priority', { ascending: false })
    .limit(5);
  const sampleNames = (productSamples || []).map((p: any) => p.name).filter(Boolean);

  // 5. Generate via gpt-5.4 (same model as the chat — no mixing)
  const brandFallback = effectiveLang.toLowerCase().startsWith('en') ? 'the brand' : 'המותג';
  const generated = await generateChips({
    brandName: config.display_name || config.username || brandFallback,
    brandSummary: config.persona_summary || widgetConfig.welcomeMessage,
    pagePattern,
    pageTitle: body.pageTitle,
    isReturning,
    lastTopic,
    productSamples: sampleNames,
    lang: effectiveLang,
    mode,
    lastUserMsg: body.lastUserMsg,
    lastBotMsg: body.lastBotMsg,
  });

  if (generated && generated.length) {
    if (mode === 'initial') {
      cacheSet(cacheKey, generated, {
        ttlMs: CHIPS_CACHE_TTL_MS,
        tags: [`account:${accountId}`, `widget-chips`],
      });
    }
    return NextResponse.json<ChipsResponse>(
      { chips: generated, cached: false, source: 'llm' },
      { headers: corsHeaders },
    );
  }

  // 6. Fallback chain: config.suggested_questions → hardcoded defaults
  const dbSuggestions = Array.isArray(config.suggested_questions)
    ? config.suggested_questions.filter((s: any) => typeof s === 'string' && s.trim())
    : [];
  const fallback = dbSuggestions.length ? dbSuggestions.slice(0, MAX_CHIPS) : DEFAULT_CHIPS[pagePattern];

  return NextResponse.json<ChipsResponse>(
    { chips: fallback, cached: false, source: 'fallback' },
    { headers: corsHeaders },
  );
}
