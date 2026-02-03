/**
 * DELETE /api/admin/cleanup?username=xxx
 * מוחק את כל החשבונות והנתונים של username מסוים (כולל duplicates)
 * שימושי למחיקה מהירה של ניסיונות מרובים
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

export async function DELETE(request: Request) {
  try {
    const isAdmin = await checkAdminAuth();
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'username is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    console.log(`[Cleanup] Deleting all accounts and data for username: ${username}`);

    // Find all accounts with this username
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, legacy_influencer_id')
      .eq('type', 'creator')
      .eq('config->>username', username);

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No accounts found',
        deleted: 0,
      });
    }

    console.log(`[Cleanup] Found ${accounts.length} accounts to delete`);

    let deletedCount = 0;

    for (const account of accounts) {
      console.log(`[Cleanup] Deleting account ${account.id}...`);

      // Delete Instagram data (CASCADE should handle, but be explicit)
      await supabase.from('instagram_comments').delete().eq('account_id', account.id);
      await supabase.from('instagram_posts').delete().eq('account_id', account.id);
      await supabase.from('instagram_hashtags').delete().eq('account_id', account.id);
      await supabase.from('instagram_profile_history').delete().eq('account_id', account.id);
      
      // Delete scraping jobs
      await supabase.from('scraping_jobs').delete().eq('account_id', account.id);
      
      // Delete persona
      await supabase.from('chatbot_persona').delete().eq('account_id', account.id);
      
      // Delete the account
      await supabase.from('accounts').delete().eq('id', account.id);
      
      // Delete legacy influencer if exists
      if (account.legacy_influencer_id) {
        const { error } = await supabase
          .from('influencers')
          .delete()
          .eq('id', account.legacy_influencer_id);
        
        if (error) {
          console.error(`[Cleanup] Error deleting legacy influencer:`, error);
        }
      }

      deletedCount++;
      console.log(`[Cleanup] Account ${account.id} deleted successfully`);
    }

    console.log(`[Cleanup] Cleanup complete: ${deletedCount} accounts deleted`);

    return NextResponse.json({
      success: true,
      message: `Deleted ${deletedCount} accounts for @${username}`,
      deleted: deletedCount,
    });

  } catch (error: any) {
    console.error('[Cleanup] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
