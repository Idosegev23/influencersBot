import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  Influencer,
  Post,
  ContentItem,
  Product,
  ChatSession,
  ChatMessage,
  SupportRequest,
  AnalyticsEvent,
} from '@/types';

// Environment variables validation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Debug: Check if service key is available (server-side only)
if (typeof window === 'undefined' && !supabaseServiceKey) {
  console.warn('⚠️ SUPABASE_SECRET_KEY not found - using anon key (RLS will apply)');
}

// Singleton pattern to avoid multiple GoTrueClient instances
let _supabaseClient: SupabaseClient | null = null;
let _supabaseServer: SupabaseClient | null = null;

// Client for browser-side operations (limited by RLS)
export const supabaseClient = (() => {
  if (!_supabaseClient) {
    _supabaseClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return _supabaseClient;
})();

// Helper: create client-side Supabase client (for use in React components)
export function createClientSupabaseClient() {
  return supabaseClient;
}

// Server-side client with service role (bypasses RLS)
// Only use this in API routes, never expose to client
export const supabase = (() => {
  if (!_supabaseServer) {
    _supabaseServer = supabaseServiceKey 
      ? createSupabaseClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        })
      : createSupabaseClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
        });
  }
  return _supabaseServer;
})();

// Helper: create server-side Supabase client (for use in API routes)
export function createServerSupabaseClient() {
  return supabase;
}

// Alias for backward compatibility - returns the server-side client
export function createClient() {
  return supabase;
}

// ============================================
// Influencer Functions
// ============================================

/**
 * @deprecated Use getAccountBySubdomain instead
 * Wrapper function for backward compatibility
 */
export async function getInfluencerBySubdomain(subdomain: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('config->>subdomain', subdomain)
    .eq('status', 'active')
    .single();

  if (error) {
    console.error('Error fetching account by subdomain:', error);
    return null;
  }
  return data as any;
}

/**
 * @deprecated Use getAccountByUsername instead
 * Wrapper function for backward compatibility
 */
export async function getInfluencerByUsername(username: string): Promise<Influencer | null> {
  const { data: account, error } = await supabase
    .from('accounts')
    .select(`
      *,
      chatbot_persona(
        id,
        name,
        instagram_username,
        instagram_followers,
        tone,
        response_style,
        topics,
        common_phrases,
        created_at,
        updated_at
      ),
      instagram_profile_history(
        username,
        full_name,
        bio,
        followers_count,
        profile_pic_url,
        is_verified,
        category,
        snapshot_date
      )
    `)
    .eq('config->>username', username)
    .eq('status', 'active')
    .single();

  if (error) {
    console.error('Error fetching account by username:', error);
    return null;
  }

  if (!account) return null;

  // Transform to Influencer format
  const config = account.config || {};
  const persona = (account.chatbot_persona as any)?.[0];
  const profileHistory = account.instagram_profile_history || [];
  const latestProfile = profileHistory.length > 0 
    ? profileHistory.sort((a: any, b: any) => 
        new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime()
      )[0]
    : null;

  return {
    id: account.id,
    username: config.username || latestProfile?.username || username,
    display_name: config.display_name || latestProfile?.full_name || persona?.name || config.username || 'Unknown',
    subdomain: config.subdomain || config.username || account.id,
    
    // Instagram profile data
    instagram_username: latestProfile?.username || persona?.instagram_username || config.username,
    followers_count: latestProfile?.followers_count || persona?.instagram_followers || 0,
    profile_pic_url: latestProfile?.profile_pic_url || null,
    avatar_url: config.avatar_url || latestProfile?.profile_pic_url || null, // ⚡ Avatar for chat UI
    bio: latestProfile?.bio || null,
    is_verified: latestProfile?.is_verified || false,
    category: latestProfile?.category || null,
    
    // Influencer type (from config or default to 'other')
    influencer_type: config.influencer_type || 'other',
    
    // Theme (default colors if not set)
    theme: config.theme || {
      colors: {
        primary: '#6366f1',
        secondary: '#8b5cf6',
        accent: '#ec4899',
        background: '#0f172a',
        surface: '#1e293b',
        text: '#f1f5f9',
        textSecondary: '#94a3b8',
      },
      fonts: {
        heading: 'Heebo',
        body: 'Inter',
      }
    },
    
    // Account info
    is_active: account.status === 'active',
    plan: account.plan || 'free',
    type: account.type,
    created_at: account.created_at,
    updated_at: account.updated_at,
    
    // Persona
    persona_name: persona?.name,
    has_persona: !!persona,
    
    // Additional config fields
    greeting_message: config.greeting_message,
    suggested_questions: config.suggested_questions,
    
    // Security config for authentication
    security_config: account.security_config,
  } as any;
}

/**
 * @deprecated Use getAccountById instead
 * Wrapper function for backward compatibility
 */
export async function getInfluencerById(id: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching account by id:', error);
    return null;
  }
  return data as any;
}

/**
 * @deprecated Use getAllAccounts instead
 * Wrapper function for backward compatibility
 */
export async function getAllInfluencers(): Promise<Influencer[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select(`
      *,
      instagram_profile_history(
        username,
        full_name,
        bio,
        followers_count,
        following_count,
        posts_count,
        profile_pic_url
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching accounts:', error);
    return [];
  }
  
  // Transform accounts to look like old influencer format
  return (data || []).map((account: any) => {
    const config = account.config || {};
    const profile = account.instagram_profile_history?.[0];
    
    return {
      id: account.id,
      username: config.username || profile?.username || 'unknown',
      subdomain: config.subdomain || config.username || account.id,
      display_name: config.display_name || profile?.full_name || config.username || 'Unknown',
      bio: profile?.bio || '',
      avatar_url: profile?.profile_pic_url || '',
      profile_pic_url: profile?.profile_pic_url || '',
      followers_count: profile?.followers_count || 0,
      following_count: profile?.following_count || 0,
      posts_count: profile?.posts_count || 0,
      is_active: account.status === 'active',
      created_at: account.created_at,
      updated_at: account.updated_at,
    } as any;
  });
}

/**
 * @deprecated Use POST /api/admin/accounts instead
 * This function is no longer functional - influencers table deleted
 */
export async function createInfluencer(influencer: Omit<Influencer, 'id' | 'created_at' | 'updated_at'>): Promise<Influencer | null> {
  console.warn('⚠️ createInfluencer is deprecated - use POST /api/admin/accounts');
  return null;
}

/**
 * @deprecated Use PATCH /api/admin/accounts/[id] instead
 * This function is no longer functional - influencers table deleted
 */
export async function updateInfluencer(id: string, updates: Partial<Influencer>): Promise<boolean> {
  console.warn('⚠️ updateInfluencer is deprecated - use PATCH /api/admin/accounts/[id]');
  return false;
}

// ⚠️ Dead code removed (lines 202-338) - all references to influencers table

/**
 * Get account by legacy influencer ID
 * @deprecated legacy_influencer_id column removed - just use getAccountById instead
 */
export async function getAccountByInfluencerId(influencerId: string) {
  // Now just use the ID directly as account ID
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', influencerId)
    .single();

  if (error) {
    console.error('Error fetching account:', error);
    return null;
  }
  return data;
}

/**
 * Get account by username (from config)
 */
export async function getAccountByUsername(username: string) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('type', 'creator')
    .eq('config->>username', username)
    .maybeSingle(); // ⚡ Use maybeSingle() to avoid error when no rows found

  if (error) {
    console.error('Error fetching account by username:', error);
    return null;
  }
  
  if (!data) {
    console.log(`[getAccountByUsername] No account found for @${username}`);
    return null;
  }
  return data;
}

// ============================================
// Post Functions
// ============================================

export async function getPostsByInfluencer(influencerId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('influencer_id', influencerId)
    .order('posted_at', { ascending: false });

  if (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
  return data || [];
}

export async function upsertPosts(posts: Omit<Post, 'id' | 'created_at'>[]): Promise<boolean> {
  const { error } = await supabase
    .from('posts')
    .upsert(posts, { onConflict: 'influencer_id,shortcode' });

  if (error) {
    console.error('Error upserting posts:', error);
    return false;
  }
  return true;
}

// ============================================
// Content Item Functions
// ============================================

export async function getContentByInfluencer(influencerId: string): Promise<ContentItem[]> {
  // ⚡ content_items table doesn't exist - return empty array
  // This is a legacy feature that's not currently in use
  console.log('[Content] content_items table not available, returning empty array');
  return [];
  
  // Original code (disabled):
  // const { data, error } = await supabase
  //   .from('content_items')
  //   .select('*')
  //   .eq('influencer_id', influencerId)
  //   .order('created_at', { ascending: false });
  //
  // if (error) {
  //   console.error('Error fetching content:', error);
  //   return [];
  // }
  // return data || [];
}

export async function createContentItem(item: Omit<ContentItem, 'id' | 'created_at'>): Promise<ContentItem | null> {
  const { data, error } = await supabase
    .from('content_items')
    .insert(item)
    .select()
    .single();

  if (error) {
    console.error('Error creating content item:', error);
    return null;
  }
  return data;
}

// ============================================
// Product Functions
// ============================================

export async function getProductsByInfluencer(influencerId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('influencer_id', influencerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }
  return data || [];
}

export async function createProduct(product: Omit<Product, 'id' | 'created_at' | 'click_count'>): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .insert({ ...product, click_count: 0 })
    .select()
    .single();

  if (error) {
    console.error('Error creating product:', error);
    return null;
  }
  return data;
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<boolean> {
  const { error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating product:', error);
    return false;
  }
  return true;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting product:', error);
    return false;
  }
  return true;
}

export async function incrementProductClick(id: string): Promise<boolean> {
  const { error } = await supabase.rpc('increment_product_click', { product_id: id });
  if (error) {
    console.error('Error incrementing click:', error);
    return false;
  }
  return true;
}

// ============================================
// Brands Functions (DEPRECATED - use Partnerships)
// ============================================

/**
 * @deprecated Use Partnership interface instead
 * Kept for backward compatibility
 */
export interface Brand {
  id: string;
  influencer_id: string;
  brand_name: string;
  description: string | null;
  coupon_code: string | null;
  link: string | null;
  short_link: string | null;
  category: string | null;
  whatsapp_phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * @deprecated Use getPartnershipsByInfluencer instead
 * Kept for backward compatibility
 */
export async function getBrandsByInfluencer(influencerId: string): Promise<Brand[]> {
  // ⚡ Now influencerId IS the account_id (no more legacy_influencer_id)
  const accountIds = [influencerId];

  // 1. Get partnerships-based brands
  const partnerships = await getPartnershipsByInfluencer(influencerId);
  
  // 2. For each partnership, get all its coupons
  const partnershipBrands = await Promise.all(partnerships.map(async (p) => {
    // Get all coupons for this partnership
    const { data: coupons } = await supabase
      .from('coupons')
      .select('code')
      .eq('partnership_id', p.id)
      .eq('is_active', true);
    
    // Join all coupon codes with commas, or use the partnership's coupon_code as fallback
    const couponCodes = coupons && coupons.length > 0 
      ? coupons.map(c => c.code).join(', ')
      : p.coupon_code;
    
    return {
      id: p.id,
      influencer_id: influencerId,
      brand_name: p.brand_name,
      description: p.brief,
      coupon_code: couponCodes,
      link: p.link,
      short_link: p.short_link,
      category: p.category,
      whatsapp_phone: p.whatsapp_phone,
      is_active: p.is_active || false,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  }));

  // 2. Get standalone coupons (without partnership)
  const { data: standaloneCoupons, error: couponsError } = await supabase
    .from('coupons')
    .select('*')
    .in('account_id', accountIds)
    .is('partnership_id', null)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (couponsError) {
    console.error('Error fetching standalone coupons:', couponsError);
  }

  // 3. Map standalone coupons to Brand format
  const standaloneBrands: Brand[] = (standaloneCoupons || []).map(c => ({
    id: c.id,
    influencer_id: influencerId,
    brand_name: c.brand_name || 'מותג',
    description: c.description,
    coupon_code: c.code,
    link: c.brand_link || c.tracking_url,
    short_link: null,
    category: c.brand_category,
    whatsapp_phone: null,
    is_active: c.is_active || false,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }));

  // 4. Combine and filter - only return brands WITH active coupons!
  // This prevents showing brands without coupons in the UI
  const allBrands = [...partnershipBrands, ...standaloneBrands];
  const brandsWithCoupons = allBrands.filter(b => b.coupon_code && b.coupon_code.trim().length > 0);
  
  console.log(`[getBrandsByInfluencer] ✅ Found ${brandsWithCoupons.length}/${allBrands.length} brands WITH COUPONS`);
  
  return brandsWithCoupons;
}

/**
 * @deprecated Use createPartnership instead
 */
export async function createBrand(brand: Omit<Brand, 'id' | 'created_at' | 'updated_at'>): Promise<Brand | null> {
  console.warn('createBrand is deprecated. Use createPartnership instead.');
  return null;
}

/**
 * @deprecated Use updatePartnership instead
 */
export async function updateBrand(id: string, updates: Partial<Brand>): Promise<boolean> {
  console.warn('updateBrand is deprecated. Use updatePartnership instead.');
  return false;
}

/**
 * @deprecated Use deletePartnership instead
 */
export async function deleteBrand(id: string): Promise<boolean> {
  console.warn('deleteBrand is deprecated. Use deletePartnership instead.');
  return false;
}

// ============================================
// Partnerships Functions (NEW - replaces Brands)
// ============================================

export interface Partnership {
  id: string;
  account_id: string;
  brand_name: string;
  brand_contact_name: string | null;
  brand_contact_email: string | null;
  brand_contact_phone: string | null;
  status: 'proposal' | 'negotiation' | 'contract' | 'active' | 'completed' | 'cancelled';
  proposal_amount: number | null;
  contract_amount: number | null;
  currency: string;
  brief: string | null;
  deliverables: any; // JSON
  proposal_date: string | null;
  contract_signed_date: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  tags: any; // JSON
  // New fields from brands
  coupon_code: string | null;
  link: string | null;
  short_link: string | null;
  category: string | null;
  is_active: boolean;
  whatsapp_phone: string | null;
  created_at: string;
  updated_at: string;
}

export async function getPartnershipsByInfluencer(influencerId: string): Promise<Partnership[]> {
  try {
    // ⚡ Now influencerId IS the account_id (no more legacy_influencer_id)
    const accountIds = [influencerId];

    const { data, error } = await supabase
      .from('partnerships')
      .select(`
        *,
        coupons:coupons!partnership_id(
          id,
          code,
          discount_type,
          discount_value,
          description,
          is_active
        )
      `)
      .in('account_id', accountIds)
      .order('brand_name', { ascending: true });

    if (error) {
      // ⚡ If partnerships table doesn't exist, return empty array
      if (error.code === 'PGRST204' || error.code === 'PGRST205' || error.message?.includes('not find')) {
        console.log('[Partnerships] Table not available, returning empty array');
        return [];
      }
      console.error('Error fetching partnerships:', error);
      return [];
    }
    
    // Map partnerships with coupons to include coupon_code
    return (data || []).map(p => ({
      ...p,
      coupon_code: p.coupons?.find((c: any) => c.is_active)?.code || null,
      coupons: undefined, // Remove nested array from final result
    }));
  } catch (err) {
    console.error('Exception fetching partnerships:', err);
    return [];
  }
}

export async function getPartnershipById(id: string): Promise<Partnership | null> {
  const { data, error } = await supabase
    .from('partnerships')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching partnership:', error);
    return null;
  }
  return data;
}

export async function createPartnership(partnership: Omit<Partnership, 'id' | 'created_at' | 'updated_at'>): Promise<Partnership | null> {
  const { data, error } = await supabase
    .from('partnerships')
    .insert(partnership)
    .select()
    .single();

  if (error) {
    console.error('Error creating partnership:', error);
    return null;
  }
  return data;
}

export async function updatePartnership(id: string, updates: Partial<Partnership>): Promise<boolean> {
  const { error } = await supabase
    .from('partnerships')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error updating partnership:', error);
    return false;
  }
  return true;
}

export async function deletePartnership(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('partnerships')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting partnership:', error);
    return false;
  }
  return true;
}

// ============================================
// Chat Functions
// ============================================

export async function createChatSession(influencerId: string): Promise<ChatSession | null> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ account_id: influencerId, message_count: 0 }) // ⚡ Fixed: use account_id not influencer_id
    .select()
    .single();

  if (error) {
    console.error('Error creating chat session:', error);
    return null;
  }
  return data;
}

export async function getChatSessions(influencerId: string): Promise<ChatSession[]> {
  // ⚡ Now using account_id instead of influencer_id
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('account_id', influencerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching chat sessions:', error);
    return [];
  }
  return data || [];
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching chat messages:', error);
    return [];
  }
  return data || [];
}

export async function saveChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, role, content })
    .select()
    .single();

  if (error) {
    console.error('Error saving chat message:', error);
    return null;
  }

  // Update session message count
  await supabase.rpc('increment_message_count', { session_id: sessionId });

  return data;
}

// ============================================
// Support Functions
// ============================================

export async function createSupportRequest(
  request: Omit<SupportRequest, 'id' | 'created_at' | 'resolved_at' | 'status' | 'whatsapp_sent'>
): Promise<SupportRequest | null> {
  const { data, error } = await supabase
    .from('support_requests')
    .insert({ ...request, status: 'open', whatsapp_sent: false })
    .select()
    .single();

  if (error) {
    console.error('Error creating support request:', error);
    return null;
  }
  return data;
}

export async function getSupportRequests(influencerId: string): Promise<SupportRequest[]> {
  const { data, error } = await supabase
    .from('support_requests')
    .select('*')
    .eq('influencer_id', influencerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching support requests:', error);
    return [];
  }
  return data || [];
}

export async function updateSupportStatus(id: string, status: 'open' | 'resolved'): Promise<boolean> {
  const { error } = await supabase
    .from('support_requests')
    .update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating support status:', error);
    return false;
  }
  return true;
}

// ============================================
// Analytics Functions
// ============================================

export async function trackEvent(
  influencerId: string,
  eventType: AnalyticsEvent['event_type'],
  sessionId?: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase
    .from('analytics_events')
    .insert({
      influencer_id: influencerId,
      event_type: eventType,
      session_id: sessionId || null,
      metadata: metadata || {},
    });

  if (error) {
    console.error('Error tracking event:', error);
    return false;
  }
  return true;
}

/**
 * @deprecated analytics_events table was deleted - use events table or other analytics
 */
export async function getAnalytics(influencerId: string, days: number = 30) {
  console.warn('⚠️ getAnalytics is deprecated - analytics_events table was deleted');
  // Return empty array for now - this function needs to be replaced with new analytics logic
  return [];
}

// ============================================
// Advanced Analytics Functions
// ============================================

export interface AnalyticsSummary {
  totalSessions: number;
  totalMessages: number;
  totalCouponCopies: number;
  totalProductClicks: number;
  avgMessagesPerSession: number;
  uniqueVisitors: number;
}

export interface DailyStats {
  date: string;
  sessions: number;
  messages: number;
  couponCopies: number;
  productClicks: number;
}

export interface TopProduct {
  id: string;
  name: string;
  brand: string;
  clicks: number;
  couponCopies: number;
}

export async function getAnalyticsSummary(
  influencerId: string,
  startDate: Date,
  endDate: Date
): Promise<AnalyticsSummary> {
  // Get sessions in date range
  const { data: sessions, error: sessionsError } = await supabase
    .from('chat_sessions')
    .select('id, message_count')
    .eq('influencer_id', influencerId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (sessionsError) {
    console.error('Error fetching sessions:', sessionsError);
  }

  // Get analytics events in date range
  const { data: events, error: eventsError } = await supabase
    .from('analytics_events')
    .select('event_type, session_id')
    .eq('influencer_id', influencerId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (eventsError) {
    console.error('Error fetching events:', eventsError);
  }

  const sessionsList = sessions || [];
  const eventsList = events || [];

  const totalSessions = sessionsList.length;
  const totalMessages = sessionsList.reduce((sum, s) => sum + (s.message_count || 0), 0);
  const totalCouponCopies = eventsList.filter(e => e.event_type === 'coupon_copied').length;
  const totalProductClicks = eventsList.filter(e => e.event_type === 'product_clicked').length;
  const avgMessagesPerSession = totalSessions > 0 ? Math.round(totalMessages / totalSessions * 10) / 10 : 0;
  const uniqueVisitors = new Set(eventsList.map(e => e.session_id).filter(Boolean)).size;

  return {
    totalSessions,
    totalMessages,
    totalCouponCopies,
    totalProductClicks,
    avgMessagesPerSession,
    uniqueVisitors: uniqueVisitors || totalSessions,
  };
}

export async function getDailyStats(
  influencerId: string,
  startDate: Date,
  endDate: Date
): Promise<DailyStats[]> {
  // Get all sessions
  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('created_at, message_count')
    .eq('influencer_id', influencerId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  // Get all events
  const { data: events } = await supabase
    .from('analytics_events')
    .select('created_at, event_type')
    .eq('influencer_id', influencerId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  // Group by date
  const dateMap = new Map<string, DailyStats>();

  // Initialize all dates in range
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateKey = current.toISOString().split('T')[0];
    dateMap.set(dateKey, {
      date: dateKey,
      sessions: 0,
      messages: 0,
      couponCopies: 0,
      productClicks: 0,
    });
    current.setDate(current.getDate() + 1);
  }

  // Count sessions and messages
  (sessions || []).forEach(session => {
    const dateKey = new Date(session.created_at).toISOString().split('T')[0];
    const stats = dateMap.get(dateKey);
    if (stats) {
      stats.sessions++;
      stats.messages += session.message_count || 0;
    }
  });

  // Count events
  (events || []).forEach(event => {
    const dateKey = new Date(event.created_at).toISOString().split('T')[0];
    const stats = dateMap.get(dateKey);
    if (stats) {
      if (event.event_type === 'coupon_copied') {
        stats.couponCopies++;
      } else if (event.event_type === 'product_clicked') {
        stats.productClicks++;
      }
    }
  });

  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getTopProducts(
  influencerId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 5
): Promise<TopProduct[]> {
  // Get products
  const { data: products } = await supabase
    .from('products')
    .select('id, name, brand, click_count')
    .eq('influencer_id', influencerId);

  // Get events for products
  const { data: events } = await supabase
    .from('analytics_events')
    .select('event_type, metadata')
    .eq('influencer_id', influencerId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .in('event_type', ['product_clicked', 'coupon_copied']);

  const productStats = new Map<string, { clicks: number; couponCopies: number }>();

  (events || []).forEach(event => {
    const productId = event.metadata?.product_id;
    if (productId) {
      const stats = productStats.get(productId) || { clicks: 0, couponCopies: 0 };
      if (event.event_type === 'product_clicked') {
        stats.clicks++;
      } else if (event.event_type === 'coupon_copied') {
        stats.couponCopies++;
      }
      productStats.set(productId, stats);
    }
  });

  const topProducts: TopProduct[] = (products || []).map(product => ({
    id: product.id,
    name: product.name,
    brand: product.brand || '',
    clicks: productStats.get(product.id)?.clicks || product.click_count || 0,
    couponCopies: productStats.get(product.id)?.couponCopies || 0,
  }));

  return topProducts
    .sort((a, b) => (b.clicks + b.couponCopies) - (a.clicks + a.couponCopies))
    .slice(0, limit);
}

export async function getChatSessionsWithMessages(
  influencerId: string,
  limit: number = 50,
  offset: number = 0
): Promise<(ChatSession & { messages: ChatMessage[] })[]> {
  const { data: sessions, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('influencer_id', influencerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !sessions) {
    console.error('Error fetching sessions:', error);
    return [];
  }

  // Fetch messages for each session
  const sessionsWithMessages = await Promise.all(
    sessions.map(async (session) => {
      const messages = await getChatMessages(session.id);
      return { ...session, messages };
    })
  );

  return sessionsWithMessages;
}

export async function searchChatSessions(
  influencerId: string,
  query: string
): Promise<(ChatSession & { messages: ChatMessage[] })[]> {
  // Get all sessions
  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('influencer_id', influencerId)
    .order('created_at', { ascending: false });

  if (!sessions || sessions.length === 0) return [];

  // Get all messages and search
  const results: (ChatSession & { messages: ChatMessage[] })[] = [];

  for (const session of sessions) {
    const { data: messages } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });

    if (messages && messages.some(m => m.content.toLowerCase().includes(query.toLowerCase()))) {
      results.push({ ...session, messages });
    }

    if (results.length >= 20) break;
  }

  return results;
}

