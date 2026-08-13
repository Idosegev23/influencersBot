// Instagram DM adapter for the CS engine (spec 2026-08-12, milestone 3).
// The account IS the brand on IG, so the turn auto-binds; the IGSID is an unverified
// identity — order access runs through the same trust matrix as the widget (a claimed
// phone must MATCH; guest-checkout orders escalate, never reveal). Suggestions are
// PARSED into IG quick replies (spec §5: the adapter parses where WhatsApp strips).
// Payloads are ignored on IG — the prose carries the answer (they are additive by design).
import { runCsTurnCore } from '@/lib/cs/cs-agent';

export async function runIgCsTurn(p: {
  accountId: string;
  igsid: string;
  text: string;
  language?: 'he' | 'en';
}): Promise<{ text: string; suggestions: string[] }> {
  const turn = await runCsTurnCore({
    identity: { channel: 'instagram', igsid: p.igsid, trust: 'unverified' },
    text: p.text,
    boundAccountId: p.accountId,
    mode: 'cs',
    language: p.language ?? 'he',
  });
  return {
    text: turn.reply.kind === 'text' ? turn.reply.body : '',
    suggestions: turn.suggestions ?? [],
  };
}
