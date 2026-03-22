import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/influencer/chatbot/insights?type=...
 * Get conversation insights for an account
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    const supabase = await createClient();

    let query = supabase
      .from('conversation_insights')
      .select('*')
      .eq('is_active', true)
      .order('occurrence_count', { ascending: false });

    if (type && type !== 'all') {
      query = query.eq('insight_type', type);
    }

    const { data, error } = await query.limit(100);
    if (error) throw error;

    return NextResponse.json({ insights: data || [] });
  } catch (error) {
    console.error('[Insights] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
