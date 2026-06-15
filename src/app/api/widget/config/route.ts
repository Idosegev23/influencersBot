/**
 * Widget Config API — Returns theme and settings for the embedded widget
 * GET /api/widget/config?accountId=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { signWidgetToken } from '@/lib/analytics/widget-token';

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
    };

    return NextResponse.json(
      {
        language,
        theme: {
          primaryColor: widgetConfig.primaryColor || config.theme?.colors?.primary || '#6366f1',
          fontFamily: config.theme?.fonts?.body || 'system-ui',
          darkMode: config.theme?.darkMode || false,
          position: widgetConfig.position || 'bottom-right',
        },
        brandName: config.display_name || config.username || '',
        profilePic: config.profile_pic_url || null,
        coverImage: widgetConfig.coverImage || null,
        socialLinks: Array.isArray(widgetConfig.socialLinks) ? widgetConfig.socialLinks : [],
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
