/**
 * Text Chunker
 * Splits text into overlapping chunks of target token size.
 * Uses a simple whitespace tokenizer (1 token ~= 0.75 words for English,
 * ~0.5 words for Hebrew). For cost estimation we use tiktoken-compatible counting.
 */

export interface ChunkOptions {
  /** Target tokens per chunk (default: 400) */
  targetTokens?: number;
  /** Minimum tokens per chunk (default: 100) */
  minTokens?: number;
  /** Maximum tokens per chunk (default: 500) */
  maxTokens?: number;
  /** Overlap ratio 0-1 (default: 0.12 = 12%) */
  overlapRatio?: number;
}

export interface Chunk {
  index: number;
  text: string;
  tokenCount: number;
  startChar: number;
  endChar: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  targetTokens: 400,
  minTokens: 100,
  maxTokens: 500,
  overlapRatio: 0.12,
};

/**
 * Approximate token count.
 * OpenAI's tokenizer averages ~4 chars/token for English.
 * Hebrew and mixed content is ~3 chars/token.
 * We use 3.5 as a safe middle ground.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

/**
 * Find the best split point near a target character position.
 * Prefers paragraph breaks > sentence ends > clause breaks > word boundaries.
 */
function findSplitPoint(text: string, target: number, window: number): number {
  const start = Math.max(0, target - window);
  const end = Math.min(text.length, target + window);
  const region = text.substring(start, end);

  // Priority 1: Paragraph break (\n\n)
  const paraBreak = region.lastIndexOf('\n\n');
  if (paraBreak !== -1) return start + paraBreak + 2;

  // Priority 2: Line break (\n)
  const lineBreak = region.lastIndexOf('\n');
  if (lineBreak !== -1) return start + lineBreak + 1;

  // Priority 3: Sentence end (. ! ?)
  const sentenceEnd = region.search(/[.!?]\s+[^\s]/);
  if (sentenceEnd !== -1) {
    const afterPunct = region.indexOf(' ', sentenceEnd + 1);
    if (afterPunct !== -1) return start + afterPunct + 1;
  }

  // Priority 4: Comma or semicolon
  const clauseBreak = region.lastIndexOf(', ');
  if (clauseBreak !== -1) return start + clauseBreak + 2;

  // Priority 5: Any whitespace
  const space = region.lastIndexOf(' ');
  if (space !== -1) return start + space + 1;

  // Fallback: hard cut at target
  return target;
}

/**
 * Normalize text for chunking.
 * Collapses excessive whitespace, trims, removes null bytes.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Chunk text into overlapping segments.
 */
export function chunkText(rawText: string, options?: ChunkOptions): Chunk[] {
  const opts = { ...DEFAULTS, ...options };
  const text = normalizeText(rawText);

  if (!text) return [];

  const totalTokens = estimateTokens(text);

  // If text fits in a single chunk, return as-is
  if (totalTokens <= opts.maxTokens) {
    return [{
      index: 0,
      text,
      tokenCount: totalTokens,
      startChar: 0,
      endChar: text.length,
    }];
  }

  const targetChars = Math.round(opts.targetTokens * 3.5);
  const overlapChars = Math.round(targetChars * opts.overlapRatio);
  const splitWindow = Math.round(targetChars * 0.2); // Search window for split point

  const chunks: Chunk[] = [];
  let pos = 0;

  while (pos < text.length) {
    const prevPos = pos;
    const idealEnd = pos + targetChars;

    let endPos: number;
    if (idealEnd >= text.length) {
      endPos = text.length;
    } else {
      endPos = findSplitPoint(text, idealEnd, splitWindow);
    }

    // Safety: endPos must advance past pos
    if (endPos <= pos) {
      endPos = Math.min(pos + targetChars, text.length);
    }

    const chunkStr = text.substring(pos, endPos).trim();
    const tokenCount = estimateTokens(chunkStr);

    if (chunkStr.length > 0 && tokenCount >= opts.minTokens) {
      chunks.push({
        index: chunks.length,
        text: chunkStr,
        tokenCount,
        startChar: pos,
        endChar: endPos,
      });
    } else if (chunkStr.length > 0 && chunks.length === 0) {
      // First chunk might be small — include anyway
      chunks.push({
        index: 0,
        text: chunkStr,
        tokenCount,
        startChar: pos,
        endChar: endPos,
      });
    } else if (chunkStr.length > 0 && chunks.length > 0) {
      // Merge small trailing chunk with previous
      const prev = chunks[chunks.length - 1];
      prev.text = text.substring(prev.startChar, endPos).trim();
      prev.tokenCount = estimateTokens(prev.text);
      prev.endChar = endPos;
    }

    // Move position forward (with overlap)
    const nextPos = endPos - overlapChars;
    pos = nextPos > prevPos ? nextPos : endPos;

    // Final safety: if pos hasn't advanced, force it forward
    if (pos <= prevPos) {
      pos = prevPos + 1;
    }
  }

  return chunks;
}
