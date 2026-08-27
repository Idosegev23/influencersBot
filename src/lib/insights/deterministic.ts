import type { ContentInsight, InsightCorpus, InsightEvidence, InsightPost } from './types';

/**
 * Deterministic insight generators — arithmetic over the scanned corpus, no model
 * in the loop. Everything here is reproducible from the same data, which is what
 * lets the numbers be quoted back to a customer without hedging.
 *
 * The recurring rule below is the sample-size guard. An account with eleven posts
 * and single-digit engagement can produce an arithmetically valid "Wednesdays
 * perform 3× better" that is pure noise. Where a finding needs a sample to mean
 * anything, it is not emitted at all rather than emitted with a caveat nobody
 * reads.
 */

/** Below this many posts, timing and pattern claims are noise, not signal. */
const MIN_POSTS_FOR_PATTERN = 12;
/** A day/hour bucket needs at least this many posts before it can be compared. */
const MIN_BUCKET_SIZE = 3;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

/**
 * Platforms whose posts carry no engagement data at all.
 *
 * The LinkedIn company endpoint returns text and a date and nothing else — no
 * reactions, no comments. Ranking those posts, or averaging them into a
 * per-platform comparison, would report "LinkedIn: 0 interactions" when the
 * truth is that we cannot see them. Silence is not zero, so they are excluded
 * from anything measuring response. Their TEXT still counts everywhere else:
 * topic map, RAG, persona.
 */
const NO_ENGAGEMENT_DATA = new Set(['linkedin']);

/** Human label for a topic slug, e.g. 'membership' → 'Membership'. */
export function topicLabel(topic: string): string {
  return topic.charAt(0).toUpperCase() + topic.slice(1).replace(/_/g, ' ');
}

function platformLabel(p: string): string {
  return PLATFORM_LABEL[p] || p.charAt(0).toUpperCase() + p.slice(1);
}

/** Post fields in the account's own timezone, so "Wednesday" means their Wednesday. */
function localParts(iso: string, timezone: string): { day: number; hour: number } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date(ms));
    const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN);
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
    if (day < 0 || !Number.isFinite(hour)) return null;
    return { day, hour };
  } catch {
    return null;
  }
}

function postEvidence(p: InsightPost): InsightEvidence {
  return {
    kind: 'post',
    platform: p.platform,
    url: p.url || undefined,
    excerpt: p.caption.slice(0, 180).replace(/\s+/g, ' ').trim() || '(no caption)',
    metric: p.platform === 'facebook' ? 'reactions + comments' : 'likes + comments',
    value: p.engagement,
    postedAt: p.postedAt,
  };
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ============================================
// topic_map
// ============================================

/**
 * What this account actually talks about, by weight.
 *
 * Reads `document_chunks.topic`, which is classified against the account's own
 * archetype vocabulary — so an association is measured on membership / events /
 * advocacy rather than being forced through a retail taxonomy.
 */
export function generateTopicMap(corpus: InsightCorpus): ContentInsight[] {
  const entries = Object.entries(corpus.topicCounts)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  if (entries.length === 0) return [];

  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  const insights: ContentInsight[] = [];

  const top = entries.slice(0, 6);
  const shares = top.map(([topic, count]) => ({
    topic,
    label: topicLabel(topic),
    count,
    share: round((count / total) * 100),
  }));

  const leader = shares[0];
  const tail = shares.slice(1, 3).map((s) => `${s.label} ${s.share}%`).join(', ');

  insights.push({
    type: 'topic_map',
    title: 'What your content is actually about',
    summary:
      `${leader.label} accounts for ${leader.share}% of everything we indexed` +
      (tail ? `, followed by ${tail}` : '') +
      `. That is the shape of the knowledge your assistant answers from.`,
    rank: 0,
    metrics: { total, distribution: shares, topicCount: entries.length },
    evidence: shares.map((s) => ({
      kind: 'page' as const,
      title: s.label,
      metric: 'indexed passages',
      value: s.count,
    })),
  });

  // A lopsided corpus is a real finding: it predicts which questions the
  // assistant answers confidently and which it hedges on.
  if (leader.share >= 50 && shares.length > 1) {
    const thinnest = shares[shares.length - 1];
    insights.push({
      type: 'topic_map',
      title: `Your content leans heavily on ${leader.label}`,
      summary:
        `More than half your indexed content sits under ${leader.label}, while ` +
        `${thinnest.label} has only ${thinnest.count} passages. Expect confident answers ` +
        `on the first and hedged ones on the second.`,
      rank: 1,
      metrics: { leaderShare: leader.share, thinnestTopic: thinnest.topic, thinnestCount: thinnest.count },
      evidence: [
        { kind: 'page', title: leader.label, metric: 'indexed passages', value: leader.count },
        { kind: 'page', title: thinnest.label, metric: 'indexed passages', value: thinnest.count },
      ],
    });
  }

  return insights;
}

// ============================================
// top_performers
// ============================================

/**
 * Which posts outperformed, scored against their own platform's median.
 *
 * Emits the ranked posts themselves — the "what do the winners have in common"
 * reading is added separately by the model-backed generator, which can only
 * describe posts this function already selected.
 */
export function generateTopPerformers(corpus: InsightCorpus): ContentInsight[] {
  const posts = corpus.posts.filter(
    (p) => p.caption.trim().length > 0 && !NO_ENGAGEMENT_DATA.has(p.platform),
  );
  if (posts.length === 0) return [];

  const ranked = [...posts].sort((a, b) => b.relativeEngagement - a.relativeEngagement);
  const top = ranked.slice(0, 5);
  const best = top[0];
  if (best.engagement === 0) {
    // Every post scored zero. There is no "top performer" to report, and inventing
    // one from a tie at zero would be the most misleading thing on the page.
    return [];
  }

  const insights: ContentInsight[] = [];
  const platformCounts = posts.reduce<Record<string, number>>((acc, p) => {
    acc[p.platform] = (acc[p.platform] || 0) + 1;
    return acc;
  }, {});

  insights.push({
    type: 'top_performers',
    title: 'Your strongest posts',
    summary:
      `Ranked against each platform's own median, your best post earned ` +
      `${round(best.relativeEngagement)}× typical engagement on ${platformLabel(best.platform)}. ` +
      `These five are the ones worth studying.`,
    rank: 0,
    metrics: {
      sampleSize: posts.length,
      byPlatform: platformCounts,
      bestMultiple: round(best.relativeEngagement),
      bestEngagement: best.engagement,
    },
    evidence: top.map(postEvidence),
  });

  // Does either platform genuinely carry the account? Only worth saying when both
  // have enough posts to compare honestly.
  const platforms = Object.keys(platformCounts);
  if (platforms.length > 1) {
    const stats = platforms
      .map((platform) => {
        const subset = posts.filter((p) => p.platform === platform);
        const avg = subset.reduce((s, p) => s + p.engagement, 0) / subset.length;
        return { platform, count: subset.length, avg: round(avg) };
      })
      .filter((s) => s.count >= MIN_BUCKET_SIZE)
      .sort((a, b) => b.avg - a.avg);

    if (stats.length > 1 && stats[0].avg > 0) {
      insights.push({
        type: 'top_performers',
        title: `${platformLabel(stats[0].platform)} is where your audience actually responds`,
        summary:
          stats
            .map((s) => `${platformLabel(s.platform)} averages ${s.avg} interactions across ${s.count} posts`)
            .join('; ') + '.',
        rank: 1,
        metrics: { perPlatform: stats },
        evidence: stats.map((s) => ({
          kind: 'post' as const,
          platform: s.platform,
          title: platformLabel(s.platform),
          metric: 'average interactions per post',
          value: s.avg,
        })),
      });
    }
  }

  return insights;
}

// ============================================
// cadence
// ============================================

/**
 * Posting rhythm and timing, measured against performance.
 *
 * Every claim here is gated on sample size — see MIN_POSTS_FOR_PATTERN and
 * MIN_BUCKET_SIZE. With eleven posts there is no such thing as a best day.
 */
export function generateCadence(corpus: InsightCorpus): ContentInsight[] {
  const posts = corpus.posts.filter((p) => Number.isFinite(Date.parse(p.postedAt)));
  if (posts.length < MIN_POSTS_FOR_PATTERN) return [];

  const times = posts.map((p) => Date.parse(p.postedAt)).sort((a, b) => a - b);
  const spanDays = (times[times.length - 1] - times[0]) / 86_400_000;
  if (spanDays < 7) return [];

  const perWeek = round((posts.length / spanDays) * 7);
  const insights: ContentInsight[] = [];

  const withMedia = posts.filter((p) => p.hasMedia).length;
  const avgLength = Math.round(posts.reduce((s, p) => s + p.caption.length, 0) / posts.length);

  insights.push({
    type: 'cadence',
    title: 'Your publishing rhythm',
    summary:
      `You publish about ${perWeek} times a week across ${Math.round(spanDays)} days of history. ` +
      `${Math.round((withMedia / posts.length) * 100)}% of posts carry an image or video, and captions ` +
      `average ${avgLength} characters.`,
    rank: 0,
    metrics: {
      postsPerWeek: perWeek,
      spanDays: Math.round(spanDays),
      sampleSize: posts.length,
      mediaShare: round((withMedia / posts.length) * 100),
      avgCaptionLength: avgLength,
    },
    evidence: [
      { kind: 'post', metric: 'posts analysed', value: posts.length },
      { kind: 'post', metric: 'days of history', value: Math.round(spanDays) },
    ],
  });

  // Day-of-week performance, only where a day has enough posts to compare.
  const byDay = new Map<number, InsightPost[]>();
  for (const p of posts) {
    const parts = localParts(p.postedAt, corpus.timezone);
    if (!parts) continue;
    byDay.set(parts.day, [...(byDay.get(parts.day) || []), p]);
  }

  const dayStats = [...byDay.entries()]
    .filter(([, list]) => list.length >= MIN_BUCKET_SIZE)
    .map(([day, list]) => ({
      day,
      name: DAY_NAMES[day],
      count: list.length,
      avg: round(list.reduce((s, p) => s + p.engagement, 0) / list.length),
    }))
    .sort((a, b) => b.avg - a.avg);

  // Needs at least two comparable days AND a real difference between them.
  if (dayStats.length >= 2 && dayStats[0].avg > 0) {
    const best = dayStats[0];
    const worst = dayStats[dayStats.length - 1];
    const meaningful = worst.avg === 0 ? best.avg >= 1 : best.avg / worst.avg >= 1.5;
    if (meaningful) {
      insights.push({
        type: 'cadence',
        title: `${best.name} is your strongest day`,
        summary:
          `Posts published on ${best.name} average ${best.avg} interactions across ${best.count} posts, ` +
          `against ${worst.avg} on ${worst.name}. Times are in ${corpus.timezone}.`,
        rank: 1,
        metrics: { byDay: dayStats, timezone: corpus.timezone },
        evidence: dayStats.map((d) => ({
          kind: 'post' as const,
          title: d.name,
          metric: 'average interactions',
          value: d.avg,
        })),
      });
    }
  }

  return insights;
}
