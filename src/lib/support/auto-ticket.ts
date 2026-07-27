/**
 * Auto-ticket assessment for the public chat.
 *
 * Why this exists — measured on the Argania chat log, 2026-07-21 → 07-27:
 * 75 conversations raised a service problem and only 26 produced a ticket.
 * The other 49 ended with the bot reciting the support phone number, often to
 * a customer whose opening line was that nobody answers that phone. Customers
 * handed over a name, a phone and an address and nothing was recorded.
 *
 * So this module answers two questions per turn, deterministically (no LLM —
 * the LLM is what was skipping it):
 *   1. Should we stop reciting contact channels? (suppressContactDeflection)
 *   2. Do we have enough to file a ticket right now?  (shouldFileTicket)
 *
 * It only ASSESSES. Filing and notifying stay with the existing support
 * pipeline so tickets keep flowing through one path.
 */

import { extractOrderNumber } from '@/lib/shipment/intent';

/** The customer has already used the official channels and got nothing back. */
const EXHAUSTED_CHANNEL_PATTERNS: RegExp[] = [
  /לא עונים/,
  /אין מענה/,
  /אינם עונים/,
  /לא ענו/,
  /לא חוזרים אליי?/,
  /מנסה (?:לתפוס|להשיג|ליצור קשר|לפנות)/,
  /מנסה.*ללא הצלחה/,
  /ניסיתי.*(?:ואין|ולא)/,
  /שלחתי (?:מייל|אימייל|הודעה).*(?:ואין|ולא)/,
  /(?:כבר|מעל|יותר מ).{0,12}(?:ימים|שבוע|שבועיים|חודש)/,
];

/** A concrete service problem (not a pre-sales delivery-time question). */
const SERVICE_ISSUE_PATTERNS: RegExp[] = [
  /לא הגיע(?:ה)?/,
  /לא קיבלתי/,
  /לא קיבלנו/,
  /לא סופק/,
  /חסר(?:ים)?\b/,
  /שבור|פגום|פגומים|מעוך|נשפך|נישפך|מפוצץ|חצי ריק/,
  /מוצר(?:ים)? לא (?:נכון|נכונים|שלי)/,
  /הזמנה (?:שגויה|לא נכונה)/,
  /טעות בהזמנה/,
  /זיכוי|החזר כספי|ביטול הזמנה/,
  /תשלום.*(?:נתקע|נכשל)|לא מצליח(?:ה)? (?:לשלם|להגיע לתשלום)/,
  /להחליף|החלפה/,
  /נציג|שירות לקוחות|אנושי/,
];

/** Escalate immediately — legal exposure or an explicit threat. */
const URGENT_PATTERNS: RegExp[] = [
  /תביעה|משפטי|עורך דין|עו"ד|תלונה להגנת הצרכן/,
  /מאוכזב(?:ת)? מאוד|בושה|שערורי/,
];

// Israeli mobile: 05X + 7 digits, tolerating - or space separators.
const PHONE_PATTERN = /\b(0(?:5\d)[-\s]?\d{3}[-\s]?\d{4})\b/;
const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b/i;

function anyMatch(patterns: RegExp[], text: string): boolean {
  return patterns.some((re) => re.test(text));
}

export function alreadyTriedOfficialChannels(text: string): boolean {
  return anyMatch(EXHAUSTED_CHANNEL_PATTERNS, text || '');
}

export interface ContactDetails {
  phone: string | null;
  email: string | null;
  orderNumber: string | null;
}

export function extractContactDetails(text: string): ContactDetails {
  const t = text || '';
  const phone = t.match(PHONE_PATTERN)?.[1]?.replace(/[-\s]/g, '') ?? null;
  const email = t.match(EMAIL_PATTERN)?.[0] ?? null;
  // extractOrderNumber already skips phone-shaped runs, so a bare mobile
  // number never doubles as an order number.
  const orderNumber = extractOrderNumber(t);
  return { phone, email, orderNumber };
}

export interface ServiceTurnAssessment {
  isServiceIssue: boolean;
  /** Customer says the official channels are dead → never recite them again. */
  suppressContactDeflection: boolean;
  /** Service issue but nothing to reach them on — ask for one handle, once. */
  needsContactHandle: boolean;
  shouldFileTicket: boolean;
  urgent: boolean;
  contact: ContactDetails;
}

/**
 * @param conversationText all USER turns of the session, newest last.
 */
export function assessServiceTurn(conversationText: string): ServiceTurnAssessment {
  const text = conversationText || '';
  const contact = extractContactDetails(text);
  const urgent = anyMatch(URGENT_PATTERNS, text);
  const exhausted = alreadyTriedOfficialChannels(text);

  // A problem, an exhausted channel, or a legal threat all mean "this is
  // service, not shopping". Exhausted-channel alone counts: "לא עונים לי" is
  // itself the complaint.
  const isServiceIssue = anyMatch(SERVICE_ISSUE_PATTERNS, text) || exhausted || urgent;

  // We can only open a ticket someone can act on if there's a way back to the
  // customer (phone/email) or something to look up (order number).
  const hasHandle = Boolean(contact.phone || contact.email || contact.orderNumber);

  return {
    isServiceIssue,
    suppressContactDeflection: exhausted,
    needsContactHandle: isServiceIssue && !hasHandle,
    shouldFileTicket: isServiceIssue && hasHandle,
    urgent,
    contact,
  };
}
