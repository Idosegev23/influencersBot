/**
 * Text Extractor — Layer 1 of Multi-Layer Document Analysis
 *
 * Extracts raw text from documents using native parsers (no AI).
 * Supports: PDF (pdf-parse), XLSX/XLS (xlsx), DOCX, PPTX, plain text.
 */

/**
 * Extract raw text from a file buffer based on MIME type
 */
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ExtractedText> {
  const startTime = Date.now();

  try {
    let text = '';
    let method: string = 'none';
    let pageCount: number | undefined;

    if (mimeType === 'application/pdf') {
      // PDF extraction using pdf-parse v1 (simple, serverless-compatible, no canvas needed)
      const pdfParse = (await import('pdf-parse')).default;
      const result = await pdfParse(buffer);
      text = result.text || '';
      pageCount = result.numpages;
      method = 'pdf-parse';

      // Quality check: Hebrew PDFs with custom font encodings produce garbled text
      if (text.length > 0 && isGarbledText(text)) {
        console.log(`[TextExtractor] PDF text is garbled (custom font encoding), discarding`);
        text = '';
        method = 'pdf-parse-garbled';
      } else {
        console.log(`[TextExtractor] PDF extracted: ${pageCount} pages, ${text.length} chars`);
      }
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    ) {
      // XLSX/XLS — extract all sheets as structured text
      text = extractTextFromXlsx(buffer);
      method = text ? 'xlsx' : 'xlsx-empty';
      if (text) {
        console.log(`[TextExtractor] XLSX extracted: ${text.length} chars`);
      }
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      // DOCX/DOC — XML extraction
      text = extractTextFromDocx(buffer);
      method = text ? 'docx-xml' : 'docx-empty';
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      mimeType === 'application/vnd.ms-powerpoint'
    ) {
      // PPTX — extract slide text from XML
      text = extractTextFromPptx(buffer);
      method = text ? 'pptx-xml' : 'pptx-empty';
      if (text) {
        console.log(`[TextExtractor] PPTX extracted: ${text.length} chars`);
      }
    } else if (mimeType === 'text/plain') {
      text = buffer.toString('utf-8');
      method = 'text-plain';
    } else if (mimeType.startsWith('image/')) {
      // Images don't have extractable text — will rely on vision layer
      text = '';
      method = 'image-skip';
      console.log(`[TextExtractor] Image file — skipping text extraction, vision layer will handle`);
    } else {
      // Unsupported format — try as UTF-8 text
      try {
        const rawText = buffer.toString('utf-8');
        const printableRatio = rawText.replace(/[^\x20-\x7E\u0590-\u05FF\u0600-\u06FF\u0400-\u04FF\s]/g, '').length / rawText.length;
        if (printableRatio > 0.7) {
          text = rawText;
          method = 'utf8-fallback';
        } else {
          method = 'binary-skip';
        }
      } catch {
        method = 'binary-skip';
      }
    }

    const duration = Date.now() - startTime;

    return {
      text: cleanExtractedText(text),
      method,
      pageCount,
      charCount: text.length,
      durationMs: duration,
      success: text.trim().length > 0,
    };
  } catch (error: any) {
    console.error(`[TextExtractor] Error extracting text from ${filename}:`, error.message);
    return {
      text: '',
      method: 'error',
      charCount: 0,
      durationMs: Date.now() - startTime,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Extract text from XLSX/XLS using the xlsx library.
 * Converts each sheet into a readable text table.
 */
function extractTextFromXlsx(buffer: Buffer): string {
  try {
    // Dynamic import to avoid bundling issues
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      // Convert to array of arrays
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rows || rows.length === 0) continue;

      parts.push(`=== גיליון: ${sheetName} ===`);

      for (const row of rows) {
        const cells = row.map((cell: any) => {
          if (cell === null || cell === undefined || cell === '') return '';
          return String(cell).trim();
        });
        // Skip completely empty rows
        if (cells.every((c: string) => c === '')) continue;
        parts.push(cells.join(' | '));
      }

      parts.push(''); // blank line between sheets
    }

    return parts.join('\n');
  } catch (err: any) {
    console.error(`[TextExtractor] XLSX extraction error:`, err.message);
    return '';
  }
}

/**
 * Basic DOCX text extraction via XML parsing
 * DOCX files are ZIP archives with XML content
 */
function extractTextFromDocx(buffer: Buffer): string {
  try {
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
      return '';
    }

    const content = buffer.toString('utf-8');
    // Match text between <w:t> tags (Word XML format)
    const matches = content.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (matches) {
      return matches
        .map((m) => m.replace(/<[^>]+>/g, ''))
        .join(' ');
    }

    return '';
  } catch {
    return '';
  }
}

/**
 * Basic PPTX text extraction via XML parsing
 * PPTX files are ZIP archives containing slide XML
 */
function extractTextFromPptx(buffer: Buffer): string {
  try {
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
      return '';
    }

    const content = buffer.toString('utf-8');
    // Match text in <a:t> tags (PowerPoint XML format)
    const matches = content.match(/<a:t>([^<]+)<\/a:t>/g);
    if (matches) {
      return matches
        .map((m) => m.replace(/<[^>]+>/g, ''))
        .join(' ');
    }

    return '';
  } catch {
    return '';
  }
}

/**
 * Detect garbled text from PDFs with custom font encodings.
 * Hebrew PDFs often use embedded fonts that map characters to wrong Unicode points.
 * If text has very few recognizable Hebrew/English/Arabic chars, it's likely garbled.
 */
function isGarbledText(text: string): boolean {
  const sample = text.substring(0, 2000);
  if (sample.length < 20) return false;

  // Count recognizable characters: Hebrew, English, Arabic, Russian, digits, common punctuation
  const recognizable = sample.match(/[\u0590-\u05FF\u0600-\u06FF\u0400-\u04FFa-zA-Z0-9.,;:!?()\-\s]/g);
  const ratio = (recognizable?.length || 0) / sample.length;

  // If less than 40% of chars are recognizable, it's garbled
  // Normal Hebrew text has 70%+ recognizable chars
  return ratio < 0.4;
}

/**
 * Clean extracted text: normalize whitespace, remove control characters
 */
function cleanExtractedText(text: string): string {
  return text
    // Remove null bytes and control characters (except newlines and tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize multiple spaces to single space
    .replace(/[ \t]+/g, ' ')
    // Normalize multiple newlines to max 2
    .replace(/\n{3,}/g, '\n\n')
    // Trim each line
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/**
 * Result from text extraction
 */
export interface ExtractedText {
  text: string;
  method: string;
  pageCount?: number;
  charCount: number;
  durationMs: number;
  success: boolean;
  error?: string;
}
