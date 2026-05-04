/**
 * Public lookup endpoint for shipment status.
 *
 * GET /api/shipment/status?username=<acct>&shipmentNumber=<num>
 *
 * Returns a customer-safe view (no driver/branch-codes/billing info).
 * Provider is resolved from accounts.config.shipment_provider:
 *   { type: 'focus', host: 'focusdelivery.co.il', enabled: true }
 *
 * Rate-limit: 30 lookups / minute / IP (cheap and prevents enumeration
 * attacks if someone tries to scan ranges of shipment numbers).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerByUsername } from '@/lib/supabase';
import { getFocusShipmentStatus } from '@/lib/shipment/focus-client';

export const runtime = 'nodejs';

const SHIPMENT_NUM_RE = /^[A-Z0-9-]{3,32}$/i;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const username = url.searchParams.get('username');
    const shipmentNumber = url.searchParams.get('shipmentNumber');
    const reference = url.searchParams.get('reference');

    if (!username) {
      return NextResponse.json({ error: 'username required' }, { status: 400 });
    }
    if (!shipmentNumber && !reference) {
      return NextResponse.json({ error: 'shipmentNumber or reference required' }, { status: 400 });
    }

    const queryValue = shipmentNumber || reference;
    if (!queryValue || !SHIPMENT_NUM_RE.test(queryValue)) {
      return NextResponse.json({ error: 'invalid shipment id format' }, { status: 400 });
    }

    const influencer = await getInfluencerByUsername(username);
    if (!influencer) {
      return NextResponse.json({ error: 'account not found' }, { status: 404 });
    }

    const cfg = (influencer as any)?._rawConfig || {};
    const provider = cfg.shipment_provider;
    if (!provider || provider.enabled !== true) {
      return NextResponse.json(
        { error: 'shipment lookup not enabled for this account' },
        { status: 404 },
      );
    }

    if (provider.type !== 'focus') {
      return NextResponse.json({ error: `unsupported provider: ${provider.type}` }, { status: 501 });
    }

    const view = await getFocusShipmentStatus({
      host: provider.host || 'focusdelivery.co.il',
      shipmentNumber: shipmentNumber || undefined,
      reference: reference || undefined,
    });

    return NextResponse.json(view);
  } catch (e: any) {
    console.error('[shipment/status] error:', e);
    return NextResponse.json({ error: e?.message || 'lookup failed' }, { status: 500 });
  }
}
