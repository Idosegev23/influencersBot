/**
 * Discovery rows for `government_ministry` archetype.
 * Source: `instagram_bio_websites` rows scraped from the ministry's site
 * (see `scripts/scrape-govil-ministry.mjs`).
 *
 * Each scraped page is bucketed into a category by URL pattern + title.
 * Categories with no items are dropped before returning to the client.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DiscoveryItem } from './types';

interface DiscoveryRow {
  category: {
    slug: string;
    title: string;
    subtitle: string;
    type: string;
    icon: string;
    color: string;
  };
  items: DiscoveryItem[];
}

interface MinistryPageRow {
  url: string;
  page_title: string | null;
  page_description: string | null;
  page_content: string | null;
  image_urls: string[] | null;
  scraped_at: string | null;
}

/**
 * Each bucket has a matcher (returns true if a page belongs to it),
 * sort priority (higher = appears earlier in the discovery feed),
 * and presentation metadata.
 */
interface Bucket {
  slug: string;
  title: string;
  subtitle: string;
  icon: string;       // material-symbols-outlined name
  color: string;
  priority: number;
  match: (url: string, title: string) => boolean;
}

const BUCKETS: Bucket[] = [
  {
    slug: 'circulars',
    title: 'חוזרי מנכ"ל',
    subtitle: 'הנחיות ועדכוני מדיניות',
    icon: 'description',
    color: '#1e40af',
    priority: 100,
    match: (u, t) =>
      /\/he\/pages\/(mankal|chozer[-_]?mancal|chozer[-_]?menahel)/i.test(u) ||
      /חוזר\s*מנכ"?ל/.test(t),
  },
  {
    slug: 'reports',
    title: 'דוחות ונתונים',
    subtitle: 'נתוני פעילות, סקרים, סטטיסטיקות',
    icon: 'monitoring',
    color: '#059669',
    priority: 95,
    match: (u, t) =>
      /\/he\/pages\/(aluma|trends|report|summary|alon|mapa|plan_actions|youth|hr|education|ar_digital)/i.test(u) ||
      /(דוח|מגמ|נתון|אלומה)/.test(t),
  },
  {
    slug: 'legal',
    title: 'חקיקה ותקנות',
    subtitle: 'חוקים, תקנות וכללי הרשות',
    icon: 'gavel',
    color: '#7c2d12',
    priority: 90,
    match: (u, t) =>
      /\/he\/pages\/(regulations|takanot|.*law|ncs_law|cs_law|discharged_soldiers|ekronot)/i.test(u) ||
      /(תקנות|חוק\s|חוקים|לוועדה)/.test(t),
  },
  {
    slug: 'jobs',
    title: 'דרושים ומכרזים',
    subtitle: 'משרות פתוחות והליכי מכרז',
    icon: 'work',
    color: '#c2410c',
    priority: 85,
    match: (u, t) =>
      /\/he\/pages\/(drush|darush|michraz|drushim|merakez|nitur)/i.test(u) ||
      /(דרוש|מכרז|דרושים)/.test(t),
  },
  {
    slug: 'campaigns',
    title: 'מסעות הסברה ופעילויות',
    subtitle: 'אירועים, ימי הסברה ותכניות לקהל',
    icon: 'campaign',
    color: '#be185d',
    priority: 80,
    match: (u, t) =>
      /\/he\/pages\/(hazdaa|shvua[-_]?hatzdaa|outstanding|shrut[-_]?im[-_]?shlihut|shrut_im_shlihut|sherut[-_]?im[-_]?shlichut|sherut[-_]?leumi|yarid|amlavi|kelavie|hatzdaa|reuven_pinski)/i.test(u) ||
      /(שבוע הצדעה|מסע הסברה|הצדעה|פעילות)/.test(t),
  },
  {
    slug: 'safety',
    title: 'בטיחות ומניעת תאונות',
    subtitle: 'מידע לכבישים, להולכי רגל ולנהגים',
    icon: 'health_and_safety',
    color: '#0d9488',
    priority: 78,
    match: (u, t) =>
      /\/he\/pages\/(speed|accompanying[-_]?young|pedestrians)/i.test(u) ||
      /(בטיחות|מהירות|נהיגה|תאונ)/.test(t),
  },
  {
    slug: 'tariffs',
    title: 'תעריפים וזכאויות',
    subtitle: 'תעריפי שירות, הקצבות, הטבות',
    icon: 'payments',
    color: '#0369a1',
    priority: 75,
    match: (u, t) =>
      /\/he\/pages\/taarif/i.test(u) ||
      /(תעריף|תעריפי|זכאות|הטב)/.test(t),
  },
  {
    slug: 'collectors',
    title: 'תוכן והדרכה',
    subtitle: 'קטלוגי תוכן ואוספים לימודיים',
    icon: 'school',
    color: '#6d28d9',
    priority: 70,
    match: (u, _t) => /\/he\/departments\/dynamiccollectors\//i.test(u),
  },
  {
    slug: 'services',
    title: 'שירותים',
    subtitle: 'שירותים מקוונים וטפסים',
    icon: 'support_agent',
    color: '#0891b2',
    priority: 65,
    match: (u, _t) => /\/he\/service\//i.test(u),
  },
  {
    slug: 'scholarships',
    title: 'מלגות',
    subtitle: 'מלגות מקרנות וגופים חיצוניים',
    icon: 'school',
    color: '#7c3aed',
    priority: 90,
    // hachvana.mod.gov.il/MainEducation/Scholarship/Pages/<name>.aspx — all except default
    match: (u, _t) =>
      /\/maineducation\/scholarship\/pages\//i.test(u) &&
      !/pages\/default\.aspx$/i.test(u),
  },
];

const FALLBACK_BUCKET: Bucket = {
  slug: 'publications',
  title: 'פרסומים נוספים',
  subtitle: 'תכנים נוספים שפורסמו באתר',
  icon: 'article',
  color: '#475569',
  priority: 10,
  match: () => true,
};

/**
 * Skip listing/index pages — they're not "items" to discover.
 * The user lands on items, not on listing skeletons.
 */
function isListingPage(url: string): boolean {
  const u = url.toLowerCase();
  if (/\/he\/departments\/(publications|news|policies|legalinfo|bureaus|government-service-branches)(\/|\?|$)/.test(u)) return true;
  if (/\/he\/collectors\//.test(u)) return true;
  if (/\/govil-landing-page(\?|#|$)/.test(u)) return true;
  if (/\/maineducation\/scholarship\/pages\/default\.aspx$/.test(u)) return true;
  // Department root without subpath (e.g. /he/departments/{slug})
  if (/\/he\/departments\/[^/]+$/.test(u.split('?')[0])) return true;
  return false;
}

/**
 * Discard pages that are too thin to be meaningful items.
 */
function isContentful(p: MinistryPageRow): boolean {
  const content = p.page_content || '';
  const title = p.page_title || '';
  if (title.length < 4) return false;
  // Generic boilerplate (gov.il global terms of use) ends up cross-linked
  // from many pages — keep it out of the per-ministry discovery feed.
  if (/gov_terms_of_use/i.test(p.url)) return false;
  return content.split(/\s+/).filter(Boolean).length >= 30;
}

function toItem(p: MinistryPageRow, rank: number): DiscoveryItem {
  const title = (p.page_title || '').replace(/\s+/g, ' ').trim();
  const summary = (p.page_description || p.page_content || '').replace(/\s+/g, ' ').trim();
  const summaryShort = summary.slice(0, 220) + (summary.length > 220 ? '…' : '');
  const thumbnail = Array.isArray(p.image_urls) && p.image_urls.length > 0 ? p.image_urls[0] : undefined;
  return {
    rank,
    postUrl: p.url,
    thumbnailUrl: thumbnail,
    captionExcerpt: title || summaryShort,
    aiTitle: title || summaryShort,
    aiSummary: summaryShort,
    postedAt: p.scraped_at || undefined,
    mediaType: 'post',
  };
}

export async function buildGovMinistryDiscoveryRows(
  supabase: SupabaseClient,
  accountId: string,
): Promise<DiscoveryRow[]> {
  const { data: pagesRaw } = await supabase
    .from('instagram_bio_websites')
    .select('url, page_title, page_description, page_content, image_urls, scraped_at')
    .eq('account_id', accountId)
    .order('scraped_at', { ascending: false })
    .limit(500);

  const pages = (pagesRaw || []) as MinistryPageRow[];

  // 1. Filter to actual content items
  const items = pages.filter((p) => !isListingPage(p.url) && isContentful(p));

  // 2. Bucket each item — first bucket whose matcher returns true wins;
  //    items that match nothing fall into the catch-all "publications" bucket.
  const grouped = new Map<string, { bucket: Bucket; items: MinistryPageRow[] }>();
  for (const p of items) {
    const t = (p.page_title || '').toLowerCase();
    const u = p.url.toLowerCase();
    const bucket = BUCKETS.find((b) => b.match(u, t)) || FALLBACK_BUCKET;
    const bin = grouped.get(bucket.slug) || { bucket, items: [] };
    bin.items.push(p);
    grouped.set(bucket.slug, bin);
  }

  // 3. Build rows — drop empty/single-item buckets unless they're the only thing
  //    we have. Sort items by recency, cap at 12 per row.
  const rows: DiscoveryRow[] = [];
  for (const { bucket, items: bucketItems } of grouped.values()) {
    if (bucketItems.length === 0) continue;
    const sorted = bucketItems
      .sort((a, b) => (b.scraped_at || '').localeCompare(a.scraped_at || ''))
      .slice(0, 12);
    rows.push({
      category: {
        slug: bucket.slug,
        title: bucket.title,
        subtitle: bucket.subtitle,
        type: 'gov_ministry',
        icon: bucket.icon,
        color: bucket.color,
      },
      items: sorted.map((p, i) => toItem(p, i + 1)),
    });
  }

  // 4. Sort rows by bucket priority (most important categories on top).
  rows.sort((a, b) => {
    const pa = BUCKETS.find((x) => x.slug === a.category.slug)?.priority ?? FALLBACK_BUCKET.priority;
    const pb = BUCKETS.find((x) => x.slug === b.category.slug)?.priority ?? FALLBACK_BUCKET.priority;
    return pb - pa;
  });

  return rows;
}
