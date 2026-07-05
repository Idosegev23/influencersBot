/**
 * POST /api/widget/recommendations/click
 * Track when a user clicks a product recommendation in the widget.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================
// CORS Headers
// ============================================

function getCorsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// ============================================
// OPTIONS — CORS Preflight
// ============================================

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin') || '*';
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { recommendationId, productId, accountId } = await request.json();

    if (!productId || !accountId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400, headers: corsHeaders });
    }

    const supabase = await createClient();

    // Update specific recommendation if ID provided
    if (recommendationId) {
      await supabase
        .from('widget_recommendations')
        .update({ was_clicked: true, clicked_at: new Date().toISOString() })
        .eq('id', recommendationId);
    } else {
      // Find the most recent recommendation for this product + account
      const { data: rec } = await supabase
        .from('widget_recommendations')
        .select('id')
        .eq('account_id', accountId)
        .eq('product_id', productId)
        .eq('was_clicked', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rec) {
        await supabase
          .from('widget_recommendations')
          .update({ was_clicked: true, clicked_at: new Date().toISOString() })
          .eq('id', rec.id);
      }
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('[RecommendationClick] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: corsHeaders });
  }
}
