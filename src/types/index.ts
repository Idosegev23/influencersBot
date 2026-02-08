// ============================================
// InfluencerBot Types
// ============================================

// Influencer Types
export type InfluencerType = 'food' | 'fashion' | 'tech' | 'lifestyle' | 'fitness' | 'beauty' | 'parenting' | 'travel' | 'other';

export interface InfluencerTheme {
  colors: {
    primary: string;
    accent: string;
    background: string;
    text: string;
    surface: string;
    border: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  style: 'minimal' | 'playful' | 'elegant' | 'bold';
  darkMode: boolean;
}

export interface InfluencerPersona {
  tone: string;
  style: string;
  interests: string[];
  signature_phrases: string[];
  emoji_style: 'none' | 'minimal' | 'frequent';
  language: 'he' | 'en' | 'mixed';
}

export interface Influencer {
  id: string;
  username: string;
  subdomain: string;
  display_name: string;
  bio?: string;
  avatar_url?: string; // @deprecated Use profile_pic_url
  profile_pic_url?: string; // NEW: from instagram_profile_history
  followers_count: number;
  following_count?: number;
  posts_count?: number;
  influencer_type?: InfluencerType;
  assistant_id?: string | null;
  persona?: InfluencerPersona | null;
  theme?: InfluencerTheme;
  admin_password_hash?: string;
  is_active: boolean;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
  // Instagram profile data
  instagram_username?: string;
  is_verified?: boolean;
  category?: string;
  // Personalization fields
  greeting_message?: string | null;
  suggested_questions?: string[];
  // White label fields
  hide_branding?: boolean;
  custom_logo_url?: string | null;
  // Scrape settings
  scrape_settings?: ScrapeSettings;
  // Contact info
  phone_number?: string | null;
  // WhatsApp settings
  whatsapp_enabled?: boolean;
  // Account info
  plan?: string;
  type?: string;
  persona_name?: string;
  has_persona?: boolean;
  has_profile_data?: boolean;
}

// Scrape Settings Types
export interface ScrapeSettings {
  posts_limit: number;              // 10-100, default 50
  content_types: PostType[];        // Which types to include
  include_comments: boolean;        // Whether to fetch comments
  include_hashtags: boolean;        // Whether to extract hashtags
}

// Default scrape settings
export const DEFAULT_SCRAPE_SETTINGS: ScrapeSettings = {
  posts_limit: 50,
  content_types: ['image', 'video', 'reel', 'carousel'],
  include_comments: false,
  include_hashtags: true,
};

// Post Types
export type PostType = 'image' | 'video' | 'reel' | 'carousel';

export interface ExtractedData {
  brands: string[];
  coupons: { code: string; brand: string }[];
  topics: string[];
  products: { name: string; link?: string }[];
}

export interface Post {
  id: string;
  influencer_id: string;
  shortcode: string;
  type: PostType;
  caption: string;
  image_url: string;
  video_url: string | null;
  likes_count: number;
  comments_count: number;
  posted_at: string;
  extracted_data: ExtractedData | null;
  is_analyzed: boolean;
  created_at: string;
}

// Content Item Types - Dynamic based on influencer type
export type ContentItemType = 
  // Food
  | 'recipe' | 'review' | 'recommendation'
  // Fashion
  | 'look' | 'outfit' | 'style_tip'
  // Beauty  
  | 'tutorial' | 'routine'
  // Lifestyle
  | 'tip' | 'moment' | 'story'
  // Fitness
  | 'workout' | 'motivation'
  // General
  | 'collaboration' | 'event' | 'unboxing' | 'itinerary';

export interface RecipeContent {
  ingredients: string[];
  instructions: string[];
  prep_time?: string;
  cook_time?: string;
  servings?: number;
}

export interface LookContent {
  items: { name: string; brand?: string; link?: string }[];
  occasion?: string;
  style?: string;
}

export interface ReviewContent {
  rating?: number;
  pros: string[];
  cons: string[];
  verdict?: string;
}

export interface ContentItem {
  id: string;
  influencer_id: string;
  type: ContentItemType;
  title: string;
  description: string;
  content: RecipeContent | LookContent | ReviewContent | Record<string, unknown>;
  source_post_id: string | null;
  image_url: string | null;
  created_at: string;
}

// Product Types
export interface Product {
  id: string;
  influencer_id: string;
  name: string;
  brand: string;
  category: string;
  link: string;
  short_link: string | null;
  coupon_code: string | null;
  image_url: string | null;
  source_post_id: string | null;
  is_manual: boolean;
  click_count: number;
  created_at: string;
}

// Brand Partnership Types
export interface Brand {
  id: string;
  influencer_id: string;
  brand_name: string;
  description: string | null;
  coupon_code: string | null;
  link: string | null;
  short_link: string | null;
  category: string | null;
  whatsapp_phone: string | null; // Phone number for support notifications
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Chat Types
export interface ChatSession {
  id: string;
  influencer_id: string;
  thread_id: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// Support Types
export interface SupportRequest {
  id: string;
  influencer_id: string;
  brand: string;
  customer_name: string;
  order_number: string | null;
  problem: string;
  phone: string;
  status: 'open' | 'resolved';
  whatsapp_sent: boolean;
  created_at: string;
  resolved_at: string | null;
}

// Analytics Types
export type EventType = 
  | 'chat_started'
  | 'message_sent'
  | 'product_clicked'
  | 'coupon_copied'
  | 'support_started'
  | 'support_completed';

export interface AnalyticsEvent {
  id: string;
  influencer_id: string;
  event_type: EventType;
  session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Apify Types
export interface ApifyProfileData {
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isVerified: boolean;
}

export interface ApifyPostData {
  shortCode: string;
  type: string;
  caption: string;
  displayUrl: string;
  videoUrl?: string;
  likesCount: number;
  commentsCount: number;
  timestamp: string;
}

// Wizard Types
export type WizardStep = 'url' | 'fetching' | 'analysis' | 'review' | 'theme' | 'publish';

export interface WizardState {
  step: WizardStep;
  url: string;
  profileData: ApifyProfileData | null;
  posts: ApifyPostData[];
  influencerType: InfluencerType | null;
  extractedProducts: Partial<Product>[];
  extractedContent: Partial<ContentItem>[];
  persona: InfluencerPersona | null;
  theme: InfluencerTheme;
  subdomain: string;
  error: string | null;
  isLoading: boolean;
}


