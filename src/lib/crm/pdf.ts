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
  // agency branding (rendered in the header)
  agencyName?: string | null;
  agencyLogo?: Uint8Array | null;
  agencyLogoType?: string | null; // image/png | image/jpeg
  agencyPhone?: string | null;
  agencyEmail?: string | null;
  agencyAddress?: string | null;
}

const HEB_RE = /[֐-׿]/;

let cachedFontBytes: Record<string, Buffer> = {};
async function loadFont(pdf: PDFDocument, fileName: string): Promise<PDFFont> {
  if (!cachedFontBytes[fileName]) {
    cachedFontBytes[fileName] = await fs.readFile(path.join(process.cwd(), 'public', 'fonts', fileName));
  }
  return pdf.embedFont(cachedFontBytes[fileName], { subset: true });
}

/**
 * Keep logical order. Modern PDF renderers (CoreText/Preview, browser PDF.js,
 * Chrome) are bidi-aware and shape RTL correctly from logical order — manually
 * reversing double-reverses it into mirror text. We only right-align (drawRtl).
 */
function bidi(text: string): string {
  return text;
}

// Isolate number tokens as their own LTR runs — a renderer that otherwise
// mishandles bidi digit-reverses numbers embedded in Hebrew (15,000 → 000,51).
const NUM_RE = /[0-9][0-9.,\/-]*/g;
function rtlSegments(text: string): { s: string; num: boolean }[] {
  const segs: { s: string; num: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  NUM_RE.lastIndex = 0;
  while ((m = NUM_RE.exec(text))) {
    if (m.index > last) segs.push({ s: text.slice(last, m.index), num: false });
    segs.push({ s: m[0], num: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ s: text.slice(last), num: false });
  return segs.length ? segs : [{ s: text, num: false }];
}

/**
 * Draw a right-aligned (RTL) line, returns the next y.
 * Hebrew lines are laid out run-by-run (numbers kept as isolated LTR runs so they
 * don't digit-reverse); lines with no Hebrew are drawn as-is (LTR), right-aligned.
 */
function drawRtl(
  page: PDFPage,
  text: string,
  yTop: number,
  size: number,
  font: PDFFont,
  marginRight: number,
  color = rgb(0.12, 0.12, 0.2)
): number {
  if (!HEB_RE.test(text)) {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: page.getWidth() - marginRight - w, y: yTop, size, font, color });
    return yTop - size * 1.6;
  }
  const segs = rtlSegments(text);
  const widths = segs.map((r) => font.widthOfTextAtSize(r.s, size));
  const total = widths.reduce((a, b) => a + b, 0);
  let x = page.getWidth() - marginRight - total;
  for (let i = segs.length - 1; i >= 0; i--) {
    page.drawText(segs[i].s, { x, y: yTop, size, font, color });
    x += widths[i];
  }
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

  // Agency logo (top-left) or agency/Bestie name
  let drewLogo = false;
  if (q.agencyLogo && q.agencyLogo.length) {
    try {
      const img = /png/i.test(q.agencyLogoType || '')
        ? await pdf.embedPng(q.agencyLogo)
        : await pdf.embedJpg(q.agencyLogo);
      const targetH = 38;
      const scale = targetH / img.height;
      page.drawImage(img, { x: margin, y: y - targetH + 14, width: img.width * scale, height: targetH });
      drewLogo = true;
    } catch {
      /* fall back to text below */
    }
  }
  if (!drewLogo) {
    page.drawText(q.agencyName || 'Bestie', { x: margin, y, size: 16, font: bold, color: rgb(0.535, 0.247, 0.886) });
  }

  // Agency contact (top-right, small)
  const contact = [q.agencyPhone, q.agencyEmail].filter(Boolean).join('  ·  ');
  if (contact) drawRtl(page, contact, y, 9.5, reg, margin, rgb(0.45, 0.45, 0.5));

  y -= drewLogo ? 44 : 36;

  y = drawRtl(page, q.title || 'הצעת מחיר', y, 26, bold, margin);
  y -= 6;

  const meta: string[] = [];
  if (q.clientName) meta.push(`מיוצג: ${q.clientName}`);
  if (q.brandName) meta.push(`מותג: ${q.brandName}`);
  if (q.campaignName) meta.push(`קמפיין: ${q.campaignName}`);
  if (q.agencyName) meta.push(`סוכנות: ${q.agencyName}`);
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

/** Render an editable text contract (Hebrew) to a paginated A4 PDF. */
export async function generateContractPdf(opts: {
  title: string;
  body: string;
  agencyName?: string | null;
  agencyLogo?: Uint8Array | null;
  agencyLogoType?: string | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const reg = await loadFont(pdf, 'Heebo-Regular.ttf');
  const bold = await loadFont(pdf, 'Heebo-Bold.ttf');

  const margin = 48;
  let page = pdf.addPage([595, 842]);
  let y = 842 - margin - 10;
  page.drawRectangle({ x: 0, y: 842 - 6, width: 595, height: 6, color: rgb(0.535, 0.247, 0.886) });

  let drewLogo = false;
  if (opts.agencyLogo && opts.agencyLogo.length) {
    try {
      const img = /png/i.test(opts.agencyLogoType || '') ? await pdf.embedPng(opts.agencyLogo) : await pdf.embedJpg(opts.agencyLogo);
      const h = 34;
      page.drawImage(img, { x: margin, y: y - h + 12, width: (img.width / img.height) * h, height: h });
      drewLogo = true;
    } catch {
      /* fall back */
    }
  }
  if (!drewLogo) page.drawText(opts.agencyName || 'Bestie', { x: margin, y, size: 15, font: bold, color: rgb(0.535, 0.247, 0.886) });
  y -= drewLogo ? 42 : 34;

  y = drawRtl(page, opts.title || 'הסכם', y, 20, bold, margin);
  y -= 14;

  const newPageIfNeeded = () => {
    if (y < margin + 70) {
      page = pdf.addPage([595, 842]);
      y = 842 - margin - 10;
    }
  };

  for (const rawLine of (opts.body || '').split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) {
      y -= 8;
      continue;
    }
    const isHeading = /^\d+\.\s/.test(line) || line.length < 22;
    y = drawRtlParagraph(page, line, y, isHeading ? 12 : 11, isHeading ? bold : reg, margin, isHeading ? rgb(0.1, 0.1, 0.18) : rgb(0.25, 0.25, 0.32));
    y -= 4;
    newPageIfNeeded();
  }

  return pdf.save();
}

/* ---------------- signature stamping (ported from leaders-platform) ---------------- */

function prepBidi(text: string): string {
  // Logical order — see bidi() above; renderers handle RTL.
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
