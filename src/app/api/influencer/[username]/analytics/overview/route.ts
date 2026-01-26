import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/api-helpers';
import { AudienceAnalytics } from '@/lib/analytics/audience';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await context.params;

    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const supabase = await createClient();

    // Get account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, owner_user_id')
      .eq('name', username)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'חשבון לא נמצא' },
        { status: 404 }
      );
    }

    // Check access
    if (!authResult.user || account.owner_user_id !== authResult.user.id) {
      // TODO: Check if user is an agent with access
      return NextResponse.json(
        { error: 'אין הרשאה לצפות בנתונים' },
        { status: 403 }
      );
    }

    const analytics = new AudienceAnalytics(supabase);
    const overview = await analytics.getOverview(account.id);

    return NextResponse.json({
      success: true,
      overview,
    });
  } catch (error) {
    console.error('Error in GET /api/influencer/[username]/analytics/overview:', error);
    return NextResponse.json(
      { error: 'שגיאת שרת פנימית' },
      { status: 500 }
    );
  }
}
