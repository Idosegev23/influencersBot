// Backend analytics calculations for audience dashboard

import { createClient } from '@/lib/supabase';

export interface AudienceOverview {
  total_followers: number;
  growth_percentage: number;
  engagement_rate: number;
  avg_likes: number;
  avg_comments: number;
  top_platform: string;
}

export interface GrowthData {
  date: string;
  followers: number;
  growth: number;
}

export interface Demographics {
  age_groups: Array<{ range: string; percentage: number }>;
  gender: Array<{ gender: string; percentage: number }>;
  locations: Array<{ country: string; percentage: number }>;
}

export interface EngagementMetrics {
  likes_rate: number;
  comments_rate: number;
  shares_rate: number;
  saves_rate: number;
  reach: number;
  impressions: number;
}

export class AudienceAnalytics {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabase: ReturnType<typeof createClient>) {
    this.supabase = supabase;
  }

  /**
   * Get audience overview
   */
  async getOverview(accountId: string): Promise<AudienceOverview> {
    try {
      // Get account with persona data
      const { data: account } = await this.supabase
        .from('accounts')
        .select('persona, instagram_stats')
        .eq('id', accountId)
        .single();

      if (!account || !account.persona) {
        return this.getDefaultOverview();
      }

      const persona = account.persona;
      const stats = account.instagram_stats || {};

      // Calculate metrics
      const totalFollowers = stats.followers_count || persona.followers || 0;
      const previousFollowers = stats.previous_followers || totalFollowers;
      const growthPercentage = previousFollowers > 0
        ? ((totalFollowers - previousFollowers) / previousFollowers) * 100
        : 0;

      const avgLikes = stats.avg_likes || persona.engagement?.avg_likes || 0;
      const avgComments = stats.avg_comments || persona.engagement?.avg_comments || 0;
      const engagementRate = totalFollowers > 0
        ? ((avgLikes + avgComments) / totalFollowers) * 100
        : 0;

      return {
        total_followers: totalFollowers,
        growth_percentage: Math.round(growthPercentage * 10) / 10,
        engagement_rate: Math.round(engagementRate * 100) / 100,
        avg_likes: Math.round(avgLikes),
        avg_comments: Math.round(avgComments),
        top_platform: persona.platform || 'instagram',
      };
    } catch (error) {
      console.error('Error getting audience overview:', error);
      return this.getDefaultOverview();
    }
  }

  /**
   * Get growth data for charts
   */
  async getGrowthData(
    accountId: string,
    days: number = 30
  ): Promise<GrowthData[]> {
    try {
      // For now, generate mock data based on current followers
      // TODO: Implement actual historical tracking
      const overview = await this.getOverview(accountId);
      const data: GrowthData[] = [];

      const startFollowers = Math.round(
        overview.total_followers * (1 - overview.growth_percentage / 100)
      );

      for (let i = days; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        const progress = (days - i) / days;
        const followers = Math.round(
          startFollowers + (overview.total_followers - startFollowers) * progress
        );

        const previousFollowers = i < days ? data[data.length - 1]?.followers || startFollowers : startFollowers;
        const growth = followers - previousFollowers;

        data.push({
          date: date.toISOString().split('T')[0],
          followers,
          growth,
        });
      }

      return data;
    } catch (error) {
      console.error('Error getting growth data:', error);
      return [];
    }
  }

  /**
   * Get demographics data
   */
  async getDemographics(accountId: string): Promise<Demographics> {
    try {
      const { data: account } = await this.supabase
        .from('accounts')
        .select('persona')
        .eq('id', accountId)
        .single();

      if (!account || !account.persona) {
        return this.getDefaultDemographics();
      }

      const demographics = account.persona.demographics || {};

      return {
        age_groups: demographics.age_groups || [
          { range: '18-24', percentage: 30 },
          { range: '25-34', percentage: 40 },
          { range: '35-44', percentage: 20 },
          { range: '45+', percentage: 10 },
        ],
        gender: demographics.gender || [
          { gender: 'נשים', percentage: 65 },
          { gender: 'גברים', percentage: 30 },
          { gender: 'אחר', percentage: 5 },
        ],
        locations: demographics.locations || [
          { country: 'ישראל', percentage: 70 },
          { country: 'ארה"ב', percentage: 15 },
          { country: 'אירופה', percentage: 10 },
          { country: 'אחר', percentage: 5 },
        ],
      };
    } catch (error) {
      console.error('Error getting demographics:', error);
      return this.getDefaultDemographics();
    }
  }

  /**
   * Get engagement metrics
   */
  async getEngagementMetrics(accountId: string): Promise<EngagementMetrics> {
    try {
      const { data: account } = await this.supabase
        .from('accounts')
        .select('persona, instagram_stats')
        .eq('id', accountId)
        .single();

      if (!account || !account.persona) {
        return this.getDefaultEngagementMetrics();
      }

      const stats = account.instagram_stats || {};
      const engagement = account.persona.engagement || {};

      const totalFollowers = stats.followers_count || account.persona.followers || 1;

      return {
        likes_rate: engagement.avg_likes ? (engagement.avg_likes / totalFollowers) * 100 : 3.5,
        comments_rate: engagement.avg_comments ? (engagement.avg_comments / totalFollowers) * 100 : 0.5,
        shares_rate: engagement.avg_shares ? (engagement.avg_shares / totalFollowers) * 100 : 0.3,
        saves_rate: engagement.avg_saves ? (engagement.avg_saves / totalFollowers) * 100 : 1.2,
        reach: stats.reach || totalFollowers * 1.5,
        impressions: stats.impressions || totalFollowers * 3,
      };
    } catch (error) {
      console.error('Error getting engagement metrics:', error);
      return this.getDefaultEngagementMetrics();
    }
  }

  /**
   * Get top content posts
   */
  async getTopContent(accountId: string, limit: number = 10) {
    try {
      // TODO: Implement actual content tracking
      // For now, return mock data
      return [
        {
          id: '1',
          type: 'post',
          thumbnail: 'https://via.placeholder.com/300',
          caption: 'פוסט מוצלח עם engagement גבוה',
          likes: 1500,
          comments: 120,
          engagement_rate: 5.2,
          date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '2',
          type: 'reel',
          thumbnail: 'https://via.placeholder.com/300',
          caption: 'רील ויראלי',
          likes: 3200,
          comments: 250,
          engagement_rate: 7.8,
          date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '3',
          type: 'carousel',
          thumbnail: 'https://via.placeholder.com/300',
          caption: 'קרוסלה אינפורמטיבית',
          likes: 980,
          comments: 65,
          engagement_rate: 3.1,
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];
    } catch (error) {
      console.error('Error getting top content:', error);
      return [];
    }
  }

  // Default values
  private getDefaultOverview(): AudienceOverview {
    return {
      total_followers: 0,
      growth_percentage: 0,
      engagement_rate: 0,
      avg_likes: 0,
      avg_comments: 0,
      top_platform: 'instagram',
    };
  }

  private getDefaultDemographics(): Demographics {
    return {
      age_groups: [],
      gender: [],
      locations: [],
    };
  }

  private getDefaultEngagementMetrics(): EngagementMetrics {
    return {
      likes_rate: 0,
      comments_rate: 0,
      shares_rate: 0,
      saves_rate: 0,
      reach: 0,
      impressions: 0,
    };
  }
}

export default AudienceAnalytics;
