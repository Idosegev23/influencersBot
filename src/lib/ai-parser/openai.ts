// GPT-5.2 Vision Parser

import OpenAI from 'openai';
import { getPrompt } from './prompts';
import { fileToBase64, calculateConfidence, retryWithBackoff } from './utils';
import type { ParseOptions, ParseResult } from './types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Parse document using OpenAI GPT-5.2 Vision
 */
export async function parseWithOpenAI(options: ParseOptions): Promise<ParseResult> {
  const startTime = Date.now();
  const { file, documentType, language = 'auto' } = options;

  try {
    console.log(`[OpenAI] Parsing ${file.name} as ${documentType}...`);

    // Convert file to base64
    const base64 = await fileToBase64(file);
    const mimeType = file.type || 'application/pdf';

    // Get prompt
    const prompt = getPrompt(documentType, language);

    // GPT-5.2 supports multimodal input (PDF, DOCX, PPTX, images)
    const result = await retryWithBackoff(async () => {
      return await openai.chat.completions.create({
        model: 'gpt-5.2-2025-12-11',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
      });
    }, 3, 2000);

    const text = result.choices[0]?.message?.content || '';

    console.log('[OpenAI] Raw response (first 500 chars):', text.substring(0, 500));

    // Parse JSON (response_format: json_object guarantees valid JSON)
    const parsed = JSON.parse(text);

    console.log('[OpenAI] Parsed JSON successfully');
    console.log('[OpenAI] Full parsed data:', JSON.stringify(parsed, null, 2));

    // Calculate confidence
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
    console.error('[OpenAI] Error:', error);

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
