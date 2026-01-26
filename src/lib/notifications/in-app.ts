// In-App notification channel

import { createClient } from '@/lib/supabase';

interface InAppNotificationParams {
  accountId: string;
  userId: string;
  followUpId?: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  actionUrl?: string;
  actionLabel?: string;
}

export class InAppChannel {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabase: ReturnType<typeof createClient>) {
    this.supabase = supabase;
  }

  /**
   * Create in-app notification
   */
  async create(params: InAppNotificationParams): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('in_app_notifications')
        .insert({
          account_id: params.accountId,
          user_id: params.userId,
          follow_up_id: params.followUpId || null,
          title: params.title,
          message: params.message,
          type: params.type || 'info',
          action_url: params.actionUrl || null,
          action_label: params.actionLabel || null,
          is_read: false,
        });

      if (error) {
        console.error('Error creating in-app notification:', error);
        return false;
      }

      console.log('✅ In-app notification created');
      return true;
    } catch (error) {
      console.error('Error in InAppChannel.create:', error);
      return false;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('in_app_notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', notificationId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error marking notification as read:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in InAppChannel.markAsRead:', error);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('in_app_notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        console.error('Error marking all as read:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in InAppChannel.markAllAsRead:', error);
      return false;
    }
  }

  /**
   * Get unread count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from('in_app_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        console.error('Error getting unread count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error in InAppChannel.getUnreadCount:', error);
      return 0;
    }
  }

  /**
   * Get notifications for user (paginated)
   */
  async getNotifications(
    userId: string,
    { limit = 20, offset = 0, unreadOnly = false }
  ): Promise<any[]> {
    try {
      let query = this.supabase
        .from('in_app_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error getting notifications:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in InAppChannel.getNotifications:', error);
      return [];
    }
  }

  /**
   * Delete old notifications (older than 30 days)
   */
  async cleanupOldNotifications(userId: string): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      await this.supabase
        .from('in_app_notifications')
        .delete()
        .eq('user_id', userId)
        .eq('is_read', true)
        .lt('created_at', thirtyDaysAgo.toISOString());

      console.log('✅ Old notifications cleaned up');
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
    }
  }
}

export default InAppChannel;
