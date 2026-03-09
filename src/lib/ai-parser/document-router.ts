/**
 * Document Router — auto-routes parsed document data to the right DB tables:
 * - Coupon codes → coupons table + chatbot_knowledge_base
 * - Partnership data → partnerships table (status: pending)
 * - General knowledge → chatbot_knowledge_base
 */

import { supabase } from '@/lib/supabase';

export interface RouteResult {
  couponsCreated: number;
  partnershipCreated: boolean;
  partnershipId: string | null;
  knowledgeEntriesCreated: number;
}

interface CouponFromDoc {
  code: string;
  brand_name?: string;
  discount_type?: string;
  discount_value?: number;
  description?: string;
}

interface KnowledgeFromDoc {
  title: string;
  content: string;
  knowledge_type?: string;
  keywords?: string[];
}

/**
 * Route parsed document data to the appropriate DB tables
 */
export async function routeParsedDocument(params: {
  accountId: string;
  documentId: string;
  documentType: string;
  parsedData: any;
  confidence: number;
}): Promise<RouteResult> {
  const { accountId, documentId, documentType, parsedData, confidence } = params;

  const result: RouteResult = {
    couponsCreated: 0,
    partnershipCreated: false,
    partnershipId: null,
    knowledgeEntriesCreated: 0,
  };

  if (!parsedData || confidence < 0.3) {
    console.log(`[DocRouter] Skipping — confidence too low (${confidence})`);
    return result;
  }

  // 1. Extract and insert coupons
  result.couponsCreated = await routeCoupons(accountId, parsedData);

  // 2. Create partnership if applicable (quote/contract/brief with brand name)
  if (['quote', 'contract', 'brief'].includes(documentType) && confidence >= 0.6) {
    const partnershipResult = await routePartnership(accountId, documentId, parsedData);
    result.partnershipCreated = partnershipResult.created;
    result.partnershipId = partnershipResult.id;
  }

  // 3. Extract knowledge entries (mainly for 'other' type docs, but also general content)
  result.knowledgeEntriesCreated = await routeKnowledge(accountId, documentId, parsedData, documentType);

  // Save routing result to the document record
  await supabase
    .from('partnership_documents')
    .update({
      routing_result: {
        ...result,
        routed_at: new Date().toISOString(),
      },
    })
    .eq('id', documentId);

  console.log(`[DocRouter] Routing complete for ${documentId}:`, result);
  return result;
}

/**
 * Extract coupon codes from parsed data and insert into coupons + knowledge base
 */
async function routeCoupons(accountId: string, parsedData: any): Promise<number> {
  const coupons: CouponFromDoc[] = [];

  // From coupon_codes array (new prompt field)
  if (Array.isArray(parsedData.coupon_codes)) {
    coupons.push(...parsedData.coupon_codes.filter((c: any) => c?.code));
  }

  // From legacy single coupon_code field
  if (parsedData.coupon_code && typeof parsedData.coupon_code === 'string') {
    coupons.push({
      code: parsedData.coupon_code,
      brand_name: parsedData.brandName || parsedData.parties?.brand || null,
    });
  }

  if (coupons.length === 0) return 0;

  let created = 0;

  for (const coupon of coupons) {
    // Dedup: check if coupon code already exists for this account
    const { data: existing } = await supabase
      .from('coupons')
      .select('id')
      .eq('account_id', accountId)
      .eq('code', coupon.code)
      .maybeSingle();

    if (existing) {
      console.log(`[DocRouter] Coupon ${coupon.code} already exists, skipping`);
      continue;
    }

    const { data: inserted, error } = await supabase
      .from('coupons')
      .insert({
        account_id: accountId,
        code: coupon.code,
        brand_name: coupon.brand_name || 'מותג',
        discount_type: coupon.discount_type || null,
        discount_value: coupon.discount_value || null,
        description: coupon.description || null,
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      console.error(`[DocRouter] Failed to insert coupon ${coupon.code}:`, error.message);
      continue;
    }

    // Also add to knowledge base
    const brandName = coupon.brand_name || 'מותג';
    const discountText = coupon.discount_type === 'percentage'
      ? `${coupon.discount_value}% הנחה`
      : coupon.discount_value
        ? `${coupon.discount_value} ש"ח הנחה`
        : 'הנחה';

    await supabase
      .from('chatbot_knowledge_base')
      .upsert({
        account_id: accountId,
        knowledge_type: 'coupon',
        title: `קופון ${brandName}: ${coupon.code}`,
        content: `קוד קופון: ${coupon.code} - ${discountText} ב${brandName}${coupon.description ? `. ${coupon.description}` : ''}`,
        keywords: [coupon.code, brandName, 'קופון', 'coupon', 'הנחה'],
        source_type: 'coupon',
        source_id: inserted.id,
        is_active: true,
        priority: 10,
      }, {
        onConflict: 'account_id,source_type,source_id',
      });

    created++;
  }

  if (created > 0) {
    console.log(`[DocRouter] Created ${created} coupon(s)`);
  }
  return created;
}

/**
 * Create a partnership record from parsed document data
 */
async function routePartnership(
  accountId: string,
  documentId: string,
  parsedData: any
): Promise<{ created: boolean; id: string | null }> {
  const brandName = parsedData.brandName || parsedData.parties?.brand;
  if (!brandName) return { created: false, id: null };

  // Check if partnership with this brand already exists
  const { data: existing } = await supabase
    .from('partnerships')
    .select('id')
    .eq('account_id', accountId)
    .ilike('brand_name', brandName)
    .maybeSingle();

  if (existing) {
    // Link document to existing partnership
    await supabase
      .from('partnership_documents')
      .update({ partnership_id: existing.id })
      .eq('id', documentId);

    console.log(`[DocRouter] Partnership for "${brandName}" already exists (${existing.id}), linked document`);
    return { created: false, id: existing.id };
  }

  // Create new partnership with status 'pending'
  const { data: partnership, error } = await supabase
    .from('partnerships')
    .insert({
      account_id: accountId,
      brand_name: brandName,
      campaign_name: parsedData.campaignName || null,
      status: 'proposal', // Not 'active' — let influencer review first
      contract_amount: parsedData.totalAmount || parsedData.paymentTerms?.totalAmount || 0,
      currency: parsedData.currency || 'ILS',
      start_date: parsedData.timeline?.startDate || parsedData.effectiveDate || null,
      end_date: parsedData.timeline?.endDate || parsedData.expiryDate || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[DocRouter] Failed to create partnership for "${brandName}":`, error.message);
    return { created: false, id: null };
  }

  // Link document to the new partnership
  await supabase
    .from('partnership_documents')
    .update({ partnership_id: partnership.id })
    .eq('id', documentId);

  console.log(`[DocRouter] Created partnership for "${brandName}" (${partnership.id})`);
  return { created: true, id: partnership.id };
}

/**
 * Extract knowledge entries and insert into chatbot_knowledge_base
 */
async function routeKnowledge(
  accountId: string,
  documentId: string,
  parsedData: any,
  documentType: string
): Promise<number> {
  let created = 0;

  // From explicit knowledge_entries array (new prompt field, mainly for 'other' docs)
  if (Array.isArray(parsedData.knowledge_entries)) {
    for (let i = 0; i < parsedData.knowledge_entries.length; i++) {
      const entry: KnowledgeFromDoc = parsedData.knowledge_entries[i];
      if (!entry?.title || !entry?.content) continue;

      // Map knowledge_type to allowed values
      const knowledgeType = mapKnowledgeType(entry.knowledge_type);

      const { error } = await supabase
        .from('chatbot_knowledge_base')
        .insert({
          account_id: accountId,
          knowledge_type: knowledgeType,
          title: entry.title,
          content: entry.content,
          keywords: entry.keywords || [],
          source_type: 'document',
          source_id: `${documentId}_${i}`,
          is_active: true,
          priority: 5,
        });

      if (!error) created++;
    }
  }

  // For 'other' docs: also create a summary knowledge entry from keyPoints/content
  if (documentType === 'other' && !parsedData.knowledge_entries?.length) {
    const title = parsedData.title || 'מסמך שהועלה';
    let content = '';

    if (Array.isArray(parsedData.keyPoints) && parsedData.keyPoints.length > 0) {
      content = parsedData.keyPoints.join('\n');
    } else if (parsedData.content) {
      content = typeof parsedData.content === 'string'
        ? parsedData.content.substring(0, 2000)
        : '';
    }

    if (content) {
      const { error } = await supabase
        .from('chatbot_knowledge_base')
        .insert({
          account_id: accountId,
          knowledge_type: 'custom',
          title,
          content,
          keywords: [],
          source_type: 'document',
          source_id: documentId,
          is_active: true,
          priority: 3,
        });

      if (!error) created++;
    }
  }

  if (created > 0) {
    console.log(`[DocRouter] Created ${created} knowledge entry(ies)`);
  }
  return created;
}

/**
 * Map AI output knowledge_type to allowed DB values
 */
function mapKnowledgeType(type?: string): string {
  const allowed: Record<string, string> = {
    faq: 'faq',
    brand_info: 'brand_info',
    custom: 'custom',
    product: 'product',
  };
  return allowed[type || ''] || 'custom';
}
