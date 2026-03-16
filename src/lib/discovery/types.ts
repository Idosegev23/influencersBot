// ============================================
// Discovery Feature — Type Definitions
// ============================================

export interface DiscoveryCategory {
  slug: string;
  titleTemplate: string;       // "5 הסרטונים הכי ויראליים של {name}"
  subtitle: string;            // "לפי צפיות"
  icon: string;                // lucide icon name
  type: 'data_driven' | 'ai_generated' | 'interactive';
  color: string;               // hex color for card accent
  bgColor: string;             // light background for card
  requiredData: 'posts_with_views' | 'posts_any' | 'reels' | 'transcriptions' | 'all' | 'none';
  minItems?: number;           // minimum items to show category (default 5)
}

export interface DiscoveryItem {
  rank: number;
  postId?: string;
  shortcode?: string;
  postUrl?: string;
  thumbnailUrl?: string;
  captionExcerpt: string;
  mediaType?: 'post' | 'reel' | 'carousel' | 'video';
  postedAt?: string;
  metricValue?: number;
  metricLabel?: string;        // "צפיות", "לייקים", etc.
  aiSummary?: string;          // AI-generated summary for AI categories
  aiTitle?: string;            // AI-generated title for AI categories
}

export interface DiscoveryListData {
  category: {
    slug: string;
    title: string;             // resolved with influencer name
    subtitle: string;
    type: string;
    icon: string;
    color: string;
  };
  items: DiscoveryItem[];
  generatedAt: string;
  isStale: boolean;
}

export interface DiscoveryCategoryAvailability {
  slug: string;
  title: string;               // resolved with name
  subtitle: string;
  icon: string;
  type: 'data_driven' | 'ai_generated' | 'interactive';
  color: string;
  bgColor: string;
  available: boolean;
  itemCount: number;
}

export interface DiscoveryQuestion {
  id: string;
  questionText: string;
  voteCount: number;
  hasVoted: boolean;           // relative to current session
  status: 'open' | 'selected' | 'answered' | 'archived';
  answerText?: string;
  answerGeneratedAt?: string;
  createdAt: string;
}

export interface DiscoveryQuestionsData {
  currentWeek: DiscoveryQuestion[];
  previousAnswers: DiscoveryQuestion[];
  canSubmitToday: boolean;
  weekLabel: string;           // "12-18 מרץ 2026"
}

// DB row types (matching Supabase schema)
export interface DiscoveryListRow {
  id: string;
  account_id: string;
  category_slug: string;
  category_type: string;
  title_he: string;
  items: DiscoveryItem[];
  item_count: number;
  generation_model: string | null;
  influencer_name: string | null;
  generated_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryQuestionRow {
  id: string;
  account_id: string;
  question_text: string;
  submitted_by: string | null;
  vote_count: number;
  voters: string[];
  status: string;
  answer_text: string | null;
  answer_generated_at: string | null;
  week_start: string;
  created_at: string;
  updated_at: string;
}
