import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { sendInfluencerWelcome, fireAndForget } from '@/lib/whatsapp-notify';

/**
 * POST /api/admin/accounts/finalize
 * Finalize account setup with subdomain, password, phone, etc.
 */
export async function POST(request: Request) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

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
          email: `${subdomain || username}@bestieai.local`,
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

    // Fire WhatsApp welcome template to the new influencer (MARKETING —
    // Meta classified this as marketing, so requires explicit opt-in).
    // Gated by WHATSAPP_NOTIFY_ENABLED + WHATSAPP_TEMPLATE_INFLUENCER_WELCOME
    // + whatsappMarketingOptIn from the finalize body.
    const whatsappMarketingOptIn = body.whatsappMarketingOptIn === true;
    if (phoneNumber && whatsappEnabled && whatsappMarketingOptIn && username) {
      try {
        // Pull the display name for a friendly greeting
        const { data: persona } = await supabase
          .from('chatbot_persona')
          .select('name')
          .eq('account_id', accountId)
          .maybeSingle();
        const firstName =
          persona?.name?.split(' ')[0] ||
          username;
        fireAndForget(
          sendInfluencerWelcome({
            to: phoneNumber,
            influencerFirstName: firstName,
            influencerUsername: username,
          })
        );
      } catch (err) {
        console.warn('[Accounts] WhatsApp welcome dispatch failed (non-fatal):', err);
      }
    }

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
