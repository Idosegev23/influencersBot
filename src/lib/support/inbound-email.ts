/**
 * Route a customer's email reply to the business it belongs to.
 *
 * Bestie sends from one shared mailbox, so a customer who replied to their
 * ticket confirmation wrote to bestie@ldrsgroup.com — an inbox no brand
 * watches. Outbound customer mail now carries the brand's Reply-To
 * (@/lib/support/reply-address), which stops the problem at the source, but
 * replies to older threads keep arriving. This is the catch-net: the Gmail
 * poller hands every unmatched inbound message here, and anything that is a
 * customer reply gets forwarded to the right brand.
 *
 * Matching, strongest signal first:
 *   1. the ticket reference the confirmation email printed ("מספר פנייה: 88E0F3…")
 *      and which the customer's client quotes back — an exact ticket id prefix
 *   2. the sender address against support_requests.customer_email
 * Neither → the CTO is told, because a customer waiting on an answer is worse
 * than a noisy alert.
 */

import { supabase as supabaseAdmin } from '@/lib/supabase';
import { sendEmail, sendAdminAlert, ADMIN_ALERT_RECIPIENTS } from '@/lib/email';
import { resolveBrandReplyTo } from '@/lib/support/reply-address';
import { normalizeEmail } from '@/lib/support/email-deliverability';
import { markBounced } from '@/lib/support/email-deliverability-store';

// sendAdminAlert defaults to GMAIL_SEND_FROM — the unwatched shared mailbox this whole feature
// exists to drain. Every alert here must name a human inbox explicitly.


export interface InboundEmail {
  providerMessageId: string;
  from: string;          // already lowercased bare address
  subject: string;
  body: string;          // plain-text body, quoted history included
  /** Gmail's X-Failed-Recipients header, when this is a bounce. The strongest signal. */
  failedRecipient?: string;
}

export type InboundOutcome =
  | 'forwarded'
  | 'unmatched'
  | 'no_brand_address'
  | 'duplicate'
  | 'not_a_customer_reply'
  | 'error';

/** One message this run could not hand to a business — collected and reported as a single digest. */
export interface UnroutableEmail {
  from: string;
  subject: string;
  reason: 'unmatched' | 'no_brand_address';
  brandName?: string;
  excerpt: string;
}

export interface RouteOptions {
  /**
   * Collect alerts here instead of emailing one per message. A per-message alert is how a
   * classification mistake turns into an inbox flood — see reportUnroutableEmails.
   */
  deferAlerts?: UnroutableEmail[];
}

export interface InboundResult {
  outcome: InboundOutcome;
  accountId?: string;
  ticketId?: string;
  matchedBy?: 'ticket_code' | 'sender_email';
  forwardedTo?: string;
}

// The confirmation email prints "מספר פנייה: <code>" / "Reference: <code>", where the code is the
// UUID's first group (8 hex). Status templates use a 6-hex prefix of the same id. Accept 6–8 so
// both surfaces resolve, and read it out of the quoted history the client attached.
const TICKET_CODE_RE = /(?:מספר\s*פנייה|Reference|Ticket\s*ID)\s*[:：]?\s*#?\s*([0-9a-fA-F]{6,8})/;

/**
 * Mail WE sent. The poller reads the mailbox Bestie sends from, so without this every outbound
 * email — customer confirmations, and the unmatched-alert itself — comes back as an inbound
 * "customer reply". The alert loop that produced 349 alerts in two hours started exactly here.
 */
function isSelfSent(from: string): boolean {
  const ours = [process.env.GMAIL_SEND_FROM, process.env.CRM_INBOX_EMAIL]
    .map((v) => v?.trim().toLowerCase())
    .filter(Boolean) as string[];
  return ours.includes(from.trim().toLowerCase());
}

/** A bounce or an auto-reply must never be forwarded to a brand as if a customer wrote it. */
function isAutomated(email: InboundEmail): boolean {
  const from = email.from;
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce)/.test(from)) return true;
  return /^(automatic reply|out of office|delivery status notification|undelivered mail)/i.test(
    email.subject.trim(),
  );
}

/** Gmail's own wording, and the RFC 3464 field, around the address that failed. */
const BOUNCE_BODY_PATTERNS = [
  /Final-Recipient:\s*rfc822;\s*([^\s<>,;]+@[^\s<>,;]+)/i,
  /wasn'?t delivered to\s+([^\s<>,;]+@[^\s<>,;]+)/i,
  /couldn'?t be delivered to\s+([^\s<>,;]+@[^\s<>,;]+)/i,
  /\u05d4\u05d4\u05d5\u05d3\u05e2\u05d4 \u05e9\u05dc\u05da \u05dc\u05d0 \u05e0\u05e9\u05dc\u05d7\u05d4 \u05d0\u05dc\s+([^\s<>,;]+@[^\s<>,;]+)/,
];

/**
 * The address that could not be reached, when this message is a hard bounce.
 *
 * A bounce is the only signal that sees past a valid domain to a mailbox that does not
 * exist, and it already arrives here — poll-gmail read the failure notice for ticket
 * 99bb08a1 six minutes after the ticket was filed, isAutomated() recognised it, and it was
 * dropped. Two earlier ones went the same way.
 *
 * Deliberately narrow. A (Delay) notice is not a failure — mail delayed is still mail that
 * may be delivered — and marking an address dead on a delay takes a working route away from
 * a brand for nothing.
 */
export function extractBouncedRecipient(email: InboundEmail): string | null {
  const from = (email.from || '').toLowerCase();
  const isDaemon = /^(mailer-daemon|postmaster)/.test(from);
  const subject = email.subject || '';
  const isFailure =
    /delivery status notification \(failure\)|undelivered mail|delivery incomplete|returned mail/i.test(subject)
    || /^address not found/i.test((email.body || '').trim());
  if (!isDaemon || !isFailure) return null;
  if (/\(delay\)/i.test(subject)) return null;

  if (email.failedRecipient) {
    const fromHeader = normalizeEmail(email.failedRecipient);
    if (fromHeader) return fromHeader;
  }
  for (const re of BOUNCE_BODY_PATTERNS) {
    const m = re.exec(email.body || '');
    if (!m) continue;
    const addr = normalizeEmail(m[1].replace(/[.,;]+$/, ''));
    // Never mark our own mailbox, or the daemon writing the report, as dead.
    if (addr && !/^(mailer-daemon|postmaster)@/.test(addr) && !isSelfSent(addr)) return addr;
  }
  return null;
}

async function findByTicketCode(body: string) {
  const m = TICKET_CODE_RE.exec(body || '');
  if (!m) return null;
  const code = m[1].toLowerCase();
  // `id::text like 'code%'` — the code is a prefix of the UUID, not a column of its own.
  const { data } = await supabaseAdmin
    .from('support_requests')
    .select('id, account_id')
    .ilike('id', `${code}%`)
    .order('created_at', { ascending: false })
    .limit(2);
  // Two hits means the prefix is ambiguous; fall through to the weaker signal rather than
  // forward a customer's message to a business that is not theirs.
  if (!data || data.length !== 1) return null;
  return { ticketId: data[0].id as string, accountId: data[0].account_id as string };
}

async function findBySenderEmail(from: string) {
  const { data } = await supabaseAdmin
    .from('support_requests')
    .select('id, account_id')
    .ilike('customer_email', from)
    .order('created_at', { ascending: false })
    .limit(1);
  if (!data?.length) return null;
  return { ticketId: data[0].id as string, accountId: data[0].account_id as string };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildForwardHtml(email: InboundEmail, brandName: string, ticketId: string | null): string {
  const ref = ticketId ? ticketId.split('-')[0].toUpperCase() : null;
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f5f7;margin:0;padding:24px;color:#0c1013;direction:rtl">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <div style="font-size:12px;color:#676767;letter-spacing:0.08em;font-weight:600;margin-bottom:6px">תשובה מלקוח/ה</div>
    <h1 style="font-size:19px;font-weight:700;margin:0 0 14px">${escapeHtml(brandName)}</h1>
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
      <tr><td style="padding:6px 0 6px 12px;color:#676767;font-size:13px;white-space:nowrap">מאת</td><td style="padding:6px 0;font-size:14px" dir="ltr">${escapeHtml(email.from)}</td></tr>
      <tr><td style="padding:6px 0 6px 12px;color:#676767;font-size:13px;white-space:nowrap">נושא</td><td style="padding:6px 0;font-size:14px">${escapeHtml(email.subject || '(ללא נושא)')}</td></tr>
      ${ref ? `<tr><td style="padding:6px 0 6px 12px;color:#676767;font-size:13px;white-space:nowrap">מספר פנייה</td><td style="padding:6px 0;font-size:14px"><code>${escapeHtml(ref)}</code></td></tr>` : ''}
    </table>
    <div style="border-top:1px solid #f1e9fd;padding-top:14px;white-space:pre-wrap;font-size:14px;line-height:1.55">${escapeHtml(email.body.slice(0, 8000))}</div>
    <p style="font-size:12px;color:#676767;margin:18px 0 0">הלקוח/ה השיב/ה למייל של Bestie. אפשר להשיב ישירות להודעה הזו — התשובה תגיע אליו/ה.</p>
  </div>
</body></html>`;
}

/** Defer when the caller is batching (the cron), else send immediately (a one-off call). */
async function raiseAlert(options: RouteOptions, item: UnroutableEmail): Promise<void> {
  if (options.deferAlerts) { options.deferAlerts.push(item); return; }
  await reportUnroutableEmails([item]);
}

/**
 * One alert for everything a run could not route. Silent when there is nothing to say — a cron
 * that emails every 10 minutes to report "nothing happened" gets filtered, and then the one that
 * mattered gets filtered with it.
 */
export async function reportUnroutableEmails(items: UnroutableEmail[]): Promise<void> {
  if (!items.length) return;
  const lines = items.map((i) => {
    const why = i.reason === 'no_brand_address'
      ? `שויך ל-${i.brandName || 'מותג'} אבל לחשבון אין כתובת מייל`
      : 'לא הצלחנו לשייך לאף חשבון';
    return `• ${i.from} — "${i.subject || '(ללא נושא)'}"\n  ${why}\n  ${i.excerpt.replace(/\s+/g, ' ').slice(0, 200)}`;
  });
  await sendAdminAlert({
    level: 'warning',
    subject: `${items.length} תשובות מייל לא נותבו לאף עסק`,
    message: `הגיעו ${items.length} הודעות לתיבה של Bestie שלא הועברו לאף עסק. הן ממתינות בתיבה.`,
    details: lines.join('\n\n'),
    adminEmails: ADMIN_ALERT_RECIPIENTS,
  }).catch(() => {});
}

/**
 * Forward one inbound message to its brand. Idempotent: the Gmail poller re-reads a 2-day
 * window every 10 minutes, so a message already handled returns 'duplicate' untouched.
 */
export async function routeInboundCustomerEmail(
  email: InboundEmail,
  options: RouteOptions = {},
): Promise<InboundResult> {
  const { data: seen } = await supabaseAdmin
    .from('inbound_email_routing')
    .select('id')
    .eq('provider_message_id', email.providerMessageId)
    .maybeSingle();
  if (seen) return { outcome: 'duplicate' };

  const log = async (row: Record<string, any>) => {
    await supabaseAdmin.from('inbound_email_routing').insert({
      provider_message_id: email.providerMessageId,
      sender: email.from,
      subject: email.subject || null,
      ...row,
    });
  };

  if (isSelfSent(email.from)) {
    await log({ outcome: 'not_a_customer_reply', note: 'sent by us — not an inbound reply' });
    return { outcome: 'not_a_customer_reply' };
  }

  if (isAutomated(email)) {
    // Still never forwarded to a brand — but no longer thrown away. A hard bounce is the
    // only evidence that a syntactically perfect address has no mailbox behind it.
    const bounced = extractBouncedRecipient(email);
    if (bounced) {
      await markBounced(bounced, (email.subject || 'bounce').slice(0, 200));
      await log({ outcome: 'not_a_customer_reply', note: `bounce recorded for ${bounced}` });
      return { outcome: 'not_a_customer_reply' };
    }
    await log({ outcome: 'not_a_customer_reply', note: 'automated sender or auto-reply subject' });
    return { outcome: 'not_a_customer_reply' };
  }

  const byCode = await findByTicketCode(email.body);
  const match = byCode ?? (await findBySenderEmail(email.from));
  const matchedBy: 'ticket_code' | 'sender_email' | null =
    match ? (byCode ? 'ticket_code' : 'sender_email') : null;

  if (!match) {
    await log({ outcome: 'unmatched' });
    await raiseAlert(options, {
      from: email.from, subject: email.subject, reason: 'unmatched', excerpt: email.body.slice(0, 400),
    });
    return { outcome: 'unmatched' };
  }

  const { data: account } = await supabaseAdmin
    .from('accounts')
    .select('id, config')
    .eq('id', match.accountId)
    .maybeSingle();

  const brandName = (account?.config as any)?.display_name || (account?.config as any)?.username || 'המותג';
  const to = await resolveBrandReplyTo(supabaseAdmin, account as any);

  if (!to) {
    await log({
      account_id: match.accountId, ticket_id: match.ticketId, matched_by: matchedBy,
      outcome: 'no_brand_address',
    });
    await raiseAlert(options, {
      from: email.from, subject: email.subject, reason: 'no_brand_address', brandName,
      excerpt: email.body.slice(0, 400),
    });
    return { outcome: 'no_brand_address', accountId: match.accountId, ticketId: match.ticketId };
  }

  // Reply-To is the CUSTOMER: the brand hits reply and reaches the person who wrote, not Bestie.
  const res = await sendEmail({
    to,
    replyTo: email.from,
    subject: `[${brandName}] תשובה מלקוח/ה — ${email.subject || 'ללא נושא'}`,
    html: buildForwardHtml(email, brandName, match.ticketId),
  });

  if (!res.success) {
    await log({
      account_id: match.accountId, ticket_id: match.ticketId, matched_by: matchedBy,
      forwarded_to: to, outcome: 'error', note: res.error || 'send failed',
    });
    return { outcome: 'error', accountId: match.accountId, ticketId: match.ticketId };
  }

  await log({
    account_id: match.accountId, ticket_id: match.ticketId, matched_by: matchedBy,
    forwarded_to: to, outcome: 'forwarded',
  });
  return {
    outcome: 'forwarded',
    accountId: match.accountId,
    ticketId: match.ticketId,
    matchedBy: matchedBy || undefined,
    forwardedTo: to,
  };
}
