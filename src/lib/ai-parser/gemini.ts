// Gemini Multi-Modal Parser
// Supports: Vision (images/PDFs), Audio (MP3/WAV/M4A), Video (MP4/MOV), Text, URL

import { getGeminiClient, MODELS } from '@/lib/ai/google-client';
import { getPrompt } from './prompts';
import { fileToBase64, calculateConfidence, retryWithBackoff } from './utils';
import type { ParseOptions, ParseResult } from './types';

/** MIME types that Gemini Vision supports */
export const VISION_SUPPORTED_MIMES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
];

/** MIME types for audio that Gemini can process directly */
export const AUDIO_MIMES = [
  'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/aac',
  'audio/ogg', 'audio/flac', 'audio/aiff', 'audio/opus', 'audio/webm',
];

/** MIME types for video that Gemini can process directly */
export const VIDEO_MIMES = [
  'video/mp4', 'video/mpeg', 'video/mov', 'video/quicktime',
  'video/avi', 'video/webm', 'video/wmv', 'video/3gpp',
];

/** All MIME types Gemini can accept as inline data */
export const GEMINI_INLINE_MIMES = [
  ...VISION_SUPPORTED_MIMES,
  ...AUDIO_MIMES,
  ...VIDEO_MIMES,
];

/**
 * Robust JSON parser with multiple fallback strategies.
 * Handles: direct parse, markdown fences, embedded JSON, trailing commas, truncated responses.
 */
function robustJsonParse(text: string, label: string): any {
  // 1. Direct parse
  try {
    const parsed = JSON.parse(text);
    console.log(`[${label}] ✅ JSON parsed directly`);
    return parsed;
  } catch {}

  // 2. Strip markdown code fences
  const stripped = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');
  try {
    const parsed = JSON.parse(stripped);
    console.log(`[${label}] ✅ JSON parsed after stripping markdown fences`);
    return parsed;
  } catch {}

  // 3. Extract JSON object from text
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`[${label}] ✅ JSON extracted from response text`);
      return parsed;
    } catch {}

    // 4. Fix common issues: trailing commas
    const fixed = jsonMatch[0].replace(/,\s*([\]}])/g, '$1');
    try {
      const parsed = JSON.parse(fixed);
      console.log(`[${label}] ✅ JSON parsed after fixing trailing commas`);
      return parsed;
    } catch {}

    // 5. Truncated JSON — try to close open brackets/braces
    let truncated = fixed;
    const openBraces = (truncated.match(/\{/g) || []).length;
    const closeBraces = (truncated.match(/\}/g) || []).length;
    const openBrackets = (truncated.match(/\[/g) || []).length;
    const closeBrackets = (truncated.match(/\]/g) || []).length;

    truncated = truncated.replace(/,\s*"[^"]*$/, '');
    truncated = truncated.replace(/,\s*$/, '');
    truncated = truncated.replace(/:\s*"[^"]*$/, ': null');
    truncated = truncated.replace(/:\s*\[?\s*$/, ': []');

    for (let i = 0; i < openBrackets - closeBrackets; i++) truncated += ']';
    for (let i = 0; i < openBraces - closeBraces; i++) truncated += '}';

    try {
      const parsed = JSON.parse(truncated);
      console.log(`[${label}] ⚠️ JSON parsed after fixing truncation (${openBraces - closeBraces} unclosed braces)`);
      return parsed;
    } catch {}
  }

  console.error(`[${label}] ❌ All JSON parse attempts failed. Response (first 500 chars):`, text.substring(0, 500));
  throw new Error(`Failed to parse JSON from ${label} response`);
}

/**
 * Parse document using Google Gemini Vision (images, PDFs)
 */
export async function parseWithGemini(options: ParseOptions): Promise<ParseResult> {
  const startTime = Date.now();
  const { file, documentType, language = 'auto' } = options;

  try {
    console.log(`[Gemini] Parsing ${file.name} as ${documentType}...`);

    const base64 = await fileToBase64(file);
    const mimeType = file.type || 'application/pdf';
    const prompt = getPrompt(documentType, language);

    const client = getGeminiClient();
    const result = await retryWithBackoff(async () => {
      return await client.models.generateContent({
        model: MODELS.COMPLEX,
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { data: base64, mimeType } },
            { text: prompt },
          ],
        }],
        config: {
          temperature: 0.1,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
        },
      });
    }, 3, 2000);

    const text = result.text || '';
    console.log('[Gemini] Raw response (first 500 chars):', text.substring(0, 500));

    const parsed = robustJsonParse(text, 'Gemini');
    console.log('[Gemini] 📊 Parsed data keys:', Object.keys(parsed));

    const confidence = calculateConfidence(parsed, documentType);
    const duration = Date.now() - startTime;

    console.log(`[Gemini] ✅ Success! Confidence: ${(confidence * 100).toFixed(1)}%, Duration: ${duration}ms`);

    return {
      success: true,
      data: parsed,
      confidence,
      model: 'gemini',
      attemptNumber: 1,
      duration_ms: duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Gemini] ❌ Error:', error.message || error);
    return {
      success: false,
      data: null,
      confidence: 0,
      model: 'gemini',
      attemptNumber: 1,
      error: error.message || String(error),
      duration_ms: duration,
    };
  }
}

/**
 * Parse document using Gemini with extracted text (no vision — text-based deep analysis)
 * Layer 3: Takes pre-extracted text and analyzes it deeply
 */
export async function parseWithGeminiText(
  options: ParseOptions & { extractedText: string }
): Promise<ParseResult> {
  const startTime = Date.now();
  const { file, documentType, language = 'auto', extractedText } = options;

  try {
    console.log(`[Gemini-Text] Deep text analysis for ${file.name} (${extractedText.length} chars)...`);

    const structuredPrompt = getPrompt(documentType, language);
    const fullPrompt = `${structuredPrompt}

--- תחילת תוכן המסמך ---
${extractedText}
--- סוף תוכן המסמך ---

חלץ את כל המידע מהטקסט למעלה. זה טקסט שחולץ ישירות מהקובץ "${file.name}".
אם הטקסט מכיל מידע שלא מתאים לסכמה, הוסף אותו בשדה content או keyPoints.
החזר רק JSON תקין.`;

    const client = getGeminiClient();
    const result = await retryWithBackoff(async () => {
      return await client.models.generateContent({
        model: MODELS.COMPLEX,
        contents: fullPrompt,
        config: {
          temperature: 0.1,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
        },
      });
    }, 3, 2000);

    const text = result.text || '';
    console.log('[Gemini-Text] Raw response (first 500 chars):', text.substring(0, 500));

    const parsed = robustJsonParse(text, 'Gemini-Text');
    const confidence = calculateConfidence(parsed, documentType);
    const duration = Date.now() - startTime;

    console.log(`[Gemini-Text] Success! Confidence: ${(confidence * 100).toFixed(1)}%, Duration: ${duration}ms`);

    return {
      success: true,
      data: parsed,
      confidence,
      model: 'gemini',
      attemptNumber: 1,
      duration_ms: duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Gemini-Text] Error:', error.message);
    return {
      success: false,
      data: null,
      confidence: 0,
      model: 'gemini',
      attemptNumber: 1,
      error: error.message || String(error),
      duration_ms: duration,
    };
  }
}

/**
 * Process audio file with Gemini — transcription + structured extraction
 * Gemini handles: MP3, WAV, M4A, AAC, FLAC, OGG, AIFF, OPUS, WEBM
 */
export async function parseAudioWithGemini(
  options: ParseOptions
): Promise<ParseResult & { transcription?: string }> {
  const startTime = Date.now();
  const { file, documentType, language = 'auto' } = options;
  const mimeType = file.type || 'audio/mp3';

  try {
    console.log(`[Gemini-Audio] Processing ${file.name} (${mimeType})...`);

    const base64 = await fileToBase64(file);
    const structuredPrompt = getPrompt(documentType, language);

    const prompt = `קודם תמלל את האודיו במדויק, ואז חלץ מידע מובנה מהתמלול.

שלב 1 - תמלול:
תמלל את כל מה שנאמר, כולל זיהוי דוברים אם יש יותר מאחד.

שלב 2 - חילוץ מידע מובנה:
${structuredPrompt}

החזר JSON עם המבנה:
{
  "transcription": "התמלול המלא של האודיו",
  ... (שאר השדות לפי הפרומפט למעלה)
}

החזר רק JSON תקין.`;

    const client = getGeminiClient();
    const result = await retryWithBackoff(async () => {
      return await client.models.generateContent({
        model: MODELS.COMPLEX,
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { data: base64, mimeType } },
            { text: prompt },
          ],
        }],
        config: {
          temperature: 0.1,
          topP: 0.95,
          maxOutputTokens: 32768, // Audio transcriptions can be long
          responseMimeType: 'application/json',
        },
      });
    }, 3, 3000);

    const text = result.text || '';
    console.log('[Gemini-Audio] Raw response (first 500 chars):', text.substring(0, 500));

    const parsed = robustJsonParse(text, 'Gemini-Audio');
    const transcription = parsed.transcription || '';

    // Remove transcription from data to avoid duplication in RAG
    const { transcription: _, ...dataWithoutTranscription } = parsed;

    const confidence = calculateConfidence(dataWithoutTranscription, documentType);
    const duration = Date.now() - startTime;

    console.log(`[Gemini-Audio] Success! Transcription: ${transcription.length} chars, Confidence: ${(confidence * 100).toFixed(1)}%, Duration: ${duration}ms`);

    return {
      success: true,
      data: dataWithoutTranscription,
      confidence: Math.max(confidence, transcription.length > 50 ? 0.8 : 0.5),
      model: 'gemini',
      attemptNumber: 1,
      duration_ms: duration,
      transcription,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Gemini-Audio] Error:', error.message);
    return {
      success: false,
      data: null,
      confidence: 0,
      model: 'gemini',
      attemptNumber: 1,
      error: error.message || String(error),
      duration_ms: duration,
    };
  }
}

/**
 * Process video file with Gemini — visual + audio analysis
 * Gemini processes both video frames AND audio track simultaneously
 */
export async function parseVideoWithGemini(
  options: ParseOptions
): Promise<ParseResult & { transcription?: string }> {
  const startTime = Date.now();
  const { file, documentType, language = 'auto' } = options;
  const mimeType = file.type || 'video/mp4';

  try {
    console.log(`[Gemini-Video] Processing ${file.name} (${mimeType}, ${(file.size / 1024 / 1024).toFixed(1)}MB)...`);

    const base64 = await fileToBase64(file);
    const structuredPrompt = getPrompt(documentType, language);

    const prompt = `נתח את הסרטון הזה — גם את התוכן החזותי וגם את האודיו.

שלב 1 - תמלול:
תמלל את כל הדיבור בסרטון, כולל זיהוי דוברים.

שלב 2 - ניתוח חזותי:
תאר טקסטים, לוגואים, מוצרים, או מידע חזותי שמופיע בסרטון.

שלב 3 - חילוץ מידע מובנה:
${structuredPrompt}

החזר JSON עם המבנה:
{
  "transcription": "התמלול המלא של האודיו בסרטון",
  "visual_content": "תיאור התוכן החזותי המשמעותי",
  ... (שאר השדות לפי הפרומפט למעלה)
}

החזר רק JSON תקין.`;

    const client = getGeminiClient();
    const result = await retryWithBackoff(async () => {
      return await client.models.generateContent({
        model: MODELS.COMPLEX,
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { data: base64, mimeType } },
            { text: prompt },
          ],
        }],
        config: {
          temperature: 0.1,
          topP: 0.95,
          maxOutputTokens: 32768,
          responseMimeType: 'application/json',
        },
      });
    }, 3, 5000);

    const text = result.text || '';
    console.log('[Gemini-Video] Raw response (first 500 chars):', text.substring(0, 500));

    const parsed = robustJsonParse(text, 'Gemini-Video');
    const transcription = parsed.transcription || '';
    const visualContent = parsed.visual_content || '';

    const { transcription: _, visual_content: __, ...dataWithoutMedia } = parsed;

    const confidence = calculateConfidence(dataWithoutMedia, documentType);
    const duration = Date.now() - startTime;

    console.log(`[Gemini-Video] Success! Transcription: ${transcription.length} chars, Visual: ${visualContent.length} chars, Duration: ${duration}ms`);

    return {
      success: true,
      data: { ...dataWithoutMedia, visual_content: visualContent },
      confidence: Math.max(confidence, (transcription.length + visualContent.length) > 50 ? 0.8 : 0.5),
      model: 'gemini',
      attemptNumber: 1,
      duration_ms: duration,
      transcription,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Gemini-Video] Error:', error.message);
    return {
      success: false,
      data: null,
      confidence: 0,
      model: 'gemini',
      attemptNumber: 1,
      error: error.message || String(error),
      duration_ms: duration,
    };
  }
}

/**
 * Process a URL — Gemini fetches the page and extracts content
 * Uses Gemini URL Context tool
 */
export async function parseUrlWithGemini(
  url: string,
  language: string = 'auto'
): Promise<ParseResult & { extractedText?: string }> {
  const startTime = Date.now();

  try {
    console.log(`[Gemini-URL] Processing URL: ${url}`);

    const prompt = `נתח את תוכן הדף בקישור ובצע חילוץ מידע מלא.

חלץ את כל המידע השימושי מהדף, כולל:

{
  "title": "כותרת הדף (string)",
  "content": "תקציר מקיף של תוכן הדף (string)",
  "keyPoints": ["נקודות מרכזיות"],
  "contacts": [{"name": "שם", "email": "", "phone": ""}],
  "coupon_codes": [{"code": "קוד", "brand_name": "", "discount_type": "", "discount_value": null, "description": ""}],
  "knowledge_entries": [
    {
      "title": "כותרת פריט ידע",
      "content": "התוכן המלא",
      "knowledge_type": "faq/custom/brand_info",
      "keywords": ["מילות חיפוש"]
    }
  ],
  "page_text": "הטקסט המלא של הדף (לשימוש ב-RAG)"
}

הנחיות:
- חלץ כל שאלה/תשובה כ-knowledge_entry עם type=faq
- חלץ מידע על מוצרים/מותגים כ-knowledge_entry עם type=brand_info
- חלץ מידע כללי (שעות, מדיניות, מחירים) כ-knowledge_entry עם type=custom
- חלץ קודי קופון אם קיימים
- בשדה page_text — הכנס את כל הטקסט הגולמי של הדף

החזר רק JSON תקין.`;

    const client = getGeminiClient();
    const result = await retryWithBackoff(async () => {
      return await client.models.generateContent({
        model: MODELS.COMPLEX,
        contents: `${prompt}\n\nURL: ${url}`,
        config: {
          temperature: 0.1,
          topP: 0.95,
          maxOutputTokens: 32768,
          responseMimeType: 'application/json',
          tools: [{ urlContext: {} }],
        },
      });
    }, 3, 3000);

    const text = result.text || '';
    console.log('[Gemini-URL] Raw response (first 500 chars):', text.substring(0, 500));

    const parsed = robustJsonParse(text, 'Gemini-URL');
    const pageText = parsed.page_text || parsed.content || '';
    const { page_text: _, ...dataWithoutPageText } = parsed;

    const duration = Date.now() - startTime;

    // Calculate confidence based on content richness
    const hasContent = (parsed.content?.length || 0) > 50;
    const hasKnowledge = (parsed.knowledge_entries?.length || 0) > 0;
    const confidence = hasContent ? (hasKnowledge ? 0.9 : 0.75) : 0.5;

    console.log(`[Gemini-URL] Success! Content: ${parsed.content?.length || 0} chars, Knowledge: ${parsed.knowledge_entries?.length || 0} entries, Duration: ${duration}ms`);

    return {
      success: true,
      data: dataWithoutPageText,
      confidence,
      model: 'gemini',
      attemptNumber: 1,
      duration_ms: duration,
      extractedText: pageText,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Gemini-URL] Error:', error.message);
    return {
      success: false,
      data: null,
      confidence: 0,
      model: 'gemini',
      attemptNumber: 1,
      error: error.message || String(error),
      duration_ms: duration,
    };
  }
}

/**
 * Parse multiple documents in parallel
 */
export async function parseMultipleWithGemini(
  files: ParseOptions[]
): Promise<ParseResult[]> {
  console.log(`[Gemini] Parsing ${files.length} documents in parallel...`);

  const results = await Promise.allSettled(
    files.map(options => parseWithGemini(options))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.error(`[Gemini] Document ${index + 1} failed:`, result.reason);
      return {
        success: false,
        data: null,
        confidence: 0,
        model: 'gemini' as const,
        attemptNumber: 1,
        error: result.reason?.message || 'Unknown error',
      };
    }
  });
}
