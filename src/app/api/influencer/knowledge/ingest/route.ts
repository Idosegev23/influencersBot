/**
 * Knowledge Ingest API
 *
 * Accepts multiple input types and ingests them into the RAG knowledge base:
 * - type: "url"       → Gemini fetches & analyzes the page
 * - type: "text"      → Free text input, directly ingested
 * - type: "faq"       → Q&A pairs
 *
 * All data is scoped to account_id (multi-tenant).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, type, data } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId required' }, { status: 400 });
    }

    if (!type || !data) {
      return NextResponse.json({ error: 'type and data required' }, { status: 400 });
    }

    console.log(`[Knowledge Ingest] type=${type}, accountId=${accountId}`);

    switch (type) {
      case 'url':
        return await handleUrlIngest(accountId, data);
      case 'text':
        return await handleTextIngest(accountId, data);
      case 'faq':
        return await handleFaqIngest(accountId, data);
      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Knowledge Ingest] Error:', error);
    return NextResponse.json(
      { error: 'שגיאה בהכנסת מידע', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Ingest content from a URL using Gemini URL Context
 */
async function handleUrlIngest(accountId: string, data: { url: string; title?: string }) {
  const { url, title } = data;

  if (!url || !url.startsWith('http')) {
    return NextResponse.json({ error: 'Valid URL required' }, { status: 400 });
  }

  console.log(`[Knowledge Ingest] URL: ${url}`);

  const { parseUrlWithGemini } = await import('@/lib/ai-parser/gemini');
  const result = await parseUrlWithGemini(url);

  if (!result.success) {
    return NextResponse.json({
      success: false,
      error: result.error || 'Failed to process URL',
    }, { status: 200 });
  }

  // Build text for RAG from the parsed data + page text
  const ragText = [
    `Source: ${url}`,
    title ? `Title: ${title}` : '',
    result.data?.title ? `Page Title: ${result.data.title}` : '',
    result.data?.content || '',
    '',
    result.extractedText ? `--- Full Page Text ---\n${result.extractedText}` : '',
  ].filter(Boolean).join('\n');

  // Ingest into RAG
  const { ingestDocument } = await import('@/lib/rag/ingest');
  const ragResult = await ingestDocument({
    accountId,
    entityType: 'document',
    sourceId: `url-${Date.now()}`,
    title: title || result.data?.title || `URL: ${url}`,
    text: ragText,
    metadata: {
      source: 'url',
      url,
      parsedTitle: result.data?.title,
      confidence: result.confidence,
      knowledgeEntries: result.data?.knowledge_entries?.length || 0,
    },
  });

  // Also save knowledge entries if any
  if (result.data?.knowledge_entries?.length) {
    await saveKnowledgeEntries(accountId, result.data.knowledge_entries, url);
  }

  // Save coupon codes if any
  if (result.data?.coupon_codes?.length) {
    await saveCouponCodes(accountId, result.data.coupon_codes);
  }

  console.log(`[Knowledge Ingest] URL done: ${ragResult.chunksCreated} chunks`);

  return NextResponse.json({
    success: true,
    title: result.data?.title || url,
    chunksCreated: ragResult.chunksCreated,
    knowledgeEntries: result.data?.knowledge_entries?.length || 0,
    couponCodes: result.data?.coupon_codes?.length || 0,
    confidence: result.confidence,
  });
}

/**
 * Ingest free text directly into RAG
 */
async function handleTextIngest(accountId: string, data: { text: string; title?: string; tags?: string[] }) {
  const { text, title, tags } = data;

  if (!text || text.trim().length < 10) {
    return NextResponse.json({ error: 'Text must be at least 10 characters' }, { status: 400 });
  }

  console.log(`[Knowledge Ingest] Free text: ${text.length} chars`);

  // Optionally analyze with Gemini for structured extraction
  let parsedData: any = null;
  if (text.length > 100) {
    try {
      const { getGeminiClient, MODELS } = await import('@/lib/ai/google-client');
      const client = getGeminiClient();

      const result = await client.models.generateContent({
        model: MODELS.CHAT_FAST,
        contents: `נתח את הטקסט הבא וחלץ מידע מובנה. החזר JSON:
{
  "title": "כותרת מתאימה לטקסט",
  "keyPoints": ["נקודות מרכזיות"],
  "knowledge_entries": [{"title": "כותרת", "content": "תוכן", "knowledge_type": "custom", "keywords": ["מילה"]}],
  "coupon_codes": []
}

טקסט:
${text.substring(0, 10000)}

החזר רק JSON תקין.`,
        config: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      });

      const responseText = result.text || '';
      try {
        parsedData = JSON.parse(responseText);
      } catch {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) parsedData = JSON.parse(match[0]);
      }
    } catch (err: any) {
      console.error('[Knowledge Ingest] AI analysis failed (non-critical):', err.message);
    }
  }

  const ragText = [
    title ? `Title: ${title}` : '',
    tags?.length ? `Tags: ${tags.join(', ')}` : '',
    '',
    text,
  ].filter(Boolean).join('\n');

  const { ingestDocument } = await import('@/lib/rag/ingest');
  const ragResult = await ingestDocument({
    accountId,
    entityType: 'document',
    sourceId: `text-${Date.now()}`,
    title: title || parsedData?.title || 'Free text input',
    text: ragText,
    metadata: {
      source: 'free_text',
      tags: tags || [],
      hasAiAnalysis: !!parsedData,
    },
  });

  // Save knowledge entries if any
  if (parsedData?.knowledge_entries?.length) {
    await saveKnowledgeEntries(accountId, parsedData.knowledge_entries, 'free_text');
  }

  // Save coupon codes if any
  if (parsedData?.coupon_codes?.length) {
    await saveCouponCodes(accountId, parsedData.coupon_codes);
  }

  console.log(`[Knowledge Ingest] Text done: ${ragResult.chunksCreated} chunks`);

  return NextResponse.json({
    success: true,
    title: title || parsedData?.title || 'Free text',
    chunksCreated: ragResult.chunksCreated,
    knowledgeEntries: parsedData?.knowledge_entries?.length || 0,
  });
}

/**
 * Ingest FAQ (question/answer pairs) directly
 */
async function handleFaqIngest(accountId: string, data: { entries: Array<{ question: string; answer: string }> }) {
  const { entries } = data;

  if (!entries?.length) {
    return NextResponse.json({ error: 'entries array required' }, { status: 400 });
  }

  console.log(`[Knowledge Ingest] FAQ: ${entries.length} entries`);

  // Build RAG text from all FAQs
  const ragText = entries.map((e, i) =>
    `שאלה ${i + 1}: ${e.question}\nתשובה: ${e.answer}`
  ).join('\n\n');

  const { ingestDocument } = await import('@/lib/rag/ingest');
  const ragResult = await ingestDocument({
    accountId,
    entityType: 'document',
    sourceId: `faq-${Date.now()}`,
    title: `FAQ - ${entries.length} שאלות ותשובות`,
    text: ragText,
    metadata: {
      source: 'faq',
      entryCount: entries.length,
    },
  });

  // Also save each FAQ as a knowledge entry for direct retrieval
  const knowledgeEntries = entries.map(e => ({
    title: e.question,
    content: e.answer,
    knowledge_type: 'faq',
    keywords: e.question.split(/\s+/).filter((w: string) => w.length > 2),
  }));

  await saveKnowledgeEntries(accountId, knowledgeEntries, 'faq_input');

  console.log(`[Knowledge Ingest] FAQ done: ${ragResult.chunksCreated} chunks, ${entries.length} knowledge entries`);

  return NextResponse.json({
    success: true,
    chunksCreated: ragResult.chunksCreated,
    knowledgeEntries: entries.length,
  });
}

/**
 * Save knowledge entries to the knowledge_base table
 */
async function saveKnowledgeEntries(
  accountId: string,
  entries: Array<{ title?: string; content: string; knowledge_type?: string; keywords?: string[] }>,
  source: string
) {
  if (!entries?.length) return;

  try {
    const rows = entries.map(entry => ({
      account_id: accountId,
      title: entry.title || 'Untitled',
      content: entry.content,
      knowledge_type: entry.knowledge_type || 'custom',
      keywords: entry.keywords || [],
      source,
      is_active: true,
      created_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('knowledge_base').insert(rows);
    if (error) {
      console.error('[Knowledge Ingest] Error saving knowledge entries:', error.message);
    } else {
      console.log(`[Knowledge Ingest] Saved ${rows.length} knowledge entries`);
    }
  } catch (err: any) {
    console.error('[Knowledge Ingest] Error saving knowledge entries:', err.message);
  }
}

/**
 * Save coupon codes to the coupons table
 */
async function saveCouponCodes(
  accountId: string,
  coupons: Array<{ code: string; brand_name?: string; discount_type?: string; discount_value?: number; description?: string }>
) {
  if (!coupons?.length) return;

  try {
    for (const coupon of coupons) {
      if (!coupon.code) continue;

      // Check if coupon already exists
      const { data: existing } = await supabase
        .from('coupons')
        .select('id')
        .eq('account_id', accountId)
        .eq('code', coupon.code)
        .maybeSingle();

      if (existing) continue;

      await supabase.from('coupons').insert({
        account_id: accountId,
        code: coupon.code,
        brand_name: coupon.brand_name || null,
        discount_type: coupon.discount_type || null,
        discount_value: coupon.discount_value || null,
        description: coupon.description || null,
        is_active: true,
        source: 'ai_extracted',
      });
    }
    console.log(`[Knowledge Ingest] Saved ${coupons.length} coupon codes`);
  } catch (err: any) {
    console.error('[Knowledge Ingest] Error saving coupons:', err.message);
  }
}
