import { createClient } from '@/lib/supabase';

/**
 * Upsell & Renewal Suggestions Engine
 * מציע המשך פעילות/renewal לפי ביצועי שת"פ
 */

export type UpsellSuggestion = {
  partnership_id: string;
  partnership_name: string;
  brand_name: string;
  suggestion_type: 'renewal' | 'upsell' | 'expansion';
  confidence_score: number; // 0-100
  reasons: string[];
  metrics: {
    roi: number;
    engagement: number;
    revenue: number;
    usage_count: number;
    satisfaction_score?: number;
  };
  recommendation: string;
  next_steps: string[];
  suggested_offer?: {
    type: string;
    value: number;
    description: string;
  };
};

/**
 * Analyze partnership performance and suggest upsell/renewal
 */
export async function analyzePartnershipForUpsell(
  partnershipId: string
): Promise<UpsellSuggestion | null> {
  const supabase = createClient();

  // Get partnership details
  const { data: partnership } = await supabase
    .from('partnerships')
    .select(`
      id,
      name,
      brand_name,
      status,
      start_date,
      end_date,
      compensation_amount,
      coupons (
        id,
        code,
        usage_count,
        coupon_usages (
          order_amount,
          final_amount
        )
      )
    `)
    .eq('id', partnershipId)
    .single();

  if (!partnership) {
    return null;
  }

  // Only analyze completed or near-end partnerships
  const endDate = partnership.end_date ? new Date(partnership.end_date) : null;
  const daysUntilEnd = endDate ? Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 999;
  
  if (partnership.status !== 'completed' && daysUntilEnd > 30) {
    return null; // Too early to suggest
  }

  // Calculate metrics
  const coupons = partnership.coupons || [];
  const totalUsages = coupons.reduce((sum: number, c: any) => sum + (c.usage_count || 0), 0);
  
  const totalRevenue = coupons.reduce((sum: number, c: any) => {
    const usages = c.coupon_usages || [];
    return sum + usages.reduce((s: number, u: any) => s + (u.final_amount || u.order_amount || 0), 0);
  }, 0);

  const investment = partnership.compensation_amount || 0;
  const roi = investment > 0 ? ((totalRevenue - investment) / investment) * 100 : 0;

  // Get satisfaction score (if exists)
  const { data: surveys } = await supabase
    .from('satisfaction_surveys')
    .select('score')
    .eq('entity_type', 'partnership')
    .eq('entity_id', partnershipId)
    .eq('status', 'completed');

  const avgSatisfaction = surveys && surveys.length > 0
    ? surveys.reduce((sum, s) => sum + (s.score || 0), 0) / surveys.length
    : undefined;

  // Calculate engagement (usages per coupon)
  const engagement = coupons.length > 0 ? totalUsages / coupons.length : 0;

  // Build suggestion
  const metrics = {
    roi,
    engagement,
    revenue: totalRevenue,
    usage_count: totalUsages,
    satisfaction_score: avgSatisfaction,
  };

  // Determine suggestion type and confidence
  let suggestionType: 'renewal' | 'upsell' | 'expansion' = 'renewal';
  let confidenceScore = 50;
  const reasons: string[] = [];
  const nextSteps: string[] = [];

  // ROI Analysis
  if (roi > 200) {
    confidenceScore += 30;
    reasons.push(`ROI מעולה (${roi.toFixed(0)}%) - השקעה משתלמת מאוד`);
    suggestionType = 'upsell';
  } else if (roi > 100) {
    confidenceScore += 20;
    reasons.push(`ROI טוב (${roi.toFixed(0)}%) - שת"פ מצליח`);
    suggestionType = 'renewal';
  } else if (roi > 50) {
    confidenceScore += 10;
    reasons.push(`ROI בינוני (${roi.toFixed(0)}%) - יש פוטנציאל לשיפור`);
  } else {
    confidenceScore -= 20;
    reasons.push(`ROI נמוך (${roi.toFixed(0)}%) - צריך לשפר תנאים`);
  }

  // Engagement Analysis
  if (engagement > 50) {
    confidenceScore += 20;
    reasons.push(`מעורבות גבוהה (${engagement.toFixed(0)} שימושים/קופון)`);
  } else if (engagement > 20) {
    confidenceScore += 10;
    reasons.push(`מעורבות בינונית (${engagement.toFixed(0)} שימושים/קופון)`);
  }

  // Satisfaction Analysis
  if (avgSatisfaction !== undefined) {
    if (avgSatisfaction >= 8) {
      confidenceScore += 15;
      reasons.push(`שביעות רצון גבוהה (${avgSatisfaction.toFixed(1)}/10)`);
    } else if (avgSatisfaction >= 6) {
      confidenceScore += 5;
      reasons.push(`שביעות רצון בינונית (${avgSatisfaction.toFixed(1)}/10)`);
    } else {
      confidenceScore -= 10;
      reasons.push(`שביעות רצון נמוכה (${avgSatisfaction.toFixed(1)}/10) - צריך שיפור`);
    }
  }

  // Revenue threshold
  if (totalRevenue > investment * 3) {
    confidenceScore += 10;
    reasons.push(`הכנסות גבוהות (₪${totalRevenue.toLocaleString()})`);
  }

  // Cap confidence at 100
  confidenceScore = Math.min(Math.max(confidenceScore, 0), 100);

  // Build recommendation
  let recommendation = '';
  let suggestedOffer: UpsellSuggestion['suggested_offer'];

  if (confidenceScore >= 70) {
    if (suggestionType === 'upsell') {
      recommendation = `שת"פ זה הצליח מעולה! הגיע הזמן להרחיב את הפעילות עם ${partnership.brand_name}`;
      nextSteps.push('הצע קמפיין משופר עם תקציב גבוה יותר');
      nextSteps.push('הוסף מוצרים נוספים מהמותג');
      nextSteps.push('בקש בונוס על הביצועים המצוינים');
      suggestedOffer = {
        type: 'increased_compensation',
        value: investment * 1.5,
        description: `הצע להעלות את התמורה ל-₪${(investment * 1.5).toLocaleString()} בגלל הביצועים המעולים`,
      };
    } else {
      recommendation = `שת"פ זה הצליח! מומלץ להמשיך את הפעילות עם ${partnership.brand_name}`;
      nextSteps.push('צור קשר למותג לחידוש שת"פ');
      nextSteps.push('הצע תנאים דומים לשת"פ הנוכחי');
      nextSteps.push('שלח סיכום הצלחות לשכנוע המותג');
      suggestedOffer = {
        type: 'renewal',
        value: investment,
        description: `הצע להמשיך בתנאים דומים (₪${investment.toLocaleString()})`,
      };
    }
  } else if (confidenceScore >= 50) {
    recommendation = `שת"פ זה הצליח בינוני. אפשר לנסות לשפר תנאים ולחדש`;
    nextSteps.push('בדוק אילו קופונים הצליחו ואילו לא');
    nextSteps.push('הצע לשפר את האסטרטגיה לשת"פ הבא');
    nextSteps.push('שקול לבקש תמורה גבוהה יותר');
    suggestedOffer = {
      type: 'renewal_with_improvements',
      value: investment * 1.2,
      description: `הצע חידוש עם שיפורים ו-20% תמורה נוספת`,
    };
  } else {
    recommendation = `שת"פ זה לא הצליח מספיק. מומלץ לא לחדש או לשפר תנאים משמעותית`;
    nextSteps.push('נתח מה לא עבד בשת"פ');
    nextSteps.push('אם תחדש, דרוש תנאים טובים יותר');
    nextSteps.push('שקול לעבור למותג אחר');
    suggestedOffer = undefined;
  }

  return {
    partnership_id: partnershipId,
    partnership_name: partnership.name || 'ללא שם',
    brand_name: partnership.brand_name || 'ללא מותג',
    suggestion_type: suggestionType,
    confidence_score: confidenceScore,
    reasons,
    metrics,
    recommendation,
    next_steps: nextSteps,
    suggested_offer: suggestedOffer,
  };
}

/**
 * Get all upsell suggestions for an account
 */
export async function getUpsellSuggestions(accountId: string): Promise<UpsellSuggestion[]> {
  const supabase = createClient();

  // Get all partnerships that are completed or near end
  const { data: partnerships } = await supabase
    .from('partnerships')
    .select('id')
    .eq('account_id', accountId)
    .or('status.eq.completed,end_date.lt.' + new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());

  if (!partnerships) {
    return [];
  }

  // Analyze each partnership
  const suggestions = await Promise.all(
    partnerships.map(p => analyzePartnershipForUpsell(p.id))
  );

  // Filter out nulls and sort by confidence
  return suggestions
    .filter((s): s is UpsellSuggestion => s !== null)
    .sort((a, b) => b.confidence_score - a.confidence_score);
}
