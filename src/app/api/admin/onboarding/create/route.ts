import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { supabase } from '@/lib/supabase';
import { newOnboardingToken, slugifyAccountName, onboardingLinkFor } from '@/lib/onboarding/tokens';

/**
 * POST /api/admin/onboarding/create  { accountName, clientName }
 * Admin creates a DRAFT account + a shareable onboarding token/link. The creator
 * finishes setup (sources + Instagram) on the public /onboard/<token> wizard.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { accountName, clientName } = await req.json().catch(() => ({}));
  if (!accountName?.trim()) return NextResponse.json({ error: 'accountName required' }, { status: 400 });

  const token = newOnboardingToken();
  // Placeholder username (unique) until the creator connects Instagram; the real
  // IG handle replaces it at Start.
  const username = `${slugifyAccountName(accountName)}-${token.slice(0, 6).toLowerCase()}`;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      type: 'creator',
      status: 'active',
      config: {
        username,
        display_name: accountName.trim(),
        onboarding: {
          token,
          status: 'draft',
          accountName: accountName.trim(),
          clientName: (clientName || '').trim(),
          createdAt: now,
        },
      },
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[onboarding/create] insert failed:', error?.message);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }

  return NextResponse.json({ accountId: data.id, token, link: onboardingLinkFor(token) });
}
