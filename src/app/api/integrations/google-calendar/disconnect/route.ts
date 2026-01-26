import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-helpers';
import { createClient } from '@/lib/supabase';

/**
 * POST /api/integrations/google-calendar/disconnect
 * ניתוק חיבור לGoogle Calendar
 */
export async function POST(request: NextRequest) {
  const authCheck = await requireAuth(request);
  if (!authCheck.authorized) {
    return authCheck.response!;
  }

  const supabase = createClient();

  try {
    // Delete connection (cascade will delete events and logs)
    const { error } = await supabase
      .from('calendar_connections')
      .delete()
      .eq('user_id', authCheck.user!.id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Calendar disconnected successfully',
    });
  } catch (error: any) {
    console.error('Error disconnecting calendar:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect calendar', details: error.message },
      { status: 500 }
    );
  }
}
