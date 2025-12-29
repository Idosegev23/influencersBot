import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Singleton pattern to avoid multiple GoTrueClient instances
let _supabaseClient: SupabaseClient | null = null;
let _supabaseServer: SupabaseClient | null = null;

// Client for browser-side operations (limited by RLS)
export const supabaseClient = (() => {
  if (!_supabaseClient) {
    _supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return _supabaseClient;
})();

// Server-side client with service role (bypasses RLS)
// Only use this in API routes, never expose to client
export const supabase = (() => {
  if (!_supabaseServer) {
    _supabaseServer = supabaseServiceKey 
      ? createClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        })
      : createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
        });
  }
  return _supabaseServer;
})();

// ============================================
// Influencer Functions
// ============================================

export async function getInfluencerBySubdomain(subdomain: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from('influencers')
    .select('*')
    .eq('subdomain', subdomain)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching influencer:', error);
    return null;
  }
  return data;
}

export async function getInfluencerByUsername(username: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from('influencers')
    .select('*')
    .eq('username', username)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('Error fetching influencer by username:', error);
    return null;
  }
  return data;
}

export async function getInfluencerById(id: string): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from('influencers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching influencer:', error);
    return null;
  }
  return data;
}

export async function getAllInfluencers(): Promise<Influencer[]> {
  const { data, error } = await supabase
    .from('influencers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching influencers:', error);
    return [];
  }
  return data || [];
}

export async function createInfluencer(influencer: Omit<Influencer, 'id' | 'created_at' | 'updated_at'>): Promise<Influencer | null> {
  const { data, error } = await supabase
    .from('influencers')
    .insert(influencer)
    .select()
    .single();

  if (error) {
    console.error('Error creating influencer:', error);
    return null;
  }
  return data;
}

export async function updateInfluencer(id: string, updates: Partial<Influencer>): Promise<boolean> {
  const { error } = await supabase
    .from('influencers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error updating influencer:', error);
    return false;
  }
  return true;
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
  const { data, error } = await supabase
    .from('content_items')
    .select('*')
    .eq('influencer_id', influencerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching content:', error);
    return [];
  }
  return data || [];
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
// Brands Functions
// ============================================

export interface Brand {
  id: string;
  influencer_id: string;
  brand_name: string;
  description: string | null;
  coupon_code: string | null;
  link: string | null;
  short_link: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getBrandsByInfluencer(influencerId: string): Promise<Brand[]> {
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('influencer_id', influencerId)
    .eq('is_active', true)
    .order('brand_name', { ascending: true });

  if (error) {
    console.error('Error fetching brands:', error);
    return [];
  }
  return data || [];
}

export async function createBrand(brand: Omit<Brand, 'id' | 'created_at' | 'updated_at'>): Promise<Brand | null> {
  const { data, error } = await supabase
    .from('brands')
    .insert(brand)
    .select()
    .single();

  if (error) {
    console.error('Error creating brand:', error);
    return null;
  }
  return data;
}

export async function updateBrand(id: string, updates: Partial<Brand>): Promise<boolean> {
  const { error } = await supabase
    .from('brands')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error updating brand:', error);
    return false;
  }
  return true;
}

export async function deleteBrand(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('brands')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting brand:', error);
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
    .insert({ influencer_id: influencerId, message_count: 0 })
    .select()
    .single();

  if (error) {
    console.error('Error creating chat session:', error);
    return null;
  }
  return data;
}

export async function getChatSessions(influencerId: string): Promise<ChatSession[]> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('influencer_id', influencerId)
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

export async function getAnalytics(influencerId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('analytics_events')
    .select('*')
    .eq('influencer_id', influencerId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching analytics:', error);
    return [];
  }
  return data || [];
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

