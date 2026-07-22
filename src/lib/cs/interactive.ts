import type { BrandCandidate } from '@/lib/cs/brand-resolver';
import type { InteractiveButton, InteractiveRow, InteractiveSection } from '@/lib/whatsapp-cloud/client';

// The reply shape the show_* tools emit / the loop returns; the worker sends it by kind (C7).
export type CsReply =
  | { kind: 'text'; body: string }
  | { kind: 'buttons'; body: string; buttons: InteractiveButton[]; header?: string; footer?: string }
  | { kind: 'list'; body: string; buttonLabel: string; sections: InteractiveSection[]; header?: string; footer?: string }
  | { kind: 'none' };

// WhatsApp hard limits (recon): row.title<=24, row.desc<=72, button.title<=20, list buttonLabel<=20.
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + '…');

export function buildBrandDisambiguationList(candidates: BrandCandidate[], body?: string): CsReply {
  const rows: InteractiveRow[] = candidates.slice(0, 10).map((c) => ({
    id: `brand_${c.accountId}`,
    title: clip(c.displayName, 24),
    description: c.domain ? clip(c.domain, 72) : undefined,
  }));
  return {
    kind: 'list',
    body: body || 'לאיזה מותג לפנות?',
    buttonLabel: clip('בחירת מותג', 20),
    sections: [{ title: 'מותגים', rows }],
  };
}

export function buildBrandConfirmButtons(candidate: BrandCandidate): CsReply {
  const label = candidate.domain ? `${candidate.displayName} (${candidate.domain})` : candidate.displayName;
  return {
    kind: 'buttons',
    body: clip(`מדובר ב-${label}?`, 1024),
    buttons: [
      { id: 'confirm_yes', title: clip('כן', 20) },
      { id: 'confirm_no', title: clip('לא, מותג אחר', 20) },
    ],
  };
}

export function buildThreadReentryList(
  threads: Array<{ ticketId: string; brandName: string; topic: string }>,
): CsReply {
  const rows: InteractiveRow[] = threads.slice(0, 9).map((t) => ({
    id: `thread_${t.ticketId}`,
    title: clip(t.brandName, 24),
    description: clip(t.topic, 72),
  }));
  rows.push({ id: 'thread_new', title: clip('➕ פנייה חדשה', 24) });
  return {
    kind: 'list',
    body: 'במה נמשיך?',
    buttonLabel: clip('המשך שיחה', 20),
    sections: [{ title: 'הפניות שלך', rows }],
  };
}

export function buildSingleThreadButtons(brandName: string, topic: string): CsReply {
  return {
    kind: 'buttons',
    body: clip(`ממשיכים עם ${brandName} – ${topic}?`, 1024),
    buttons: [
      { id: 'reentry_continue', title: clip('כן, ממשיכים', 20) },
      { id: 'reentry_other', title: clip('משהו אחר', 20) },
    ],
  };
}
