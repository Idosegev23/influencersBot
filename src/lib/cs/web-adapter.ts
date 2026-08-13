// Web adapter for the CS engine (spec §5): both web surfaces — the site widget and the main
// chat page — funnel their CS turns through here. Each route keeps its own CORS/session/auth
// handling; this module only assembles the identity, runs the core, and shapes the wire result.
// Suggestions are PARSED into chips here (where WhatsApp strips them) — spec §5's one line of
// channel divergence.
import { runCsTurnCore } from '@/lib/cs/cs-agent';
import type { CsIdentity } from '@/lib/cs/identity';
import type { CsUiPayload } from '@/lib/cs/payloads';

export interface WebCsTurnParams {
  channel: 'widget' | 'web_chat';
  accountId: string;
  channelUserId: string;          // widget: persistent ANON_ID; chat page: persistent anon id
  text: string;
  claimedPhone?: string;          // from the details form (spec §7 — asked once, stored on the session)
  mode?: 'cs' | 'content';
  language?: 'he' | 'en';
}

export interface WebCsTurnResult {
  text: string;                   // suggestion-free reply text
  suggestions: string[];          // quick-reply chips (spec §5: web parses where WhatsApp strips)
  payloads: CsUiPayload[];        // structured CS screens (spec §6)
}

export async function runWebCsTurn(p: WebCsTurnParams): Promise<WebCsTurnResult> {
  const identity: CsIdentity = p.channel === 'widget'
    ? { channel: 'widget', visitorId: p.channelUserId, trust: 'unverified' }
    : { channel: 'web_chat', sessionId: p.channelUserId, trust: 'unverified' };
  // The core upgrades trust to phone_claimed from claimedPhone / the session's stored phone.

  const turn = await runCsTurnCore({
    identity,
    text: p.text,
    boundAccountId: p.accountId,
    claimedPhone: p.claimedPhone,
    mode: p.mode ?? 'cs',
    language: p.language ?? 'he',
  });

  return {
    text: turn.reply.kind === 'text' ? turn.reply.body : '',
    suggestions: turn.suggestions ?? [],
    payloads: turn.payloads ?? [],
  };
}
