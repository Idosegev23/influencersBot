import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: notificationId } = await context.params;
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
      .eq('id', notificationId)
      .eq('account_id', accountId); // Ensure account owns the notification

    if (error) {
      console.error('Error marking notification as read:', error);
      return NextResponse.json(
        { error: 'שגיאה בעדכון התראה' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'ההתראה סומנה כנקראה',
    });
  } catch (error) {
    console.error('Error in PATCH /api/influencer/notifications/[id]/read:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}
