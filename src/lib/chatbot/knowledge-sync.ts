import { createClient } from '@/lib/supabase';

/**
 * Sync knowledge base from all sources
 */
export async function syncKnowledgeBase(accountId: string) {
  console.log('Syncing knowledge base for account:', accountId);

  try {
    // 1. Sync from partnerships (using DB function)
    await syncPartnershipsToKnowledge(accountId);

    // 2. Products sync removed - products table deleted
    // Products are now handled via partnerships/coupons

    // 3. Sync from coupons
    await syncCouponsToKnowledge(accountId);

    console.log('Knowledge base synced successfully');
    return { success: true };
  } catch (error) {
    console.error('Failed to sync knowledge base:', error);
    throw error;
  }
}

/**
 * Sync partnerships to knowledge base (using SQL function)
 */
async function syncPartnershipsToKnowledge(accountId: string) {
  const supabase = createClient();

  // Call the SQL function created in migration 015
  const { data, error } = await supabase.rpc('sync_chatbot_knowledge_from_partnerships');

  if (error) {
    console.error('Failed to sync partnerships:', error);
    throw new Error('Failed to sync partnerships to knowledge base');
  }

  console.log(`Synced ${data} partnerships to knowledge base`);
  return data;
}

/**
 * @deprecated Products table deleted - products are now handled via partnerships/coupons
 * This function is kept for reference but does nothing
 */
async function syncProductsToKnowledge(accountId: string) {
  console.log('⚠️ syncProductsToKnowledge deprecated - products table deleted');
  return 0;
}

/**
 * Sync coupons to knowledge base
 */
async function syncCouponsToKnowledge(accountId: string) {
  const supabase = createClient();

  // Get all active coupons for this account
  const { data: coupons, error: couponsError } = await supabase
    .from('coupons')
    .select(`
      *,
      partnership:partnerships(
        brand_name,
        campaign_name
      )
    `)
    .eq('account_id', accountId)
    .eq('is_active', true);

  if (couponsError) {
    console.error('Failed to fetch coupons:', couponsError);
    return 0;
  }

  let count = 0;

  for (const coupon of coupons || []) {
    const partnership = Array.isArray(coupon.partnership) 
      ? coupon.partnership[0] 
      : coupon.partnership;

    const brandName = partnership?.brand_name || 'מותג';
    const discountText = coupon.discount_type === 'percentage'
      ? `${coupon.discount_value}% הנחה`
      : `${coupon.discount_value} ש"ח הנחה`;

    // Upsert knowledge entry
    const { error: upsertError } = await supabase
      .from('chatbot_knowledge_base')
      .upsert({
        account_id: accountId,
        knowledge_type: 'coupon',
        title: `קופון ${brandName}: ${coupon.code}`,
        content: `קוד קופון: ${coupon.code} - ${discountText} ב${brandName}${coupon.description ? `. ${coupon.description}` : ''}`,
        keywords: [coupon.code, brandName, 'קופון', 'coupon', 'הנחה', 'discount'],
        source_type: 'coupon',
        source_id: coupon.id,
        is_active: true,
        priority: 10, // High priority for coupons
      }, {
        onConflict: 'account_id,source_type,source_id',
      });

    if (!upsertError) {
      count++;
    }
  }

  console.log(`Synced ${count} coupons to knowledge base`);
  return count;
}

/**
 * Cleanup inactive knowledge entries
 */
export async function cleanupInactiveKnowledge(accountId: string) {
  const supabase = createClient();

  // Delete knowledge entries whose source no longer exists
  // For partnerships
  const { error: partnershipsCleanup } = await supabase
    .from('chatbot_knowledge_base')
    .delete()
    .eq('account_id', accountId)
    .eq('source_type', 'partnership')
    .not('source_id', 'in', `(
      SELECT id FROM partnerships 
      WHERE account_id = '${accountId}' AND status = 'active'
    )`);

  // For coupons
  const { error: couponsCleanup } = await supabase
    .from('chatbot_knowledge_base')
    .delete()
    .eq('account_id', accountId)
    .eq('source_type', 'coupon')
    .not('source_id', 'in', `(
      SELECT id FROM coupons 
      WHERE account_id = '${accountId}' AND is_active = true
    )`);

  if (partnershipsCleanup) {
    console.error('Failed to cleanup partnerships knowledge:', partnershipsCleanup);
  }

  if (couponsCleanup) {
    console.error('Failed to cleanup coupons knowledge:', couponsCleanup);
  }

  return { success: true };
}
