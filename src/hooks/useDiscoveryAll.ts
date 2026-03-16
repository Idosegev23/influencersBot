'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DiscoveryItem } from '@/lib/discovery/types';

export interface DiscoveryRow {
  category: {
    slug: string;
    title: string;
    subtitle: string;
    type: string;
    icon: string;
    color: string;
  };
  items: DiscoveryItem[];
}

interface UseDiscoveryAllOptions {
  username: string;
}

export function useDiscoveryAll({ username }: UseDiscoveryAllOptions) {
  const [rows, setRows] = useState<DiscoveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/discovery/all-lists?username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error('Failed to load discovery data');
      const data = await res.json();
      setRows(data.rows || []);
    } catch (err) {
      console.error('[useDiscoveryAll] Error:', err);
      setError('שגיאה בטעינת הנתונים');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    if (username) fetchAll();
  }, [username, fetchAll]);

  return { rows, loading, error, refetch: fetchAll };
}
