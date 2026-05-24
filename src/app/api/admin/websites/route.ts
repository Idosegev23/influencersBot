import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import crypto from 'crypto';

/**
 * POST /api/admin/websites - Generate management token for an account
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  try {
    const { accountId } = await request.json();
    if (!accountId) {
      return NextResponse.json({ error: 'accountId required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get current config
    const { data: account, error: fetchErr } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', accountId)
      .single();

    if (fetchErr || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');

    // Deep merge into config.widget.managementToken
    const config = account.config || {};
    config.widget = config.widget || {};
    config.widget.managementToken = token;

    const { error: updateErr } = await supabase
      .from('accounts')
      .update({ config })
      .eq('id', accountId);

    if (updateErr) throw new Error(updateErr.message);

    return NextResponse.json({ success: true, token });
  } catch (error: any) {
    console.error('[Admin Websites] Generate token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/admin/websites - List all accounts with a widget domain configured.
 *
 * Returns enabled + module state so the admin UI can render toggles + capability
 * badges. Includes accounts where the widget is DISABLED so the toggle is
 * symmetric (admin can flip it on/off without losing visibility).
 */
export async function GET() {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  try {
    const supabase = await createClient();

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, config, language')
      .eq('status', 'active')
      .not('config->widget', 'is', null);

    if (error) throw new Error(error.message);

    const websites = [];

    for (const account of accounts || []) {
      const widgetConfig = account.config?.widget;
      // Filter on `domain` (registered widgets) rather than `enabled` so the
      // admin sees both on AND off widgets and can flip the toggle either way.
      // Accounts that never had a widget registered (no domain) stay out of view.
      if (!widgetConfig?.domain) continue;

      const domain = widgetConfig.domain || account.config?.username || '';
      const displayName = account.config?.display_name || domain;
      const modulesRaw = (widgetConfig.modules || {}) as Record<string, any>;
      const modules = {
        support: { enabled: modulesRaw.support?.enabled === true },
        leads: { enabled: modulesRaw.leads?.enabled === true },
        bookings: { enabled: modulesRaw.bookings?.enabled === true },
      };

      // Capability badges — what does this widget actually have wired up?
      const [{ count: pagesCount }, { count: chunksCount }, { count: productsCount }] = await Promise.all([
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('account_id', account.id),
        supabase.from('document_chunks').select('id', { count: 'exact', head: true }).eq('account_id', account.id),
        supabase.from('widget_products').select('id', { count: 'exact', head: true }).eq('account_id', account.id).eq('is_available', true),
      ]);

      websites.push({
        id: account.id,
        domain,
        displayName,
        url: `https://${domain}`,
        language: account.language || 'he',
        enabled: widgetConfig.enabled === true,
        modules,
        pagesCount: pagesCount || 0,
        chunksCount: chunksCount || 0,
        productsCount: productsCount || 0,
        supportEmail: account.config?.support_email || null,
        primaryColor: widgetConfig.primaryColor || '#6366f1',
        profilePic: account.config?.profile_pic_url || null,
        managementToken: widgetConfig.managementToken || null,
      });
    }

    return NextResponse.json({ websites });
  } catch (error: any) {
    console.error('[Admin Websites] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/websites - Toggle widget enabled state or per-module
 * enabled state on an account. Body shape:
 *   { accountId, enabled?: boolean, module?: 'support'|'leads'|'bookings', moduleEnabled?: boolean }
 *
 * Each call mutates exactly one flag. Multi-flag updates = multiple calls so
 * the UI can show optimistic per-toggle feedback without coupling them.
 */
export async function PATCH(request: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  try {
    const body = await request.json();
    const { accountId, enabled, module: moduleName, moduleEnabled } = body || {};

    if (!accountId) {
      return NextResponse.json({ error: 'accountId required' }, { status: 400 });
    }

    // Exactly one mutation per request. Rejects ambiguous payloads early so
    // we never silently drop one of them.
    const isMasterToggle = typeof enabled === 'boolean';
    const isModuleToggle = typeof moduleName === 'string' && typeof moduleEnabled === 'boolean';
    if (isMasterToggle === isModuleToggle) {
      return NextResponse.json(
        { error: 'Provide either {enabled} or {module, moduleEnabled} — not both, not neither' },
        { status: 400 },
      );
    }
    if (isModuleToggle && !['support', 'leads', 'bookings'].includes(moduleName)) {
      return NextResponse.json({ error: 'Unknown module: ' + moduleName }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: account, error: fetchErr } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', accountId)
      .single();

    if (fetchErr || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Read-modify-write rather than a Postgres jsonb_set so we don't have to
    // synthesize the entire nested key path for new branches; cleaner with the
    // shape we already have in TS.
    const config: any = account.config || {};
    config.widget = config.widget || {};
    if (isMasterToggle) {
      config.widget.enabled = enabled;
    } else {
      config.widget.modules = config.widget.modules || {};
      config.widget.modules[moduleName] = config.widget.modules[moduleName] || {};
      config.widget.modules[moduleName].enabled = moduleEnabled;
    }

    const { error: updateErr } = await supabase
      .from('accounts')
      .update({ config })
      .eq('id', accountId);

    if (updateErr) throw new Error(updateErr.message);

    return NextResponse.json({
      success: true,
      enabled: !!config.widget.enabled,
      modules: {
        support: { enabled: config.widget.modules?.support?.enabled === true },
        leads: { enabled: config.widget.modules?.leads?.enabled === true },
        bookings: { enabled: config.widget.modules?.bookings?.enabled === true },
      },
    });
  } catch (error: any) {
    console.error('[Admin Websites] PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
