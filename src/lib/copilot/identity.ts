/**
 * Visitor identity rules. Multiview's Intent Exchange needs company identity
 * on as many interactions as possible, but only identity the visitor gave us:
 * login, a signed newsletter link, or an email typed into the chat.
 */
import { isConsumerMailDomain, normalizeEmail, domainOf } from '@/lib/support/email-deliverability';
import { AmsUnavailableError, type AmsAdapter, type MemberSnapshot } from './ams/types';

export type IdentitySource = 'ams_login' | 'newsletter' | 'ams_email' | 'email_domain' | 'external';

export const IDENTITY_RANK: Record<IdentitySource, number> = {
  ams_login: 5, newsletter: 4, ams_email: 3, email_domain: 2, external: 1,
};

export interface IdentityUpdate {
  source: IdentitySource;
  memberRef?: string | null;
  email?: string | null;
  name?: string | null;
  company?: string | null;
  companyDomain?: string | null;
  membership?: MemberSnapshot | null;
}

export interface VisitorIdentity {
  identity_source: IdentitySource | null;
  member_ref: string | null;
  email: string | null;
  name: string | null;
  company: string | null;
  company_domain: string | null;
  membership: unknown;
}

const FIELDS: Array<[keyof IdentityUpdate, keyof VisitorIdentity]> = [
  ['memberRef', 'member_ref'], ['email', 'email'], ['name', 'name'],
  ['company', 'company'], ['companyDomain', 'company_domain'], ['membership', 'membership'],
];

/** The columns to write, or null when the update changes nothing. */
export function planIdentityPatch(cur: VisitorIdentity, upd: IdentityUpdate, nowIso: string): Record<string, unknown> | null {
  const stronger = cur.identity_source === null || IDENTITY_RANK[upd.source] >= IDENTITY_RANK[cur.identity_source];
  const patch: Record<string, unknown> = {};
  for (const [from, to] of FIELDS) {
    const v = upd[from];
    if (v === undefined || v === null || v === '') continue;
    if (stronger ? cur[to] !== v : cur[to] === null) patch[to] = v;
  }
  if (stronger && cur.identity_source !== upd.source) patch.identity_source = upd.source;
  if (Object.keys(patch).length === 0) return null;
  if (stronger) { patch.identity_source = upd.source; patch.identity_resolved_at = nowIso; }
  return patch;
}

const CONSUMER_ISP_DOMAINS = new Set([
  'comcast.net', 'att.net', 'sbcglobal.net', 'verizon.net', 'bellsouth.net', 'cox.net',
  'charter.net', 'earthlink.net', 'optonline.net', 'frontier.com', 'windstream.net', 'rocketmail.com',
  'btinternet.com', 'sky.com', 'virginmedia.com', 'ntlworld.com', 'talktalk.net', 'blueyonder.co.uk',
  'rogers.com', 'shaw.ca', 'sympatico.ca', 'bigpond.com', 'optusnet.com.au',
]);
/** Consumer brand labels, matched on the name label so every country variant (yahoo.co.uk) is caught. */
const CONSUMER_BRAND_LABELS = new Set([
  'gmail', 'googlemail', 'yahoo', 'ymail', 'hotmail', 'outlook', 'live', 'msn', 'aol', 'icloud', 'me', 'mac',
  'gmx', 'proton', 'protonmail', 'zoho', 'yandex', 'mail', 'email',
]);
const TWO_PART_SUFFIXES = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.au', 'co.il', 'com.br', 'co.nz', 'co.za', 'com.mx']);

export function companyFromEmail(email: string): { domain: string; company: string } | null {
  const norm = normalizeEmail(email)?.toLowerCase();
  if (!norm) return null;
  const domain = domainOf(norm);
  if (isConsumerMailDomain(domain) || CONSUMER_ISP_DOMAINS.has(domain)) return null;
  const labels = domain.split('.');
  if (labels.length < 2) return null;
  const lastTwo = labels.slice(-2).join('.');
  const nameLabel = TWO_PART_SUFFIXES.has(lastTwo) ? labels[labels.length - 3] : labels[labels.length - 2];
  if (!nameLabel || CONSUMER_BRAND_LABELS.has(nameLabel)) return null;
  const company = nameLabel.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  if (!company) return null;
  return { domain, company };
}

export async function identityFromEmail(
  email: string, ams: AmsAdapter | null,
): Promise<{ update: IdentityUpdate | null; amsUnavailable: boolean }> {
  const norm = normalizeEmail(email)?.toLowerCase() ?? null;
  if (!norm) return { update: null, amsUnavailable: false };
  let amsUnavailable = false;
  if (ams) {
    try {
      const m = await ams.findMemberByEmail(norm);
      if (m) {
        return {
          update: { source: 'ams_email', memberRef: m.memberRef, email: norm, name: m.name, company: m.company, membership: m },
          amsUnavailable: false,
        };
      }
    } catch (e) {
      if (!(e instanceof AmsUnavailableError)) throw e;
      amsUnavailable = true;
    }
  }
  const co = companyFromEmail(norm);
  if (!co) return { update: null, amsUnavailable };
  return { update: { source: 'email_domain', email: norm, company: co.company, companyDomain: co.domain }, amsUnavailable };
}
