/**
 * Pure influencer-matching for inbound briefs.
 *
 * A forwarded brief almost always identifies the represented influencer by NAME
 * ("משפיען דני שובבני"), not by phone — the brand's message rarely carries the
 * influencer's number. The earlier phone-only matcher therefore returned
 * "no client matched" for every real brief (it bailed the moment no phone was
 * found in the text). We now match on phone when one is present (strongest
 * signal), else on the influencer's name appearing in the brief text.
 *
 * Kept dependency-light (only toWaId) so it is unit-testable without Supabase.
 */
import { toWaId } from '@/lib/whatsapp-cloud/client';

export interface InfluencerAccountRow {
  id: string;
  config: any;
}

function normalizeName(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pick the represented influencer from the agent's roster.
 * @param accounts the agent's managed accounts ({ id, config })
 * @param phones   normalized wa_ids found in the message (may be empty)
 * @param text     the brief text (message body) to scan for a name mention
 * @returns the matched account, or null if neither phone nor name matches
 */
export function pickInfluencerAccount(
  accounts: InfluencerAccountRow[],
  phones: string[],
  text?: string | null
): InfluencerAccountRow | null {
  if (!accounts?.length) return null;

  // 1) Phone match — strongest signal, only when a phone is actually present.
  if (phones?.length) {
    for (const a of accounts) {
      const accPhone = a.config?.phone;
      if (accPhone && phones.includes(toWaId(String(accPhone)))) return a;
    }
  }

  // 2) Name match — briefs reference the influencer by name, not phone.
  const hay = normalizeName(text);
  if (hay) {
    for (const a of accounts) {
      const dn = normalizeName(a.config?.display_name);
      if (dn.length >= 2 && hay.includes(dn)) return a;
      const un = normalizeName(a.config?.username);
      if (un.length >= 2 && hay.includes(un)) return a;
    }
  }

  return null;
}
