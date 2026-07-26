/**
 * Meta hands back whatever the lead typed into the form. WhatsApp wants E.164
 * digits with no plus.
 *
 * A number that fails to normalise returns null rather than a best guess:
 * messaging a wrong number is worse than not messaging, and a silent failure
 * here is indistinguishable from a lead who simply ignored us.
 *
 * Israeli mobile prefixes are 05X. Landlines (02/03/04/08/09) are rejected —
 * they cannot receive WhatsApp, so treating them as valid just burns a template
 * and leaves the lead looking unresponsive.
 */
export function normalizeIsraeliPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2); // 00972… → 972…

  // Already Israeli with country code: 972 + 9 digits, mobile only.
  if (digits.startsWith('972')) {
    const local = digits.slice(3);
    return /^5\d{8}$/.test(local) ? `972${local}` : null;
  }

  // Local Israeli mobile: 05X-XXXXXXX (10 digits).
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;

  // Local Israeli mobile typed without the leading zero (9 digits).
  if (/^5\d{8}$/.test(digits)) return `972${digits}`;

  // Israeli landline — a real number that cannot receive WhatsApp.
  if (/^0[23489]\d{7,8}$/.test(digits)) return null;

  // Anything else is only usable if it already looks like a full international
  // number. 10 digits is the shortest real E.164 worth accepting.
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}
