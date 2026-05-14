/**
 * Generate tab config for an account based on archetype + influencer_type.
 * Called once after RAG ingestion, saves to accounts.config.
 * Used by: scan-account.ts, generate-tab-config script, content-processor
 *
 * Tab structure per archetype:
 *   influencer:          צ׳אט | גלו | content_feed (per type) | [קופונים] | [בעיה במוצר]
 *   brand:               צ׳אט | גלו | מוצרים | [מבצעים] | [בעיה במוצר]
 *   b2b_saas:            Chat  | Discover | Features | Pricing | Get demo  (en-only)
 *   media_news:          צ׳אט | גלו | [קופונים]
 *   service_provider:    צ׳אט | גלו | שירותים
 *   government_ministry: צ׳אט | גלו | שירותים ומידע
 *   local_business:      צ׳אט | גלו | מוצרים | [הטבות] | [בעיה במוצר]
 *   tech_creator:        צ׳אט | גלו | סקירות
 */

import { createClient } from '@/lib/supabase/server';

interface TabConfig {
  id: string;
  label: string;
  type: 'chat' | 'discover' | 'topics' | 'coupons' | 'support' | 'content_feed' | 'platform' | 'customers' | 'demo' | 'b2b_support';
  topic?: string; // RAG topic filter for topics-type tabs
}

interface TabGenerationResult {
  tabs: TabConfig[];
  chat_subtitle: string;
  header_label: string;
  greeting_message: string;
}

// ─── Locale strings ───
// Hebrew is the source of truth; English is added so new int'l accounts
// (e.g. IMAI / influencermarketing.ai) get an English chat UI without changing
// the Hebrew strings any existing account sees.

type Lang = 'he' | 'en';
const L = <T,>(he: T, en: T) => ({ he, en }) as Record<Lang, T>;

const CONTENT_FEED_LABELS: Record<Lang, Record<string, string>> = {
  he: {
    food: 'מתכונים', beauty: 'טיפוח', parenting: 'טיפים', fashion: 'לוקים',
    fitness: 'אימונים', travel: 'יעדים', tech: 'סקירות', home: 'בית ועיצוב',
    lifestyle: 'המלצות', media_news: 'עדכונים', other: 'תוכן',
  },
  en: {
    food: 'Recipes', beauty: 'Beauty', parenting: 'Tips', fashion: 'Looks',
    fitness: 'Workouts', travel: 'Destinations', tech: 'Reviews', home: 'Home & Decor',
    lifestyle: 'Picks', media_news: 'Updates', other: 'Content',
  },
};

const COUPONS_LABELS: Record<Lang, Record<string, string>> = {
  he: {
    influencer: 'קופונים', brand: 'מבצעים', media_news: 'קופונים',
    service_provider: 'קופונים', local_business: 'הטבות', tech_creator: 'דילים',
  },
  en: {
    influencer: 'Promos', brand: 'Offers', media_news: 'Promos',
    service_provider: 'Promos', local_business: 'Perks', tech_creator: 'Deals',
  },
};

const STATIC_LABELS = {
  chat: L('צ׳אט', 'Chat'),
  discover: L('גלו', 'Discover'),
  products: L('מוצרים', 'Products'),
  services: L('שירותים', 'Services'),
  govServices: L('שירותים ומידע', 'Services & Info'),
  reviews: L('סקירות', 'Reviews'),
  support: L('בעיה במוצר', 'Get support'),
  contact: L('צרו קשר', 'Talk to us'),
  // b2b-specific — "Support" alone reads as a docs link to enterprise buyers;
  // "Get help" keeps the conversational tone of the rest of the surface.
  b2bSupport: L('תמיכה', 'Get help'),
  defaultCoupons: L('קופונים', 'Promos'),
  fallback: L('גלו', 'Discover'),
  // b2b_saas-specific
  features: L('יכולות', 'Features'),
  pricing: L('תמחור', 'Pricing'),
  demo: L('דמו', 'Demo'),
  platform: L('פלטפורמה', 'Platform'),
  customers: L('לקוחות', 'Customers'),
};

// Support tab — only for influencer, brand, local_business, b2b_saas.
// b2b_saas re-uses the support tab as "Talk to us" / "צרו קשר" — same flow
// (creates a support_requests row), different label.
const SUPPORT_ARCHETYPES = new Set(['influencer', 'brand', 'local_business', 'b2b_saas']);

const SUBTITLE_TEMPLATES: Record<Lang, Record<string, Record<string, string>>> = {
  he: {
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
      fashion: 'אני כאן לעזור עם סניקרס, השקות, סטיילינג וסניפים',
      home: 'אני כאן לעזור עם מוצרים, עיצוב ופתרונות',
      other: 'אני כאן לעזור עם מוצרים, המלצות ומבצעים',
    },
    media_news: { _default: 'אני כאן לעזור עם חדשות, עדכונים ובידור' },
    service_provider: { _default: 'אני כאן לעזור בכל עניין ונושא מקצועי' },
    government_ministry: { _default: 'אני כאן לעזור עם מידע, שירותים ופרסומים' },
    local_business: {
      food: 'אני כאן לעזור עם מוצרים, הזמנות ומידע',
      other: 'אני כאן לעזור עם מידע, מוצרים ושירותים',
    },
    tech_creator: { _default: 'אני כאן לעזור עם סקירות, השוואות והמלצות' },
    b2b_saas: { _default: 'אני כאן לענות על שאלות לגבי הפלטפורמה, אינטגרציות ודמו' },
  },
  en: {
    influencer: {
      food: 'Here to help with recipes, brands, and deals',
      beauty: 'Here to help with beauty, products, and deals',
      parenting: 'Here to help with parenting tips, picks, and deals',
      fashion: 'Here to help with styling, brands, and deals',
      fitness: 'Here to help with workouts, nutrition, and deals',
      travel: 'Here to help with destinations, trips, and deals',
      tech: 'Here to help with reviews, picks, and deals',
      home: 'Here to help with home, decor, and picks',
      lifestyle: 'Here to help with tips, picks, and deals',
      other: 'Here to help with tips, picks, and deals',
    },
    brand: {
      food: 'Here to help with products, recipes, and offers',
      beauty: 'Here to help with products, routines, and offers',
      fashion: 'Here to help with drops, styling, and stores',
      home: 'Here to help with products, design, and solutions',
      other: 'Here to help with products, recommendations, and offers',
    },
    media_news: { _default: 'Here to help with news, updates, and entertainment' },
    service_provider: { _default: 'Here to help with anything about our services' },
    government_ministry: { _default: 'Here to help with information, services, and publications' },
    local_business: {
      food: 'Here to help with menu, orders, and info',
      other: 'Here to help with info, products, and services',
    },
    tech_creator: { _default: 'Here to help with reviews, comparisons, and picks' },
    b2b_saas: { _default: 'Here to answer questions about the platform, integrations, and demos' },
  },
};

const HEADER_LABELS: Record<Lang, Record<string, Record<string, string>>> = {
  he: {
    influencer: {
      food: 'מתכונים וטיפים', beauty: 'טיפוח ויופי', parenting: 'הורות ומשפחה',
      fashion: 'לוקים וסטיילינג', fitness: 'אימונים ותזונה', travel: 'טיולים והמלצות',
      tech: 'סקירות והמלצות', home: 'בית ועיצוב', lifestyle: 'טיפים והמלצות', other: 'טיפים והמלצות',
    },
    brand: { home: 'בית ועיצוב', fashion: 'סניקרס ואופנה', _default: 'מותג' },
    media_news: { _default: 'חדשות ומדיה' },
    service_provider: { _default: 'Assistant' },
    government_ministry: { _default: 'שירותים ומידע' },
    local_business: { food: 'אוכל ומעדנייה', _default: 'עסק מקומי' },
    tech_creator: { _default: 'טכנולוגיה וסקירות' },
    b2b_saas: { _default: 'פלטפורמה' },
  },
  en: {
    influencer: {
      food: 'Recipes & tips', beauty: 'Beauty', parenting: 'Parenting',
      fashion: 'Style', fitness: 'Workouts', travel: 'Travel',
      tech: 'Reviews', home: 'Home & Decor', lifestyle: 'Tips & picks', other: 'Tips & picks',
    },
    brand: { home: 'Home & Decor', fashion: 'Fashion', _default: 'Brand' },
    media_news: { _default: 'News & Media' },
    service_provider: { _default: 'Assistant' },
    government_ministry: { _default: 'Services & Info' },
    local_business: { food: 'Food & Deli', _default: 'Local Business' },
    tech_creator: { _default: 'Tech & Reviews' },
    b2b_saas: { _default: 'Platform' },
  },
};

function resolveLabel(
  map: Record<Lang, Record<string, Record<string, string>>>,
  lang: Lang,
  archetype: string,
  itype: string,
): string {
  const byLang = map[lang] || map.he;
  const entry = byLang[archetype] || byLang['influencer'];
  return entry[itype] || entry['_default'] || entry['other'] || STATIC_LABELS.fallback[lang];
}

function generateGreeting(displayName: string, archetype: string, lang: Lang): string {
  const firstName = displayName.split(' ')[0];
  if (lang === 'en') {
    switch (archetype) {
      case 'b2b_saas':
        return `Hi, I'm the ${displayName} assistant. Ask me about the platform, integrations, pricing, or to set up a demo.`;
      case 'brand':
        return `Hi, I'm the ${firstName} assistant. Ask me anything about our products and offers.`;
      case 'media_news':
        return `Hi, I'm the ${firstName} assistant. Ask me about news, entertainment, and updates.`;
      case 'service_provider':
        return `Hi, I'm the ${firstName} assistant. Ask me about our services, work, and team.`;
      case 'government_ministry':
        return `Hello, I'm the ${displayName} assistant. Ask me about services, publications, and procedures.`;
      case 'local_business':
        return `Hi, I'm the ${firstName} assistant. Ask me about our menu, hours, and orders.`;
      case 'tech_creator':
        return `Hi, I'm the ${firstName} assistant. Ask me about reviews, picks, and tech.`;
      default:
        return `Hi, I'm ${firstName}'s personal assistant. Ask me anything.`;
    }
  }
  switch (archetype) {
    case 'brand':
      return `היי, אני העוזר של ${firstName}. שאלו אותי הכל על המוצרים וההמלצות`;
    case 'media_news':
      return `היי, אני העוזר של ${firstName}. שאלו אותי על חדשות, בידור ועדכונים`;
    case 'service_provider':
      return `היי, אני העוזר של ${firstName}. שאלו אותי על השירותים, הפרויקטים והניסיון שלנו`;
    case 'government_ministry':
      return `שלום, אני העוזר החכם של ${displayName}. שאלו אותי על שירותים, פרסומים ונהלים`;
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
    .select('id, config, type, language')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const config = account.config || {};
  const archetype = config.archetype || 'influencer';
  const influencerType = config.influencer_type || 'other';
  const displayName = config.display_name || config.username || accountId;
  const lang: Lang = (account.language === 'en') ? 'en' : 'he';

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
  const tabs: TabConfig[] = [{ id: 'chat', label: STATIC_LABELS.chat[lang], type: 'chat' }];

  // גלו — always present
  tabs.push({ id: 'discover', label: STATIC_LABELS.discover[lang], type: 'discover' });

  // Content/products tab — depends on archetype
  if (archetype === 'influencer' && influencerType !== 'parenting') {
    // Influencers get content_feed with type-specific label (parenting lives under גלו)
    const contentFeedLabel = CONTENT_FEED_LABELS[lang][influencerType] || CONTENT_FEED_LABELS[lang]['other'];
    tabs.push({ id: 'content_feed', label: contentFeedLabel, type: 'content_feed' });
  } else if (archetype === 'brand' || archetype === 'local_business') {
    tabs.push({ id: 'topics', label: STATIC_LABELS.products[lang], type: 'topics' });
  } else if (archetype === 'service_provider') {
    tabs.push({ id: 'topics', label: STATIC_LABELS.services[lang], type: 'topics' });
  } else if (archetype === 'government_ministry') {
    tabs.push({ id: 'topics', label: STATIC_LABELS.govServices[lang], type: 'topics' });
  } else if (archetype === 'tech_creator') {
    tabs.push({ id: 'topics', label: STATIC_LABELS.reviews[lang], type: 'topics' });
  } else if (archetype === 'b2b_saas') {
    // B2B SaaS layout is a deliberate departure from the retail "Discover" /
    // "Products" pattern. Three dedicated tab types because the content has
    // structurally different shapes:
    //   • Platform → 6 product workspaces (tiles fed by accounts.config.platform_workspaces)
    //   • Customers → named case studies (tiles fed by accounts.config.case_studies)
    //   • Demo → qualifying form that lands in support_requests with source='demo_request'
    tabs.push({ id: 'platform', label: STATIC_LABELS.platform[lang], type: 'platform' });
    tabs.push({ id: 'customers', label: STATIC_LABELS.customers[lang], type: 'customers' });
    tabs.push({ id: 'demo', label: STATIC_LABELS.demo[lang], type: 'demo' });
    // B2B SaaS gets a dedicated Support tab in addition to Demo — Demo is for
    // new-lead capture (sales), Support is for existing-customer issues
    // (bugs, integration, billing). Both land in support_requests but with
    // different metadata.source so the inbox can route appropriately.
    // Uses a distinct type ('b2b_support') from the retail 'support' tab so
    // we don't accidentally route IMAI visitors to the LA BEAUTÉ product
    // tracking form.
    tabs.push({ id: 'support', label: STATIC_LABELS.b2bSupport[lang], type: 'b2b_support' });
    // b2b_saas does NOT use the Hebrew "discover" content surface — return now
    // so we don't fall through to the support / coupons branches below.
    const subtitle = resolveLabel(SUBTITLE_TEMPLATES, lang, archetype, influencerType);
    const header = resolveLabel(HEADER_LABELS, lang, archetype, influencerType);
    const greet = generateGreeting(displayName, archetype, lang);
    const tabsForB2B = tabs.filter((t) => t.id !== 'discover');
    const next = {
      ...config,
      tabs: tabsForB2B,
      chat_subtitle: subtitle,
      header_label: header,
      greeting_message: greet,
    };
    const { error: e2 } = await supabase.from('accounts').update({ config: next }).eq('id', accountId);
    if (e2) throw new Error(`Failed to save config: ${e2.message}`);
    return { tabs: tabsForB2B, chat_subtitle: subtitle, header_label: header, greeting_message: greet };
  }
  // media_news: NO separate content tab — updates live under גלו

  // Coupons — only if data exists
  if (hasCoupons) {
    tabs.push({
      id: 'coupons',
      label: COUPONS_LABELS[lang][archetype] || STATIC_LABELS.defaultCoupons[lang],
      type: 'coupons',
    });
  }

  // Support ("בעיה במוצר") — only for influencer, brand, local_business
  if (SUPPORT_ARCHETYPES.has(archetype)) {
    tabs.push({ id: 'support', label: STATIC_LABELS.support[lang], type: 'support' });
  }

  const chatSubtitle = resolveLabel(SUBTITLE_TEMPLATES, lang, archetype, influencerType);
  const headerLabel = resolveLabel(HEADER_LABELS, lang, archetype, influencerType);
  const greeting = generateGreeting(displayName, archetype, lang);

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
