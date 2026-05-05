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
    // Strip the customer-facing "#" prefix Shopify uses, plus surrounding whitespace
    const sanitize = (v: string | null) => (v ? v.trim().replace(/^#+/, '').replace(/\s+/g, '') : v);
    const shipmentNumber = sanitize(url.searchParams.get('shipmentNumber'));
    const reference = sanitize(url.searchParams.get('reference'));

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

    // Lookup-mode strategy is per-account because different brands
    // are mapped to Focus differently:
    //   • 'p1' — the customer-facing order number IS the Focus ship_no.
    //     Just send P1. (LA BEAUTÉ works this way — Focus sync'd ship_no
    //     to Shopify order ID.)
    //   • 'p2' — order number is the brand-side reference, prefixed
    //     with brand letters at Focus. Send P2 with prefix.
    //   • 'p2_then_p1' — try P2 first, fall back to P1 on not-found.
    //     Useful when the brand has both legacy and new orders.
    const lookupMode: 'p1' | 'p2' | 'p2_then_p1' = provider.lookup_mode || 'p1';
    const refPrefix: string = (provider.reference_prefix || '').trim();
    const host = provider.host || 'focusdelivery.co.il';
    // Customer-scope safety: Focus's ship_status_xml does global ship_no
    // lookup with NO scope, so a numeric collision returns another
    // brand's record. We pass our master_customer_id to the client and
    // any response with a different master is treated as "not found".
    const expectedMasterCustomerId: number | undefined = provider.expected_master_customer_id
      ? Number(provider.expected_master_customer_id)
      : undefined;

    let view: Awaited<ReturnType<typeof getFocusShipmentStatus>>;

    // P2 lookups require the customer code to be scoped — Focus
    // confirmed the URL format `-N,-A<ref>,-A,-N<customer>` (Tzvika,
    // 2026-05-05). The expected_master_customer_id from config doubles
    // as the customer code passed to Focus.
    const customerCode = expectedMasterCustomerId;

    if (shipmentNumber && !reference) {
      view = await getFocusShipmentStatus({ host, shipmentNumber, expectedMasterCustomerId });
    } else {
      const raw = (reference || shipmentNumber)!;
      if (lookupMode === 'p1') {
        view = await getFocusShipmentStatus({ host, shipmentNumber: raw, expectedMasterCustomerId });
      } else if (lookupMode === 'p2') {
        view = await getFocusShipmentStatus({
          host,
          reference: `${refPrefix}${raw}`,
          customerCode,
          expectedMasterCustomerId,
        });
      } else {
        // p2_then_p1
        view = await getFocusShipmentStatus({
          host,
          reference: `${refPrefix}${raw}`,
          customerCode,
          expectedMasterCustomerId,
        });
        if (!view.found) {
          const p1 = await getFocusShipmentStatus({ host, shipmentNumber: raw, expectedMasterCustomerId });
          if (p1.found) view = p1;
        }
      }
    }

    return NextResponse.json(view);
  } catch (e: any) {
    console.error('[shipment/status] error:', e);
    return NextResponse.json({ error: e?.message || 'lookup failed' }, { status: 500 });
  }
}
