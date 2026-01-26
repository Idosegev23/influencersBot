import { createClient } from '@/lib/supabase';

/**
 * Advanced Coupon Analytics
 * מוצרים נמכרים ביותר, סל ממוצע, רווח פר קופון
 */

export type ProductSalesData = {
  product_name: string;
  product_id?: string;
  total_sold: number;
  total_revenue: number;
  average_price: number;
};

export type CouponPerformance = {
  coupon_id: string;
  code: string;
  usage_count: number;
  copy_count: number;
  total_revenue: number;
  total_discount: number;
  profit_per_coupon: number;
  average_basket: number;
  conversion_rate: number;
};

export type AdvancedCouponAnalytics = {
  top_products: ProductSalesData[];
  average_basket: number;
  total_items_sold: number;
  coupon_performance: CouponPerformance[];
  summary: {
    total_revenue: number;
    total_orders: number;
    total_discount_given: number;
    net_profit: number;
    average_order_value: number;
  };
};

/**
 * Get top selling products from coupon usages
 */
export async function getTopSellingProducts(
  partnershipId: string,
  limit: number = 10
): Promise<ProductSalesData[]> {
  const supabase = createClient();

  // Get all coupon usages for this partnership
  const { data: coupons } = await supabase
    .from('coupons')
    .select('id')
    .eq('partnership_id', partnershipId);

  if (!coupons || coupons.length === 0) {
    return [];
  }

  const couponIds = coupons.map(c => c.id);

  // Get all usages
  const { data: usages } = await supabase
    .from('coupon_usages')
    .select('products, order_amount')
    .in('coupon_id', couponIds);

  if (!usages) {
    return [];
  }

  // Aggregate products
  const productMap = new Map<string, ProductSalesData>();

  usages.forEach(usage => {
    if (!usage.products || !Array.isArray(usage.products)) return;

    usage.products.forEach((product: any) => {
      const name = product.name || product.product_name || 'Unknown';
      const price = parseFloat(product.price || product.unit_price || 0);
      const quantity = parseInt(product.quantity || 1);

      if (!productMap.has(name)) {
        productMap.set(name, {
          product_name: name,
          product_id: product.id || product.product_id,
          total_sold: 0,
          total_revenue: 0,
          average_price: 0,
        });
      }

      const existing = productMap.get(name)!;
      existing.total_sold += quantity;
      existing.total_revenue += price * quantity;
      existing.average_price = existing.total_revenue / existing.total_sold;
    });
  });

  // Convert to array and sort
  const products = Array.from(productMap.values())
    .sort((a, b) => b.total_sold - a.total_sold)
    .slice(0, limit);

  return products;
}

/**
 * Calculate average basket size
 */
export async function getAverageBasket(partnershipId: string): Promise<number> {
  const supabase = createClient();

  const { data: coupons } = await supabase
    .from('coupons')
    .select('id')
    .eq('partnership_id', partnershipId);

  if (!coupons || coupons.length === 0) {
    return 0;
  }

  const couponIds = coupons.map(c => c.id);

  const { data: usages } = await supabase
    .from('coupon_usages')
    .select('order_amount')
    .in('coupon_id', couponIds);

  if (!usages || usages.length === 0) {
    return 0;
  }

  const total = usages.reduce((sum, u) => sum + (u.order_amount || 0), 0);
  return Math.round(total / usages.length);
}

/**
 * Get profit per coupon
 */
export async function getCouponPerformance(
  partnershipId: string
): Promise<CouponPerformance[]> {
  const supabase = createClient();

  // Get partnership investment
  const { data: partnership } = await supabase
    .from('partnerships')
    .select('compensation_amount')
    .eq('id', partnershipId)
    .single();

  const investment = partnership?.compensation_amount || 0;

  // Get all coupons for this partnership
  const { data: coupons } = await supabase
    .from('coupons')
    .select(`
      id,
      code,
      usage_count,
      copy_count,
      coupon_usages (
        order_amount,
        discount_amount,
        final_amount
      )
    `)
    .eq('partnership_id', partnershipId);

  if (!coupons) {
    return [];
  }

  // Calculate performance for each coupon
  const performance: CouponPerformance[] = coupons.map((coupon: any) => {
    const usages = coupon.coupon_usages || [];
    const usageCount = usages.length;
    const copyCount = coupon.copy_count || 0;

    const totalRevenue = usages.reduce((sum: number, u: any) => 
      sum + (u.final_amount || u.order_amount || 0), 0
    );

    const totalDiscount = usages.reduce((sum: number, u: any) => 
      sum + (u.discount_amount || 0), 0
    );

    // Calculate profit: revenue minus proportional investment
    const couponShare = usageCount > 0 ? usageCount / Math.max(coupon.usage_count, 1) : 0;
    const couponInvestment = investment * couponShare;
    const profit = totalRevenue - couponInvestment;
    const profitPerCoupon = usageCount > 0 ? profit / usageCount : 0;

    // Average basket
    const averageBasket = usageCount > 0 ? totalRevenue / usageCount : 0;

    // Conversion rate: usages / copies
    const conversionRate = copyCount > 0 ? (usageCount / copyCount) * 100 : 0;

    return {
      coupon_id: coupon.id,
      code: coupon.code,
      usage_count: usageCount,
      copy_count: copyCount,
      total_revenue: totalRevenue,
      total_discount: totalDiscount,
      profit_per_coupon: profitPerCoupon,
      average_basket: averageBasket,
      conversion_rate: conversionRate,
    };
  });

  return performance.sort((a, b) => b.total_revenue - a.total_revenue);
}

/**
 * Get complete advanced analytics
 */
export async function getAdvancedCouponAnalytics(
  partnershipId: string
): Promise<AdvancedCouponAnalytics> {
  const supabase = createClient();

  // Run all queries in parallel
  const [topProducts, couponPerformance] = await Promise.all([
    getTopSellingProducts(partnershipId, 10),
    getCouponPerformance(partnershipId),
  ]);

  // Calculate summary
  const totalRevenue = couponPerformance.reduce((sum, c) => sum + c.total_revenue, 0);
  const totalOrders = couponPerformance.reduce((sum, c) => sum + c.usage_count, 0);
  const totalDiscount = couponPerformance.reduce((sum, c) => sum + c.total_discount, 0);
  const averageBasket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Get investment for net profit
  const { data: partnership } = await supabase
    .from('partnerships')
    .select('compensation_amount')
    .eq('id', partnershipId)
    .single();

  const investment = partnership?.compensation_amount || 0;
  const netProfit = totalRevenue - investment;

  // Calculate total items sold
  const totalItemsSold = topProducts.reduce((sum, p) => sum + p.total_sold, 0);

  return {
    top_products: topProducts,
    average_basket: averageBasket,
    total_items_sold: totalItemsSold,
    coupon_performance: couponPerformance,
    summary: {
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      total_discount_given: totalDiscount,
      net_profit: netProfit,
      average_order_value: averageBasket,
    },
  };
}
