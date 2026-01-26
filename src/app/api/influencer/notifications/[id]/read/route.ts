import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/api-helpers';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: notificationId } = await context.params;

    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { user } = authResult;
    const supabase = await createClient();

    const { error } = await supabase
      .from('in_app_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', notificationId)
      .eq('user_id', user.id); // Ensure user owns the notification

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
