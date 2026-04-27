/**
 * Generate tab config for an account based on archetype + influencer_type.
 * Called once after RAG ingestion, saves to accounts.config.
 * Used by: scan-account.ts, generate-tab-config script, content-processor
 *
 * Tab structure per archetype:
 *   influencer:       צ׳אט | גלו | content_feed (per type) | [קופונים] | [בעיה במוצר]
 *   brand:            צ׳אט | גלו | מוצרים | [מבצעים] | [בעיה במוצר]
 *   media_news:       צ׳אט | גלו | [קופונים]
 *   service_provider: צ׳אט | גלו | שירותים
 *   local_business:   צ׳אט | גלו | מוצרים | [הטבות] | [בעיה במוצר]
 *   tech_creator:     צ׳אט | גלו | סקירות
 */

import { createClient } from '@/lib/supabase/server';

interface TabConfig {
  id: string;
  label: string;
  type: 'chat' | 'discover' | 'topics' | 'coupons' | 'support' | 'content_feed';
  topic?: string; // RAG topic filter for topics-type tabs
}

interface TabGenerationResult {
  tabs: TabConfig[];
  chat_subtitle: string;
  header_label: string;
  greeting_message: string;
}

// ─── Type-specific content_feed label by influencer_type ───

const CONTENT_FEED_LABELS: Record<string, string> = {
  food: 'מתכונים',
  beauty: 'טיפוח',
  parenting: 'טיפים',
  fashion: 'לוקים',
  fitness: 'אימונים',
  travel: 'יעדים',
  tech: 'סקירות',
  home: 'בית ועיצוב',
  lifestyle: 'המלצות',
  media_news: 'עדכונים',
  other: 'תוכן',
};

const COUPONS_LABELS: Record<string, string> = {
  influencer: 'קופונים',
  brand: 'מבצעים',
  media_news: 'קופונים',
  service_provider: 'קופונים',
  local_business: 'הטבות',
  tech_creator: 'דילים',
};

// Support tab — only for influencer, brand, local_business
const SUPPORT_ARCHETYPES = new Set(['influencer', 'brand', 'local_business']);

const SUBTITLE_TEMPLATES: Record<string, Record<string, string>> = {
  influencer: {
    food: 'אני כאן לעזור עם מתכונים, מותגים וקופונים',
    beauty: 'אני כאן לעזור עם טיפוח, מוצרים וקופונים',
    parenting: 'אני כאן לעזור עם טיפים, המלצות וקופונים',
    fashion: 'אני כאן לעזור עם סטיילינג, מותגים וקופונים',
    fitness: 'אני כאן לעזור עם אימונים, תזונה וקופונים',
    travel: 'אני כאן לעזור עם יעדים, טיולים וקופונים',
    tech: 'אני כאן לעזור עם סקירות, המלצות ודילים',
    home: 'אני כאן לעזור עם בית, עיצוב והמלצות',
    lifestyle: 'אני כאן לעזור עם טיפים, המלצות וקופונים',
    other: 'אני כאן לעזור עם טיפים, המלצות וקופונים',
  },
  brand: {
    food: 'אני כאן לעזור עם מוצרים, מתכונים ומבצעים',
    beauty: 'אני כאן לעזור עם מוצרים, טיפוח ומבצעים',
    home: 'אני כאן לעזור עם מוצרים, עיצוב ופתרונות',
    other: 'אני כאן לעזור עם מוצרים, המלצות ומבצעים',
  },
  media_news: { _default: 'אני כאן לעזור עם חדשות, עדכונים ובידור' },
  service_provider: { _default: 'אני כאן לעזור בכל עניין ונושא מקצועי' },
  local_business: {
    food: 'אני כאן לעזור עם מוצרים, הזמנות ומידע',
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
    home: 'בית ועיצוב',
    lifestyle: 'טיפים והמלצות',
    other: 'טיפים והמלצות',
  },
  brand: { home: 'בית ועיצוב', _default: 'מותג' },
  media_news: { _default: 'חדשות ומדיה' },
  service_provider: { _default: 'Assistant' },
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
      return `היי, אני העוזר של ${firstName}. שאלו אותי על המוצרים, שעות פתיחה והזמנות`;
    case 'tech_creator':
      return `היי, אני העוזר של ${firstName}. שאלו אותי על סקירות, המלצות וטכנולוגיה`;
    default:
      return `היי, אני העוזר האישי של ${firstName}. שאלו אותי הכל`;
  }
}

/**
 * Generate and save tab config for a single account.
 * Reads coupons/partnerships to determine which conditional tabs to show.
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

  // Check coupons
  const { count: couponCount } = await supabase
    .from('coupons')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  // Get entity types from RAG chunks (for coupon detection)
  const { data: etData } = await supabase
    .from('document_chunks')
    .select('entity_type')
    .eq('account_id', accountId);
  const entityTypes = [...new Set((etData || []).map((r: { entity_type: string }) => r.entity_type).filter(Boolean))];

  const hasCoupons = (couponCount || 0) > 0 || entityTypes.includes('coupon');

  // Build tabs: chat + גלו + [content/products/services] + [coupons] + [support]
  const tabs: TabConfig[] = [{ id: 'chat', label: 'צ׳אט', type: 'chat' }];

  // גלו — always present
  tabs.push({ id: 'discover', label: 'גלו', type: 'discover' });

  // Content/products tab — depends on archetype
  if (archetype === 'influencer' && influencerType !== 'parenting') {
    // Influencers get content_feed with type-specific label (parenting lives under גלו)
    const contentFeedLabel = CONTENT_FEED_LABELS[influencerType] || CONTENT_FEED_LABELS['other'];
    tabs.push({ id: 'content_feed', label: contentFeedLabel, type: 'content_feed' });
  } else if (archetype === 'brand' || archetype === 'local_business') {
    tabs.push({ id: 'topics', label: 'מוצרים', type: 'topics' });
  } else if (archetype === 'service_provider') {
    tabs.push({ id: 'topics', label: 'שירותים', type: 'topics' });
  } else if (archetype === 'tech_creator') {
    tabs.push({ id: 'topics', label: 'סקירות', type: 'topics' });
  }
  // media_news: NO separate content tab — updates live under גלו

  // Coupons — only if data exists
  if (hasCoupons) {
    tabs.push({ id: 'coupons', label: COUPONS_LABELS[archetype] || 'קופונים', type: 'coupons' });
  }

  // Support ("בעיה במוצר") — only for influencer, brand, local_business
  if (SUPPORT_ARCHETYPES.has(archetype)) {
    tabs.push({ id: 'support', label: 'בעיה במוצר', type: 'support' });
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
