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
 * RTL shaping for pdf-lib. The PDF renderer (CoreText/Preview, PDF.js, WhatsApp's
 * viewer) bidi-shapes Hebrew and keeps Latin LTR correctly from LOGICAL order — but
 * it digit-REVERSES number runs that sit inside RTL text (94,400 → 004,49). So the
 * one correction we make is to pre-reverse each digit run on a Hebrew line; the
 * renderer's own reversal cancels it back to correct. Lines with no Hebrew are drawn
 * verbatim (LTR), right-aligned. Verified by rendering to PNG. (Keep deliverable text
 * in Hebrew — a number glued to a Latin word sits in an LTR run and must NOT be pre-reversed.)
 */
const DIGIT_RUN = /[0-9][0-9.,\/:\-]*/g;
function shape(text: string): string {
  if (!HEB_RE.test(text)) return text;
  return text.replace(DIGIT_RUN, (m: string, offset: number) => {
    // A digit run glued to a following Latin word sits in an LTR run — the renderer
    // keeps it LTR, so don't pre-reverse it. Otherwise it's in RTL text → reverse.
    const after = text.slice(offset + m.length, offset + m.length + 12);
    return /^\s*[·×.]?\s*[A-Za-z]/.test(after) ? m : [...m].reverse().join('');
  });
}
function widthOf(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(shape(text), size);
}
/** Draw text with its RIGHT edge at xRight; returns the drawn width. */
function drawRight(page: PDFPage, text: string, xRight: number, y: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>): number {
  const s = shape(text);
  const w = font.widthOfTextAtSize(s, size);
  page.drawText(s, { x: xRight - w, y, size, font, color });
  return w;
}
/** Draw a right-aligned (RTL) line; returns the next y. */
function drawRtl(page: PDFPage, text: string, yTop: number, size: number, font: PDFFont, marginRight: number, color = rgb(0.12, 0.12, 0.2)): number {
  drawRight(page, text, page.getWidth() - marginRight, yTop, size, font, color);
  return yTop - size * 1.6;
}
/**
 * Break text into lines that each fit `maxW`. A single word wider than the column (a long URL, a
 * glued Latin+digit run) is hard-split so it can never bleed past the margin.
 */
function wrapLines(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const trial = line ? `${line} ${word}` : word;
    if (widthOf(font, trial, size) <= maxW) { line = trial; continue; }
    if (line) { out.push(line); line = ''; }
    if (widthOf(font, word, size) <= maxW) { line = word; continue; }
    let chunk = '';
    for (const ch of word) {
      if (widthOf(font, chunk + ch, size) > maxW && chunk) { out.push(chunk); chunk = ch; }
      else chunk += ch;
    }
    line = chunk;
  }
  if (line) out.push(line);
  return out;
}

/** Wrap a long RTL paragraph to a width; returns next y. */
function drawRtlParagraph(page: PDFPage, text: string, yTop: number, size: number, font: PDFFont, margin: number, color = rgb(0.25, 0.25, 0.32)): number {
  let y = yTop;
  for (const line of wrapLines(text, font, size, page.getWidth() - margin * 2)) {
    y = drawRtl(page, line, y, size, font, margin, color);
  }
  return y;
}

/**
 * One RTL bullet, WRAPPED to the column with a hanging indent (continuation lines sit under the
 * text, not under the dot). Deliverables are full sentences — drawing them as a single unwrapped
 * line ran them straight off the page edge. Returns the next y.
 */
function drawRtlBullet(
  page: PDFPage, text: string, yTop: number, size: number, font: PDFFont,
  margin: number, color: ReturnType<typeof rgb>, dotColor: ReturnType<typeof rgb>
): number {
  const W = page.getWidth();
  const xRight = W - margin - 14;      // right edge of the text (the dot sits to its right)
  const lines = wrapLines(text, font, size, xRight - margin);
  let y = yTop;
  lines.forEach((ln, i) => {
    if (i === 0) page.drawCircle({ x: W - margin - 4, y: y + 4, size: 2.4, color: dotColor });
    drawRight(page, ln, xRight, y, size, font, color);
    y -= size * 1.5;
  });
  return y - 5;
}

function fmtAmount(amount?: number | null, currency?: string | null): string | null {
  if (amount == null) return null;
  const cur = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₪';
  return `${cur} ${amount.toLocaleString('en-US')}`;
}

// Palette
const BRAND = rgb(0.42, 0.28, 0.75);
const INK = rgb(0.13, 0.13, 0.2);
const GRAY = rgb(0.46, 0.46, 0.54);
const LINE = rgb(0.9, 0.9, 0.94);
const TINT = rgb(0.955, 0.94, 0.99);
const WHITE = rgb(1, 1, 1);

/** Generate a clean, modern A4 Hebrew quote PDF. */
export async function generateQuotePdf(q: QuoteContent): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const reg = await loadFont(pdf, 'Heebo-Regular.ttf');
  const bold = await loadFont(pdf, 'Heebo-Bold.ttf');

  const W = 595, H = 842, margin = 48, innerW = W - margin * 2;
  let page = pdf.addPage([W, H]); // reassigned if wrapped content spills to another page

  // ── Header band ──────────────────────────────────────────────
  const bandH = 104;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: BRAND });
  // agency logo or name (right)
  let drewLogo = false;
  if (q.agencyLogo && q.agencyLogo.length) {
    try {
      const img = /png/i.test(q.agencyLogoType || '') ? await pdf.embedPng(q.agencyLogo) : await pdf.embedJpg(q.agencyLogo);
      const th = 44, sc = th / img.height;
      page.drawImage(img, { x: W - margin - img.width * sc, y: H - bandH / 2 - th / 2, width: img.width * sc, height: th });
      drewLogo = true;
    } catch { /* fall back to text */ }
  }
  if (!drewLogo) drawRight(page, q.agencyName || 'Bestie', W - margin, H - 46, 19, bold, WHITE);
  // "הצעת מחיר" eyebrow (right, under agency) + contact (left)
  drawRight(page, 'הצעת מחיר', W - margin, H - 72, 11, reg, rgb(0.9, 0.86, 0.99));
  const contact = [q.agencyPhone, q.agencyEmail].filter(Boolean).join('    ·    ');
  if (contact) page.drawText(shape(contact), { x: margin, y: H - 46, size: 10, font: reg, color: rgb(0.92, 0.89, 0.99) });
  if (q.agencyName && !drewLogo === false) { /* name already drawn */ }

  let y = H - bandH - 46;

  // ── Title: brand name (the deal subject) ─────────────────────
  if (q.brandName) y = drawRtl(page, q.brandName, y, 24, bold, margin, INK);
  if (q.campaignName) { y += 6; y = drawRtl(page, q.campaignName, y, 13, reg, margin, GRAY); }
  y -= 8;

  // ── Meta card ────────────────────────────────────────────────
  const metaPairs: [string, string][] = [];
  if (q.clientName) metaPairs.push(['מיוצג', q.clientName]);
  if (q.agentName) metaPairs.push(['סוכן', q.agentName]);
  if (q.agencyName) metaPairs.push(['סוכנות', q.agencyName]);
  if (q.validUntil) metaPairs.push(['בתוקף עד', q.validUntil]);
  if (metaPairs.length) {
    const rows = Math.ceil(metaPairs.length / 2);
    const cardH = 14 + rows * 22;
    page.drawRectangle({ x: margin, y: y - cardH + 12, width: innerW, height: cardH, color: rgb(0.975, 0.975, 0.985) });
    let ry = y - 6;
    for (let i = 0; i < metaPairs.length; i += 2) {
      const colRight = W - margin - 14;
      const colMid = margin + innerW / 2;
      for (const [ci, pair] of [[0, metaPairs[i]], [1, metaPairs[i + 1]]] as [number, [string, string] | undefined][]) {
        if (!pair) continue;
        const rightEdge = ci === 0 ? colRight : colMid - 14;
        const lw = drawRight(page, pair[0], rightEdge, ry, 9, reg, GRAY);
        drawRight(page, pair[1], rightEdge - lw - 6, ry, 11.5, bold, INK);
      }
      ry -= 22;
    }
    y = y - cardH - 4;
  }

  // ── Amount highlight card ────────────────────────────────────
  const amount = fmtAmount(q.amount, q.currency);
  if (amount) {
    const cardH = 62;
    page.drawRectangle({ x: margin, y: y - cardH + 12, width: innerW, height: cardH, color: TINT, borderColor: rgb(0.86, 0.8, 0.96), borderWidth: 1 });
    drawRight(page, 'סה״כ לתשלום', W - margin - 18, y - 10, 11, reg, BRAND);
    drawRight(page, 'כולל מע״מ', W - margin - 18, y - 30, 9.5, reg, GRAY);
    // big amount on the left of the card
    const s = shape(amount);
    const aw = bold.widthOfTextAtSize(s, 26);
    page.drawText(s, { x: margin + 18, y: y - 26, size: 26, font: bold, color: INK });
    void aw;
    y = y - cardH - 6;
  }

  // ── Deliverables ─────────────────────────────────────────────
  if (q.deliverables && q.deliverables.length) {
    y -= 6;
    y = drawRtl(page, 'מה כלול', y, 13, bold, margin, INK);
    y -= 2;
    for (const d of q.deliverables) {
      if (!d?.trim()) continue;
      // Wrapping makes the block taller, so it can now outgrow the page — spill to a new one
      // rather than drawing over the footer (the signature stamps onto the LAST page).
      if (y < 110) { page = pdf.addPage([W, H]); y = H - 64; }
      y = drawRtlBullet(page, d, y, 11.5, reg, margin, rgb(0.24, 0.24, 0.32), BRAND);
    }
  }

  // ── Brief / notes ────────────────────────────────────────────
  if (q.notes?.trim()) {
    if (y < 150) { page = pdf.addPage([W, H]); y = H - 64; }
    y -= 8;
    page.drawRectangle({ x: margin, y: y + 6, width: innerW, height: 0.8, color: LINE });
    y -= 12;
    y = drawRtl(page, 'תיאור הבקשה', y, 11, bold, margin, GRAY);
    y = drawRtlParagraph(page, q.notes, y, 10.5, reg, margin, rgb(0.4, 0.4, 0.46));
  }
  if (q.terms?.trim()) {
    if (y < 130) { page = pdf.addPage([W, H]); y = H - 64; }
    y -= 10;
    y = drawRtl(page, 'תנאים', y, 11, bold, margin, GRAY);
    y = drawRtlParagraph(page, q.terms, y, 10.5, reg, margin);
  }

  // ── Agreement footer ─────────────────────────────────────────
  // Keep the agreement line + the signature block (stamped onto the LAST page) off the strip.
  if (y < 120) { page = pdf.addPage([W, H]); y = H - 64; }
  y -= 18;
  page.drawRectangle({ x: margin, y: y + 6, width: innerW, height: 0.8, color: LINE });
  y -= 14;
  drawRtlParagraph(page, 'חתימה על הצעה זו מהווה אישור והסכמה לתנאים המפורטים לעיל, ומחליפה חוזה נפרד.', y, 10, reg, margin, GRAY);

  // ── Powered-by footer strip (every page, so a spilled page isn't naked) ──
  for (const p of pdf.getPages()) {
    p.drawRectangle({ x: 0, y: 0, width: W, height: 4, color: BRAND });
    p.drawText('Powered by Bestie', { x: margin, y: 14, size: 8, font: reg, color: rgb(0.7, 0.7, 0.75) });
  }

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
