/**
 * Mini-CRM detail + update for a single support ticket.
 *
 * GET    — full ticket + history log
 * PATCH  — status / internal_notes / tracking_number / resolution_summary /
 *          assigned_to. Every change appends to support_ticket_history.
 *
 * Auth: brand-admin on this account OR platform admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, getInfluencerByUsername } from '@/lib/supabase';
import { sanitizeHtml } from '@/lib/sanitize';
import { checkInfluencerAuth } from '@/lib/auth/influencer-auth';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

const VALID_STATUSES = new Set([
  'new',
  'in_progress',
  'awaiting_customer',
  'shipped',
  'resolved',
  'closed',
  'cancelled',
]);

const STATUSES_WITH_RESOLVED_AT = new Set(['resolved', 'closed', 'cancelled']);

async function authorize(username: string) {
  const isInfluencer = await checkInfluencerAuth(username);
  const isAdmin = (await requireAdminAuth()) === null;
  return { ok: isInfluencer || isAdmin, isAdmin };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ username: string; id: string }> },
) {
  const { username, id } = await ctx.params;
  const { ok } = await authorize(username);
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // No FK on product_id — fetch the row alone, then resolve the product
  // separately from widget_products (which is the actual table the chat
  // BrandSupportTab writes its product picker against).
  const { data: ticket, error } = await supabase
    .from('support_requests')
    .select('*')
    .eq('account_id', influencer.id)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[ticket GET] db error:', error);
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }
  if (!ticket) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: history } = await supabase
    .from('support_ticket_history')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ ticket, history: history || [] });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ username: string; id: string }> },
) {
  const { username, id } = await ctx.params;
  const { ok } = await authorize(username);
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const influencer = await getInfluencerByUsername(username);
  if (!influencer) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  // Snapshot the existing row so we can record what changed in history.
  const { data: existing } = await supabase
    .from('support_requests')
    .select('id, status, internal_notes, assigned_to, tracking_number, resolution_summary')
    .eq('account_id', influencer.id)
    .eq('id', id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  const historyEntries: Array<{
    action: string;
    from_status?: string | null;
    to_status?: string | null;
    note?: string | null;
  }> = [];

  if (typeof body.status === 'string') {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    if (body.status !== existing.status) {
      update.status = body.status;
      if (STATUSES_WITH_RESOLVED_AT.has(body.status)) {
        update.resolved_at = new Date().toISOString();
      }
      historyEntries.push({
        action: 'status_change',
        from_status: existing.status,
        to_status: body.status,
        note: typeof body.statusNote === 'string' ? body.statusNote.slice(0, 500) : null,
      });
    }
  }

  if (typeof body.internal_notes === 'string') {
    const cleaned = sanitizeHtml(body.internal_notes).slice(0, 4000);
    if (cleaned !== (existing.internal_notes || '')) {
      update.internal_notes = cleaned;
      historyEntries.push({ action: 'note_added', note: cleaned.slice(0, 200) });
    }
  }

  if (typeof body.tracking_number === 'string') {
    const cleaned = body.tracking_number.replace(/[^A-Za-z0-9-]/g, '').slice(0, 32);
    if (cleaned !== (existing.tracking_number || '')) {
      update.tracking_number = cleaned || null;
    }
  }

  if (typeof body.resolution_summary === 'string') {
    const cleaned = sanitizeHtml(body.resolution_summary).slice(0, 4000);
    if (cleaned !== (existing.resolution_summary || '')) {
      update.resolution_summary = cleaned;
    }
  }

  if (typeof body.assigned_to === 'string') {
    const cleaned = body.assigned_to.replace(/[<>]/g, '').slice(0, 80);
    if (cleaned !== (existing.assigned_to || '')) {
      update.assigned_to = cleaned || null;
      historyEntries.push({ action: 'assigned', note: cleaned || 'unassigned' });
    }
  }

  if (Object.keys(update).length === 1) {
    // only updated_at — nothing actually changed
    return NextResponse.json({ ok: true, noop: true });
  }

  const { error: upErr } = await supabase
    .from('support_requests')
    .update(update)
    .eq('id', id)
    .eq('account_id', influencer.id);
  if (upErr) {
    console.error('[ticket PATCH] update failed:', upErr);
    return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }

  if (historyEntries.length > 0) {
    const actor = username; // best-effort attribution
    const rows = historyEntries.map((h) => ({
      ticket_id: id,
      account_id: influencer.id,
      actor,
      ...h,
    }));
    const { error: histErr } = await supabase.from('support_ticket_history').insert(rows);
    if (histErr) console.warn('[ticket PATCH] history insert failed (non-fatal):', histErr);
  }

  return NextResponse.json({ ok: true, updated: Object.keys(update).filter((k) => k !== 'updated_at') });
}
