/**
 * Generate tab config for an account based on RAG data + archetype + influencer_type.
 * Called once after RAG ingestion, saves to accounts.config.
 * Used by: scan-account.ts, generate-tab-config script, content-processor
 */

import { createClient } from '@/lib/supabase/server';

interface TabConfig {
  id: string;
  label: string;
}

interface TabGenerationResult {
  tabs: TabConfig[];
  chat_subtitle: string;
  header_label: string;
  greeting_message: string;
}

// ─── Tab label mapping by archetype × influencer_type ───

const DISCOVER_LABELS: Record<string, Record<string, string>> = {
  influencer: {
    food: 'מתכונים',
    beauty: 'טיפוח',
    parenting: 'טיפים',
    fashion: 'לוקים',
    fitness: 'אימונים',
    travel: 'יעדים',
    tech: 'סקירות',
    lifestyle: 'המלצות',
    other: 'גלו',
  },
  brand: {
    food: 'מוצרים',
    beauty: 'מוצרים',
    parenting: 'מוצרים',
    fashion: 'קולקציה',
    other: 'מוצרים',
  },
  media_news: { _default: 'עדכונים' },
  service_provider: { _default: 'שירותים' },
  local_business: { food: 'תפריט', other: 'גלו' },
  tech_creator: { _default: 'סקירות' },
};

const COUPONS_LABELS: Record<string, string> = {
  influencer: 'קופונים',
  brand: 'מבצעים',
  media_news: 'קופונים',
  service_provider: 'קופונים',
  local_business: 'הטבות',
  tech_creator: 'דילים',
};

const SUPPORT_LABELS: Record<string, string> = {
  influencer: 'בעיה בהזמנה',
  brand: 'שירות לקוחות',
  local_business: 'בעיה בהזמנה',
};

const SUBTITLE_TEMPLATES: Record<string, Record<string, string>> = {
  influencer: {
    food: 'אני כאן לעזור עם מתכונים, מותגים וקופונים',
    beauty: 'אני כאן לעזור עם טיפוח, מוצרים וקופונים',
    parenting: 'אני כאן לעזור עם טיפים, המלצות וקופונים',
    fashion: 'אני כאן לעזור עם סטיילינג, מותגים וקופונים',
    fitness: 'אני כאן לעזור עם אימונים, תזונה וקופונים',
    travel: 'אני כאן לעזור עם יעדים, טיולים וקופונים',
    tech: 'אני כאן לעזור עם סקירות, המלצות ודילים',
    lifestyle: 'אני כאן לעזור עם טיפים, המלצות וקופונים',
    other: 'אני כאן לעזור עם טיפים, המלצות וקופונים',
  },
  brand: {
    food: 'אני כאן לעזור עם מוצרים, מתכונים ומבצעים',
    beauty: 'אני כאן לעזור עם מוצרים, טיפוח ומבצעים',
    parenting: 'אני כאן לעזור עם מוצרים, המלצות ומבצעים',
    other: 'אני כאן לעזור עם מוצרים, המלצות ומבצעים',
  },
  media_news: { _default: 'אני כאן לעזור עם חדשות, עדכונים ובידור' },
  service_provider: { _default: 'אני כאן לעזור עם שירותים, פרויקטים ומידע' },
  local_business: {
    food: 'אני כאן לעזור עם התפריט, הזמנות ומידע',
    other: 'אני כאן לעזור עם מידע, מוצרים ושירותים',
  },
  tech_creator: { _default: 'אני כאן לעזור עם סקירות, השוואות והמלצות' },
};

const HEADER_LABELS: Record<string, Record<string, string>> = {
  influencer: {
    food: 'מתכונים וטיפים',
    beauty: 'טיפוח ויופי',
    parenting: 'הורות ומשפחה',
    fashion: 'לוקים וסטיילינג',
    fitness: 'אימונים ותזונה',
    travel: 'טיולים והמלצות',
    tech: 'סקירות והמלצות',
    lifestyle: 'טיפים והמלצות',
    other: 'טיפים והמלצות',
  },
  brand: { _default: 'מותג' },
  media_news: { _default: 'חדשות ומדיה' },
  service_provider: { _default: 'נותן שירות' },
  local_business: { food: 'אוכל ומעדנייה', _default: 'עסק מקומי' },
  tech_creator: { _default: 'טכנולוגיה וסקירות' },
};

function resolveLabel(map: Record<string, Record<string, string>>, archetype: string, itype: string): string {
  const entry = map[archetype] || map['influencer'];
  return entry[itype] || entry['_default'] || entry['other'] || 'גלו';
}

function generateGreeting(displayName: string, archetype: string): string {
  const firstName = displayName.split(' ')[0];
  switch (archetype) {
    case 'brand':
      return `היי, אני העוזר של ${firstName}. שאלו אותי הכל על המוצרים וההמלצות`;
    case 'media_news':
      return `היי, אני העוזר של ${firstName}. שאלו אותי על חדשות, בידור ועדכונים`;
    case 'service_provider':
      return `היי, אני העוזר של ${firstName}. שאלו אותי על השירותים, הפרויקטים והניסיון שלנו`;
    case 'local_business':
      return `היי, אני העוזר של ${firstName}. שאלו אותי על התפריט, שעות פתיחה והזמנות`;
    case 'tech_creator':
      return `היי, אני העוזר של ${firstName}. שאלו אותי על סקירות, המלצות וטכנולוגיה`;
    default:
      return `היי, אני העוזר האישי של ${firstName}. שאלו אותי הכל`;
  }
}

/**
 * Generate and save tab config for a single account.
 * Reads RAG entity_types + coupons/partnerships to determine which tabs to show.
 */
export async function generateTabConfig(accountId: string): Promise<TabGenerationResult> {
  const supabase = createClient();

  // Get account info
  const { data: account, error } = await supabase
    .from('accounts')
    .select('id, config, type')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const config = account.config || {};
  const archetype = config.archetype || 'influencer';
  const influencerType = config.influencer_type || 'other';
  const displayName = config.display_name || config.username || accountId;

  // Get entity types from RAG chunks
  const { data: etData } = await supabase
    .from('document_chunks')
    .select('entity_type')
    .eq('account_id', accountId);
  const entityTypes = [...new Set((etData || []).map((r: { entity_type: string }) => r.entity_type).filter(Boolean))];

  // Check coupons
  const { count: couponCount } = await supabase
    .from('coupons')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  // Check partnerships
  const { count: partnershipCount } = await supabase
    .from('partnerships')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  const hasCoupons = (couponCount || 0) > 0 || entityTypes.includes('coupon');
  const hasPartnerships = (partnershipCount || 0) > 0;

  // Build tabs
  const tabs: TabConfig[] = [{ id: 'chat', label: 'צ׳אט' }];

  // Discover — always (every account has posts/transcriptions)
  const discoverLabel = resolveLabel(DISCOVER_LABELS, archetype, influencerType);
  tabs.push({ id: 'discover', label: discoverLabel });

  // Coupons — only if data exists
  if (hasCoupons) {
    tabs.push({ id: 'coupons', label: COUPONS_LABELS[archetype] || 'קופונים' });
  }

  // Support — only for relevant archetypes + has partnerships
  const supportLabel = SUPPORT_LABELS[archetype];
  if (supportLabel && hasPartnerships) {
    tabs.push({ id: 'support', label: supportLabel });
  }

  const chatSubtitle = resolveLabel(SUBTITLE_TEMPLATES, archetype, influencerType);
  const headerLabel = resolveLabel(HEADER_LABELS, archetype, influencerType);
  const greeting = generateGreeting(displayName, archetype);

  // Save to config
  const newConfig = {
    ...config,
    tabs,
    chat_subtitle: chatSubtitle,
    header_label: headerLabel,
    greeting_message: greeting,
  };

  const { error: updateErr } = await supabase
    .from('accounts')
    .update({ config: newConfig })
    .eq('id', accountId);

  if (updateErr) {
    throw new Error(`Failed to save config: ${updateErr.message}`);
  }

  return { tabs, chat_subtitle: chatSubtitle, header_label: headerLabel, greeting_message: greeting };
}
