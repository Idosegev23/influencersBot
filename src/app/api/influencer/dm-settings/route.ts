/**
 * Instagram DM Settings — Ice Breakers + Persistent Menu
 * POST /api/influencer/dm-settings — Configure DM experience for an Instagram account
 * GET  /api/influencer/dm-settings — Get current DM settings
 *
 * Sets up:
 * 1. Ice Breakers — 4 FAQ questions shown when user opens DM for first time
 * 2. Persistent Menu — always-visible menu in DM conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { setIceBreakers, setPersistentMenu } from '@/lib/instagram-graph/client';

// ============================================
// Default Configurations
// ============================================

const DEFAULT_ICE_BREAKERS = [
  { question: 'יש לך קופון? 🎁', payload: 'icebreaker_coupon' },
  { question: 'מה המוצר הכי שווה?', payload: 'icebreaker_best_product' },
  { question: 'מה חדש? ✨', payload: 'icebreaker_whats_new' },
  { question: 'יש בעיה במוצר', payload: 'icebreaker_product_issue' },
];

const DEFAULT_PERSISTENT_MENU = [
  { type: 'postback' as const, title: 'קופונים והנחות 🎁', payload: 'menu_coupons' },
  { type: 'postback' as const, title: 'מוצרים מומלצים ⭐', payload: 'menu_products' },
  { type: 'postback' as const, title: 'דברו איתי 💬', payload: 'menu_chat' },
];

// ============================================
// POST — Configure DM Settings
// ============================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, ice_breakers, persistent_menu, use_defaults } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get IG connection for this account
    const { data: connection } = await supabase
      .from('ig_graph_connections')
      .select('ig_business_account_id, access_token')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .single();

    if (!connection?.access_token) {
      return NextResponse.json(
        { error: 'No active Instagram connection found for this account' },
        { status: 404 },
      );
    }

    const igAccountId = connection.ig_business_account_id;
    const accessToken = connection.access_token;

    // Determine which config to use
    const iceBreakersConfig = use_defaults ? DEFAULT_ICE_BREAKERS : (ice_breakers || DEFAULT_ICE_BREAKERS);
    const menuConfig = use_defaults ? DEFAULT_PERSISTENT_MENU : (persistent_menu || DEFAULT_PERSISTENT_MENU);

    // Optionally add website link to persistent menu
    const { data: accountData } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', accountId)
      .single();

    const websiteUrl = accountData?.config?.website;
    const finalMenu = [...menuConfig];
    if (websiteUrl && !finalMenu.some((m: any) => m.type === 'web_url')) {
      finalMenu.push({ type: 'web_url' as const, title: 'לאתר 🌐', url: websiteUrl });
    }

    const results: any = { ice_breakers: null, persistent_menu: null };

    // Set Ice Breakers
    try {
      await setIceBreakers(igAccountId, iceBreakersConfig, accessToken);
      results.ice_breakers = { success: true, count: iceBreakersConfig.length };
      console.log(`[DM Settings] Ice breakers set for ${igAccountId}: ${iceBreakersConfig.length} questions`);
    } catch (err: any) {
      results.ice_breakers = { success: false, error: err.message };
      console.error(`[DM Settings] Ice breakers failed for ${igAccountId}:`, err.message);
    }

    // Set Persistent Menu
    try {
      await setPersistentMenu(igAccountId, finalMenu, accessToken);
      results.persistent_menu = { success: true, count: finalMenu.length };
      console.log(`[DM Settings] Persistent menu set for ${igAccountId}: ${finalMenu.length} items`);
    } catch (err: any) {
      results.persistent_menu = { success: false, error: err.message };
      console.error(`[DM Settings] Persistent menu failed for ${igAccountId}:`, err.message);
    }

    // Save config to accounts.config.dm_settings
    const dmSettings = {
      ice_breakers: iceBreakersConfig,
      persistent_menu: finalMenu,
      configured_at: new Date().toISOString(),
    };

    await supabase
      .from('accounts')
      .update({
        config: {
          ...accountData?.config,
          dm_settings: dmSettings,
        },
      })
      .eq('id', accountId);

    return NextResponse.json({
      success: true,
      results,
      config: dmSettings,
    });
  } catch (error: any) {
    console.error('[DM Settings] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// GET — Get Current DM Settings
// ============================================

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId');

  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: accountData } = await supabase
    .from('accounts')
    .select('config')
    .eq('id', accountId)
    .single();

  const dmSettings = accountData?.config?.dm_settings || null;

  return NextResponse.json({
    configured: !!dmSettings,
    settings: dmSettings,
    defaults: {
      ice_breakers: DEFAULT_ICE_BREAKERS,
      persistent_menu: DEFAULT_PERSISTENT_MENU,
    },
  });
}
