import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

const COOKIE_NAME = 'influencerbot_admin_session';

// Check admin authentication
async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);
  return session?.value === 'authenticated';
}

/**
 * POST /api/admin/accounts/finalize
 * Finalize account setup with subdomain, password, phone, etc.
 */
export async function POST(request: Request) {
  const isAuth = await checkAuth();
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      accountId,
      username,
      subdomain,
      password,
      phoneNumber,
      whatsappEnabled,
    } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Update account config with subdomain and settings
    const config: any = {
      username,
      subdomain: subdomain || username,
    };

    if (phoneNumber) {
      config.phone = phoneNumber;
    }

    const updates: any = {
      config,
    };

    if (whatsappEnabled !== undefined) {
      updates.features = {
        chatbot: true,
        analytics: true,
        whatsapp: whatsappEnabled,
      };
    }

    const { error: updateError } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', accountId);

    if (updateError) {
      console.error('Error updating account:', updateError);
      return NextResponse.json(
        { error: 'Failed to update account', details: updateError.message },
        { status: 500 }
      );
    }

    // Create user record if password provided
    if (password) {
      const { error: userError } = await supabase
        .from('users')
        .upsert({
          account_id: accountId,
          email: `${subdomain || username}@influencerbot.local`,
          full_name: username,
          role: 'influencer',
        }, {
          onConflict: 'account_id',
        });

      if (userError) {
        console.warn('Failed to create user record:', userError);
        // Don't fail - this is optional
      }
    }

    console.log(`[Accounts] Finalized account ${accountId}`);

    return NextResponse.json({
      success: true,
      accountId,
    });
  } catch (error) {
    console.error('Error in POST /api/admin/accounts/finalize:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
