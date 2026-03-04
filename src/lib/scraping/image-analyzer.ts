/**
 * Image Analyzer — Gemini Vision for product images on websites
 * Downloads images → sends to Gemini Vision → returns descriptions
 */

import { getGeminiClient, MODELS } from '@/lib/ai/google-client';

// ============================================
// Types
// ============================================

export interface ExtractedImage {
  src: string;
  alt: string;
  title: string;
  context: string;     // surrounding text (figcaption, parent text)
  width?: number;
  height?: number;
}

export interface ImageAnalysis {
  src: string;
  alt: string;
  description: string;
  productName?: string;
  features?: string[];
  textInImage?: string;
}

// ============================================
// HTML Image Extraction
// ============================================

/**
 * Extract image data from raw HTML
 */
export function extractImageData(html: string | undefined): ExtractedImage[] {
  if (!html) return [];

  const images: ExtractedImage[] = [];
  const seen = new Set<string>();

  // Match <img> tags with attributes
  const imgRegex = /<img\s+([^>]*?)>/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const attrs = match[1];

    const src = extractAttr(attrs, 'src') || extractAttr(attrs, 'data-src') || extractAttr(attrs, 'data-lazy-src');
    if (!src || seen.has(src)) continue;

    // Skip tiny images, SVGs, data URIs, tracking pixels
    if (
      src.endsWith('.svg') ||
      src.startsWith('data:image/svg') ||
      src.includes('pixel') ||
      src.includes('tracking') ||
      src.includes('spacer') ||
      src.includes('1x1')
    ) continue;

    const alt = extractAttr(attrs, 'alt') || '';
    const title = extractAttr(attrs, 'title') || '';
    const widthStr = extractAttr(attrs, 'width');
    const heightStr = extractAttr(attrs, 'height');
    const width = widthStr ? parseInt(widthStr, 10) : undefined;
    const height = heightStr ? parseInt(heightStr, 10) : undefined;

    // Skip small images (icons, logos) — only if dimensions are specified
    if (width && width < 80) continue;
    if (height && height < 80) continue;

    seen.add(src);
    images.push({ src, alt, title, context: '', width, height });
  }

  // Extract figcaption context
  const figureRegex = /<figure[^>]*>([\s\S]*?)<\/figure>/gi;
  while ((match = figureRegex.exec(html)) !== null) {
    const figContent = match[1];
    const captionMatch = figContent.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
    const caption = captionMatch ? stripHtml(captionMatch[1]).trim() : '';

    if (caption) {
      // Find image in this figure and add caption as context
      const imgInFig = figContent.match(/<img[^>]*src=["']([^"']+)["']/i);
      if (imgInFig) {
        const img = images.find(i => i.src === imgInFig[1]);
        if (img) img.context = caption;
      }
    }
  }

  return images;
}

function extractAttr(attrs: string, name: string): string | null {
  // Match both single and double quotes, and unquoted values
  const regex = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = attrs.match(regex);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
}

// ============================================
// Gemini Vision Analysis
// ============================================

const IMAGE_FETCH_TIMEOUT = 8000;
const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB max for Gemini

/**
 * Analyze product images with Gemini Vision.
 * Downloads each image and sends to Gemini for description.
 */
export async function analyzeImages(
  images: ExtractedImage[],
  pageUrl: string,
  maxImages: number = 5,
): Promise<ImageAnalysis[]> {
  if (images.length === 0) return [];

  // Prioritize: images with alt text > large images > others
  const sorted = [...images].sort((a, b) => {
    const scoreA = (a.alt ? 2 : 0) + (a.context ? 1 : 0) + ((a.width || 0) > 300 ? 1 : 0);
    const scoreB = (b.alt ? 2 : 0) + (b.context ? 1 : 0) + ((b.width || 0) > 300 ? 1 : 0);
    return scoreB - scoreA;
  });

  const toAnalyze = sorted.slice(0, maxImages);
  const results: ImageAnalysis[] = [];

  for (const img of toAnalyze) {
    try {
      const fullSrc = resolveUrl(img.src, pageUrl);
      const analysis = await analyzeImageWithVision(fullSrc, img);
      if (analysis) results.push(analysis);
    } catch (err: any) {
      console.warn(`[ImageAnalyzer] Skipping ${img.src}: ${err.message}`);
    }
  }

  // Also include non-analyzed images that have useful alt/title
  for (const img of images) {
    if (results.find(r => r.src === img.src)) continue;
    if (img.alt && img.alt.length > 10) {
      results.push({
        src: img.src,
        alt: img.alt,
        description: img.alt + (img.context ? `. ${img.context}` : ''),
      });
    }
  }

  return results;
}

function resolveUrl(src: string, pageUrl: string): string {
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  try {
    return new URL(src, pageUrl).href;
  } catch {
    return src;
  }
}

async function analyzeImageWithVision(
  imageUrl: string,
  imgData: ExtractedImage,
): Promise<ImageAnalysis | null> {
  // Download image
  let base64: string;
  let mimeType: string;

  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InfluencerBot/1.0)' },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    mimeType = contentType.split(';')[0].trim();

    // Skip non-image types
    if (!mimeType.startsWith('image/')) return null;
    // Skip SVG
    if (mimeType.includes('svg')) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_SIZE) return null;
    if (buffer.byteLength < 1000) return null; // Too small, likely placeholder

    base64 = Buffer.from(buffer).toString('base64');
  } catch {
    return null;
  }

  // Send to Gemini Vision
  try {
    const client = getGeminiClient();

    const contextHint = imgData.alt
      ? `Alt text: "${imgData.alt}". `
      : imgData.context
        ? `Context: "${imgData.context}". `
        : '';

    const response = await client.models.generateContent({
      model: MODELS.CHAT_FAST,
      contents: [
        {
          role: 'user' as const,
          parts: [
            {
              inlineData: {
                data: base64,
                mimeType,
              },
            },
            {
              text: `${contextHint}תאר את התמונה הזו בקצרה. אם זה מוצר - ציין שם, קטגוריה ותכונות עיקריות. אם יש טקסט בתמונה - העתק אותו. החזר JSON:
{"description":"תיאור קצר","product_name":"שם המוצר או null","features":["תכונה1"],"text_in_image":"טקסט שמופיע בתמונה או null"}`,
            },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 500,
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');

    return {
      src: imageUrl,
      alt: imgData.alt,
      description: parsed.description || imgData.alt || '',
      productName: parsed.product_name || undefined,
      features: parsed.features?.length ? parsed.features : undefined,
      textInImage: parsed.text_in_image || undefined,
    };
  } catch (err: any) {
    console.warn(`[ImageAnalyzer] Vision failed for ${imageUrl}: ${err.message}`);
    // Fallback: use alt text
    if (imgData.alt) {
      return {
        src: imageUrl,
        alt: imgData.alt,
        description: imgData.alt,
      };
    }
    return null;
  }
}

// ============================================
// Build text section from image analysis
// ============================================

/**
 * Build a text section from image analysis results.
 * This text gets appended to page content before RAG ingestion.
 */
export function buildImageSection(analyses: ImageAnalysis[]): string {
  if (analyses.length === 0) return '';

  const lines: string[] = [];

  for (const a of analyses) {
    let line = '';

    if (a.productName) {
      line = `מוצר: ${a.productName}`;
      if (a.description && a.description !== a.productName) {
        line += ` — ${a.description}`;
      }
    } else if (a.description) {
      line = `תמונה: ${a.description}`;
    } else if (a.alt) {
      line = `תמונה: ${a.alt}`;
    } else {
      continue;
    }

    if (a.features?.length) {
      line += `. תכונות: ${a.features.join(', ')}`;
    }
    if (a.textInImage) {
      line += `. טקסט בתמונה: "${a.textInImage}"`;
    }

    lines.push(`- ${line}`);
  }

  if (lines.length === 0) return '';
  return `\n\nתמונות ומוצרים בדף:\n${lines.join('\n')}`;
}
