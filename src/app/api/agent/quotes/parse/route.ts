/**
 * POST /api/agent/quotes/parse — agent uploads a PDF/image of a quote; we run the
 * AI parser and return pre-filled quote fields + confidence (for the new-quote form).
 */
import { NextResponse } from 'next/server';
import { requireAgentApi } from '@/lib/auth/agent-session';
import { parseDocument } from '@/lib/ai-parser';
import { parsedToQuoteFields } from '@/lib/crm/quote-ingest';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request) {
  const gate = await requireAgentApi();
  if (gate instanceof NextResponse) return gate;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid form' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'קובץ נדרש' }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'הקובץ גדול מדי (מקס 15MB)' }, { status: 400 });

  try {
    const res = await parseDocument({ file, documentType: 'quote', language: 'he' });
    const parsed = res?.data || {};
    return NextResponse.json({
      success: true,
      fields: parsedToQuoteFields(parsed),
      confidence: res?.confidence ?? 0,
      raw: parsed,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'ניתוח הקובץ נכשל' }, { status: 500 });
  }
}
