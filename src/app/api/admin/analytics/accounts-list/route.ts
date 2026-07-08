/**
 * Lightweight account list for the analytics page selector.
 * Returns id + display_name + username only — kept small so the
 * dropdown is fast even with 100+ accounts.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/auth/admin-auth';

export const runtime = 'nodejs';

export async function GET() {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { data, error } = await supabase
    .from('accounts')
    .select('id, type, status, config')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || [])
    // Exclude agent-CRM roster talents (config.crmOnly) — represented influencers, not Bestie accounts.
    .filter((a) => ((a.config || {}) as Record<string, any>).crmOnly !== true)
    .map((a) => {
    const cfg = (a.config || {}) as Record<string, any>;
    return {
      id: a.id,
      username: cfg.username || '',
      display_name: cfg.display_name || cfg.username || a.id.slice(0, 8),
      type: a.type,
      status: a.status,
      has_widget: !!cfg.widget || cfg.archetype === 'brand',
      widget_domain: cfg.widget?.domain || cfg.username || null,
    };
  });

  return NextResponse.json({ accounts: rows });
}
