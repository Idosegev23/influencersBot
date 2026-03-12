// AI Parser Main Entry Point
// Multi-Layer Document Analysis Pipeline

import { parseWithOpenAI } from './openai';
import {
  parseWithGemini, parseWithGeminiText,
  parseAudioWithGemini, parseVideoWithGemini, parseUrlWithGemini,
  VISION_SUPPORTED_MIMES, AUDIO_MIMES, VIDEO_MIMES,
} from './gemini';
import { extractTextFromFile } from './text-extractor';
import { CONFIDENCE_THRESHOLD } from './types';
import type { ParseOptions, ParseResult } from './types';

/**
 * Multi-Layer Document Analysis Result
 */
export interface MultiLayerResult extends ParseResult {
  /** Raw text extracted from the file (Layer 1) */
  extractedText?: string;
  /** Which layers completed successfully */
  layers?: {
    textExtraction: boolean;
    visionAnalysis: boolean;
    textAnalysis: boolean;
  };
}

/**
 * Parse document with multi-layer analysis
 *
 * 3-Layer Strategy:
 *   Layer 1: Text Extraction — pdf-parse for PDFs, raw text for text files
 *   Layer 2: Vision Analysis — Gemini 3 Pro vision (for images + visual documents)
 *   Layer 3: Text-based AI Analysis — Gemini analyzes extracted text deeply
 *
 * Fallback chain:
 *   - Gemini (primary) → OpenAI GPT-5.2 (fallback)
 *   - Vision (for images) ↔ Text analysis (for PDFs/docs)
 *
 * OpenAI is used separately for embeddings only (in RAG pipeline).
 */
export async function parseDocument(options: ParseOptions): Promise<MultiLayerResult> {
  const { file, documentType, language = 'auto' } = options;
  const mimeType = file.type || 'application/pdf';
  const isImage = mimeType.startsWith('image/');
  const isAudio = AUDIO_MIMES.includes(mimeType);
  const isVideo = VIDEO_MIMES.includes(mimeType);
  const canUseVision = VISION_SUPPORTED_MIMES.includes(mimeType);

  console.log(`[AI Parser] Starting multi-layer analysis: ${file.name}`);
  console.log(`[AI Parser] Type: ${documentType}, MIME: ${mimeType}, Language: ${language}, Vision: ${canUseVision}, Audio: ${isAudio}, Video: ${isVideo}`);

  // ========================================
  // Special path: Audio files → Gemini Audio
  // ========================================
  if (isAudio) {
    console.log(`[AI Parser] Audio file detected — using Gemini Audio processing`);
    const audioResult = await parseAudioWithGemini(options);
    return {
      ...audioResult,
      extractedText: audioResult.transcription || undefined,
      layers: { textExtraction: false, visionAnalysis: false, textAnalysis: true },
    };
  }

  // ========================================
  // Special path: Video files → Gemini Video
  // ========================================
  if (isVideo) {
    console.log(`[AI Parser] Video file detected — using Gemini Video processing`);
    const videoResult = await parseVideoWithGemini(options);
    return {
      ...videoResult,
      extractedText: videoResult.transcription || undefined,
      layers: { textExtraction: false, visionAnalysis: true, textAnalysis: true },
    };
  }

  const layers = {
    textExtraction: false,
    visionAnalysis: false,
    textAnalysis: false,
  };

  // ========================================
  // Layer 1: Text Extraction (non-AI)
  // ========================================
  let extractedText = '';
  if (!isImage) {
    try {
      console.log(`[AI Parser] Layer 1: Text extraction...`);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const extraction = await extractTextFromFile(buffer, mimeType, file.name);

      if (extraction.success && extraction.text.trim().length > 50) {
        extractedText = extraction.text;
        layers.textExtraction = true;
        console.log(`[AI Parser] Layer 1 OK: ${extraction.charCount} chars, ${extraction.pageCount || '?'} pages (${extraction.method})`);
      } else {
        console.log(`[AI Parser] Layer 1: Minimal text extracted (${extraction.charCount} chars)${canUseVision ? ', will rely on vision' : ', will try text AI'}`);
      }
    } catch (err: any) {
      console.error(`[AI Parser] Layer 1 error:`, err.message);
    }
  } else {
    console.log(`[AI Parser] Layer 1: Skipped (image file — vision will handle)`);
  }

  // ========================================
  // Layer 2: Vision Analysis (AI — for images and visual docs)
  // ========================================
  let visionResult: ParseResult | null = null;
  if (canUseVision && (isImage || !layers.textExtraction)) {
    // Use vision for images OR when text extraction failed (only if MIME is supported)
    try {
      console.log(`[AI Parser] Layer 2: Vision analysis (Gemini)...`);
      visionResult = await parseWithGemini(options);

      if (visionResult.success && visionResult.confidence >= CONFIDENCE_THRESHOLD) {
        layers.visionAnalysis = true;
        console.log(`[AI Parser] Layer 2 OK: Vision confidence ${(visionResult.confidence * 100).toFixed(1)}%`);
      } else {
        console.log(`[AI Parser] Layer 2: Vision ${visionResult.success ? 'low confidence' : 'failed'}: ${visionResult.error || `${(visionResult.confidence * 100).toFixed(1)}%`}`);
      }
    } catch (err: any) {
      console.error(`[AI Parser] Layer 2 error:`, err.message);
    }
  } else if (!canUseVision && !isImage) {
    console.log(`[AI Parser] Layer 2: Skipped (${mimeType} not supported by Gemini Vision)`);
  }

  // ========================================
  // Layer 3: Text-based AI Analysis (deep comprehension)
  // ========================================
  let textResult: ParseResult | null = null;
  if (extractedText.length > 50) {
    try {
      console.log(`[AI Parser] Layer 3: Deep text analysis (Gemini)...`);
      textResult = await parseWithGeminiText({
        ...options,
        extractedText,
      });

      if (textResult.success && textResult.confidence >= CONFIDENCE_THRESHOLD) {
        layers.textAnalysis = true;
        console.log(`[AI Parser] Layer 3 OK: Text analysis confidence ${(textResult.confidence * 100).toFixed(1)}%`);
      } else {
        console.log(`[AI Parser] Layer 3: Text analysis ${textResult.success ? 'low confidence' : 'failed'}: ${textResult.error || `${(textResult.confidence * 100).toFixed(1)}%`}`);
      }
    } catch (err: any) {
      console.error(`[AI Parser] Layer 3 error:`, err.message);
    }
  }

  // ========================================
  // Merge layers into best result
  // ========================================
  const bestResult = pickBestResult(visionResult, textResult, extractedText, layers);

  // ========================================
  // Fallback to OpenAI if all Gemini layers failed
  // ========================================
  if (!bestResult.success || bestResult.confidence < CONFIDENCE_THRESHOLD) {
    console.log(`[AI Parser] Gemini layers insufficient, trying OpenAI fallback...`);
    try {
      const openaiResult = await parseWithOpenAI({
        ...options,
        extractedText: extractedText || undefined,
      });

      if (openaiResult.success && openaiResult.confidence >= CONFIDENCE_THRESHOLD) {
        console.log(`[AI Parser] OpenAI fallback succeeded! Confidence: ${(openaiResult.confidence * 100).toFixed(1)}%`);
        return {
          ...openaiResult,
          extractedText: extractedText || undefined,
          layers,
        };
      }

      console.log(`[AI Parser] OpenAI fallback: ${openaiResult.success ? 'low confidence' : 'failed'}: ${openaiResult.error || ''}`);

      // If OpenAI is better than what we had, use it
      if (openaiResult.success && openaiResult.confidence > bestResult.confidence) {
        return {
          ...openaiResult,
          extractedText: extractedText || undefined,
          layers,
        };
      }
    } catch (err: any) {
      console.error(`[AI Parser] OpenAI fallback error:`, err.message);
    }
  }

  // Return best result with extracted text attached
  if (bestResult.success) {
    console.log(`[AI Parser] Multi-layer analysis complete! Confidence: ${(bestResult.confidence * 100).toFixed(1)}%`);
    console.log(`[AI Parser] Layers: text=${layers.textExtraction}, vision=${layers.visionAnalysis}, textAI=${layers.textAnalysis}`);
  } else {
    console.log(`[AI Parser] All layers failed. Flagging for manual review.`);
  }

  return {
    ...bestResult,
    extractedText: extractedText || undefined,
    layers,
  };
}

/**
 * Pick the best result from vision and text analysis layers.
 * If both succeeded, merge their data (text analysis fills gaps from vision).
 */
function pickBestResult(
  visionResult: ParseResult | null,
  textResult: ParseResult | null,
  extractedText: string,
  layers: { textExtraction: boolean; visionAnalysis: boolean; textAnalysis: boolean }
): ParseResult {
  const visionOk = visionResult?.success && visionResult.confidence >= CONFIDENCE_THRESHOLD;
  const textOk = textResult?.success && textResult.confidence >= CONFIDENCE_THRESHOLD;

  // Both succeeded → merge (text fills gaps from vision)
  if (visionOk && textOk) {
    const merged = mergeLayerData(visionResult!.data, textResult!.data);
    const bestConfidence = Math.max(visionResult!.confidence, textResult!.confidence);
    console.log(`[AI Parser] Merged vision + text analysis results`);
    return {
      success: true,
      data: merged,
      confidence: bestConfidence,
      model: 'gemini',
      attemptNumber: 1,
      duration_ms: (visionResult!.duration_ms || 0) + (textResult!.duration_ms || 0),
    };
  }

  // Only vision succeeded
  if (visionOk) return visionResult!;

  // Only text succeeded
  if (textOk) return textResult!;

  // Both have results but below threshold — pick the higher confidence one
  if (visionResult?.success && textResult?.success) {
    return visionResult.confidence >= textResult.confidence ? visionResult : textResult;
  }

  // Any success at all
  if (visionResult?.success) return visionResult;
  if (textResult?.success) return textResult;

  // If we have extracted text but AI failed — still return success with raw text
  // This ensures the document at least gets into RAG with raw text
  if (extractedText.length > 50) {
    console.log(`[AI Parser] AI analysis failed, but text extraction succeeded — creating minimal result with raw text`);
    return {
      success: true,
      data: {
        content: extractedText,
        title: null,
        keyPoints: [],
        knowledge_entries: [],
      },
      confidence: 0.5, // Below threshold but still useful
      model: 'manual' as any,
      attemptNumber: 1,
    };
  }

  // Complete failure
  return {
    success: false,
    data: null,
    confidence: 0,
    model: 'manual',
    attemptNumber: 1,
    error: 'All AI models failed. Manual review required.',
  };
}

/**
 * Merge data from vision and text analysis layers.
 * Text analysis data fills in missing fields from vision.
 */
function mergeLayerData(visionData: any, textData: any): any {
  if (!visionData || !textData) return visionData || textData;

  const merged = { ...visionData };

  // Fill in any null/empty fields from textData
  for (const [key, value] of Object.entries(textData)) {
    const visionValue = merged[key];

    if (visionValue === null || visionValue === undefined || visionValue === '') {
      merged[key] = value;
    } else if (Array.isArray(visionValue) && Array.isArray(value)) {
      // Merge arrays, avoiding duplicates by JSON comparison
      const existingSet = new Set(visionValue.map((v: any) => JSON.stringify(v)));
      for (const item of value) {
        if (!existingSet.has(JSON.stringify(item))) {
          visionValue.push(item);
        }
      }
    } else if (typeof visionValue === 'object' && typeof value === 'object' && !Array.isArray(value)) {
      // Deep merge objects
      merged[key] = mergeLayerData(visionValue, value);
    }
  }

  return merged;
}

/**
 * Parse multiple documents
 */
export async function parseMultipleDocuments(
  optionsArray: ParseOptions[]
): Promise<MultiLayerResult[]> {
  console.log(`[AI Parser] Parsing ${optionsArray.length} documents...`);

  const results = await Promise.all(
    optionsArray.map(options => parseDocument(options))
  );

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`[AI Parser] Completed: ${successful} succeeded, ${failed} need manual review`);

  return results;
}

/**
 * Merge parsed documents into single partnership object
 */
export function mergeDocuments(results: ParseResult[]): any {
  console.log(`[AI Parser] Merging ${results.length} parsed documents...`);

  const merged: any = {
    brandName: null,
    campaignName: null,
    totalAmount: null,
    currency: 'ILS',
    startDate: null,
    endDate: null,
    signedDate: null,
    expiryDate: null,
    deliverables: [],
    paymentMilestones: [],
    tasks: [],
    parsedFrom: [] as string[],
    confidence: 0,
  };

  let totalConfidence = 0;
  let successCount = 0;

  for (const result of results) {
    if (!result.success || !result.data) continue;

    successCount++;
    totalConfidence += result.confidence;

    const data = result.data;

    if (data.brandName) merged.brandName = data.brandName;
    if (data.campaignName) merged.campaignName = data.campaignName;
    if (data.totalAmount) merged.totalAmount = data.totalAmount;
    if (data.currency) merged.currency = data.currency;
    if (data.timeline?.startDate) merged.startDate = data.timeline.startDate;
    if (data.timeline?.endDate) merged.endDate = data.timeline.endDate;
    if (data.deliverables?.length) merged.deliverables.push(...data.deliverables);
    if (data.paymentTerms?.milestones?.length) merged.paymentMilestones.push(...data.paymentTerms.milestones);
    if (data.signedDate) merged.signedDate = data.signedDate;
    if (data.expiryDate) merged.expiryDate = data.expiryDate;
    if (data.parties?.brand) merged.brandName = data.parties.brand;
    if (data.exclusivity) merged.exclusivity = data.exclusivity;
    if (data.terminationClauses) merged.terminationClauses = data.terminationClauses;
    if (data.campaignGoal) merged.campaignGoal = data.campaignGoal;
    if (data.targetAudience) merged.targetAudience = data.targetAudience;
    if (data.keyMessages) merged.keyMessages = data.keyMessages;
    if (data.tasks?.length) merged.tasks.push(...data.tasks);

    merged.parsedFrom.push(result.model);
  }

  merged.confidence = successCount > 0 ? totalConfidence / successCount : 0;
  merged.deliverables = deduplicateArray(merged.deliverables, 'description');
  merged.tasks = deduplicateArray(merged.tasks, 'title');

  console.log(`[AI Parser] Merge complete! Overall confidence: ${(merged.confidence * 100).toFixed(1)}%`);

  return merged;
}

function deduplicateArray(arr: any[], key: string): any[] {
  const seen = new Set();
  return arr.filter(item => {
    const val = item[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

// Re-export types and utils
export * from './types';
export * from './utils';
export {
  parseWithOpenAI, parseWithGemini, parseWithGeminiText,
  parseAudioWithGemini, parseVideoWithGemini, parseUrlWithGemini,
  VISION_SUPPORTED_MIMES, AUDIO_MIMES, VIDEO_MIMES,
};
