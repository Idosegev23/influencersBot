import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    // Get query params
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const unreadOnly = searchParams.get('unread_only') === 'true';

    if (!accountId) {
      return NextResponse.json(
        { error: 'account_id required' },
        { status: 400 }
      );
    }

    // Build query - using account_id instead of user_id
    let query = supabase
      .from('in_app_notifications')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching notifications:', error);
      return NextResponse.json(
        { error: 'שגיאה בטעינת התראות' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      notifications: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error('Error in GET /api/influencer/notifications:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}
