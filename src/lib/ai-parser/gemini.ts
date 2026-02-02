// Gemini Vision Parser

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getPrompt } from './prompts';
import { fileToBase64, calculateConfidence, retryWithBackoff } from './utils';
import type { ParseOptions, ParseResult } from './types';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY || '');

/**
 * Parse document using Google Gemini Vision
 */
export async function parseWithGemini(options: ParseOptions): Promise<ParseResult> {
  const startTime = Date.now();
  const { file, documentType, language = 'auto' } = options;

  try {
    console.log(`[Gemini] Parsing ${file.name} as ${documentType}...`);

    // Convert file to base64
    const base64 = await fileToBase64(file);
    const mimeType = file.type || 'application/pdf';

    // Get prompt
    const prompt = getPrompt(documentType, language);

    // Initialize model (Gemini 3 Pro - most powerful, takes longer but best results)
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-pro-preview-20251117',
      generationConfig: {
        temperature: 0.1, // Low temperature for accuracy
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    // Generate content with retry
    const result = await retryWithBackoff(async () => {
      return await model.generateContent([
        {
          inlineData: {
            data: base64,
            mimeType: mimeType,
          },
        },
        prompt,
      ]);
    }, 3, 2000);

    const response = result.response;
    const text = response.text();

    console.log('[Gemini] Raw response (first 500 chars):', text.substring(0, 500));

    // Parse JSON
    let parsed: any;
    try {
      parsed = JSON.parse(text);
      console.log('[Gemini] ✅ Parsed JSON successfully');
    } catch (parseError) {
      console.error('[Gemini] JSON parse error:', parseError);
      // Try to extract JSON from text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
        console.log('[Gemini] ✅ Extracted and parsed JSON from response');
      } else {
        throw new Error('Failed to parse JSON from response');
      }
    }

    // Log full parsed data for debugging
    console.log('[Gemini] 📊 Full parsed data:', JSON.stringify(parsed, null, 2));

    // Calculate confidence
    const confidence = calculateConfidence(parsed, documentType);

    const duration = Date.now() - startTime;

    console.log(`[Gemini] ✅ Success! Confidence: ${(confidence * 100).toFixed(1)}%, Duration: ${duration}ms`);
    console.log(`[Gemini] 🎯 Key fields extracted:`, {
      brand: parsed.parties?.brand,
      amount: parsed.paymentTerms?.totalAmount,
      deliverables: parsed.deliverables?.length,
      dates: { effective: parsed.effectiveDate, expiry: parsed.expiryDate }
    });

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
    console.error('[Gemini] ❌ Error:', error);

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
        model: 'gemini',
        attemptNumber: 1,
        error: result.reason?.message || 'Unknown error',
      };
    }
  });
}

