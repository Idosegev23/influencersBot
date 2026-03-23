/**
 * Heat Score Calculator
 *
 * Formula (0-100):
 * - coverage:   (coverage_count / total_accounts) × 40   — כמה ערוצים כיסו
 * - recency:    exp(-hours / 24) × 30                    — דעיכה אקספוננציאלית
 * - engagement: log(engagement+1) / log(max+1) × 15      — מעורבות מנורמלת
 * - intensity:  min(total_posts, 10) / 10 × 15           — כמה פוסטים
 */

import type { HeatScoreInput } from './types';

export function calculateHeatScore(input: HeatScoreInput): number {
  const { coverage_count, total_news_accounts, hours_since_first_seen, total_engagement, max_engagement, total_posts } = input;

  // Coverage: how many of the news accounts covered this topic (max 40)
  const coverageScore = (coverage_count / Math.max(total_news_accounts, 1)) * 40;

  // Recency: exponential decay (max 30)
  const recencyScore = Math.exp(-hours_since_first_seen / 24) * 30;

  // Engagement: logarithmic normalization (max 15)
  const engagementScore =
    max_engagement > 0
      ? (Math.log(total_engagement + 1) / Math.log(max_engagement + 1)) * 15
      : 0;

  // Intensity: number of posts about this topic (max 15)
  const intensityScore = (Math.min(total_posts, 10) / 10) * 15;

  return Math.min(100, coverageScore + recencyScore + engagementScore + intensityScore);
}

export function determineStatus(
  heatScore: number,
  firstSeenAt: Date
): 'breaking' | 'hot' | 'cooling' | 'archive' {
  const hoursAgo = (Date.now() - firstSeenAt.getTime()) / (1000 * 60 * 60);

  if (hoursAgo < 24 && heatScore > 70) return 'breaking';
  if (hoursAgo < 72 || heatScore > 50) return 'hot';
  if (hoursAgo < 168 || heatScore > 30) return 'cooling';
  return 'archive';
}
