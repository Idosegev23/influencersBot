#!/usr/bin/env node
/**
 * Scrape Instagram & Analyze with Gemini 3 Pro Preview
 * סורק אינסטגרם ומנתח עם Gemini 3 לחילוץ מותגים וקופונים אמיתיים
 */

import { ApifyClient } from 'apify-client';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env files
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });
config({ path: join(__dirname, '..', '.env.local') });

const APIFY_API_TOKEN = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
const GOOGLE_AI_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!APIFY_API_TOKEN) throw new Error('APIFY_TOKEN missing!');
if (!GOOGLE_AI_API_KEY) throw new Error('GOOGLE_AI_API_KEY missing!');
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Supabase credentials missing!');

const apify = new ApifyClient({ token: APIFY_API_TOKEN });
const genAI = new GoogleGenAI({ apiKey: GOOGLE_AI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function scrapeInstagram(username, postsLimit = 50, reelsLimit = 30) {
  console.log(`\n📸 סורק @${username} מאינסטגרם...`);
  
  // 1. סריקת פוסטים רגילים
  console.log(`\n📷 סורק ${postsLimit} פוסטים רגילים...`);
  const postsInput = {
    directUrls: [`https://www.instagram.com/${username}/`],
    resultsType: 'posts',
    resultsLimit: postsLimit,
    searchType: 'user',
    searchLimit: 1,
    addParentData: true,
  };

  const postsRun = await apify.actor('apify/instagram-scraper').call(postsInput);
  const { items: postsItems } = await apify.dataset(postsRun.defaultDatasetId).listItems();
  const posts = postsItems.filter(item => item.shortCode && item.caption);
  console.log(`✅ ${posts.length} פוסטים עם טקסט`);
  
  // 2. סריקת ריילס
  console.log(`\n🎬 סורק ${reelsLimit} ריילס...`);
  const reelsInput = {
    username: [username], // reel scraper רוצה array של usernames
    resultsLimit: reelsLimit,
  };

  try {
    const reelsRun = await apify.actor('apify/instagram-reel-scraper').call(reelsInput);
    const { items: reelsItems } = await apify.dataset(reelsRun.defaultDatasetId).listItems();
    const reels = reelsItems.filter(item => item.caption || item.videoTranscript);
    console.log(`✅ ${reels.length} ריילס עם טקסט`);
    
    // 3. איחוד התוצאות
    const allContent = [
      ...posts.map(p => ({ ...p, contentType: 'post' })),
      ...reels.map(r => ({ ...r, contentType: 'reel' })),
    ];
    
    console.log(`\n📊 סה"כ ${allContent.length} פריטי תוכן לניתוח`);
    
    // הדפס דוגמאות
    if (allContent.length > 0) {
      console.log('\n📋 דוגמאות לתוכן:');
      allContent.slice(0, 5).forEach((item, i) => {
        const text = item.caption || item.videoTranscript || '';
        const type = item.contentType === 'reel' ? '🎬' : '📷';
        console.log(`\n${i + 1}. ${type} ${text.substring(0, 80)}...`);
        console.log(`   ❤️  ${item.likesCount || 0} | 💬 ${item.commentsCount || 0}`);
      });
    }
    
    return allContent;
  } catch (reelError) {
    console.log(`⚠️  שגיאה בסריקת ריילס: ${reelError.message}`);
    console.log(`📝 ממשיך עם ${posts.length} פוסטים בלבד`);
    return posts.map(p => ({ ...p, contentType: 'post' }));
  }
}

async function analyzeWithGemini3(content, influencerName) {
  console.log('\n🤖 מנתח עם Gemini 3 Pro Preview (thinking: high)...');
  
  // הכן את הנתונים לניתוח (כולל פוסטים וריילס)
  const contentData = content.map(item => ({
    type: item.contentType || 'post', // post או reel
    caption: item.caption || '',
    transcript: item.videoTranscript || '', // רק לריילס
    likes: item.likesCount || 0,
    comments: item.commentsCount || 0,
    views: item.videoViewCount || 0, // רק לריילס
    timestamp: item.timestamp,
    url: item.url || `https://instagram.com/p/${item.shortCode}`,
  }));

  const prompt = `אני ${influencerName}, משפיענית ישראלית. 

להלן ${content.length} פריטי תוכן (פוסטים + ריילס) האחרונים שלי מאינסטגרם:

${JSON.stringify(contentData, null, 2)}

בבקשה נתח את כל התוכן שלי (פוסטים + ריילס) ותחלץ:

1. **מותגים ושת"פים**: כל מותג שאני מזכירה או עובדת איתו
2. **קודי קופון**: כל קוד קופון שאני מפרסמת (בדוק בקפידה!)
3. **מוצרים**: מוצרים ספציפיים שאני ממליצה עליהם
4. **קטגוריות**: באילו תחומים אני פעילה (אופנה, יופי, אוכל וכו')

החזר JSON במבנה הבא:
{
  "brands": [
    {
      "name": "שם המותג",
      "category": "קטגוריה",
      "mentions": מספר_האזכורים,
      "isPartnership": true/false,
      "confidence": 0-100
    }
  ],
  "coupons": [
    {
      "code": "קוד_הקופון",
      "brand": "שם_המותג",
      "discount": "תיאור_ההנחה",
      "postUrl": "לינק_לפוסט",
      "confidence": 0-100
    }
  ],
  "products": [
    {
      "name": "שם_המוצר",
      "brand": "שם_המותג",
      "category": "קטגוריה",
      "mentions": מספר_האזכורים
    }
  ],
  "categories": ["רשימת_קטגוריות"],
  "insights": {
    "mainFocus": "מה_התמקוד_העיקרי",
    "avgEngagement": מספר,
    "topBrands": ["רשימת_3_מותגים_מובילים"]
  }
}

חשוב: 
- היה מדויק ומבוסס רק על מה שרשום בתוכן (פוסטים, ריילס, transcript)
- קודי קופון בדרך כלל:
  * מסומנים עם # או CODE או קוד
  * מופיעים באותיות גדולות (כמו MIRAN10, BUZAGLO15)
  * מלווים במילים כמו "הנחה", "קופון", "discount", "code"
  * בריילס - עשויים להופיע ב-transcript או בcaption
- אל תמציא מותגים או קופונים שלא מוזכרים
- דרג את רמת הביטחון שלך (confidence) לכל פריט
- שים לב במיוחד לריילס - לרוב שם מפרסמים קודי קופון!

החזר רק את ה-JSON, ללא הסברים נוספים.`;

  // Gemini 3 Pro with HIGH thinking level
  const response = await genAI.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: prompt,
    config: {
      thinkingConfig: {
        thinkingLevel: 'high', // חשיבה מעמיקה!
      },
      temperature: 1.0, // Gemini 3 default (recommended)
    },
  });

  const text = response.text || '';
  
  if (!text) {
    throw new Error('Gemini 3 returned empty response');
  }
  
  console.log('\n📊 תוצאות הניתוח:');
  console.log(text.substring(0, 500) + '...\n');
  
  // נסה לחלץ JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to extract JSON from response');
  }
  
  return JSON.parse(jsonMatch[0]);
}

async function saveToDatabase(analysis, influencerId) {
  console.log('\n💾 שומר לדאטה בייס...');
  
  let saved = { brands: 0, coupons: 0, products: 0 };
  
  // 1. שמור/עדכן Partnerships (מותגים)
  for (const brand of analysis.brands) {
    if (brand.confidence < 70) continue; // רק ביטחון גבוה
    
    try {
      const { data: existingPartnership } = await supabase
        .from('partnerships')
        .select('id')
        .eq('account_id', influencerId)
        .eq('brand_name', brand.name)
        .single();
      
      if (!existingPartnership) {
        const { error } = await supabase
          .from('partnerships')
          .insert({
            account_id: influencerId,
            brand_name: brand.name,
            status: brand.isPartnership ? 'active' : 'potential',
            brief: `אוטומטי: ${brand.category} - ${brand.mentions} אזכורים`,
            created_at: new Date().toISOString(),
          });
        
        if (!error) {
          saved.brands++;
          console.log(`  ✅ נוסף שת"פ: ${brand.name}`);
        }
      }
    } catch (err) {
      console.log(`  ⚠️  ${brand.name}: ${err.message}`);
    }
  }
  
  // 2. שמור קופונים
  for (const coupon of analysis.coupons) {
    if (coupon.confidence < 80) continue; // קופונים דורשים ביטחון גבוה יותר
    
    try {
      // מצא את ה-partnership המתאים
      const { data: partnership } = await supabase
        .from('partnerships')
        .select('id')
        .eq('account_id', influencerId)
        .eq('brand_name', coupon.brand)
        .single();
      
      if (partnership) {
        const { error } = await supabase
          .from('coupons')
          .insert({
            partnership_id: partnership.id,
            code: coupon.code,
            discount_type: 'percentage',
            discount_value: parseFloat(coupon.discount.match(/\d+/)?.[0] || 10),
            description: coupon.discount,
            start_date: new Date().toISOString(),
            end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            is_active: true,
            max_uses: 1000,
            tracking_url: coupon.postUrl,
          });
        
        if (!error) {
          saved.coupons++;
          console.log(`  ✅ נוסף קופון: ${coupon.code} (${coupon.brand})`);
        }
      } else {
        console.log(`  ⚠️  לא נמצא שת"פ עבור ${coupon.brand}, יוצר...`);
        // צור את ה-partnership קודם
        const { data: newPartnership } = await supabase
          .from('partnerships')
          .insert({
            account_id: influencerId,
            brand_name: coupon.brand,
            status: 'active',
            brief: `אוטומטי: נמצא קופון ${coupon.code}`,
          })
          .select()
          .single();
        
        if (newPartnership) {
          await supabase
            .from('coupons')
            .insert({
              partnership_id: newPartnership.id,
              code: coupon.code,
              discount_type: 'percentage',
              discount_value: parseFloat(coupon.discount.match(/\d+/)?.[0] || 10),
              description: coupon.discount,
              start_date: new Date().toISOString(),
              end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
              is_active: true,
              max_uses: 1000,
              tracking_url: coupon.postUrl,
            });
          saved.brands++;
          saved.coupons++;
          console.log(`  ✅ נוסף שת"פ + קופון: ${coupon.code} (${coupon.brand})`);
        }
      }
    } catch (err) {
      console.log(`  ⚠️  ${coupon.code}: ${err.message}`);
    }
  }
  
  console.log(`\n📈 סיכום: ${saved.brands} שת"פים חדשים, ${saved.coupons} קופונים חדשים`);
  return saved;
}

async function main() {
  const username = process.argv[2] || 'miranbuzaglo';
  
  console.log('🚀 מתחיל סריקה וניתוח...\n');
  console.log(`Username: @${username}`);
  
  // 1. מצא את ה-influencer
  const { data: influencer } = await supabase
    .from('influencers')
    .select('id, display_name')
    .eq('username', username)
    .single();
  
  if (!influencer) {
    throw new Error(`Influencer @${username} not found!`);
  }
  
  console.log(`Influencer: ${influencer.display_name}`);
  
  // 2. סרוק אינסטגרם (פוסטים + ריילס)
  const content = await scrapeInstagram(username, 50, 30);
  
  // 3. נתח עם Gemini 3
  const analysis = await analyzeWithGemini3(content, influencer.display_name);
  
  // 4. שמור לדאטה בייס
  const saved = await saveToDatabase(analysis, influencer.id);
  
  console.log('\n✅ הושלם!');
  console.log('\n📊 תוצאות:');
  console.log(`  📸 תוכן נסרק: ${content.length} פריטים (פוסטים + ריילס)`);
  console.log(`  🏢 מותגים: ${analysis.brands.length} נמצאו, ${saved.brands} נוספו`);
  console.log(`  🎫 קופונים: ${analysis.coupons.length} נמצאו, ${saved.coupons} נוספו`);
  console.log(`  📦 מוצרים: ${analysis.products.length} נזכרו`);
  console.log(`  🎯 קטגוריות: ${analysis.categories.join(', ')}`);
  console.log(`\n💡 Insights: ${analysis.insights.mainFocus}`);
  console.log(`   מותגים מובילים: ${analysis.insights.topBrands.join(', ')}`);
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
