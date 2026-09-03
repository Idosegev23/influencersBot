/**
 * PATCH /api/admin/accounts/[accountId] — update account config (widget settings etc.)
 * DELETE /api/admin/accounts/[accountId] — delete account
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { extendDemoWindow } from '@/lib/demo/access';

/**
 * PATCH /api/admin/accounts/[accountId]/config
 * Updates account config (merges widget settings)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  try {

    const { accountId } = await params;
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
    const updatedConfig: Record<string, any> = {
      ...currentConfig,
      widget: { ...(currentConfig.widget || {}), ...(body.widget || {}) },
    };

    // Demo flag — when set, the account is excluded from all automatic scan/AI crons
    if (typeof body.isDemo === 'boolean') {
      updatedConfig.isDemo = body.isDemo;
    }

    // Extend a demo window by a week. Sales reality: the meeting lands on day 9
    // and the demo cannot die on day 7.
    //
    // Measured from whichever is later — now, or the current end — so extending
    // a demo that still has days left adds to it rather than shortening it.
    // `extendDemoWindow` also clears `locked_at` so the reopened demo does not
    // read as closed; the weekly digest derives lock state from the dates.
    if (body.extendDemoWeek === true && currentConfig.demo) {
      const extended = extendDemoWindow(currentConfig.demo);
      if (extended) updatedConfig.demo = extended;
    }

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
  { params }: { params: Promise<{ accountId: string }> }
) {
  const denied2 = await requireAdminAuth();
  if (denied2) return denied2;

  try {
    const { accountId } = await params;

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
