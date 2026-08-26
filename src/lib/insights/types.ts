export type InsightType = 'top_performers' | 'content_gaps' | 'topic_map' | 'cadence';

/**
 * One checkable fact behind an insight.
 *
 * `kind` says what the reader is looking at, so the dashboard can render a post
 * card, a page link or a retrieval probe differently without guessing.
 */
export interface InsightEvidence {
  kind: 'post' | 'page' | 'comment' | 'probe';
  platform?: string;
  url?: string;
  title?: string;
  excerpt?: string;
  /** What was measured, e.g. 'reactions', 'likes', 'chunks', 'topScore'. */
  metric?: string;
  value?: number;
  postedAt?: string;
}

export interface ContentInsight {
  type: InsightType;
  title: string;
  summary: string;
  rank: number;
  metrics: Record<string, unknown>;
  evidence: InsightEvidence[];
}

/** A post as the generators see it, platform-normalised. */
export interface InsightPost {
  id: string;
  platform: string;
  url: string | null;
  caption: string;
  likes: number;
  comments: number;
  views: number;
  postedAt: string;
  hasMedia: boolean;
  /** Engagement relative to this platform's median. 1.0 = typical. */
  relativeEngagement: number;
  engagement: number;
}

export interface InsightComment {
  text: string;
  postUrl: string | null;
  platform: string;
  commentedAt: string;
}

export interface InsightCorpus {
  accountId: string;
  displayName: string;
  language: 'he' | 'en';
  archetype: string;
  /** IANA zone from accounts.timezone. Posting-hour findings are meaningless without it. */
  timezone: string;
  posts: InsightPost[];
  comments: InsightComment[];
  /** chunk counts by `document_chunks.topic`. */
  topicCounts: Record<string, number>;
  /** A couple of representative pages per topic, for evidence. */
  topicSamples: Record<string, { title: string; url: string | null; excerpt: string }[]>;
  websitePageCount: number;
  totalChunks: number;
}
