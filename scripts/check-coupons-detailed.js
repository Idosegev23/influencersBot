/**
 * Check Coupons and Partnerships Database
 * בדיקת כפילויות ומותגים ללא קופונים
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIRAN_ACCOUNT_ID = '1734105476826058';

async function checkCouponsAndPartnerships() {
  console.log('🔍 בדיקת מסד נתונים...\n');
  
  // ============================================
  // 1. כל הקופונים
  // ============================================
  const { data: coupons, error: couponsError } = await supabase
    .from('coupons')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('brand_name');
  
  if (couponsError) {
    console.error('❌ שגיאה בשליפת קופונים:', couponsError);
    return;
  }
  
  console.log('═'.repeat(80));
  console.log(`📋 כל הקופונים (${coupons?.length || 0}):`);
  console.log('═'.repeat(80));
  console.log('');
  
  const couponsByBrand = {};
  
  coupons?.forEach((c, i) => {
    console.log(`${i+1}. [${c.is_active ? '✅' : '❌'}] ${c.brand_name} - קוד: ${c.code}`);
    console.log(`   הנחה: ${c.discount_value}${c.discount_type === 'percentage' ? '%' : '₪'}`);
    console.log(`   תיאור: ${c.description || 'אין'}`);
    console.log(`   ID: ${c.id}`);
    console.log('');
    
    if (!couponsByBrand[c.brand_name]) {
      couponsByBrand[c.brand_name] = [];
    }
    couponsByBrand[c.brand_name].push(c);
  });
  
  // ============================================
  // 2. בדיקת כפילויות
  // ============================================
  console.log('═'.repeat(80));
  console.log('⚠️  בדיקת כפילויות:');
  console.log('═'.repeat(80));
  console.log('');
  
  let hasDuplicates = false;
  Object.entries(couponsByBrand).forEach(([brand, brandCoupons]) => {
    if (brandCoupons.length > 1) {
      console.log(`🔴 ${brand} - ${brandCoupons.length} קופונים!`);
      brandCoupons.forEach(c => {
        console.log(`   - ${c.code} (${c.is_active ? 'פעיל' : 'לא פעיל'}, ID: ${c.id})`);
      });
      console.log('');
      hasDuplicates = true;
    }
  });
  
  if (!hasDuplicates) {
    console.log('✅ אין כפילויות!\n');
  }
  
  // ============================================
  // 3. כל השותפויות
  // ============================================
  const { data: partnerships, error: partnershipsError } = await supabase
    .from('partnerships')
    .select('*')
    .eq('account_id', MIRAN_ACCOUNT_ID)
    .order('brand_name');
  
  if (partnershipsError) {
    console.error('❌ שגיאה בשליפת שותפויות:', partnershipsError);
    return;
  }
  
  console.log('═'.repeat(80));
  console.log(`🤝 כל השותפויות (${partnerships?.length || 0}):`);
  console.log('═'.repeat(80));
  console.log('');
  
  partnerships?.forEach((p, i) => {
    const brandCoupons = couponsByBrand[p.brand_name] || [];
    const activeCoupons = brandCoupons.filter(c => c.is_active);
    
    console.log(`${i+1}. [${p.is_active ? '✅' : '❌'}] ${p.brand_name}`);
    console.log(`   קטגוריה: ${p.category}`);
    console.log(`   קופונים: ${activeCoupons.length > 0 ? `✅ ${activeCoupons.length} פעילים` : '❌ אין'}`);
    if (brandCoupons.length > activeCoupons.length) {
      console.log(`   ⚠️  יש ${brandCoupons.length - activeCoupons.length} קופונים לא פעילים`);
    }
    console.log('');
  });
  
  // ============================================
  // 4. מותגים ללא קופונים
  // ============================================
  console.log('═'.repeat(80));
  console.log('⚠️  מותגים פעילים ללא קופונים:');
  console.log('═'.repeat(80));
  console.log('');
  
  let noCouponBrands = [];
  partnerships?.forEach(p => {
    const brandCoupons = couponsByBrand[p.brand_name] || [];
    const activeCoupons = brandCoupons.filter(c => c.is_active);
    
    if (activeCoupons.length === 0 && p.is_active) {
      noCouponBrands.push(p.brand_name);
    }
  });
  
  if (noCouponBrands.length > 0) {
    console.log('🔴 מותגים הבאים אין להם קופונים פעילים:');
    noCouponBrands.forEach(b => console.log(`   - ${b}`));
    console.log('');
  } else {
    console.log('✅ כל המותגים הפעילים יש להם קופונים פעילים!\n');
  }
  
  // ============================================
  // 5. סיכום
  // ============================================
  console.log('═'.repeat(80));
  console.log('📊 סיכום:');
  console.log('═'.repeat(80));
  console.log(`   קופונים פעילים: ${coupons?.filter(c => c.is_active).length}`);
  console.log(`   קופונים לא פעילים: ${coupons?.filter(c => !c.is_active).length}`);
  console.log(`   שותפויות פעילות: ${partnerships?.filter(p => p.is_active).length}`);
  console.log(`   שותפויות לא פעילות: ${partnerships?.filter(p => !p.is_active).length}`);
  console.log(`   כפילויות: ${hasDuplicates ? 'כן ⚠️' : 'לא ✅'}`);
  console.log(`   מותגים ללא קופונים: ${noCouponBrands.length > 0 ? `כן (${noCouponBrands.length}) ⚠️` : 'לא ✅'}`);
  console.log('');
}

checkCouponsAndPartnerships().catch(console.error);
