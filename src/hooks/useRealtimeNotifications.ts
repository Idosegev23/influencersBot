'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { ChatSession, SupportRequest } from '@/types';

export interface Notification {
  id: string;
  type: 'new_chat' | 'support_request' | 'system';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  data?: Record<string, unknown>;
}

interface UseRealtimeNotificationsOptions {
  influencerId: string;
  enabled?: boolean;
}

export function useRealtimeNotifications({
  influencerId,
  enabled = true,
}: UseRealtimeNotificationsOptions) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  // Load saved notifications from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`notifications_${influencerId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setNotifications(parsed.map((n: Notification) => ({
          ...n,
          timestamp: new Date(n.timestamp),
        })));
      } catch (e) {
        console.error('Error parsing saved notifications:', e);
      }
    }
  }, [influencerId]);

  // Update unread count
  useEffect(() => {
    setUnreadCount(notifications.filter(n => !n.read).length);
  }, [notifications]);

  // Save notifications to localStorage
  useEffect(() => {
    if (notifications.length > 0) {
      localStorage.setItem(`notifications_${influencerId}`, JSON.stringify(notifications));
    }
  }, [notifications, influencerId]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!enabled || !influencerId) return;

    // Subscribe to new chat sessions
    const chatChannel = supabase
      .channel(`chat_sessions_${influencerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_sessions',
          filter: `influencer_id=eq.${influencerId}`,
        },
        (payload) => {
          const session = payload.new as ChatSession;
          addNotification({
            type: 'new_chat',
            title: 'שיחה חדשה',
            message: 'מישהו התחיל שיחה חדשה עם הבוט שלך',
            data: { sessionId: session.id },
          });
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    // Subscribe to new support requests
    const supportChannel = supabase
      .channel(`support_requests_${influencerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_requests',
          filter: `influencer_id=eq.${influencerId}`,
        },
        (payload) => {
          const request = payload.new as SupportRequest;
          addNotification({
            type: 'support_request',
            title: 'בקשת תמיכה חדשה',
            message: `${request.customer_name} צריך עזרה עם ${request.brand}`,
            data: { requestId: request.id },
          });
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(supportChannel);
    };
  }, [influencerId, enabled]);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
      const newNotification: Notification = {
        ...notification,
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        read: false,
      };

      setNotifications((prev) => [newNotification, ...prev].slice(0, 50)); // Keep last 50

      // Request browser notification permission and show
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(notification.title, {
            body: notification.message,
            icon: '/favicon.ico',
          });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
              new Notification(notification.title, {
                body: notification.message,
                icon: '/favicon.ico',
              });
            }
          });
        }
      }
    },
    []
  );

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n
      )
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    localStorage.removeItem(`notifications_${influencerId}`);
  }, [influencerId]);

  return {
    notifications,
    unreadCount,
    isConnected,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
  };
}








