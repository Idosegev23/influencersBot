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

    // Filter on `domain` (registered widgets) rather than `enabled` so the
    // admin sees both on AND off widgets and can flip the toggle either way.
    // Accounts that never had a widget registered (no domain) stay out of view.
    const sites = (accounts || []).filter((a: any) => a.config?.widget?.domain);

    // Capability badges for every site in ONE round trip. This used to be three
    // `count: 'exact'` queries inside this loop — the inner Promise.all only
    // parallelised the three counts within one account, so 44 accounts meant
    // 132 queries in 44 SERIAL round trips: measured 22,995 ms against 69–336 ms
    // for the grouped function (migration 091). Each individual count is ~2 ms;
    // the cost was entirely round trips, not the database.
    //
    // Do NOT "simplify" this to .in(ids) + counting rows client-side: PostgREST
    // caps at 1000 rows by default and document_chunks holds 124,657, so that
    // silently under-reports instead of failing.
    const counts = new Map<string, { pages: number; chunks: number; products: number }>();
    if (sites.length > 0) {
      const { data: countRows, error: countErr } = await supabase.rpc('admin_widget_content_counts', {
        p_account_ids: sites.map((a: any) => a.id),
      });
      // Badges are decoration; the toggles are why this page exists. A counts
      // failure degrades to zeros rather than blanking the admin's controls.
      if (countErr) {
        console.error('[Admin Websites] counts query failed, showing zeros:', countErr.message);
      }
      for (const row of countRows || []) {
        counts.set(row.account_id, {
          pages: Number(row.pages) || 0,
          chunks: Number(row.chunks) || 0,
          products: Number(row.products) || 0,
        });
      }
    }

    const websites = [];

    for (const account of sites) {
      const widgetConfig = account.config?.widget;

      const domain = widgetConfig.domain || account.config?.username || '';
      const displayName = account.config?.display_name || domain;
      const modulesRaw = (widgetConfig.modules || {}) as Record<string, any>;
      const modules = {
        support: { enabled: modulesRaw.support?.enabled === true },
        leads: { enabled: modulesRaw.leads?.enabled === true },
        bookings: { enabled: modulesRaw.bookings?.enabled === true },
      };

      // An account with no rows at all gets no row back from the grouped
      // aggregate — that's a zero, not a missing badge.
      const { pages: pagesCount, chunks: chunksCount, products: productsCount } =
        counts.get(account.id) || { pages: 0, chunks: 0, products: 0 };

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
        supportWhatsappPhone: account.config?.support_whatsapp_phone || null,
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
 * PATCH /api/admin/websites - Mutate one widget setting on an account. Body is
 * exactly ONE of:
 *   { accountId, enabled: boolean }                                   // master on/off
 *   { accountId, module: 'support'|'leads'|'bookings', moduleEnabled } // module toggle
 *   { accountId, contact: { supportEmail?, supportWhatsappPhone? } }   // support routing
 *
 * Toggles stay single-flag so the UI shows optimistic per-toggle feedback.
 * The contact form saves both fields together (one Save button).
 */
export async function PATCH(request: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  try {
    const body = await request.json();
    const { accountId, enabled, module: moduleName, moduleEnabled, contact } = body || {};

    if (!accountId) {
      return NextResponse.json({ error: 'accountId required' }, { status: 400 });
    }

    // Exactly one mutation per request. Rejects ambiguous payloads early so
    // we never silently drop one of them.
    const isMasterToggle = typeof enabled === 'boolean';
    const isModuleToggle = typeof moduleName === 'string' && typeof moduleEnabled === 'boolean';
    const isContactUpdate = contact != null && typeof contact === 'object';
    const mutationCount = [isMasterToggle, isModuleToggle, isContactUpdate].filter(Boolean).length;
    if (mutationCount !== 1) {
      return NextResponse.json(
        { error: 'Provide exactly one of {enabled} | {module, moduleEnabled} | {contact}' },
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
    } else if (isModuleToggle) {
      config.widget.modules = config.widget.modules || {};
      config.widget.modules[moduleName] = config.widget.modules[moduleName] || {};
      config.widget.modules[moduleName].enabled = moduleEnabled;
    } else {
      // Contact routing — read by /api/support for email + WhatsApp notification.
      // Stored at top-level config (not under widget) to match where it's read.
      if ('supportEmail' in contact) {
        const email = typeof contact.supportEmail === 'string' ? contact.supportEmail.trim() : '';
        config.support_email = email || null;
      }
      if ('supportWhatsappPhone' in contact) {
        // Keep digits and a leading +; drop spaces, dashes, parens.
        const raw = typeof contact.supportWhatsappPhone === 'string' ? contact.supportWhatsappPhone.trim() : '';
        const digits = raw.replace(/\D/g, '');
        const normalized = digits ? (raw.startsWith('+') ? '+' : '') + digits : '';
        config.support_whatsapp_phone = normalized || null;
      }
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
      supportEmail: config.support_email || null,
      supportWhatsappPhone: config.support_whatsapp_phone || null,
    });
  } catch (error: any) {
    console.error('[Admin Websites] PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
