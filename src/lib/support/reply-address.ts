/**
 * Where a customer's email reply should land.
 *
 * Every Bestie email goes out from one shared mailbox (GMAIL_SEND_FROM,
 * bestie@ldrsgroup.com) with no Reply-To, so a customer who hits "reply" on
 * their ticket confirmation writes to an inbox no brand watches and nobody
 * answers. Customer-facing mail must carry the BRAND's own address instead.
 *
 * Resolution order, most explicit first:
 *   1. config.support_email        — the address the brand nominated
 *   2. config.escalation.recipients[].email — who already gets their escalations
 *   3. active support_agents        — whoever actually works the inbox
 * Null means the brand has given us no address at all; the caller then leaves
 * Reply-To off rather than inventing one.
 */

import { resolveRecipients } from '@/engines/escalation/recipients';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}

export async function resolveBrandReplyTo(
  supabase: any,
  account: { id: string; config?: any } | null | undefined,
): Promise<string | null> {
  if (!account?.id) return null;
  const config = account.config || {};

  const nominated = cleanEmail(config.support_email);
  if (nominated) return nominated;

  try {
    const recipients = await resolveRecipients(supabase, account.id, config.escalation);
    for (const r of recipients) {
      const email = cleanEmail(r.email);
      if (email) return email;
    }
  } catch (err) {
    // Reply-To is an enhancement, never a reason to drop the email itself.
    console.warn('[reply-address] recipient lookup failed:', (err as any)?.message || err);
  }
  return null;
}
