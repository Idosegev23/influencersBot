/**
 * Chat Vision Analyzer
 * Analyzes user-uploaded images and videos for the chat persona.
 *
 * Images: brief Hebrew description (2-3 sentences)
 * Videos: rich multi-modal analysis (vision + transcription + OCR + products + mood)
 *
 * Reuses patterns from gemini-transcriber.ts (inline base64, retry, JSON parsing).
 */

import { getGeminiClient, MODELS } from '@/lib/ai/google-client';
import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

interface VideoAnalysis {
  visual_description: string;
  transcription: string;
  on_screen_text: string[];
  products_mentioned: string[];
  mood: string;
}

// ============================================
// Helpers
// ============================================

async function downloadFromSupabase(storagePath: string): Promise<{ data: string; mimeType: string }> {
  const { data, error } = await supabase.storage
    .from('chat-media')
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download from storage: ${error?.message || 'no data'}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = data.type || 'application/octet-stream';

  console.log(`[VisionAnalyzer] Downloaded ${(arrayBuffer.byteLength / 1024).toFixed(1)}KB, type: ${mimeType}`);

  return { data: base64, mimeType };
}

function deleteFromSupabase(storagePath: string): void {
  supabase.storage
    .from('chat-media')
    .remove([storagePath])
    .then(({ error }) => {
      if (error) console.error('[VisionAnalyzer] Delete failed:', error.message);
      else console.log('[VisionAnalyzer] Deleted:', storagePath);
    });
}

async function callGeminiWithRetry(
  contents: any,
  config: any,
  maxRetries = 3
): Promise<string> {
  const genAI = getGeminiClient();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await genAI.models.generateContent({
        model: MODELS.CHAT_FAST,
        contents,
        config,
      });
      return response.text || '';
    } catch (error: any) {
      lastError = error;
      const is429 =
        error.message?.includes('429') ||
        error.message?.includes('quota') ||
        error.message?.includes('rate limit') ||
        error.status === 429;

      if (is429 && attempt < maxRetries) {
        const wait = Math.pow(2, attempt) * 1000;
        console.log(`[VisionAnalyzer] Rate limit — waiting ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('Max retries exceeded');
}

// ============================================
// Image Analysis
// ============================================

export async function analyzeImageForChat(storagePath: string): Promise<string> {
  console.log('[VisionAnalyzer] Analyzing image:', storagePath);
  const start = Date.now();

  try {
    const { data: imageData, mimeType } = await downloadFromSupabase(storagePath);

    const prompt = `תאר מה אתה רואה בתמונה ב-2-3 משפטים בעברית.
התמקד בעצמים, אנשים, מוצרים, טקסט, מותגים.
אם יש טקסט בתמונה — ציין אותו.
תשובה קצרה וברורה בלבד, ללא JSON.`;

    const text = await callGeminiWithRetry(
      [
        {
          parts: [
            { text: prompt },
            {
              inlineData: { mimeType, data: imageData },
            },
          ],
        },
      ],
      { temperature: 0.3 }
    );

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[VisionAnalyzer] Image analyzed in ${elapsed}s (${text.length} chars)`);

    deleteFromSupabase(storagePath);
    return text.trim() || 'תמונה שלא ניתן לנתח';
  } catch (error: any) {
    console.error('[VisionAnalyzer] Image analysis failed:', error.message);
    deleteFromSupabase(storagePath);
    throw error;
  }
}

// ============================================
// Video Analysis (rich: vision + transcription + OCR)
// ============================================

export async function analyzeVideoForChat(storagePath: string): Promise<string> {
  console.log('[VisionAnalyzer] Analyzing video:', storagePath);
  const start = Date.now();

  try {
    const { data: videoData, mimeType } = await downloadFromSupabase(storagePath);

    const prompt = `אתה מנתח סרטונים. נתח את הסרטון הבא ותחזיר JSON:

{
  "visual_description": "תיאור ויזואלי מפורט של מה שקורה בסרטון (2-4 משפטים)",
  "transcription": "תמלול מילה-במילה של כל הדיבור בסרטון",
  "on_screen_text": ["כל טקסט שמופיע על המסך — כתוביות, כותרות, מחירים, שמות מותגים"],
  "products_mentioned": ["מוצרים, מותגים או שירותים שמוזכרים או נראים"],
  "mood": "מילה אחת שמתארת את האווירה (שמח/רציני/מצחיק/מעורר השראה/אינפורמטיבי)"
}

דגשים:
- תמלל את כל הדיבור בשפה המקורית
- השתמש ביכולת הראייה שלך לזהות טקסט על המסך
- זהה מוצרים ומותגים גם מהדיבור וגם מהתמונה
- אם אין דיבור, השאר transcription כמחרוזת ריקה
- החזר רק JSON תקין`;

    const text = await callGeminiWithRetry(
      [
        {
          parts: [
            { text: prompt },
            {
              inlineData: { mimeType, data: videoData },
              mediaResolution: { level: 'media_resolution_high' },
            },
          ],
        },
      ],
      { temperature: 0.3, responseMimeType: 'application/json' }
    );

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[VisionAnalyzer] Video analyzed in ${elapsed}s`);

    deleteFromSupabase(storagePath);

    // Parse structured JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Fallback: return raw text as description
      return text.trim() || 'סרטון שלא ניתן לנתח';
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as VideoAnalysis;
      return buildVideoDescription(parsed);
    } catch {
      return text.trim() || 'סרטון שלא ניתן לנתח';
    }
  } catch (error: any) {
    console.error('[VisionAnalyzer] Video analysis failed:', error.message);
    deleteFromSupabase(storagePath);
    throw error;
  }
}

function buildVideoDescription(v: VideoAnalysis): string {
  const lines: string[] = [];

  if (v.visual_description) {
    lines.push(`תיאור: ${v.visual_description}`);
  }

  if (v.transcription && v.transcription.trim()) {
    lines.push(`דיבור בסרטון: "${v.transcription.trim()}"`);
  }

  const screenText = (v.on_screen_text || []).filter(Boolean);
  if (screenText.length > 0) {
    lines.push(`טקסט על המסך: ${screenText.join(', ')}`);
  }

  const products = (v.products_mentioned || []).filter(Boolean);
  if (products.length > 0) {
    lines.push(`מוצרים שזוהו: ${products.join(', ')}`);
  }

  if (v.mood) {
    lines.push(`אווירה: ${v.mood}`);
  }

  return lines.join('\n') || 'סרטון שלא ניתן לנתח';
}

// ============================================
// Unified entry point
// ============================================

export async function analyzeMediaForChat(
  storagePath: string,
  mediaType: 'image' | 'video'
): Promise<{ description: string; mediaType: 'image' | 'video' }> {
  const description =
    mediaType === 'video'
      ? await analyzeVideoForChat(storagePath)
      : await analyzeImageForChat(storagePath);

  return { description, mediaType };
}
