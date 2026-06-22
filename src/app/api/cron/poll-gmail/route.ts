/**
 * Agency-CRM: poll the Bestie inbox for forwarded quotes.
 *
 * Agents forward/send price-quotes to CRM_INBOX_EMAIL. This cron reads recent
 * messages, and for any FROM a registered agent address, AI-parses → creates a
 * quote → replies with the signing link. De-dupe is by Gmail message id.
 *
 * OPS PREREQUISITE (until then this route no-ops safely):
 *   1. CRM_INBOX_EMAIL env = a Workspace mailbox (e.g. quotes@ldrsgroup.com)
 *   2. Add scope https://www.googleapis.com/auth/gmail.readonly to the service
 *      account's domain-wide delegation (Workspace Admin → API controls).
 *
 * Auth: CRON_SECRET bearer (same as other cron endpoints).
 */
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleServiceAccount, sendEmail } from '@/lib/email';
import { ingestQuote, type IngestAttachment } from '@/lib/crm/quote-ingest';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const INBOX = process.env.CRM_INBOX_EMAIL?.trim();

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  return !!authHeader && authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

function b64urlToBuffer(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function headerValue(headers: any[], name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

/** Walk MIME parts: collect plain-text body + attachment descriptors. */
function walkParts(part: any, out: { text: string; atts: { filename: string; mime: string; attachmentId: string }[] }) {
  if (!part) return;
  const mime = part.mimeType || '';
  if (mime === 'text/plain' && part.body?.data) {
    out.text += b64urlToBuffer(part.body.data).toString('utf-8') + '\n';
  }
  if (part.filename && part.body?.attachmentId) {
    out.atts.push({ filename: part.filename, mime, attachmentId: part.body.attachmentId });
  }
  for (const p of part.parts || []) walkParts(p, out);
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const creds = getGoogleServiceAccount();
  if (!creds || !INBOX) {
    return NextResponse.json({
      configured: false,
      note: 'Set CRM_INBOX_EMAIL + add gmail.readonly to the service account delegation.',
    });
  }

  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    subject: INBOX,
  });
  const gmail = google.gmail({ version: 'v1', auth });

  const results: any[] = [];
  try {
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: 'newer_than:2d -in:chats category:primary',
      maxResults: 25,
    });
    const messages = list.data.messages || [];

    for (const m of messages) {
      if (!m.id) continue;
      try {
        const full = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
        const payload = full.data.payload;
        const headers = payload?.headers || [];
        const from = extractEmail(headerValue(headers, 'From'));
        const subject = headerValue(headers, 'Subject');

        const collected = { text: '', atts: [] as { filename: string; mime: string; attachmentId: string }[] };
        walkParts(payload, collected);

        // Download attachments (cap to a couple to bound work)
        const attachments: IngestAttachment[] = [];
        for (const a of collected.atts.slice(0, 3)) {
          if (!/pdf|image\/|word|sheet|document/.test(a.mime)) continue;
          const att = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: m.id,
            id: a.attachmentId,
          });
          if (att.data.data) {
            attachments.push({ filename: a.filename, mime: a.mime, bytes: new Uint8Array(b64urlToBuffer(att.data.data)) });
          }
        }

        const res = await ingestQuote({
          channel: 'email',
          sender: from,
          providerMessageId: m.id,
          subject,
          rawText: collected.text || full.data.snippet || '',
          attachments,
        });

        // Reply to the agent with the ack (only matched agents get one).
        if (res.matched && res.ackText) {
          await sendEmail({
            to: from,
            subject: `Bestie · ${subject || 'הצעת מחיר'}`,
            html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">${res.ackText.replace(/\n/g, '<br/>')}</div>`,
          }).catch(() => {});
        }
        results.push({ id: m.id, from, matched: res.matched, hasQuote: !!res.quote, needsClient: !!res.needsClient, reason: res.reason });
      } catch (e: any) {
        results.push({ id: m.id, error: String(e?.message || e) });
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }

  return NextResponse.json({ configured: true, processed: results.length, results });
}
