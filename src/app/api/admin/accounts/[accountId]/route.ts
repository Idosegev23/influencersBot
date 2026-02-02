/**
 * DELETE /api/admin/accounts/[accountId]
 * מוחק account ואת כל הנתונים הקשורים
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

const ADMIN_COOKIE_NAME = 'influencerbot_admin_session';

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE_NAME);
  return session?.value === 'authenticated';
}

export async function DELETE(
  request: Request,
  { params }: { params: { accountId: string } }
) {
  try {
    // Check admin authentication
    const isAdmin = await checkAdminAuth();
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { accountId } = params;

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    console.log(`[Admin] Deleting account ${accountId}`);

    // Delete account (CASCADE will handle related data)
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', accountId);

    if (error) {
      console.error('[Admin] Error deleting account:', error);
      return NextResponse.json(
        { error: 'Failed to delete account', details: error.message },
        { status: 500 }
      );
    }

    console.log(`[Admin] Successfully deleted account ${accountId}`);

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
    });

  } catch (error: any) {
    console.error('[Admin] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
