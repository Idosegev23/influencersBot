/**
 * Widget Config API — Returns theme and settings for the embedded widget
 * GET /api/widget/config?accountId=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { signWidgetToken } from '@/lib/analytics/widget-token';
import { resolveBanner, resolveInvitation } from '@/lib/widget/banner';

function getCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  const corsHeaders = getCorsHeaders(origin);

  try {
    const accountId = req.nextUrl.searchParams.get('accountId');
    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabase = await createClient();
    const { data: account } = await supabase
      .from('accounts')
      .select('config, security_config, language')
      .eq('id', accountId)
      .single();

    const config = account?.config || {};
    const widgetConfig = config.widget || {};
    // Resolve language: widget override > account column > default. Anything
    // we don't have strings for falls back to 'he' so widget.js still renders.
    const SUPPORTED_LANGS = new Set(['he', 'en']);
    const rawLang = widgetConfig.language || account?.language || 'he';
    const language = SUPPORTED_LANGS.has(rawLang) ? rawLang : 'he';

    const FALLBACKS: Record<string, { welcome: string; placeholder: string }> = {
      he: { welcome: 'שלום! איך אפשר לעזור?', placeholder: 'שאלו משהו...' },
      en: { welcome: 'Hi! How can I help?', placeholder: 'Ask something...' },
    };
    const fb = FALLBACKS[language];

    let analyticsToken: string | null = null;
    try {
      analyticsToken = signWidgetToken(accountId);
    } catch (err) {
      console.warn('[Widget Config] could not sign analytics token:', err);
    }

    // Resolve module toggles. Defaults are all-off so legacy accounts behave
    // exactly as before. To enable: set
    //   config.widget.modules.support.enabled = true
    // (etc) and optionally `config.support_email` for ticket notifications.
    const rawModules = (widgetConfig.modules || {}) as Record<string, any>;
    const supportMod = rawModules.support || {};
    const leadsMod = rawModules.leads || {};
    const bookingsMod = rawModules.bookings || {};
    const modules = {
      support: {
        enabled: supportMod.enabled === true,
        categories: Array.isArray(supportMod.categories) && supportMod.categories.length
          ? supportMod.categories
          : ['order', 'product', 'return', 'other'],
      },
      leads: {
        enabled: leadsMod.enabled === true,
        trigger: leadsMod.trigger || 'manual',
      },
      bookings: {
        enabled: bookingsMod.enabled === true,
      },
      // CS-engine mode (spec §5): opening choice screen + CS conversation via the brand brain.
      // Root-level flag (config.cs_web) — shared with the main chat page, not a widget-only toggle.
      customerService: {
        enabled: (config as any)?.cs_web?.enabled === true,
      },
    };

    return NextResponse.json(
      {
        language,
        theme: {
          primaryColor: widgetConfig.primaryColor || config.theme?.colors?.primary || '#6366f1',
          // No `fontFamily` here on purpose: widget.js takes its font from
          // `locale.font` (the per-language Google Font) and has never read a
          // value from this response. Shipping the field back only invited
          // someone to "fix" the widget to honor a font nobody configured.
          darkMode: config.theme?.darkMode || false,
          position: widgetConfig.position || 'bottom-right',
        },
        brandName: config.display_name || config.username || '',
        profilePic: config.profile_pic_url || config.avatar_url || config.logo_url || widgetConfig.profilePic || null,
        coverImage: widgetConfig.coverImage || null,
        // Opening banner. Null keeps the pre-banner header exactly as it was,
        // so accounts that never configured one are untouched. The fallback
        // ladder (gradient from primaryColor, coverImage as art, copy caps)
        // lives in resolveBanner so widget.js and the chat page can't drift.
        banner: resolveBanner(config, 'widget', { brandName: config.display_name || config.username }),
        // The launcher's own copy. Separate from `tooltip` below, which is the
        // legacy string field the manage page writes; this one honours an
        // active promotion.
        invitation: resolveInvitation(config, 'widget'),
        socialLinks: Array.isArray(widgetConfig.socialLinks) ? widgetConfig.socialLinks : [],
        cartWatcher: (widgetConfig.cartWatcher && typeof widgetConfig.cartWatcher === 'object') ? widgetConfig.cartWatcher : null,
        tooltip: (widgetConfig.tooltip && typeof widgetConfig.tooltip === 'string' && widgetConfig.tooltip.trim())
          ? { text: String(widgetConfig.tooltip).trim().slice(0, 140) }
          : null,
        enabled: widgetConfig.enabled !== false,
        welcomeMessage: widgetConfig.welcomeMessage || fb.welcome,
        placeholder: widgetConfig.placeholder || fb.placeholder,
        domain: widgetConfig.domain || config.username || '',
        analyticsToken,
        modules,
      },
      { headers: corsHeaders },
    );
  } catch (error: any) {
    console.error('[Widget Config] Error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
