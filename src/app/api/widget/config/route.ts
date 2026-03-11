/**
 * Widget Config API — Returns theme and settings for the embedded widget
 * GET /api/widget/config?accountId=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
      .select('config, security_config')
      .eq('id', accountId)
      .single();

    const config = account?.config || {};
    const widgetConfig = config.widget || {};

    return NextResponse.json(
      {
        theme: {
          primaryColor: widgetConfig.primaryColor || config.theme?.colors?.primary || '#6366f1',
          fontFamily: config.theme?.fonts?.body || 'system-ui',
          darkMode: config.theme?.darkMode || false,
          position: widgetConfig.position || 'bottom-right',
        },
        brandName: config.display_name || config.username || '',
        welcomeMessage: widgetConfig.welcomeMessage || 'שלום! איך אפשר לעזור?',
        placeholder: widgetConfig.placeholder || 'שאלו משהו...',
        domain: widgetConfig.domain || config.username || '',
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
