import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');

    if (!accountId) {
      return NextResponse.json(
        { error: 'account_id required' },
        { status: 400 }
      );
    }

    const { count, error } = await supabase
      .from('in_app_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('is_read', false);

    if (error) {
      console.error('Error counting unread notifications:', error);
      return NextResponse.json(
        { error: 'שגיאה בספירת התראות' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: count || 0,
    });
  } catch (error) {
    console.error('Error in GET /api/influencer/notifications/unread-count:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}
