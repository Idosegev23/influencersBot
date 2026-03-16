// ============================================
// Discovery Feature — Category Registry
// ============================================

import type { DiscoveryCategory } from './types';

// ------------------------------------------
// Type A: Data-driven categories (DB query)
// ------------------------------------------

const dataDrivenCategories: DiscoveryCategory[] = [
  {
    slug: 'viral-videos',
    titleTemplate: 'הסרטונים הכי ויראליים של {name}',
    subtitle: 'לפי צפיות',
    icon: 'Play',
    type: 'data_driven',
    color: '#FF6B6B',
    bgColor: '#FFE8E8',
    requiredData: 'posts_with_views',
  },
  {
    slug: 'most-liked',
    titleTemplate: 'הפוסטים הכי אהובים של {name}',
    subtitle: 'לפי לייקים',
    icon: 'Heart',
    type: 'data_driven',
    color: '#E84393',
    bgColor: '#FDE8F0',
    requiredData: 'posts_any',
  },
  {
    slug: 'most-commented',
    titleTemplate: 'הפוסטים עם הכי הרבה תגובות',
    subtitle: 'לפי תגובות',
    icon: 'MessageCircle',
    type: 'data_driven',
    color: '#0984E3',
    bgColor: '#E0F0FF',
    requiredData: 'posts_any',
  },
  {
    slug: 'highest-engagement',
    titleTemplate: 'התוכן עם הכי הרבה אינטראקציה',
    subtitle: 'לפי מעורבות',
    icon: 'TrendingUp',
    type: 'data_driven',
    color: '#00B894',
    bgColor: '#E0FFF5',
    requiredData: 'posts_any',
  },
  {
    slug: 'recent-hits',
    titleTemplate: 'הלהיטים של החודש האחרון',
    subtitle: 'תוכן חם ועדכני',
    icon: 'Flame',
    type: 'data_driven',
    color: '#F39C12',
    bgColor: '#FFF4E0',
    requiredData: 'posts_any',
  },
  {
    slug: 'best-reels',
    titleTemplate: 'הרילסים הכי טובים של {name}',
    subtitle: 'לפי צפיות',
    icon: 'Film',
    type: 'data_driven',
    color: '#6C5CE7',
    bgColor: '#EDE8FD',
    requiredData: 'reels',
  },
];

// ------------------------------------------
// Type B: AI-generated categories
// ------------------------------------------

const aiCategories: DiscoveryCategory[] = [
  {
    slug: 'best-tips',
    titleTemplate: 'הטיפים הכי טובים של {name}',
    subtitle: 'מהתוכן של המשפיענית',
    icon: 'Lightbulb',
    type: 'ai_generated',
    color: '#FDCB6E',
    bgColor: '#FFF8E1',
    requiredData: 'transcriptions',
  },
  {
    slug: 'behind-scenes',
    titleTemplate: 'מאחורי הקלעים של {name}',
    subtitle: 'רגעים שלא רואים',
    icon: 'Camera',
    type: 'ai_generated',
    color: '#A29BFE',
    bgColor: '#EEECFE',
    requiredData: 'all',
  },
  {
    slug: 'personal-things',
    titleTemplate: 'דברים אישיים שאולי פספסתם על {name}',
    subtitle: 'הצצה אישית',
    icon: 'Star',
    type: 'ai_generated',
    color: '#FD79A8',
    bgColor: '#FFEAF1',
    requiredData: 'all',
  },
  {
    slug: 'best-products',
    titleTemplate: 'המוצרים הכי מומלצים של {name}',
    subtitle: 'המלצות אמיתיות',
    icon: 'ShoppingBag',
    type: 'ai_generated',
    color: '#00CEC9',
    bgColor: '#E0FFFE',
    requiredData: 'all',
  },
  {
    slug: 'best-places',
    titleTemplate: 'המקומות הכי מעניינים של {name}',
    subtitle: 'מקומות ששווה להכיר',
    icon: 'MapPin',
    type: 'ai_generated',
    color: '#E17055',
    bgColor: '#FDE8E2',
    requiredData: 'all',
  },
  {
    slug: 'truth-or-lie',
    titleTemplate: 'אמת או שקר על {name}',
    subtitle: '5 עובדות — נחשו!',
    icon: 'HelpCircle',
    type: 'ai_generated',
    color: '#636E72',
    bgColor: '#EEF0F1',
    requiredData: 'all',
  },
  {
    slug: 'common-mistakes',
    titleTemplate: 'טעויות שכולם עושים',
    subtitle: 'לפי {name}',
    icon: 'AlertTriangle',
    type: 'ai_generated',
    color: '#D63031',
    bgColor: '#FFE5E5',
    requiredData: 'transcriptions',
  },
  {
    slug: 'daily-habits',
    titleTemplate: 'הרגלים יומיומיים של {name}',
    subtitle: 'שגרה ולייפסטייל',
    icon: 'Sun',
    type: 'ai_generated',
    color: '#F9CA24',
    bgColor: '#FFFDE7',
    requiredData: 'all',
  },
];

// ------------------------------------------
// Type C: Interactive categories
// ------------------------------------------

const interactiveCategories: DiscoveryCategory[] = [
  {
    slug: 'questions',
    titleTemplate: 'שאלות שתמיד רציתם לשאול את {name}',
    subtitle: '5 השאלות הכי פופולריות יקבלו תשובה!',
    icon: 'MessageSquare',
    type: 'interactive',
    color: '#6C5CE7',
    bgColor: '#F0EDFF',
    requiredData: 'none',
  },
];

// ------------------------------------------
// Full Registry
// ------------------------------------------

export const DISCOVERY_CATEGORIES: DiscoveryCategory[] = [
  ...dataDrivenCategories,
  ...aiCategories,
  ...interactiveCategories,
];

export const CATEGORY_MAP = new Map<string, DiscoveryCategory>(
  DISCOVERY_CATEGORIES.map(c => [c.slug, c])
);

/**
 * Resolve {name} placeholders in title/subtitle templates
 */
export function resolveCategoryTitle(template: string, influencerName: string): string {
  const firstName = influencerName.split(' ')[0];
  return template.replace(/\{name\}/g, firstName);
}

/**
 * Get categories by type
 */
export function getCategoriesByType(type: DiscoveryCategory['type']): DiscoveryCategory[] {
  return DISCOVERY_CATEGORIES.filter(c => c.type === type);
}
