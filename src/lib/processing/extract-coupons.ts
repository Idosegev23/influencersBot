/**
 * Deterministic Coupon Extractor
 *
 * Scans instagram_transcriptions (on_screen_text + transcription_text)
 * for coupon codes and discount patterns, then upserts to partnerships/coupons tables.
 *
 * Runs as Step 3.5 in the content processing pipeline — after transcription,
 * before persona building. No AI calls — pure regex/heuristic extraction.
 */

import { createClient } from '@/lib/supabase/server';

// ============================================
// Types
// ============================================

interface ExtractedCoupon {
  code: string;
  discountValue: number;
  discountType: 'percentage' | 'fixed';
  brandHint: string | null;      // brand name extracted from context
  brandUrl: string | null;        // brand URL extracted from context
  brandHandle: string | null;     // @handle from בשיתוף
  description: string;
  sourceId: string;
}

interface ExtractionResult {
  couponsCreated: number;
  couponsUpdated: number;
  partnershipsCreated: number;
  errors: string[];
}

// ============================================
// Regex Patterns
// ============================================

// "X% הנחה עם הקוד CODE" or "X% הנחה קוד CODE"
const PATTERN_PERCENT_CODE = /(\d+)%?\s*הנחה\s+(?:עם\s+)?(?:ה)?קוד\s+([A-Za-z][\w]*\d*)/gi;

// "קוד הנחה CODE" or "קוד CODE" (also matches "הקוד CODE")
const PATTERN_CODE_LABEL = /(?:ה)?קוד\s+(?:הנחה\s+)?([A-Za-z][\w]{2,}\d*)/gi;

// "-₪X עם הקוד CODE" or "₪X הנחה עם הקוד CODE"
const PATTERN_SHEKEL_CODE = /[-]?\s*₪?\s*(\d[\d,]*)\s*₪?\s*(?:הנחה\s+)?עם\s+(?:ה)?קוד\s+([A-Za-z][\w]*)/gi;

// "X% הנחה בקניית N פריטים קוד CODE"
const PATTERN_TIERED = /(\d+)%\s*הנחה\s+בקניית\s+(\d+)\s+פריטים?\s*(?:ומעלה\s+)?קוד\s+([A-Za-z][\w]*\d*)/gi;

// Standalone code near "עם הקוד" or "הנחה" (items separated in screen text array)
// Matches: "עם הקוד CODE" or "הנחה ... CODE" where CODE is ALL-CAPS with digits
const PATTERN_STANDALONE_CODE = /(?:עם\s+)?(?:ה)?קוד\s*[\s,]*([A-Z][A-Z0-9]{2,})/gi;

// "Xדולר הנחה" near a standalone code
const PATTERN_DOLLAR_DISCOUNT = /(\d+)\s*דולר\s*(?:לאדם\s+)?הנחה/gi;

// URL patterns in on_screen_text
const PATTERN_URL = /([a-zA-Z0-9-]+\.(?:co\.il|com|co|io))/gi;

// @handle patterns (בשיתוף @brand)
const PATTERN_COLLAB = /בשיתוף\s+@([a-zA-Z0-9_.]+)/gi;

// Known false positives to skip
const CODE_BLOCKLIST = new Set([
  'qr', 'url', 'push', 'resume', 'login', 'signup', 'http', 'https',
  'instagram', 'facebook', 'tiktok', 'youtube', 'whatsapp', 'telegram',
  'iphone', 'android', 'samsung', 'apple', 'google', 'amazon',
  'made', 'china', 'cotton', 'care', 'extra', 'clean', 'power',
  'baby', 'daily', 'enjoy', 'little', 'things', 'official',
  'sunglass', 'returned', 'louder', 'fresh',
  // Brand names that get false-matched as coupon codes
  'lenor', 'ariel', 'philips', 'sonicare', 'magnus', 'zohara', 'delta',
  'prada', 'gucci', 'dior', 'chanel', 'huggies', 'disney', 'tommy',
  'emily', 'story', 'alma',
]);

// ============================================
// Brand Handle → Name mapping (common patterns)
// ============================================

const HANDLE_TO_BRAND: Record<string, string> = {
  'magnus_israel': 'מגנוס',
  'deltaofficial': 'דלתא',
  'delta_official': 'דלתא',
  'zoharatights': 'זוהרה',
  'philipsisrael': 'סוניקייר',
  'philipsphisrael': 'סוניקייר',
  'super_pharm': 'לנור / אריאל',
  'addict_o.n': 'אדיקט אונליין',
  'pandazzz_sleep': 'פנדה',
  'labeaute.israel': 'לה בוטה',
  'cattleya_eyewear': 'קטאליה',
  'opticana_official': 'אופטיקנה',
  'storyonline': 'סטורי',
};

const URL_TO_BRAND: Record<string, string> = {
  'magnus-shop.co.il': 'מגנוס',
  'zoharatights.co.il': 'זוהרה',
  'addictonline.co.il': 'אדיקט אונליין',
  'pandazzz.co.il': 'פנדה',
  'labeauteisrael.co.il': 'לה בוטה',
  'candle-club.com': 'קנדל קלאב',
  'storyonline.co.il': 'סטורי',
  'dagdag.co.il': 'דג דג',
};

// ============================================
// Main Extraction Function
// ============================================

export async function extractCouponsFromContent(accountId: string): Promise<ExtractionResult> {
  console.log(`[Coupon Extractor] Starting extraction for ${accountId}`);

  const supabase = await createClient();
  const result: ExtractionResult = {
    couponsCreated: 0,
    couponsUpdated: 0,
    partnershipsCreated: 0,
    errors: [],
  };

  // 1. Load all transcriptions
  const { data: transcriptions, error: txError } = await supabase
    .from('instagram_transcriptions')
    .select('id, on_screen_text, transcription_text, source_type, source_id')
    .eq('account_id', accountId)
    .eq('processing_status', 'completed');

  if (txError) {
    result.errors.push(`Failed to load transcriptions: ${txError.message}`);
    return result;
  }

  // 1b. Load all post captions (coupons often appear in captions too)
  const { data: posts, error: postError } = await supabase
    .from('instagram_posts')
    .select('id, caption, mentions')
    .eq('account_id', accountId)
    .not('caption', 'is', null);

  if (postError) {
    result.errors.push(`Failed to load posts: ${postError.message}`);
  }

  const txCount = transcriptions?.length || 0;
  const postCount = posts?.length || 0;
  console.log(`[Coupon Extractor] Scanning ${txCount} transcriptions + ${postCount} post captions...`);

  if (txCount === 0 && postCount === 0) {
    console.log('[Coupon Extractor] No content found');
    return result;
  }

  // 2. Extract coupons from each transcription
  const allExtracted: ExtractedCoupon[] = [];

  for (const tx of (transcriptions || [])) {
    // Flatten on_screen_text array into clean text — strip JSON artifacts
    const screenText = normalizeScreenText(tx.on_screen_text);
    const spokenText = tx.transcription_text || '';

    // Extract brand context from this transcription
    const brandContext = extractBrandContext(screenText);

    // Extract coupon codes with patterns
    const coupons = extractCodesFromText(screenText, spokenText, brandContext, tx.source_id);
    allExtracted.push(...coupons);
  }

  // 2b. Extract coupons from post captions
  for (const post of (posts || [])) {
    const captionText = post.caption || '';
    const mentionText = Array.isArray(post.mentions) ? post.mentions.join(' ') : '';
    const combined = `${captionText} ${mentionText}`;

    const brandContext = extractBrandContext(combined);
    const coupons = extractCodesFromText(combined, '', brandContext, post.id);
    allExtracted.push(...coupons);
  }

  console.log(`[Coupon Extractor] Found ${allExtracted.length} raw coupon mentions`);

  // 3. Deduplicate — keep unique code+brand combos, prefer highest discount
  const deduped = deduplicateCoupons(allExtracted);
  console.log(`[Coupon Extractor] ${deduped.length} unique coupons after dedup`);

  if (deduped.length === 0) {
    return result;
  }

  // 4. Load existing data for dedup against DB
  const { data: existingPartnerships } = await supabase
    .from('partnerships')
    .select('id, brand_name, coupon_code, link')
    .eq('account_id', accountId);

  const { data: existingCoupons } = await supabase
    .from('coupons')
    .select('id, code, partnership_id, discount_value')
    .eq('account_id', accountId);

  const partnershipMap = new Map<string, any>(
    (existingPartnerships || []).map(p => [p.brand_name.toLowerCase(), p])
  );
  const existingCouponCodes = new Set<string>(
    (existingCoupons || []).map(c => c.code.toLowerCase())
  );

  // 5. Upsert coupons and partnerships
  for (const coupon of deduped) {
    try {
      const brandName = coupon.brandHint || 'Unknown Brand';

      // Find or create partnership
      let partnership = partnershipMap.get(brandName.toLowerCase());

      if (!partnership) {
        // Try fuzzy match
        const entries = Array.from(partnershipMap.entries());
        for (const [key, p] of entries) {
          if (key.includes(brandName.toLowerCase()) || brandName.toLowerCase().includes(key)) {
            partnership = p;
            break;
          }
        }
      }

      if (!partnership) {
        // Create new partnership
        const { data: newPartnership, error: pError } = await supabase
          .from('partnerships')
          .insert({
            account_id: accountId,
            brand_name: brandName,
            coupon_code: coupon.code,
            link: coupon.brandUrl ? `https://${coupon.brandUrl}` : null,
            status: 'active',
            is_active: true,
            notes: 'Auto-extracted from Instagram content',
          })
          .select('id, brand_name, coupon_code, link')
          .single();

        if (pError) {
          result.errors.push(`Partnership insert failed for ${brandName}: ${pError.message}`);
          continue;
        }

        partnership = newPartnership;
        partnershipMap.set(brandName.toLowerCase(), partnership!);
        result.partnershipsCreated++;
        console.log(`[Coupon Extractor] Created partnership: ${brandName}`);
      } else {
        // Update partnership link/coupon_code if missing
        const updates: Record<string, string> = {};
        if (!partnership.coupon_code && coupon.code) updates.coupon_code = coupon.code;
        if (!partnership.link && coupon.brandUrl) updates.link = `https://${coupon.brandUrl}`;

        if (Object.keys(updates).length > 0) {
          await supabase
            .from('partnerships')
            .update(updates)
            .eq('id', partnership.id);
        }
      }

      // Check if coupon already exists
      if (existingCouponCodes.has(coupon.code.toLowerCase())) {
        continue; // Skip duplicate
      }

      // Insert coupon
      const { error: cError } = await supabase
        .from('coupons')
        .insert({
          account_id: accountId,
          partnership_id: partnership!.id,
          code: coupon.code,
          discount_type: coupon.discountType,
          discount_value: coupon.discountValue,
          description: coupon.description,
          is_active: true,
        });

      if (cError) {
        // May be a duplicate — not an error
        if (!cError.message.includes('duplicate')) {
          result.errors.push(`Coupon insert failed for ${coupon.code}: ${cError.message}`);
        }
      } else {
        existingCouponCodes.add(coupon.code.toLowerCase());
        result.couponsCreated++;
        console.log(`[Coupon Extractor] Created coupon: ${coupon.code} (${coupon.discountValue}% for ${brandName})`);
      }
    } catch (err: any) {
      result.errors.push(`Error processing coupon ${coupon.code}: ${err.message}`);
    }
  }

  console.log(`[Coupon Extractor] Done: ${result.couponsCreated} created, ${result.partnershipsCreated} partnerships`);
  return result;
}

// ============================================
// Extraction Helpers
// ============================================

interface BrandContext {
  handles: string[];
  urls: string[];
  brandNames: string[];
}

/**
 * Flatten on_screen_text (JSON array or string) into clean searchable text.
 * The Gemini transcriber stores screen text as a JSON array of strings like:
 * ["קוד einav", "לובשת os", "קישור לג'קט 🔗"]
 * We join them with spaces and strip JSON artifacts.
 */
function normalizeScreenText(raw: any): string {
  if (!raw) return '';
  if (typeof raw === 'string') {
    // Try to parse as JSON array
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.join(' ');
    } catch {}
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw.map(item => typeof item === 'string' ? item : String(item)).join(' ');
  }
  return String(raw);
}

function extractBrandContext(screenText: string): BrandContext {
  const handles: string[] = [];
  const urls: string[] = [];
  const brandNames: string[] = [];

  // Extract @handles
  let match;
  const collabRegex = new RegExp(PATTERN_COLLAB.source, 'gi');
  while ((match = collabRegex.exec(screenText)) !== null) {
    const handle = match[1].toLowerCase().replace(/_?official$/, '').replace(/_?israel$/, '');
    handles.push(match[1]);
    if (HANDLE_TO_BRAND[match[1].toLowerCase()]) {
      brandNames.push(HANDLE_TO_BRAND[match[1].toLowerCase()]);
    }
  }

  // Also catch @handles without בשיתוף
  const atRegex = /@([a-zA-Z0-9_.]+)/g;
  while ((match = atRegex.exec(screenText)) !== null) {
    const h = match[1].toLowerCase();
    if (HANDLE_TO_BRAND[h] && !brandNames.includes(HANDLE_TO_BRAND[h])) {
      brandNames.push(HANDLE_TO_BRAND[h]);
      handles.push(match[1]);
    }
  }

  // Extract URLs
  const urlRegex = new RegExp(PATTERN_URL.source, 'gi');
  while ((match = urlRegex.exec(screenText)) !== null) {
    const url = match[1].toLowerCase();
    urls.push(url);
    if (URL_TO_BRAND[url] && !brandNames.includes(URL_TO_BRAND[url])) {
      brandNames.push(URL_TO_BRAND[url]);
    }
  }

  return { handles, urls, brandNames };
}

function extractCodesFromText(
  screenText: string,
  spokenText: string,
  brandContext: BrandContext,
  sourceId: string
): ExtractedCoupon[] {
  const results: ExtractedCoupon[] = [];
  const seenCodes = new Set<string>();

  const brandHint = brandContext.brandNames[0] || null;
  const brandUrl = brandContext.urls[0] || null;
  const brandHandle = brandContext.handles[0] || null;

  // Pattern 1: X% הנחה עם הקוד CODE
  let match;
  let regex = new RegExp(PATTERN_PERCENT_CODE.source, 'gi');
  while ((match = regex.exec(screenText)) !== null) {
    const code = match[2];
    if (isValidCode(code) && !seenCodes.has(code.toLowerCase())) {
      seenCodes.add(code.toLowerCase());
      results.push({
        code,
        discountValue: parseInt(match[1], 10),
        discountType: 'percentage',
        brandHint, brandUrl, brandHandle,
        description: match[0].trim(),
        sourceId,
      });
    }
  }

  // Pattern 2: Tiered discounts
  regex = new RegExp(PATTERN_TIERED.source, 'gi');
  while ((match = regex.exec(screenText)) !== null) {
    const code = match[3];
    if (isValidCode(code) && !seenCodes.has(code.toLowerCase())) {
      seenCodes.add(code.toLowerCase());
      const items = match[2];
      results.push({
        code,
        discountValue: parseInt(match[1], 10),
        discountType: 'percentage',
        brandHint, brandUrl, brandHandle,
        description: `${match[1]}% הנחה בקניית ${items} פריטים`,
        sourceId,
      });
    }
  }

  // Pattern 3: ₪ discount
  regex = new RegExp(PATTERN_SHEKEL_CODE.source, 'gi');
  while ((match = regex.exec(screenText)) !== null) {
    const code = match[2];
    if (isValidCode(code) && !seenCodes.has(code.toLowerCase())) {
      seenCodes.add(code.toLowerCase());
      results.push({
        code,
        discountValue: parseInt(match[1].replace(',', ''), 10),
        discountType: 'fixed',
        brandHint, brandUrl, brandHandle,
        description: `₪${match[1]} הנחה עם הקוד ${code}`,
        sourceId,
      });
    }
  }

  // Pattern 4: קוד הנחה CODE (no discount value specified)
  regex = new RegExp(PATTERN_CODE_LABEL.source, 'gi');
  while ((match = regex.exec(screenText)) !== null) {
    const code = match[1];
    if (isValidCode(code) && !seenCodes.has(code.toLowerCase())) {
      seenCodes.add(code.toLowerCase());
      results.push({
        code,
        discountValue: 0,
        discountType: 'percentage',
        brandHint, brandUrl, brandHandle,
        description: `קוד הנחה ${code}`,
        sourceId,
      });
    }
  }

  // Pattern 5: Standalone ALL-CAPS code near "עם הקוד" (common in screen text arrays)
  regex = new RegExp(PATTERN_STANDALONE_CODE.source, 'gi');
  while ((match = regex.exec(screenText)) !== null) {
    const code = match[1];
    if (isValidCode(code) && !seenCodes.has(code.toLowerCase())) {
      seenCodes.add(code.toLowerCase());
      // Check if there's a dollar/shekel discount nearby
      let discountValue = 0;
      let discountType: 'percentage' | 'fixed' = 'percentage';
      const dollarMatch = screenText.match(PATTERN_DOLLAR_DISCOUNT);
      if (dollarMatch) {
        const dollarVal = dollarMatch[0].match(/(\d+)/);
        if (dollarVal) {
          discountValue = parseInt(dollarVal[1], 10);
          discountType = 'fixed';
        }
      }
      results.push({
        code,
        discountValue,
        discountType,
        brandHint, brandUrl, brandHandle,
        description: discountValue > 0 ? `${discountValue} הנחה עם הקוד ${code}` : `קוד הנחה ${code}`,
        sourceId,
      });
    }
  }

  // Pattern 6: Also search in spoken text (same patterns)
  regex = new RegExp(PATTERN_CODE_LABEL.source, 'gi');
  while ((match = regex.exec(spokenText)) !== null) {
    const code = match[1];
    if (isValidCode(code) && !seenCodes.has(code.toLowerCase())) {
      seenCodes.add(code.toLowerCase());
      results.push({
        code,
        discountValue: 0,
        discountType: 'percentage',
        brandHint, brandUrl, brandHandle,
        description: `קוד הנחה ${code} (מהדיבור)`,
        sourceId,
      });
    }
  }

  return results;
}

function isValidCode(code: string): boolean {
  if (!code || code.length < 3) return false;
  if (CODE_BLOCKLIST.has(code.toLowerCase())) return false;
  // Must start with a letter
  if (!/^[A-Za-z]/.test(code)) return false;
  // Not all caps single common word
  if (code.length <= 4 && /^[A-Z]+$/.test(code)) {
    const lower = code.toLowerCase();
    if (['alma', 'zara', 'nike', 'puma', 'gucci', 'prada', 'delta', 'ariel', 'lenor'].includes(lower)) {
      return false;
    }
  }
  return true;
}

function deduplicateCoupons(coupons: ExtractedCoupon[]): ExtractedCoupon[] {
  const map = new Map<string, ExtractedCoupon>();

  for (const c of coupons) {
    const key = c.code.toLowerCase();
    const existing = map.get(key);

    if (!existing) {
      map.set(key, c);
    } else {
      // Keep the one with more info (higher discount, better brand context)
      if (c.discountValue > existing.discountValue) {
        map.set(key, { ...c, brandHint: c.brandHint || existing.brandHint });
      } else if (!existing.brandHint && c.brandHint) {
        existing.brandHint = c.brandHint;
        existing.brandUrl = c.brandUrl || existing.brandUrl;
      }
    }
  }

  return Array.from(map.values());
}
