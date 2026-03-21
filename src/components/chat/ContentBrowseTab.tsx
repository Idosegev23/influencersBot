'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Search, ChevronLeft } from 'lucide-react';
import Image from 'next/image';
import { getProxiedImageUrl } from '@/lib/image-utils';

interface ContentItem {
  id: string;
  title: string;
  excerpt: string;
  thumbnail_url: string | null;
  topic: string;
  entity_type: string;
  updated_at: string;
}

interface ContentBrowseTabProps {
  username: string;
  tabLabel: string;
  topics?: string[];
  entityTypes?: string[];
  onAskAbout: (question: string) => void;
}

export default function ContentBrowseTab({
  username,
  tabLabel,
  topics,
  entityTypes,
  onAskAbout,
}: ContentBrowseTabProps) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchItems = useCallback(async (pageNum: number, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ username, page: String(pageNum), limit: '20' });
      if (topics?.length) params.set('topics', topics.join(','));
      if (entityTypes?.length) params.set('entityTypes', entityTypes.join(','));

      const res = await fetch(`/api/content/browse?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      if (append) {
        setItems(prev => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setHasMore(data.items.length === 20);
    } catch {
      console.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  }, [username, topics, entityTypes]);

  useEffect(() => {
    fetchItems(1);
  }, [fetchItems]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchItems(nextPage, true);
  };

  const filteredItems = searchQuery
    ? items.filter(item =>
        item.title.includes(searchQuery) || item.excerpt.includes(searchQuery)
      )
    : items;

  const handleCardClick = (item: ContentItem) => {
    const question = `ספר/י לי על: ${item.title}`;
    onAskAbout(question);
  };

  return (
    <motion.div
      key="content-browse"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-xl font-bold mb-3" style={{ color: '#0c1013' }}>
          {tabLabel}
        </h2>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`חיפוש ב${tabLabel}...`}
            className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
            dir="rtl"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            {searchQuery ? 'לא נמצאו תוצאות' : 'אין תוכן להצגה'}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredItems.map((item, i) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.25 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleCardClick(item)}
                  className="group text-right rounded-xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Thumbnail */}
                  <div className="aspect-[4/3] bg-gradient-to-br from-purple-50 to-pink-50 relative overflow-hidden">
                    {item.thumbnail_url ? (
                      <Image
                        src={getProxiedImageUrl(item.thumbnail_url)}
                        alt={item.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 768px) 50vw, 25vw"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-3xl opacity-30">
                          {getPlaceholderEmoji(item.topic)}
                        </span>
                      </div>
                    )}

                    {/* Entity type badge */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/40 text-white backdrop-blur-sm">
                      {getEntityLabel(item.entity_type)}
                    </div>
                  </div>

                  {/* Text */}
                  <div className="p-2.5">
                    <h3 className="text-[13px] font-semibold text-gray-900 line-clamp-2 leading-tight mb-1">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
                      {item.excerpt}
                    </p>
                  </div>

                  {/* Action hint */}
                  <div className="px-2.5 pb-2 flex items-center gap-1 text-purple-500">
                    <ChevronLeft className="w-3 h-3" />
                    <span className="text-[10px] font-medium">שאל על זה</span>
                  </div>
                </motion.button>
              ))}
            </div>

            {/* Load more */}
            {hasMore && !searchQuery && (
              <div className="flex justify-center pt-4 pb-2">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-6 py-2.5 rounded-full bg-purple-50 text-purple-600 text-sm font-medium hover:bg-purple-100 transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'טען עוד'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function getPlaceholderEmoji(topic: string): string {
  const map: Record<string, string> = {
    food: '\uD83C\uDF73', beauty: '\u2728', fashion: '\uD83D\uDC57',
    tech: '\uD83D\uDCF1', lifestyle: '\uD83C\uDF3F', health: '\u2764\uFE0F',
    home: '\uD83C\uDFE0', business: '\uD83D\uDCBC',
  };
  return map[topic] || '\uD83D\uDCCB';
}

function getEntityLabel(entityType: string): string {
  const map: Record<string, string> = {
    transcription: 'וידאו',
    post: 'פוסט',
    website: 'אתר',
    coupon: 'קופון',
    partnership: 'שיתוף פעולה',
  };
  return map[entityType] || entityType;
}
