// GPT-5.2 Parser (Vision for images, Text for documents)

import OpenAI from 'openai';
import { getPrompt } from './prompts';
import { fileToBase64, calculateConfidence, retryWithBackoff } from './utils';
import type { ParseOptions, ParseResult } from './types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// MIME types that OpenAI vision API accepts
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Parse document using OpenAI GPT-5.2
 * - Images → Vision API (image_url)
 * - PDFs/Docs → Text API (requires pre-extracted text via extractedText option)
 */
export async function parseWithOpenAI(
  options: ParseOptions & { extractedText?: string }
): Promise<ParseResult> {
  const startTime = Date.now();
  const { file, documentType, language = 'auto', extractedText } = options;
  const mimeType = file.type || 'application/pdf';
  const isImage = IMAGE_MIME_TYPES.includes(mimeType);

  try {
    console.log(`[OpenAI] Parsing ${file.name} as ${documentType} (mode: ${isImage ? 'vision' : 'text'})...`);

    const prompt = getPrompt(documentType, language);

    let messages: any[];

    if (isImage) {
      // Images → use vision API with base64
      const base64 = await fileToBase64(file);
      messages = [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            { type: 'text', text: prompt },
          ],
        },
      ];
    } else if (extractedText && extractedText.trim().length > 0) {
      // PDFs/Docs → use extracted text
      console.log(`[OpenAI] Using pre-extracted text (${extractedText.length} chars)`);
      messages = [
        {
          role: 'user',
          content: `${prompt}\n\n--- תחילת תוכן המסמך ---\n${extractedText}\n--- סוף תוכן המסמך ---\n\nזה טקסט שחולץ מהקובץ "${file.name}". חלץ את כל המידע והחזר רק JSON תקין.`,
        },
      ];
    } else {
      // No extracted text available for non-image file
      console.log(`[OpenAI] No extracted text for non-image file ${file.name}, skipping`);
      return {
        success: false,
        data: null,
        confidence: 0,
        model: 'openai',
        attemptNumber: 1,
        error: 'Non-image file without extracted text — cannot process',
        duration_ms: Date.now() - startTime,
      };
    }

    const result = await retryWithBackoff(async () => {
      return await openai.chat.completions.create({
        model: 'gpt-5.2-2025-12-11',
        messages,
        temperature: 0.1,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
      });
    }, 3, 2000);

    const text = result.choices[0]?.message?.content || '';

    console.log('[OpenAI] Raw response (first 500 chars):', text.substring(0, 500));

    const parsed = JSON.parse(text);

    console.log('[OpenAI] Parsed JSON successfully');

    const confidence = calculateConfidence(parsed, documentType);
    const duration = Date.now() - startTime;

    console.log(`[OpenAI] Success! Confidence: ${(confidence * 100).toFixed(1)}%, Duration: ${duration}ms`);

    return {
      success: true,
      data: parsed,
      confidence,
      model: 'openai',
      attemptNumber: 1,
      duration_ms: duration,
    };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[OpenAI] Error:', error.message);

    return {
      success: false,
      data: null,
      confidence: 0,
      model: 'openai',
      attemptNumber: 1,
      error: error.message || String(error),
      duration_ms: duration,
    };
  }
}
