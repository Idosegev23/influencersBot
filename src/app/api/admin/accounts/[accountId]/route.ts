/**
 * PATCH /api/admin/accounts/[accountId] — update account config (widget settings etc.)
 * DELETE /api/admin/accounts/[accountId] — delete account
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

/**
 * PATCH /api/admin/accounts/[accountId]/config
 * Updates account config (merges widget settings)
 */
export async function PATCH(
  request: Request,
  { params }: { params: { accountId: string } }
) {
  try {
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId } = params;
    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const body = await request.json();
    const supabase = await createClient();

    // Get current config
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('config')
      .eq('id', accountId)
      .single();

    if (fetchError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Merge new config into existing
    const currentConfig = account.config || {};
    const updatedConfig = {
      ...currentConfig,
      widget: { ...(currentConfig.widget || {}), ...(body.widget || {}) },
    };

    const { error: updateError } = await supabase
      .from('accounts')
      .update({ config: updatedConfig })
      .eq('id', accountId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update config', details: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, config: updatedConfig });
  } catch (error: any) {
    console.error('[Admin] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
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
