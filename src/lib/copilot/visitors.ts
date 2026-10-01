/**
 * Visitor profiles. One profile per visitor from the first visit; identities
 * from the same member on two devices merge into one profile, so Multiview
 * sees one journey per person.
 */
import { supabase } from '@/lib/supabase';
import { planIdentityPatch, type IdentityUpdate, type VisitorIdentity } from './identity';
import type { AssociationTenant } from './tenant';

export interface VisitorRow extends VisitorIdentity {
  id: string;
  partner_id: string;
  account_id: string;
  anon_id: string;
  merged_into: string | null;
  identity_resolved_at: string | null;
}

const COLS = 'id, partner_id, account_id, anon_id, member_ref, email, name, company, company_domain, identity_source, identity_resolved_at, membership, merged_into';
const MAX_HOPS = 5;

/** The visitor is already a different member than the one being asserted (shared device). */
export class IdentityConflictError extends Error {}

export function isValidAnonId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);
}

async function byId(id: string): Promise<VisitorRow | null> {
  const { data, error } = await supabase.from('visitors').select(COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(`visitor read failed: ${error.message}`);
  return (data as VisitorRow) ?? null;
}

async function followMerges(v: VisitorRow | null): Promise<VisitorRow | null> {
  let cur = v;
  for (let i = 0; cur?.merged_into && i < MAX_HOPS; i++) cur = await byId(cur.merged_into);
  return cur;
}

export async function getVisitor(t: AssociationTenant, visitorId: string): Promise<VisitorRow | null> {
  const v = await followMerges(await byId(visitorId));
  return v && v.account_id === t.accountId ? v : null;
}

export async function getOrCreateVisitor(t: AssociationTenant, anonId: string): Promise<VisitorRow> {
  await supabase.from('visitors').upsert(
    { partner_id: t.partnerId, account_id: t.accountId, anon_id: anonId },
    { onConflict: 'account_id,anon_id', ignoreDuplicates: true },
  );
  const { data, error } = await supabase.from('visitors').select(COLS)
    .eq('account_id', t.accountId).eq('anon_id', anonId).maybeSingle();
  if (error) throw new Error(`visitor read failed: ${error.message}`);
  const v = await followMerges(data as VisitorRow);
  if (!v) throw new Error('visitor upsert returned nothing');
  await supabase.from('visitors').update({ last_seen: new Date().toISOString() }).eq('id', v.id);
  return v;
}

export async function applyIdentity(
  t: AssociationTenant, v: VisitorRow, upd: IdentityUpdate,
): Promise<{ visitor: VisitorRow; merged: boolean }> {
  if (v.member_ref && upd.memberRef && v.member_ref !== upd.memberRef) {
    throw new IdentityConflictError('visitor is already identified as a different member');
  }
  let target = v;
  let merged = false;

  if (upd.memberRef) {
    const { data: owner } = await supabase.from('visitors').select(COLS)
      .eq('account_id', t.accountId).eq('member_ref', upd.memberRef).is('merged_into', null)
      .neq('id', v.id).maybeSingle();
    if (owner) {
      const { error } = await supabase.rpc('copilot_merge_visitor', { p_from: v.id, p_into: (owner as VisitorRow).id });
      if (error) throw new Error(`merge failed: ${error.message}`);
      target = owner as VisitorRow;
      merged = true;
    }
  }

  const patch = planIdentityPatch(target, upd, new Date().toISOString());
  if (patch) {
    const { error } = await supabase.from('visitors').update(patch).eq('id', target.id);
    if (error) throw new Error(`identity update failed: ${error.message}`);
    target = { ...target, ...patch } as VisitorRow;
  }
  return { visitor: target, merged };
}
