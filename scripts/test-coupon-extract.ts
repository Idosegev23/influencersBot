import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const EINAV_ACCOUNT_ID = 'e18b4860-a281-4c8b-bde0-2e15360cb16f';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

// ---- Inline extraction logic (mirrors extract-coupons.ts) ----

const PATTERN_PERCENT_CODE = /(\d+)%?\s*הנחה\s+(?:עם\s+)?(?:ה)?קוד\s+([A-Za-z][\w]*\d*)/gi;
const PATTERN_CODE_LABEL = /(?:ה)?קוד\s+(?:הנחה\s+)?([A-Za-z][\w]{2,}\d*)/gi;
const PATTERN_SHEKEL_CODE = /[-]?\s*₪?\s*(\d[\d,]*)\s*₪?\s*(?:הנחה\s+)?עם\s+(?:ה)?קוד\s+([A-Za-z][\w]*)/gi;
const PATTERN_STANDALONE_CODE = /(?:עם\s+)?(?:ה)?קוד\s*[\s,]*([A-Z][A-Z0-9]{2,})/gi;
const PATTERN_DOLLAR_DISCOUNT = /(\d+)\s*דולר\s*(?:לאדם\s+)?הנחה/gi;
const PATTERN_URL = /([a-zA-Z0-9-]+\.(?:co\.il|com|co|io))/gi;
const PATTERN_COLLAB = /בשיתוף\s+@([a-zA-Z0-9_.]+)/gi;

const CODE_BLOCKLIST = new Set([
  'qr', 'url', 'push', 'resume', 'login', 'signup', 'http', 'https',
  'instagram', 'facebook', 'tiktok', 'youtube', 'whatsapp', 'telegram',
  'iphone', 'android', 'samsung', 'apple', 'google', 'amazon',
  'made', 'china', 'cotton', 'care', 'extra', 'clean', 'power',
  'baby', 'daily', 'enjoy', 'little', 'things', 'official',
  'sunglass', 'returned', 'louder', 'fresh',
  'lenor', 'ariel', 'philips', 'sonicare', 'magnus', 'zohara', 'delta',
  'prada', 'gucci', 'dior', 'chanel', 'huggies', 'disney', 'tommy',
  'emily', 'story', 'alma',
  'black', 'white', 'blue', 'pink', 'gold', 'silver',
  'cinav',
]);

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
  'flyingcarpet_il': 'השטיח המעופף',
  'ksp_co_il': 'KSP',
  'kspcoil': 'KSP',
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
  'flyingcarpet.co.il': 'השטיח המעופף',
};

const HEBREW_BRAND_NAMES: Record<string, string> = {
  'בראון': 'בראון', 'פיליפס': 'פיליפס', 'סוניקייר': 'סוניקייר',
  'דלתא': 'דלתא', 'מגנוס': 'מגנוס', 'זוהרה': 'זוהרה',
  'אדיקט אונליין': 'אדיקט אונליין', 'אדיקט': 'אדיקט אונליין',
  'פנדה': 'פנדה', 'לה בוטה': 'לה בוטה', 'קנדל קלאב': 'קנדל קלאב',
  'סטורי': 'סטורי', 'דג דג': 'דג דג', 'קטאליה': 'קטאליה',
  'אופטיקנה': 'אופטיקנה', 'לנור': 'לנור', 'אריאל': 'אריאל',
  'השטיח המעופף': 'השטיח המעופף', 'פוקס': 'פוקס', 'קסטרו': 'קסטרו',
  'רנואר': 'רנואר', 'גולברי': 'גולברי', 'הוניגמן': 'הוניגמן',
  'טרמינל איקס': 'טרמינל איקס', 'טרמינל': 'טרמינל איקס',
  'סופר פארם': 'סופר פארם', 'שופרסל': 'שופרסל',
  'סלקום': 'סלקום', 'פרטנר': 'פרטנר', 'איקאה': 'איקאה',
  'הום סנטר': 'הום סנטר', 'עדיקה': 'עדיקה', 'שילב': 'שילב',
  'באגס': 'באגס', 'האגיס': 'האגיס', 'סימילאק': 'סימילאק',
  'מטרנה': 'מטרנה', 'נספרסו': 'נספרסו',
};

const ENGLISH_BRAND_KEYWORDS: Record<string, string> = {
  'braun': 'בראון', 'philips': 'פיליפס', 'sonicare': 'סוניקייר',
  'delta': 'דלתא', 'magnus': 'מגנוס', 'fox': 'פוקס',
  'castro': 'קסטרו', 'renuar': 'רנואר', 'golbary': 'גולברי',
  'honigman': 'הוניגמן', 'ikea': 'איקאה', 'ksp': 'KSP',
  'nespresso': 'נספרסו', 'addict': 'אדיקט אונליין', 'pandazzz': 'פנדה',
};

function normalizeScreenText(raw: any): string {
  if (!raw) return '';
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p.join(' '); } catch {}
    return raw;
  }
  if (Array.isArray(raw)) return raw.map((i: any) => typeof i === 'string' ? i : String(i)).join(' ');
  return String(raw);
}

interface BrandContext { handles: string[]; urls: string[]; brandNames: string[]; }

function matchHebrewBrand(text: string): string | null {
  const t = text.trim();
  for (const brand of Object.keys(HEBREW_BRAND_NAMES).sort((a, b) => b.length - a.length)) {
    if (t.startsWith(brand)) return HEBREW_BRAND_NAMES[brand];
  }
  return null;
}

function extractBrandContext(screenText: string): BrandContext {
  const handles: string[] = [], urls: string[] = [], brandNames: string[] = [];
  let match;

  const collabRegex = new RegExp(PATTERN_COLLAB.source, 'gi');
  while ((match = collabRegex.exec(screenText)) !== null) {
    handles.push(match[1]);
    if (HANDLE_TO_BRAND[match[1].toLowerCase()]) brandNames.push(HANDLE_TO_BRAND[match[1].toLowerCase()]);
  }

  const atRegex = /@([a-zA-Z0-9_.]+)/g;
  while ((match = atRegex.exec(screenText)) !== null) {
    const h = match[1].toLowerCase();
    if (HANDLE_TO_BRAND[h] && !brandNames.includes(HANDLE_TO_BRAND[h])) {
      brandNames.push(HANDLE_TO_BRAND[h]); handles.push(match[1]);
    }
  }

  const hebrewCollabRegex = /(?:בשיתוף|בחסות|בשת"פ|בשת״פ|בהפקת|sponsored\s+by)\s+(?:עם\s+)?([א-ת][א-ת\s]{1,20})/gi;
  while ((match = hebrewCollabRegex.exec(screenText)) !== null) {
    const matched = matchHebrewBrand(match[1].trim());
    if (matched && !brandNames.includes(matched)) brandNames.push(matched);
  }

  const textLower = screenText.toLowerCase();
  for (const [eng, heb] of Object.entries(ENGLISH_BRAND_KEYWORDS)) {
    if (textLower.includes(eng) && !brandNames.includes(heb)) brandNames.push(heb);
  }

  const urlRegex = new RegExp(PATTERN_URL.source, 'gi');
  while ((match = urlRegex.exec(screenText)) !== null) {
    const url = match[1].toLowerCase(); urls.push(url);
    if (URL_TO_BRAND[url] && !brandNames.includes(URL_TO_BRAND[url])) brandNames.push(URL_TO_BRAND[url]);
  }

  return { handles, urls, brandNames };
}

function isValidCode(code: string): boolean {
  if (!code || code.length < 3) return false;
  if (CODE_BLOCKLIST.has(code.toLowerCase())) return false;
  if (!/^[A-Za-z]/.test(code)) return false;
  if (code.length <= 4 && /^[A-Z]+$/.test(code)) {
    if (['alma', 'zara', 'nike', 'puma', 'gucci', 'prada', 'delta', 'ariel', 'lenor'].includes(code.toLowerCase())) return false;
  }
  return true;
}

interface ExtractedCoupon {
  code: string; discountValue: number; discountType: 'percentage' | 'fixed';
  brandHint: string | null; brandUrl: string | null; brandHandle: string | null;
  description: string; sourceId: string;
}

function extractCodesFromText(screenText: string, spokenText: string, brandContext: BrandContext, sourceId: string): ExtractedCoupon[] {
  const results: ExtractedCoupon[] = [];
  const seenCodes = new Set<string>();
  const brandHint = brandContext.brandNames[0] || null;
  const brandUrl = brandContext.urls[0] || null;
  const brandHandle = brandContext.handles[0] || null;

  let match;
  // Pattern 1: X% הנחה עם הקוד CODE
  let regex = new RegExp(PATTERN_PERCENT_CODE.source, 'gi');
  while ((match = regex.exec(screenText)) !== null) {
    const code = match[2]; const pct = parseInt(match[1], 10);
    if (pct > 100) continue; // price, not discount
    if (isValidCode(code) && !seenCodes.has(code.toLowerCase())) {
      seenCodes.add(code.toLowerCase());
      results.push({ code, discountValue: pct, discountType: 'percentage', brandHint, brandUrl, brandHandle, description: match[0].trim(), sourceId });
    }
  }

  // Pattern 3: ₪ discount
  regex = new RegExp(PATTERN_SHEKEL_CODE.source, 'gi');
  while ((match = regex.exec(screenText)) !== null) {
    const code = match[2]; const val = parseInt(match[1].replace(',', ''), 10);
    if (val > 500) continue; // likely a price, not a discount
    if (isValidCode(code) && !seenCodes.has(code.toLowerCase())) {
      seenCodes.add(code.toLowerCase());
      results.push({ code, discountValue: val, discountType: 'fixed', brandHint, brandUrl, brandHandle, description: `₪${match[1]} הנחה עם הקוד ${code}`, sourceId });
    }
  }

  // Pattern 4: קוד הנחה CODE
  regex = new RegExp(PATTERN_CODE_LABEL.source, 'gi');
  while ((match = regex.exec(screenText)) !== null) {
    const code = match[1];
    if (isValidCode(code) && !seenCodes.has(code.toLowerCase())) {
      seenCodes.add(code.toLowerCase());
      results.push({ code, discountValue: 0, discountType: 'percentage', brandHint, brandUrl, brandHandle, description: `קוד הנחה ${code}`, sourceId });
    }
  }

  // Pattern 5: Standalone ALL-CAPS code near "עם הקוד"
  regex = new RegExp(PATTERN_STANDALONE_CODE.source, 'gi');
  while ((match = regex.exec(screenText)) !== null) {
    const code = match[1];
    if (isValidCode(code) && !seenCodes.has(code.toLowerCase())) {
      seenCodes.add(code.toLowerCase());
      let discountValue = 0; let discountType: 'percentage' | 'fixed' = 'percentage';
      const dollarMatch = screenText.match(PATTERN_DOLLAR_DISCOUNT);
      if (dollarMatch) {
        const dv = dollarMatch[0].match(/(\d+)/);
        if (dv) { discountValue = parseInt(dv[1], 10); discountType = 'fixed'; }
      }
      results.push({ code, discountValue, discountType, brandHint, brandUrl, brandHandle, description: discountValue > 0 ? `${discountValue} דולר הנחה עם הקוד ${code}` : `קוד הנחה ${code}`, sourceId });
    }
  }

  // Pattern 6: spoken text
  regex = new RegExp(PATTERN_CODE_LABEL.source, 'gi');
  while ((match = regex.exec(spokenText)) !== null) {
    const code = match[1];
    if (isValidCode(code) && !seenCodes.has(code.toLowerCase())) {
      seenCodes.add(code.toLowerCase());
      results.push({ code, discountValue: 0, discountType: 'percentage', brandHint, brandUrl, brandHandle, description: `קוד הנחה ${code} (מהדיבור)`, sourceId });
    }
  }

  return results;
}

// ---- DRY RUN ----

async function main() {
  console.log('=== DRY RUN: Coupon Extraction for Einav ===\n');

  const { data: transcriptions } = await supabase
    .from('instagram_transcriptions')
    .select('id, on_screen_text, transcription_text, source_type, source_id')
    .eq('account_id', EINAV_ACCOUNT_ID)
    .eq('processing_status', 'completed');

  const { data: posts } = await supabase
    .from('instagram_posts')
    .select('id, caption, mentions')
    .eq('account_id', EINAV_ACCOUNT_ID)
    .not('caption', 'is', null);

  console.log(`${transcriptions?.length || 0} transcriptions, ${posts?.length || 0} posts\n`);

  const allExtracted: ExtractedCoupon[] = [];

  for (const tx of (transcriptions || [])) {
    const screenText = normalizeScreenText(tx.on_screen_text);
    const spokenText = tx.transcription_text || '';
    const brandContext = extractBrandContext(screenText);
    const coupons = extractCodesFromText(screenText, spokenText, brandContext, tx.source_id);
    if (coupons.length > 0) {
      for (const c of coupons) {
        console.log(`  🎟️ ${c.code} → ${c.brandHint || '?'} | ${c.discountValue}${c.discountType === 'percentage' ? '%' : '₪'} | ${c.description}`);
      }
      allExtracted.push(...coupons);
    }
  }

  for (const post of (posts || [])) {
    const combined = `${post.caption || ''} ${Array.isArray(post.mentions) ? post.mentions.join(' ') : ''}`;
    const brandContext = extractBrandContext(combined);
    const coupons = extractCodesFromText(combined, '', brandContext, post.id);
    if (coupons.length > 0) {
      for (const c of coupons) {
        console.log(`  📸 ${c.code} → ${c.brandHint || '?'} | ${c.discountValue}${c.discountType === 'percentage' ? '%' : '₪'} | ${c.description}`);
      }
      allExtracted.push(...coupons);
    }
  }

  // Dedup
  const map = new Map<string, ExtractedCoupon>();
  for (const c of allExtracted) {
    const key = c.code.toLowerCase();
    const existing = map.get(key);
    if (!existing) map.set(key, c);
    else if (c.discountValue > existing.discountValue) map.set(key, { ...c, brandHint: c.brandHint || existing.brandHint });
    else if (!existing.brandHint && c.brandHint) existing.brandHint = c.brandHint;
  }

  console.log('\n=== FINAL DEDUPED COUPONS ===');
  for (const [, c] of map) {
    console.log(`  ${c.code} → ${c.brandHint || 'Unknown'} | ${c.discountValue}${c.discountType === 'percentage' ? '%' : (c.description.includes('דולר') ? '$' : '₪')} | ${c.description}`);
  }
  console.log(`\nTotal: ${map.size} unique codes`);
}

main().catch(console.error);
