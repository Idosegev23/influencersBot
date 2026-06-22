/**
 * Agency-CRM PDF helpers — generate a Hebrew quote PDF and stamp a signature.
 *
 * pdf-lib has no RTL/bidi shaping, so we render right-aligned and reverse pure
 * Hebrew runs (token reorder + per-Hebrew-word char reversal). Good enough for
 * quote documents and signature stamps. Hebrew glyphs come from Heebo
 * (public/fonts), embedded + subset.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs/promises';
import path from 'path';

export interface QuoteContent {
  title: string;
  clientName: string | null; // the influencer/client being represented
  brandName: string | null; // the brand receiving the quote
  campaignName?: string | null;
  amount?: number | null;
  currency?: string | null;
  validUntil?: string | null; // YYYY-MM-DD
  deliverables?: string[];
  terms?: string | null;
  notes?: string | null;
  agentName?: string | null;
}

const HEB_RE = /[֐-׿]/;

let cachedFontBytes: Record<string, Buffer> = {};
async function loadFont(pdf: PDFDocument, fileName: string): Promise<PDFFont> {
  if (!cachedFontBytes[fileName]) {
    cachedFontBytes[fileName] = await fs.readFile(path.join(process.cwd(), 'public', 'fonts', fileName));
  }
  return pdf.embedFont(cachedFontBytes[fileName], { subset: true });
}

/** Reorder for visual RTL: reverse token order; reverse chars inside Hebrew tokens. */
function bidi(text: string): string {
  if (!text || !HEB_RE.test(text)) return text;
  const tokens = text.split(' ');
  const out = tokens
    .map((t) => (HEB_RE.test(t) && !/[A-Za-z]/.test(t) ? Array.from(t).reverse().join('') : t))
    .reverse();
  return out.join(' ');
}

/** Draw a right-aligned (RTL) line, returns the next y. */
function drawRtl(
  page: PDFPage,
  text: string,
  yTop: number,
  size: number,
  font: PDFFont,
  marginRight: number,
  color = rgb(0.12, 0.12, 0.2)
): number {
  const s = bidi(text);
  const w = font.widthOfTextAtSize(s, size);
  const x = page.getWidth() - marginRight - w;
  page.drawText(s, { x, y: yTop, size, font, color });
  return yTop - size * 1.6;
}

/** Wrap a long RTL paragraph to a width, return next y. */
function drawRtlParagraph(
  page: PDFPage,
  text: string,
  yTop: number,
  size: number,
  font: PDFFont,
  margin: number,
  color = rgb(0.25, 0.25, 0.32)
): number {
  const maxW = page.getWidth() - margin * 2;
  const words = text.split(/\s+/);
  let line = '';
  let y = yTop;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(bidi(trial), size) > maxW && line) {
      y = drawRtl(page, line, y, size, font, margin, color);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) y = drawRtl(page, line, y, size, font, margin, color);
  return y;
}

function fmtAmount(amount?: number | null, currency?: string | null): string | null {
  if (amount == null) return null;
  const cur = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₪';
  return `${cur} ${amount.toLocaleString('en-US')}`;
}

/** Generate a clean A4 Hebrew quote PDF. */
export async function generateQuotePdf(q: QuoteContent): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const reg = await loadFont(pdf, 'Heebo-Regular.ttf');
  const bold = await loadFont(pdf, 'Heebo-Bold.ttf');

  const page = pdf.addPage([595, 842]); // A4
  const margin = 48;
  let y = 842 - margin - 10;

  // Brand strip
  page.drawRectangle({ x: 0, y: 842 - 6, width: 595, height: 6, color: rgb(0.535, 0.247, 0.886) });

  page.drawText('Bestie', { x: margin, y, size: 16, font: bold, color: rgb(0.535, 0.247, 0.886) });
  y -= 36;

  y = drawRtl(page, q.title || 'הצעת מחיר', y, 26, bold, margin);
  y -= 6;

  const meta: string[] = [];
  if (q.clientName) meta.push(`משפיען/לקוח: ${q.clientName}`);
  if (q.brandName) meta.push(`מותג: ${q.brandName}`);
  if (q.campaignName) meta.push(`קמפיין: ${q.campaignName}`);
  if (q.agentName) meta.push(`סוכן: ${q.agentName}`);
  for (const m of meta) y = drawRtl(page, m, y, 12, reg, margin, rgb(0.3, 0.3, 0.38));

  y -= 12;
  page.drawRectangle({ x: margin, y: y + 6, width: 595 - margin * 2, height: 0.8, color: rgb(0.85, 0.85, 0.9) });
  y -= 14;

  const amount = fmtAmount(q.amount, q.currency);
  if (amount) {
    y = drawRtl(page, `סכום: ${amount}`, y, 16, bold, margin);
    y -= 4;
  }
  if (q.validUntil) y = drawRtl(page, `בתוקף עד: ${q.validUntil}`, y, 12, reg, margin, rgb(0.3, 0.3, 0.38));

  if (q.deliverables && q.deliverables.length) {
    y -= 12;
    y = drawRtl(page, 'תוצרים:', y, 13, bold, margin);
    for (const d of q.deliverables) {
      if (!d?.trim()) continue;
      y = drawRtl(page, `•  ${d}`, y, 12, reg, margin, rgb(0.25, 0.25, 0.32));
    }
  }

  if (q.terms?.trim()) {
    y -= 12;
    y = drawRtl(page, 'תנאים:', y, 13, bold, margin);
    y = drawRtlParagraph(page, q.terms, y, 11, reg, margin);
  }

  if (q.notes?.trim()) {
    y -= 8;
    y = drawRtlParagraph(page, q.notes, y, 11, reg, margin, rgb(0.4, 0.4, 0.46));
  }

  // Agreement note (signed quote = agreement)
  y -= 18;
  page.drawRectangle({ x: margin, y: y + 6, width: 595 - margin * 2, height: 0.8, color: rgb(0.85, 0.85, 0.9) });
  y -= 14;
  y = drawRtlParagraph(
    page,
    'חתימה על הצעה זו מהווה אישור והסכמה לתנאים המפורטים לעיל, ומחליפה חוזה נפרד.',
    y,
    10.5,
    reg,
    margin,
    rgb(0.4, 0.4, 0.46)
  );

  return pdf.save();
}

/* ---------------- signature stamping (ported from leaders-platform) ---------------- */

function prepBidi(text: string): string {
  if (!text) return text;
  if (!HEB_RE.test(text)) return text;
  if (!/[A-Za-z]/.test(text)) return Array.from(text).reverse().join('');
  return text;
}

function formatStampDate(iso: string): string {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr}, ${timeStr}`;
}

export async function stampPdfWithSignature(params: {
  originalPdf: Uint8Array | Buffer;
  signerName: string;
  signatureImageDataUrl: string | null;
  typedName: string | null;
  signedAtIso: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(params.originalPdf);
  pdf.registerFontkit(fontkit);

  const page = pdf.getPages().at(-1);
  if (!page) throw new Error('PDF has no pages');

  const { width } = page.getSize();
  const margin = 36;
  const boxWidth = width - margin * 2;
  const boxHeight = 110;
  const baseY = margin;

  page.drawRectangle({ x: margin, y: baseY + boxHeight + 6, width: boxWidth, height: 0.6, color: rgb(0.85, 0.85, 0.88) });
  page.drawRectangle({
    x: margin,
    y: baseY,
    width: boxWidth,
    height: boxHeight,
    color: rgb(0.98, 0.98, 0.99),
    borderColor: rgb(0.9, 0.9, 0.93),
    borderWidth: 0.6,
  });

  if (params.signatureImageDataUrl) {
    try {
      const base64 = params.signatureImageDataUrl.replace(/^data:image\/png;base64,/, '');
      const sigBytes = Buffer.from(base64, 'base64');
      const sigImage = await pdf.embedPng(sigBytes);
      const sigDims = sigImage.scale(0.45);
      const targetH = Math.min(60, boxHeight - 40);
      const scale = targetH / sigDims.height;
      const renderW = sigDims.width * scale;
      const renderH = sigDims.height * scale;
      page.drawImage(sigImage, {
        x: margin + boxWidth - renderW - 18,
        y: baseY + (boxHeight - renderH) / 2 + 8,
        width: renderW,
        height: renderH,
      });
    } catch (e) {
      console.warn('[stamp] failed to embed signature image:', e);
    }
  }

  const reg = await loadFont(pdf, 'Heebo-Regular.ttf');
  const bold = await loadFont(pdf, 'Heebo-Bold.ttf');
  const labelSize = 8;
  const valueSize = 11;
  const xLabel = margin + 18;

  page.drawText('SIGNED BY', { x: xLabel, y: baseY + boxHeight - 22, size: labelSize, font: reg, color: rgb(0.45, 0.45, 0.5) });
  page.drawText(prepBidi(params.signerName), { x: xLabel, y: baseY + boxHeight - 38, size: valueSize, font: bold, color: rgb(0.1, 0.1, 0.18) });
  page.drawText('SIGNED AT', { x: xLabel, y: baseY + 38, size: labelSize, font: reg, color: rgb(0.45, 0.45, 0.5) });
  page.drawText(formatStampDate(params.signedAtIso), { x: xLabel, y: baseY + 22, size: valueSize, font: bold, color: rgb(0.1, 0.1, 0.18) });

  if (params.typedName && !params.signatureImageDataUrl) {
    page.drawText(prepBidi(params.typedName), {
      x: margin + boxWidth - 220,
      y: baseY + boxHeight / 2 - 6,
      size: 22,
      font: reg,
      color: rgb(0.05, 0.05, 0.18),
    });
  }

  return pdf.save();
}
