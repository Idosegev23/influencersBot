/**
 * Partnerships Normalizer
 * זיהוי אוטומטי של שיתופי פעולה וקופונים מתוכן נסרק
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ============================================
// Type Definitions
// ============================================

export interface DetectedPartnership {
  brand_name: string;
  type: 'sponsored' | 'affiliate' | 'gift' | 'collaboration';
  confidence: number; // 0-1
  evidence: string[]; // Mentions, hashtags, etc.
  posts: string[]; // Post IDs where mentioned
}

export interface DetectedCoupon {
  code: string;
  brand_name?: string;
  discount_description?: string;
  source: 'post' | 'highlight' | 'story' | 'bio' | 'website';
  source_id?: string;
  confidence: number;
}

export interface NormalizationResult {
  partnerships: DetectedPartnership[];
  coupons: DetectedCoupon[];
}

// ============================================
// Patterns for Detection
// ============================================

const COUPON_PATTERNS = [
  /\b([A-Z0-9]{4,12})\b/g,           // Generic codes: SAVE20, CODE123
  /\b([A-Z]+\d+)\b/g,                 // Mixed: SAVE20, WINTER30
  /\b(\d+%?OFF)\b/gi,                 // Discount: 20OFF, 30%OFF
];

const PARTNERSHIP_INDICATORS = [
  '#ad',
  '#sponsored',
  '#שיתוף פעולה',
  '#קמפיין',
  'בשיתוף עם',
  'בשת״פ עם',
  'ממומן',
  'פרסומת',
];

// ============================================
// Partnerships Normalizer Class
// ============================================

export class PartnershipsNormalizer {
  /**
   * Analyze content and detect partnerships & coupons
   */
  async analyze(
    accountId: string,
    content: {
      posts?: any[];
      highlights?: any[];
      bio?: string;
      websites?: any[];
    }
  ): Promise<NormalizationResult> {
    const allText = this.extractAllText(content);
    
    // Use Gemini for intelligent detection
    const detected = await this.geminiDetection(allText);

    // Also do pattern-based detection for coupons
    const patternCoupons = this.detectCouponsByPattern(allText);

    // Merge results
    const partnerships = detected.partnerships;
    const coupons = this.mergeCoupons(detected.coupons, patternCoupons);

    return { partnerships, coupons };
  }

  /**
   * Extract all text from scraped content
   */
  private extractAllText(content: any): string {
    let text = '';

    // Bio
    if (content.bio) {
      text += `[BIO]\n${content.bio}\n\n`;
    }

    // Posts
    if (content.posts) {
      for (const post of content.posts) {
        text += `[POST]\n${post.caption || ''}\n`;
        if (post.mentions) {
          text += `Mentions: ${post.mentions.join(', ')}\n`;
        }
        text += '\n';
      }
    }

    // Highlights
    if (content.highlights) {
      for (const highlight of content.highlights) {
        text += `[HIGHLIGHT: ${highlight.title}]\n\n`;
      }
    }

    // Websites
    if (content.websites) {
      for (const site of content.websites) {
        text += `[WEBSITE: ${site.url}]\n${site.page_content || ''}\n\n`;
      }
    }

    return text;
  }

  /**
   * Use Gemini to detect partnerships and coupons
   */
  private async geminiDetection(text: string): Promise<NormalizationResult> {
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview });

    const prompt = `נתח את התוכן הבא וזהה:

1. שיתופי פעולה (Partnerships):
   - שמות מותגים שמוזכרים
   - סוג השיתוף (sponsored/affiliate/gift)
   - ראיות (#ad, "בשיתוף עם", וכו')

2. קופונים (Coupons):
   - קודי הנחה (לדוגמה: SAVE20, WINTER30)
   - מותג של הקוד
   - תיאור ההנחה אם יש

תוכן:
${text.substring(0, 8000)}

החזר JSON בפורמט:
{
  "partnerships": [
    {
      "brand_name": "שם המותג",
      "type": "sponsored|affiliate|gift|collaboration",
      "confidence": 0.0-1.0,
      "evidence": ["#ad", "@brand"],
      "posts": []
    }
  ],
  "coupons": [
    {
      "code": "SAVE20",
      "brand_name": "Nike",
      "discount_description": "20% הנחה",
      "source": "post",
      "confidence": 0.0-1.0
    }
  ]
}`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response.text();

      // Parse JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[PartnershipsNormalizer] Failed to parse Gemini response');
        return { partnerships: [], coupons: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        partnerships: parsed.partnerships || [],
        coupons: parsed.coupons || [],
      };

    } catch (error) {
      console.error('[PartnershipsNormalizer] Gemini detection failed:', error);
      return { partnerships: [], coupons: [] };
    }
  }

  /**
   * Detect coupons by regex patterns
   */
  private detectCouponsByPattern(text: string): DetectedCoupon[] {
    const coupons: DetectedCoupon[] = [];
    const seen = new Set<string>();

    for (const pattern of COUPON_PATTERNS) {
      const matches = text.matchAll(pattern);
      
      for (const match of matches) {
        const code = match[1];
        
        // Skip if already found or too short
        if (seen.has(code) || code.length < 4) continue;
        
        // Check if looks like a coupon (not just random text)
        if (this.looksLikeCoupon(code)) {
          seen.add(code);
          
          coupons.push({
            code,
            source: 'post',
            confidence: 0.6, // Lower confidence for pattern-based
          });
        }
      }
    }

    return coupons;
  }

  /**
   * Check if string looks like a coupon code
   */
  private looksLikeCoupon(str: string): boolean {
    // Must have at least one letter and one number, or be all caps
    const hasLetterAndNumber = /[A-Z]/.test(str) && /\d/.test(str);
    const isAllCaps = str === str.toUpperCase() && /[A-Z]/.test(str);
    
    return hasLetterAndNumber || isAllCaps;
  }

  /**
   * Merge coupons from different sources
   */
  private mergeCoupons(
    geminiCoupons: DetectedCoupon[],
    patternCoupons: DetectedCoupon[]
  ): DetectedCoupon[] {
    const merged = new Map<string, DetectedCoupon>();

    // Add Gemini coupons (higher confidence)
    for (const coupon of geminiCoupons) {
      merged.set(coupon.code, coupon);
    }

    // Add pattern coupons if not already found
    for (const coupon of patternCoupons) {
      if (!merged.has(coupon.code)) {
        merged.set(coupon.code, coupon);
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Save detected partnerships to database
   */
  async savePartnerships(
    accountId: string,
    partnerships: DetectedPartnership[]
  ): Promise<number> {
    const supabase = await createClient();
    let saved = 0;

    for (const partnership of partnerships) {
      // Check if partnership already exists
      const { data: existing } = await supabase
        .from('partnerships')
        .select('id')
        .eq('account_id', accountId)
        .eq('brand_name', partnership.brand_name)
        .single();

      if (!existing) {
        // Create new partnership
        const { error } = await supabase.from('partnerships').insert({
          account_id: accountId,
          brand_name: partnership.brand_name,
          status: 'active',
          partnership_type: partnership.type,
          notes: `Auto-detected from content. Evidence: ${partnership.evidence.join(', ')}`,
          confidence_score: partnership.confidence,
        });

        if (!error) saved++;
      }
    }

    return saved;
  }

  /**
   * Save detected coupons to database
   */
  async saveCoupons(
    accountId: string,
    coupons: DetectedCoupon[]
  ): Promise<number> {
    const supabase = await createClient();
    let saved = 0;

    for (const coupon of coupons) {
      // Check if coupon already exists
      const { data: existing } = await supabase
        .from('coupons')
        .select('id')
        .eq('account_id', accountId)
        .eq('code', coupon.code)
        .single();

      if (!existing && coupon.confidence > 0.7) {
        // Create new coupon
        const { error } = await supabase.from('coupons').insert({
          account_id: accountId,
          code: coupon.code,
          brand_name: coupon.brand_name,
          discount_description: coupon.discount_description,
          status: 'active',
          source: `auto-detected from ${coupon.source}`,
        });

        if (!error) saved++;
      }
    }

    return saved;
  }
}

// ============================================
// Convenience Functions
// ============================================

let normalizerInstance: PartnershipsNormalizer | null = null;

export function getPartnershipsNormalizer(): PartnershipsNormalizer {
  if (!normalizerInstance) {
    normalizerInstance = new PartnershipsNormalizer();
  }
  return normalizerInstance;
}

/**
 * Analyze and save partnerships & coupons
 */
export async function analyzeAndSavePartnerships(
  accountId: string,
  content: any
): Promise<{ partnershipsFound: number; couponsFound: number }> {
  const normalizer = getPartnershipsNormalizer();
  
  const result = await normalizer.analyze(accountId, content);
  
  const partnershipsFound = await normalizer.savePartnerships(accountId, result.partnerships);
  const couponsFound = await normalizer.saveCoupons(accountId, result.coupons);

  return { partnershipsFound, couponsFound };
}
