import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');

    if (!accountId) {
      return NextResponse.json(
        { error: 'account_id required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('in_app_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('account_id', accountId)
      .eq('is_read', false);

    if (error) {
      console.error('Error marking all notifications as read:', error);
      return NextResponse.json(
        { error: 'שגיאה בעדכון התראות' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'כל ההתראות סומנו כנקראו',
    });
  } catch (error) {
    console.error('Error in PATCH /api/influencer/notifications/mark-all-read:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}
