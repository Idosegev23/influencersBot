/**
 * Sync AI-extracted commerce data (brands, coupons) from persona metadata
 * to the partnerships and coupons tables so the chat page can display them.
 *
 * Called after persona building in the content processing pipeline.
 */

import { createClient } from '@/lib/supabase/server';

interface ExtractedBrand {
  name: string;
  relationship: string;
  category?: string;
  mentionCount?: number;
}

interface ExtractedCoupon {
  code: string | null;
  brand: string;
  description?: string;
  discount?: string;
  expiresAt?: string | null;
}

export async function syncCommerceData(accountId: string): Promise<{
  partnershipsCreated: number;
  couponsCreated: number;
}> {
  const supabase = await createClient();

  // Load extracted commerce data from persona metadata
  const { data: persona, error: personaError } = await supabase
    .from('chatbot_persona')
    .select('metadata')
    .eq('account_id', accountId)
    .single();

  if (personaError || !persona?.metadata) {
    console.log('[Commerce Sync] No metadata found, skipping');
    return { partnershipsCreated: 0, couponsCreated: 0 };
  }

  const brands: ExtractedBrand[] = persona.metadata.brands || [];
  const coupons: ExtractedCoupon[] = persona.metadata.coupons || [];

  if (brands.length === 0 && coupons.length === 0) {
    console.log('[Commerce Sync] No brands or coupons to sync');
    return { partnershipsCreated: 0, couponsCreated: 0 };
  }

  // Check existing partnerships to avoid duplicates
  const { data: existingPartnerships } = await supabase
    .from('partnerships')
    .select('brand_name')
    .eq('account_id', accountId);

  const existingBrandNames = new Set(
    (existingPartnerships || []).map(p => p.brand_name.toLowerCase())
  );

  // Insert brands as partnerships (only partnership/sponsored/owned, skip organic mentions)
  const relevantRelationships = ['partnership', 'sponsored', 'owned', 'affiliate'];
  const brandsToInsert = brands
    .filter(b => relevantRelationships.includes(b.relationship))
    .filter(b => !existingBrandNames.has(b.name.toLowerCase()));

  let partnershipsCreated = 0;
  if (brandsToInsert.length > 0) {
    const rows = brandsToInsert.map(b => ({
      account_id: accountId,
      brand_name: b.name,
      category: b.category || null,
      status: 'active',
      is_active: true,
      notes: `Auto-extracted from Instagram content (${b.relationship})`,
    }));

    const { error: insertError } = await supabase
      .from('partnerships')
      .insert(rows);

    if (insertError) {
      console.error('[Commerce Sync] Error inserting partnerships:', insertError.message);
    } else {
      partnershipsCreated = rows.length;
    }
  }

  // Check existing coupons
  const { data: existingCoupons } = await supabase
    .from('coupons')
    .select('code, brand_name')
    .eq('account_id', accountId);

  const existingCouponKeys = new Set(
    (existingCoupons || []).map(c => `${c.code}::${c.brand_name}`.toLowerCase())
  );

  // Insert coupons that have actual codes
  const couponsToInsert = coupons
    .filter(c => c.code && c.code.trim().length > 0)
    .filter(c => !existingCouponKeys.has(`${c.code}::${c.brand}`.toLowerCase()));

  let couponsCreated = 0;
  if (couponsToInsert.length > 0) {
    const rows = couponsToInsert.map(c => {
      // Parse discount value from string like "20%", "25%", "מתנה"
      const discountMatch = c.discount?.match(/(\d+)%/);
      const discountValue = discountMatch ? parseFloat(discountMatch[1]) : 0;
      const discountType = discountMatch ? 'percentage' : 'fixed';

      return {
        account_id: accountId,
        code: c.code!.trim(),
        brand_name: c.brand,
        brand_category: null as string | null,
        description: c.description || null,
        discount_type: discountType,
        discount_value: discountValue,
        is_active: true,
      };
    });

    const { error: couponError } = await supabase
      .from('coupons')
      .insert(rows);

    if (couponError) {
      console.error('[Commerce Sync] Error inserting coupons:', couponError.message);
    } else {
      couponsCreated = rows.length;
    }
  }

  console.log(`[Commerce Sync] ✅ Synced for ${accountId}:`);
  console.log(`  - ${partnershipsCreated} partnerships created (from ${brands.length} brands)`);
  console.log(`  - ${couponsCreated} coupons created (from ${coupons.length} extracted)`);

  return { partnershipsCreated, couponsCreated };
}
