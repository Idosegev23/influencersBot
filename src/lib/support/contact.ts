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
