import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth/admin-auth';
import { supabase } from '@/lib/supabase';
import { toWaId } from '@/lib/whatsapp-cloud/client';
import { newOnboardingToken, slugifyAccountName, onboardingLinkFor } from '@/lib/onboarding/tokens';

/**
 * POST /api/admin/onboarding/create  { clientName, email, mobile }
 * Admin creates a DRAFT account + a shareable onboarding token/link. The client's
 * contact (email + mobile) is captured here so the scan-complete notifications can
 * reach them; the client finishes setup (sources + Instagram) on /onboard/<token>.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdminAuth();
  if (denied) return denied;

  const { clientName, email, mobile } = await req.json().catch(() => ({}));
  if (!clientName?.trim()) return NextResponse.json({ error: 'clientName required' }, { status: 400 });

  const name = clientName.trim();
  const token = newOnboardingToken();
  // Placeholder username (unique) until the creator connects Instagram; the real
  // IG handle replaces it at Start.
  const username = `${slugifyAccountName(name)}-${token.slice(0, 6).toLowerCase()}`;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      type: 'creator',
      status: 'active',
      config: {
        username,
        display_name: name,
        onboarding: {
          token,
          status: 'draft',
          accountName: name,
          clientName: name,
          ownerEmail: (email || '').trim(),
          ownerWhatsapp: mobile ? toWaId(String(mobile)) : '',
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
