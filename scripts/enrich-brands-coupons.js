/**
 * 🎯 ENRICH BRANDS & COUPONS
 * מחזק את המותגים והקופונים בדאטה-בייס בהתאם לניתוח GPT-5.2 Pro
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
);

const MIRAN_ACCOUNT_ID = '4e2a0ce8-8753-4876-973c-00c9e1426e51';

// 10 המותגים מהניתוח
const BRANDS_DATA = [
  {
    brand_name: 'SACARA',
    category: 'איפור וקוסמטיקה',
    brief: 'מותג איפור ישראלי מוביל. המוצרים האהובים של מירן: Sun Kiss (ברונזר), תוחם Fine Lady מס\' 3 מקולקציית אנה זק, סומק קרמי (03/04), שימר סטיק להארה, עט נמשים, ליפ באלם בגוונים שונים.',
    frequency: 'high',
    products: [
      'Sun Kiss - ברונזר לערבוב עם קרם פנים',
      'תוחם Fine Lady מס\' 3 (קולקציית אנה זק)',
      'סומק קרמי (גוון 03/04)',
      'שימר סטיק להארה',
      'עט נמשים (Freckles Pen)',
      'ליפ באלם (גוונים 02/08/10)',
      'קונסילר מאט (גוון 7)',
    ],
    link: 'https://www.sacara.co.il',
  },
  {
    brand_name: 'Spring',
    category: 'בשמים וריח לבית',
    brief: 'מותג בשמים ישראלי איכותי. הבשמים האהובים של מירן: Amber Intense (ריח טלק/פודרה כמו תינוק), Bisou Bisou (לבנדר+וניל רך ועוצמתי), Eternal Flower (פרייבט קולקשן לערב), Velvet Crystal (בושם מולקולרי/פריימר לבשמים).',
    frequency: 'high',
    products: [
      'Amber Intense - טלק/פודרה "ריח של תינוק"',
      'Bisou Bisou - לבנדר+וניל רך ועוצמתי',
      'Eternal Flower - פרייבט קולקשן לערב',
      'Velvet Crystal - בושם מולקולרי/פריימר',
    ],
    link: 'https://www.spring-perfume.com',
  },
  {
    brand_name: 'Max',
    category: 'פיננסים וכרטיסי אשראי',
    brief: 'כרטיס אשראי Max Back Total עם קאשבק ונקודות. מאפשר מימוש בוולט, רשתות מזון, טיסות, חיסכון והשקעות. פי 2 קאשבק בחו"ל/אונליין בקמפיינים, חשבון מט"ח באפליקציה וליווי VIP בנתב"ג.',
    frequency: 'high',
    products: [
      'Max Back Total - כרטיס אשראי עם קאשבק',
      'מימוש נקודות בוולט/רשתות/טיסות',
      'פי 2 קאשבק בחו"ל ואונליין',
      'חשבון מט"ח באפליקציה',
      'ליווי VIP בנתב"ג',
    ],
    link: 'https://www.max.co.il',
  },
  {
    brand_name: 'RENUAR',
    category: 'אופנה',
    brief: 'רשת אופנה ישראלית. מירן ומאור השיקו קולקציה משותפת RENUAR X MIRAN & MAOR. מירן חוזרת על פריטי רנואר עם "גזרה מדויקת", טרנץ\' רנואר, ומכנסיים עם תיקתק לשינוי גזרה.',
    frequency: 'medium',
    products: [
      'RENUAR X MIRAN & MAOR Collection',
      'טרנץ\' רנואר',
      'מכנסיים עם תיקתק (גזרה משתנה)',
    ],
    link: 'https://www.renuar.co.il',
  },
  {
    brand_name: 'ARGANIA',
    category: 'טיפוח שיער',
    brief: 'מותג טיפוח שיער מקצועי. המוצרים האהובים של מירן: סדרת קיק זעפרן/קיק, מסכה ללא שטיפה (במתנה בקמפיינים), My Keratin עם חומצה היאלורונית+קרטין, ספריי סרום ושמן קיק.',
    frequency: 'medium',
    products: [
      'סדרת קיק זעפרן / קיק',
      'מסכה ללא שטיפה',
      'My Keratin - חומצה היאלורונית+קרטין',
      'ספריי סרום',
      'שמן קיק',
    ],
    link: 'https://www.argania-cosmetics.com',
  },
  {
    brand_name: 'Leaves / K-Care Organics',
    category: 'טיפוח עור',
    brief: 'מותג טיפוח עור מתקדם. המוצרים האהובים של מירן: סרום רטינול+קולגן לאנטי אייג\'ינג (לא להריוניות), סרום ניאצינמיד+B5 לבוקר, ויטמין C 15%+ויטמין E ללילה, מגבות מתכלות לניקוי פנים, מדבקות פצעונים (כוכבים/עיגולים), תרחיץ עם חומצה סליצילית וניאצינמיד, ומשחת שיניים פחם פעיל.',
    frequency: 'medium',
    products: [
      'סרום רטינול + קולגן (אנטי אייג\'ינג)',
      'סרום ניאצינמיד + B5 (בוקר)',
      'ויטמין C 15% + ויטמין E (לילה)',
      'מגבות מתכלות לניקוי פנים',
      'מדבקות פצעונים (כוכבים/עיגולים)',
      'תרחיץ פנים - חומצה סליצילית וניאצינמיד',
      'משחת שיניים פחם פעיל',
    ],
    link: 'https://www.k-care.co.il',
  },
  {
    brand_name: 'Estée Lauder',
    category: 'טיפוח ומייקאפ',
    brief: 'מותג יוקרה בינלאומי. מירן משתמשת ב-Double Wear (מייקאפ), סרום לפני איפור, קרם עיניים וסרום רטינול ללילה.',
    frequency: 'medium',
    products: [
      'Double Wear - מייקאפ',
      'סרום לפני איפור',
      'קרם עיניים',
      'סרום רטינול (לילה)',
    ],
    link: 'https://www.esteelauder.co.il',
  },
  {
    brand_name: 'MAC',
    category: 'איפור',
    brief: 'מותג איפור בינלאומי מוביל. מירן אוהבת את הקונסילר של MAC לכיסוי מושלם ושימוש ארוך.',
    frequency: 'low',
    products: [
      'קונסילר MAC - כיסוי מושלם',
    ],
    link: 'https://www.maccosmetics.co.il',
  },
  {
    brand_name: 'ROOMI',
    category: 'שינה ומצעים',
    brief: 'מותג ישראלי למזרנים ומצעים. המוצרים: מזרן Freedom, מגן מזרן "כמו ענן", כריות כתף לבנדר/מנטה. כולל 100 לילות ניסיון.',
    frequency: 'low',
    products: [
      'מזרן Freedom',
      'מגן מזרן "כמו ענן"',
      'כריות כתף לבנדר/מנטה',
    ],
    link: 'https://www.roomi.co.il',
  },
  {
    brand_name: 'HONGQI',
    category: 'רכב',
    brief: 'מותג רכב יוקרה. מירן ומאור צילמו תוכן על "לא משתפים את ההגה" והווי של רכב יוקרתי.',
    frequency: 'low',
    products: [],
    link: null,
  },
];

// קופונים
const COUPONS_DATA = [
  {
    code: 'MIRAN',
    brand_name: 'Spring',
    description: 'קוד הנחה של מירן על כל בשמי Spring - הבשמים האהובים: Amber Intense, Bisou Bisou, Eternal Flower',
    discount_type: 'percentage',
    discount_value: 15,
    active: true,
  },
  {
    code: 'MIRAN_SPRING',
    brand_name: 'Spring',
    description: 'קוד הנחה מיוחד של מירן על בשמים נבחרים מ-Spring',
    discount_type: 'percentage',
    discount_value: 15,
    active: true,
  },
  {
    code: 'MIRAN_ARGANIA',
    brand_name: 'ARGANIA',
    description: 'קוד מירן - 40% הנחה על כל מוצרי ארגניה לטיפוח שיער (קיק, My Keratin, מסכות)',
    discount_type: 'percentage',
    discount_value: 40,
    active: true,
  },
  {
    code: 'MIRAN_LEAVES',
    brand_name: 'Leaves / K-Care Organics',
    description: 'עד 45% הנחה על מוצרי K-Care/Leaves לטיפוח עור (רטינול, ניאצינמיד, ויטמין C)',
    discount_type: 'percentage',
    discount_value: 45,
    active: true,
  },
  {
    code: 'מירן',
    brand_name: 'Leaves / K-Care Organics',
    description: 'קוד מירן - עד 45% הנחה על מוצרי Leaves/K-Care לטיפוח עור',
    discount_type: 'percentage',
    discount_value: 45,
    active: true,
  },
];

async function main() {
  console.log('🔥'.repeat(50));
  console.log('🔥 ENRICH BRANDS & COUPONS');
  console.log('🔥 מחזק מותגים וקופונים בדאטה-בייס');
  console.log('🔥'.repeat(50));
  console.log('');

  // ===== שלב 1: עדכון/הוספת שותפויות =====
  console.log('═'.repeat(80));
  console.log('📦 שלב 1/2: עדכון/הוספת שותפויות');
  console.log('═'.repeat(80));
  console.log('');

  for (const brand of BRANDS_DATA) {
    console.log(`📦 ${brand.brand_name} (${brand.frequency})...`);

    // בדיקה אם קיים
    const { data: existing } = await supabase
      .from('partnerships')
      .select('id')
      .eq('account_id', MIRAN_ACCOUNT_ID)
      .eq('brand_name', brand.brand_name)
      .single();

    const tags = {
      frequency: brand.frequency,
      products: brand.products,
    };

    if (existing) {
      // עדכון
      const { error } = await supabase
        .from('partnerships')
        .update({
          category: brand.category,
          brief: brand.brief,
          link: brand.link,
          tags,
          is_active: true,
        })
        .eq('id', existing.id);

      if (error) {
        console.log(`   ❌ שגיאה בעדכון: ${error.message}`);
      } else {
        console.log(`   ✅ עודכן`);
      }
    } else {
      // הוספה
      const { error } = await supabase
        .from('partnerships')
        .insert({
          account_id: MIRAN_ACCOUNT_ID,
          brand_name: brand.brand_name,
          category: brand.category,
          brief: brand.brief,
          link: brand.link,
          tags,
          is_active: true,
        });

      if (error) {
        console.log(`   ❌ שגיאה בהוספה: ${error.message}`);
      } else {
        console.log(`   ✅ נוסף`);
      }
    }
  }

  // ===== שלב 2: עדכון/הוספת קופונים =====
  console.log('\n');
  console.log('═'.repeat(80));
  console.log('🎟️ שלב 2/2: עדכון/הוספת קופונים');
  console.log('═'.repeat(80));
  console.log('');

  for (const coupon of COUPONS_DATA) {
    console.log(`🎫 ${coupon.code}...`);

    // בדיקה אם קיים
    const { data: existing } = await supabase
      .from('coupons')
      .select('id')
      .eq('account_id', MIRAN_ACCOUNT_ID)
      .eq('code', coupon.code)
      .single();

    if (existing) {
      // עדכון
      const { error } = await supabase
        .from('coupons')
        .update({
          brand_name: coupon.brand_name,
          description: coupon.description,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          is_active: coupon.active,
        })
        .eq('id', existing.id);

      if (error) {
        console.log(`   ❌ שגיאה בעדכון: ${error.message}`);
      } else {
        console.log(`   ✅ עודכן והופעל`);
      }
    } else {
      // הוספה
      const { error } = await supabase
        .from('coupons')
        .insert({
          account_id: MIRAN_ACCOUNT_ID,
          code: coupon.code,
          brand_name: coupon.brand_name,
          description: coupon.description,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          is_active: coupon.active,
        });

      if (error) {
        console.log(`   ❌ שגיאה בהוספה: ${error.message}`);
      } else {
        console.log(`   ✅ נוסף`);
      }
    }
  }

  // ===== סיכום =====
  console.log('\n');
  console.log('🎉'.repeat(50));
  console.log('🎉 הושלם!');
  console.log('🎉'.repeat(50));
  console.log('');

  const { count: partnershipsCount } = await supabase
    .from('partnerships')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', MIRAN_ACCOUNT_ID);

  const { count: couponsCount } = await supabase
    .from('coupons')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', MIRAN_ACCOUNT_ID);

  console.log('📊 סיכום סופי:');
  console.log(`   • ${partnershipsCount} שותפויות במערכת`);
  console.log(`   • ${couponsCount} קופונים במערכת`);
  console.log('');
}

main().catch(console.error);
