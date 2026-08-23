/**
 * Contact-details guards for support tickets.
 *
 * `support_requests.customer_phone` is the ONLY field the WhatsApp send path
 * dials, but several writers used to fall back to the channel's user id when a
 * real phone was unknown — on WhatsApp that id IS the phone, on the widget /
 * chat page it is a synthetic visitor id (`aw_…` / `a_…`, see public/widget.js).
 * A ticket then looked contactable in the inbox, the agent hit "send", and Meta
 * rejected it with `(#131009) Parameter value is not valid` — the failure only
 * visible in the raw payload's `error_data.details` ("מספר הטלפון שגוי").
 *
 * So: a phone is stored only when it could actually be dialled. Everything
 * else is null, and the inbox says "no way to reach this customer" up front.
 */

/**
 * The value if it is dialable, else null. Deliberately strict — a false
 * negative costs one manual lookup, a false positive costs a failed send the
 * agent only discovers from Meta.
 */
export function realPhoneOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Session ids always carry letters; a phone number never does. This single
  // rule rejects every `aw_…` / `a_…` / `ig_…` id regardless of how many
  // digits its random suffix happens to contain.
  if (/[A-Za-z]/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  // E.164 allows 15 digits max; anything under 9 is a fragment, not a number —
  // those are what Meta accepts and then fails to deliver (error 131026).
  if (digits.length < 9 || digits.length > 15) return null;
  return trimmed;
}

/** Can this ticket be reached over WhatsApp at all? */
export function isRealPhone(value: unknown): boolean {
  return realPhoneOrNull(value) !== null;
}

// Deliberately loose — the job is to reject "לא רוצה" and "0545989978", not to police TLDs.
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-zA-Z]{2,}$/;

/** The value if it is a usable email address, else null. */
export function realEmailOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return null;
  return EMAIL_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

/**
 * Can a human get back to this customer at all? The single question the support inbox — and the
 * escalation gate — actually cares about. Either channel counts.
 */
export function hasContactRoute(contact: { phone?: unknown; email?: unknown }): boolean {
  return realPhoneOrNull(contact.phone) !== null || realEmailOrNull(contact.email) !== null;
}

// ---------------------------------------------------------------------------
// Harvesting a contact route out of ordinary chat text.
//
// The details form and remember_contact were the ONLY two ways a phone ever
// reached the session — so a shopper who simply TYPED her number ("דנה כחלון
// 0507106050") was treated as having given nothing: order verification kept
// failing, and the escalation filed a ticket the brand could not answer. This
// closes that gap mechanically, without asking the model to notice.
//
// Token-based on purpose. A loose /\d{9,}/ sweep over "40073 40072 40160"
// happily produces an eleven-digit "phone" that no one can dial — exactly the
// undialable-value class realPhoneOrNull exists to prevent.
// ---------------------------------------------------------------------------

/** An Israeli/E.164 phone as people actually type one: 05x…, 0x-xxx-xxxx, +972…, 972…. */
const PHONE_SHAPE = /^(?:\+?972|0)[\d.-]{7,13}$/;
const EMAIL_IN_TEXT = /[^\s@,;:<>()"'\][]+@[^\s@,;:<>()"'\][]+\.[A-Za-z]{2,}/g;

/** Trim the punctuation a sentence leaves around a number ("(טלפון: 0507106050)"). */
function stripEdges(token: string): string {
  return token.replace(/^[^\d+]+/, '').replace(/[^\d]+$/, '');
}

/**
 * A phone number and/or email address stated anywhere in a free-text message, or nulls.
 * Both are validated by the same guards that gate what gets stored on a ticket, so a
 * harvested value is dialable/mailable by construction.
 */
export function harvestContact(text: unknown): { phone: string | null; email: string | null } {
  if (typeof text !== 'string' || !text.trim()) return { phone: null, email: null };

  // Adjacent tokens are also tried joined, so "050 7106050" is found — while "40073 40072"
  // still isn't, because the join must itself start with 0 / 972 to be considered at all.
  const tokens = text.split(/[\s,;:()"'<>[\]]+/).filter(Boolean);
  let phone: string | null = null;
  for (let i = 0; i < tokens.length && !phone; i++) {
    for (const candidate of [tokens[i], i + 1 < tokens.length ? tokens[i] + tokens[i + 1] : '']) {
      const cleaned = stripEdges(candidate);
      if (!cleaned || !PHONE_SHAPE.test(cleaned)) continue;
      const valid = realPhoneOrNull(cleaned);
      if (valid) { phone = valid; break; }
    }
  }

  let email: string | null = null;
  for (const m of text.matchAll(EMAIL_IN_TEXT)) {
    const valid = realEmailOrNull(m[0]);
    if (valid) { email = valid; break; }
  }

  return { phone, email };
}
