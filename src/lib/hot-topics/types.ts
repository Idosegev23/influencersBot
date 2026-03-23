/**
 * Hot Topics System — Types
 */

export interface EntityMention {
  name: string;
  type: 'person' | 'event' | 'show' | 'scandal' | 'general';
}

export interface HotTopic {
  id: string;
  topic_name: string;
  topic_name_normalized: string;
  topic_type: string;
  entities: string[];
  heat_score: number;
  status: 'breaking' | 'hot' | 'cooling' | 'archive';
  summary: string | null;
  tags: string[];
  coverage_count: number;
  total_posts: number;
  total_engagement: number;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface HotTopicPost {
  id: string;
  topic_id: string;
  post_id: string;
  account_id: string;
  chunk_id: string | null;
  relevance_score: number;
  created_at: string;
}

export interface ClusteredEntity {
  name: string;
  normalized: string;
  type: EntityMention['type'];
  posts: Array<{
    post_id: string;
    account_id: string;
    chunk_id: string;
    engagement: number;
    posted_at: string;
  }>;
  account_ids: Set<string>;
  total_engagement: number;
  first_seen: Date;
  last_seen: Date;
}

export interface HeatScoreInput {
  coverage_count: number;
  total_news_accounts: number;
  hours_since_first_seen: number;
  total_engagement: number;
  max_engagement: number;
  total_posts: number;
}
