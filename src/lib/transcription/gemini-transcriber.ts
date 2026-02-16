/**
 * Gemini Video Transcriber
 * תמלול סרטונים + OCR באמצעות Gemini 3 Flash (with high media resolution)
 * 
 * Models:
 * - Gemini 3 Flash (default): $0.50/$3 per 1M tokens - מהיר וזול, מצוין ל-OCR
 * - Gemini 3 Pro (optional): $2/$12 per 1M tokens - איטי ויקר, דיוק מקסימלי
 * 
 * Media Resolution for Video OCR:
 * - media_resolution_high: 280 tokens/frame (מומלץ לטקסט במסך)
 * - media_resolution_low: 70 tokens/frame (לא מספיק ל-OCR איכותי)
 */

import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';

// ============================================
// Type Definitions
// ============================================

export interface TranscriptionResult {
  transcription_text: string;
  language: string;
  on_screen_text: string[];
  speakers: SpeakerSegment[];
  confidence: number;
}

export interface SpeakerSegment {
  speaker_id: string;
  speaker_name?: string;
  text: string;
  start_time?: number;
  end_time?: number;
}

export interface TranscriptionInput {
  source_type: 'highlight_item' | 'story' | 'reel' | 'post';
  source_id: string;
  video_url: string;
  video_duration?: number;
}

export interface TranscriptionOutput {
  success: boolean;
  transcription?: TranscriptionResult;
  error?: string;
  tokens_used?: number;
  processing_cost?: number;
}

// ============================================
// Gemini Client Setup
// ============================================

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY is required');
  }
  
  return new GoogleGenAI(apiKey);
}

// ============================================
// Video Processing Functions
// ============================================

/**
 * Download video and convert to base64
 */
async function downloadVideoAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  console.log(`[Transcriber] Downloading video from: ${url.substring(0, 50)}...`);
  
  const response = await fetch(url, {
    signal: AbortSignal.timeout(120000), // 120s (2 minutes) timeout for video download
  });
  
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }
  
  const contentType = response.headers.get('content-type') || 'video/mp4';
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  
  console.log(`[Transcriber] Downloaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`);
  
  return {
    data: base64,
    mimeType: contentType,
  };
}

/**
 * Get video MIME type from URL or default
 */
function getVideoMimeType(url: string): string {
  if (url.includes('.mp4')) return 'video/mp4';
  if (url.includes('.webm')) return 'video/webm';
  if (url.includes('.mov')) return 'video/quicktime';
  return 'video/mp4';
}

// ============================================
// Transcription Functions
// ============================================

/**
 * Transcribe a video using Gemini 3 Pro
 */
/**
 * Helper: Retry logic with exponential backoff for 429 errors
 */
async function callGeminiWithRetry(
  genAI: GoogleGenAI,
  model: string,
  contents: any,
  config: any,
  maxRetries: number = 3
): Promise<any> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Transcriber] Attempt ${attempt}/${maxRetries} with model: ${model}`);
      
      const response = await genAI.models.generateContent({
        model,
        contents,
        config,
      });
      
      return response; // Success!
      
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a 429 (rate limit) error
      const is429 = error.message?.includes('429') || 
                    error.message?.includes('quota') ||
                    error.message?.includes('rate limit') ||
                    error.status === 429;
      
      if (is429 && attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`[Transcriber] ⚠️ Rate limit (429) - waiting ${waitTime/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue; // Retry
      }
      
      // If not 429, or no more retries, throw
      throw error;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

export async function transcribeVideo(
  input: TranscriptionInput
): Promise<TranscriptionOutput> {
  console.log(`[Transcriber] Starting transcription for ${input.source_type}:${input.source_id}`);
  
  const startTime = Date.now();
  
  try {
    // Download the video
    const { data: videoData, mimeType } = await downloadVideoAsBase64(input.video_url);
    
    // Initialize Gemini
    const genAI = getGeminiClient();
    
    // Build the prompt
    const prompt = `אתה מומחה לתמלול ואנליזה ויזואלית של סרטונים באינסטגרם.

⚡ אתה יכול לראות ולקרוא את הסרטון - לא רק לשמוע אותו!

תמלל את הסרטון הזה במדויק וחלץ את כל המידע הרלוונטי:

הנחיות - תמלול:
1. תמלל את כל הטקסט המדובר - מילה במילה, בשפה המקורית
2. זהה את שפת הדיבור הראשית
3. אם יש יותר מדובר אחד - הפרד לפי דוברים

הנחיות - OCR (טקסט על המסך):
4. **CRITICAL**: חפש וחלץ כל טקסט שמופיע על המסך:
   - כותרות וסאבטייטלים
   - טקסט overlay (מתכונים, רשימות קניות, שמות מוצרים)
   - מספרים (מחירים, כמויות)
   - שמות מותגים
   - כל טקסט אחר שנראה בפריים
5. אם הטקסט קטן או לא ברור - השתמש ביכולות הראייה שלך לזהות אותו
6. שמור על דיוק מקסימלי - אל תוסיף מידע שלא קיים בסרטון

פורמט התשובה - JSON בלבד:
{
  "transcription_text": "התמלול המלא של הסרטון",
  "language": "he/en/ar/ru/other",
  "on_screen_text": ["טקסט 1 מהמסך", "טקסט 2 מהמסך"],
  "speakers": [
    {
      "speaker_id": "speaker_1",
      "speaker_name": "שם הדובר אם ידוע",
      "text": "מה הדובר אמר"
    }
  ],
  "confidence": 0.95
}

אם הסרטון לא מכיל דיבור (רק מוזיקה או אפקטים):
{
  "transcription_text": "",
  "language": "none",
  "on_screen_text": ["טקסט אם יש"],
  "speakers": [],
  "confidence": 1.0
}

חשוב: החזר רק JSON תקין, ללא טקסט נוסף.`;

    console.log(`[Transcriber] Calling Gemini 3 Flash with HIGH media resolution for OCR...`);
    
    // Call Gemini with video (with automatic retry on 429)
    // ⚡ CRITICAL: Use media_resolution_high for TEXT-HEAVY videos (OCR)
    const response = await callGeminiWithRetry(
      genAI,
      'gemini-3-flash-preview', // ⚡ Gemini 3 Flash Preview (1M context, cheap!)
      [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: videoData,
              },
              // ⚡ NEW: High resolution for OCR (280 tokens/frame instead of 70)
              mediaResolution: {
                level: 'media_resolution_high'
              },
            },
          ],
        },
      ],
      {
        temperature: 0.3, // Lower for more consistent transcription
        responseMimeType: 'application/json',
      }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Transcriber] Gemini responded in ${elapsed}s`);

    // Parse response
    const text = response.text || '';
    console.log(`[Transcriber] Response length: ${text.length} characters`);

    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as TranscriptionResult;

    // Validate required fields
    if (typeof parsed.transcription_text !== 'string') {
      parsed.transcription_text = '';
    }
    if (!parsed.language) {
      parsed.language = 'unknown';
    }
    if (!Array.isArray(parsed.on_screen_text)) {
      parsed.on_screen_text = [];
    }
    if (!Array.isArray(parsed.speakers)) {
      parsed.speakers = [];
    }
    if (typeof parsed.confidence !== 'number') {
      parsed.confidence = 0.8;
    }

    // Estimate tokens (rough estimate based on video duration)
    const tokensUsed = Math.ceil((input.video_duration || 30) * 100); // ~100 tokens per second of video
    const processingCost = tokensUsed * 0.000002; // Rough estimate

    console.log(`[Transcriber] Success: ${parsed.transcription_text.length} chars, language: ${parsed.language}`);

    return {
      success: true,
      transcription: parsed,
      tokens_used: tokensUsed,
      processing_cost: processingCost,
    };

  } catch (error: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[Transcriber] Failed after ${elapsed}s:`, error.message);

    return {
      success: false,
      error: error.message,
    };
  }
}

// ============================================
// Database Functions
// ============================================

/**
 * Save transcription to database
 */
export async function saveTranscription(
  accountId: string,
  input: TranscriptionInput,
  output: TranscriptionOutput
): Promise<string | null> {
  const supabase = await createClient();

  if (!output.success || !output.transcription) {
    // Save failed transcription for retry
    const { data, error } = await supabase
      .from('instagram_transcriptions')
      .upsert({
        account_id: accountId,
        source_type: input.source_type,
        source_id: input.source_id,
        video_url: input.video_url,
        video_duration: input.video_duration,
        processing_status: 'failed',
        error_message: output.error,
        gemini_model_used: 'gemini-3-flash-preview',
      }, {
        onConflict: 'source_type,source_id',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Transcriber] Error saving failed transcription:', error);
      return null;
    }

    return data?.id || null;
  }

  // Save successful transcription
  const { data, error } = await supabase
    .from('instagram_transcriptions')
    .upsert({
      account_id: accountId,
      source_type: input.source_type,
      source_id: input.source_id,
      video_url: input.video_url,
      video_duration: input.video_duration,
      transcription_text: output.transcription.transcription_text,
      language: output.transcription.language,
      on_screen_text: output.transcription.on_screen_text,
      speakers: output.transcription.speakers,
      gemini_model_used: 'gemini-3-flash-preview',
      processing_status: 'completed',
      tokens_used: output.tokens_used,
      processing_cost: output.processing_cost,
      processed_at: new Date().toISOString(),
    }, {
      onConflict: 'source_type,source_id',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Transcriber] Error saving transcription:', error);
    return null;
  }

  // Update source table status
  await updateSourceTranscriptionStatus(
    supabase,
    input.source_type,
    input.source_id,
    'completed'
  );

  console.log(`[Transcriber] Saved transcription: ${data?.id}`);
  return data?.id || null;
}

/**
 * Update transcription status on source table
 */
async function updateSourceTranscriptionStatus(
  supabase: any,
  sourceType: string,
  sourceId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed'
): Promise<void> {
  let tableName: string | null = null;

  switch (sourceType) {
    case 'highlight_item':
      tableName = 'instagram_highlight_items';
      break;
    case 'story':
      tableName = 'instagram_stories';
      break;
    // Posts/reels don't have transcription_status column
  }

  if (tableName) {
    await supabase
      .from(tableName)
      .update({ transcription_status: status })
      .eq('id', sourceId);
  }
}

// ============================================
// Batch Processing Functions
// ============================================

/**
 * Process pending transcriptions for an account
 */
export async function processPendingTranscriptions(
  accountId: string,
  limit: number = 5
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const supabase = await createClient();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // Get pending videos from highlight items
  const { data: highlightItems } = await supabase
    .from('instagram_highlight_items')
    .select('id, media_url, video_duration')
    .eq('account_id', accountId)
    .eq('media_type', 'video')
    .eq('transcription_status', 'pending')
    .limit(limit);

  // Get pending videos from stories
  const { data: stories } = await supabase
    .from('instagram_stories')
    .select('id, media_url, video_duration')
    .eq('account_id', accountId)
    .eq('media_type', 'video')
    .eq('transcription_status', 'pending')
    .limit(limit);

  // Get reels without transcription
  const { data: reels } = await supabase
    .from('instagram_posts')
    .select('id, media_urls, video_duration')
    .eq('account_id', accountId)
    .eq('type', 'reel')
    .limit(limit);

  // Filter reels that don't have transcription yet
  const reelsToProcess: any[] = [];
  if (reels) {
    for (const reel of reels) {
      const { data: existing } = await supabase
        .from('instagram_transcriptions')
        .select('id')
        .eq('source_type', 'reel')
        .eq('source_id', reel.id)
        .single();

      if (!existing) {
        reelsToProcess.push(reel);
      }
    }
  }

  // Combine all pending items
  const pendingItems: TranscriptionInput[] = [];

  if (highlightItems) {
    for (const item of highlightItems) {
      if (item.media_url) {
        pendingItems.push({
          source_type: 'highlight_item',
          source_id: item.id,
          video_url: item.media_url,
          video_duration: item.video_duration,
        });
      }
    }
  }

  if (stories) {
    for (const story of stories) {
      if (story.media_url) {
        pendingItems.push({
          source_type: 'story',
          source_id: story.id,
          video_url: story.media_url,
          video_duration: story.video_duration,
        });
      }
    }
  }

  for (const reel of reelsToProcess) {
    const videoUrl = reel.media_urls?.[0]?.url || reel.media_urls?.[0];
    if (videoUrl) {
      pendingItems.push({
        source_type: 'reel',
        source_id: reel.id,
        video_url: videoUrl,
        video_duration: reel.video_duration,
      });
    }
  }

  console.log(`[Transcriber] Found ${pendingItems.length} pending videos`);

  // Process each item (up to limit)
  for (const item of pendingItems.slice(0, limit)) {
    processed++;

    // Mark as processing
    await updateSourceTranscriptionStatus(supabase, item.source_type, item.source_id, 'processing');

    // Transcribe
    const result = await transcribeVideo(item);

    // Save result
    await saveTranscription(accountId, item, result);

    if (result.success) {
      succeeded++;
    } else {
      failed++;
      // Mark as failed
      await updateSourceTranscriptionStatus(supabase, item.source_type, item.source_id, 'failed');
    }

    // Small delay between transcriptions
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`[Transcriber] Processed: ${processed}, Succeeded: ${succeeded}, Failed: ${failed}`);

  return { processed, succeeded, failed };
}

/**
 * Get transcription for a specific source
 */
export async function getTranscription(
  sourceType: string,
  sourceId: string
): Promise<TranscriptionResult | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('instagram_transcriptions')
    .select('transcription_text, language, on_screen_text, speakers')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .eq('processing_status', 'completed')
    .single();

  if (error || !data) {
    return null;
  }

  return {
    transcription_text: data.transcription_text || '',
    language: data.language || 'unknown',
    on_screen_text: data.on_screen_text || [],
    speakers: data.speakers || [],
    confidence: 1.0,
  };
}

/**
 * Get all transcriptions for an account
 */
export async function getAllTranscriptions(
  accountId: string
): Promise<{
  source_type: string;
  source_id: string;
  transcription_text: string;
  language: string;
}[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('instagram_transcriptions')
    .select('source_type, source_id, transcription_text, language')
    .eq('account_id', accountId)
    .eq('processing_status', 'completed');

  if (error) {
    console.error('[Transcriber] Error getting transcriptions:', error);
    return [];
  }

  return data || [];
}
