/**
 * GET/PATCH /api/manage/settings
 * Widget settings management for website owners
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateManageSession } from '@/lib/manage/auth';

/**
 * GET — returns the full surface the customer panel renders: widget config,
 * theme, support email, and a redacted integration status (boolean only — we
 * never return the Shopify Admin API token to the browser).
 */
export async function GET() {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const { data: account, error } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', session.accountId)
      .single();

    if (error || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const config: any = account.config || {};
    const shop = config.integrations?.shopify || null;
    return NextResponse.json({
      success: true,
      widget: config.widget || {},
      displayName: config.display_name || config.username || '',
      domain: config.widget?.domain || config.username || '',
      theme: config.theme || {},
      supportEmail: config.support_email || '',
      // Token never leaves the server — surface presence only.
      integrations: {
        shopify: shop ? {
          shop_domain: shop.shop_domain || '',
          enabled: !!shop.enabled,
          has_token: !!shop.admin_api_token,
        } : { shop_domain: '', enabled: false, has_token: false },
      },
    });
  } catch (error: any) {
    console.error('[ManageSettings] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH — deep-merges into config.widget (prompt, colors, welcome)
 * Body: { prompt?: {...}, primaryColor?: string, welcomeMessage?: string, ... }
 */
export async function PATCH(request: Request) {
  const session = await validateManageSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = await createClient();

    // Get current config
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', session.accountId)
      .single();

    if (fetchError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const currentConfig: any = account.config || {};
    const currentWidget: any = currentConfig.widget || {};

    // Unpack top-level config sections from the request — anything else stays
    // a widget-level field for backwards compat with the existing tab.
    const {
      prompt: newPrompt,
      theme: newTheme,
      supportEmail: newSupportEmail,
      integrations: newIntegrations,
      modules: newModules,
      ...otherWidgetFields
    } = body;

    // ---- Widget block (everything currently lives here) ----
    const updatedWidget: any = {
      ...currentWidget,
      ...otherWidgetFields,
    };
    if (newPrompt) {
      updatedWidget.prompt = { ...(currentWidget.prompt || {}), ...newPrompt };
    }
    if (newModules && typeof newModules === 'object') {
      // Merge per-module so a partial PATCH (e.g. just toggling leads.enabled)
      // doesn't wipe support's categories or other module state.
      const curMods: any = currentWidget.modules || {};
      updatedWidget.modules = {
        support: { ...(curMods.support || {}), ...(newModules.support || {}) },
        leads: { ...(curMods.leads || {}), ...(newModules.leads || {}) },
        bookings: { ...(curMods.bookings || {}), ...(newModules.bookings || {}) },
      };
    }

    // ---- Build the new top-level config ----
    const updatedConfig: any = {
      ...currentConfig,
      widget: updatedWidget,
    };
    if (newTheme && typeof newTheme === 'object') {
      updatedConfig.theme = { ...(currentConfig.theme || {}), ...newTheme };
    }
    if (typeof newSupportEmail === 'string') {
      updatedConfig.support_email = newSupportEmail.trim() || undefined;
    }
    if (newIntegrations && typeof newIntegrations === 'object') {
      const curInt: any = currentConfig.integrations || {};
      const newShop = newIntegrations.shopify || {};
      const curShop: any = curInt.shopify || {};
      // Token handling: empty string means "don't touch" — only update when
      // the customer actually pasted a new value. Prevents the UI's "we don't
      // surface the token back" pattern from accidentally clearing it.
      const nextShop = {
        ...curShop,
        shop_domain: typeof newShop.shop_domain === 'string' ? newShop.shop_domain.trim() : curShop.shop_domain,
        enabled: typeof newShop.enabled === 'boolean' ? newShop.enabled : curShop.enabled,
        ...(typeof newShop.admin_api_token === 'string' && newShop.admin_api_token.trim()
          ? { admin_api_token: newShop.admin_api_token.trim() }
          : {}),
      };
      updatedConfig.integrations = { ...curInt, shopify: nextShop };
    }

    const { error: updateError } = await supabase
      .from('accounts')
      .update({ config: updatedConfig })
      .eq('id', session.accountId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update settings', details: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      widget: updatedWidget,
      theme: updatedConfig.theme || {},
      supportEmail: updatedConfig.support_email || '',
      integrations: {
        shopify: updatedConfig.integrations?.shopify
          ? {
            shop_domain: updatedConfig.integrations.shopify.shop_domain || '',
            enabled: !!updatedConfig.integrations.shopify.enabled,
            has_token: !!updatedConfig.integrations.shopify.admin_api_token,
          }
          : { shop_domain: '', enabled: false, has_token: false },
      },
    });
  } catch (error: any) {
    console.error('[ManageSettings] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
