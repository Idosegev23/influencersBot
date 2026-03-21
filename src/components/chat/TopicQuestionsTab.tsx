'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Search, ChevronLeft, FileText, Video, ImageIcon, Handshake } from 'lucide-react';

interface QuestionItem {
  title: string;
  question: string;
}

interface QuestionGroup {
  label: string;
  items: QuestionItem[];
}

interface TopicQuestionsTabProps {
  username: string;
  tabLabel: string;
  topic?: string;
  onAskAbout: (question: string) => void;
}

const GROUP_ICONS: Record<string, typeof FileText> = {
  'מאמרים': FileText,
  'סרטונים': Video,
  'פוסטים': ImageIcon,
  'שיתופי פעולה': Handshake,
};

export default function TopicQuestionsTab({
  username,
  tabLabel,
  topic,
  onAskAbout,
}: TopicQuestionsTabProps) {
  const [groups, setGroups] = useState<QuestionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ username });
      if (topic) params.set('topic', topic);

      const res = await fetch(`/api/content/topics?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setGroups(data.groups || []);

      // Auto-expand first group
      if (data.groups?.length > 0) {
        setExpandedGroups(new Set([data.groups[0].label]));
      }
    } catch {
      console.error('Failed to load topics');
    } finally {
      setLoading(false);
    }
  }, [username, topic]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  // Filter items across all groups
  const filteredGroups = searchQuery
    ? groups
        .map(g => ({
          ...g,
          items: g.items.filter(
            item =>
              item.title.includes(searchQuery) ||
              item.question.includes(searchQuery),
          ),
        }))
        .filter(g => g.items.length > 0)
    : groups;

  const totalItems = filteredGroups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <motion.div
      key="topic-questions"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-lg font-bold mb-1" style={{ color: '#0c1013' }} dir="rtl">
          {tabLabel}
        </h2>
        <p className="text-[13px] text-gray-400 mb-3" dir="rtl">
          לחצו על שאלה כדי לשאול אותי
        </p>

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

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6" dir="rtl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        ) : totalItems === 0 ? (
          <div className="text-center py-20 text-gray-400">
            {searchQuery ? 'לא נמצאו תוצאות' : 'אין תוכן להצגה'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGroups.map((group, gi) => {
              const isExpanded = expandedGroups.has(group.label) || !!searchQuery;
              const GroupIcon = GROUP_ICONS[group.label] || FileText;

              return (
                <div key={group.label} className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <GroupIcon className="w-4 h-4 text-purple-500" />
                      <span className="text-[14px] font-semibold text-gray-800">
                        {group.label}
                      </span>
                      <span className="text-[12px] text-gray-400 font-normal">
                        ({group.items.length})
                      </span>
                    </div>
                    <ChevronLeft
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                        isExpanded ? 'rotate-[-90deg]' : ''
                      }`}
                    />
                  </button>

                  {/* Group items */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-gray-50">
                          {group.items.map((item, i) => (
                            <motion.button
                              key={i}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: Math.min(i * 0.02, 0.2) }}
                              onClick={() => onAskAbout(item.question)}
                              className="w-full text-right px-4 py-3 hover:bg-purple-50 transition-colors border-b border-gray-50 last:border-b-0 group"
                            >
                              <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] text-gray-700 leading-relaxed group-hover:text-purple-700 transition-colors">
                                    {item.question}
                                  </p>
                                </div>
                                <ChevronLeft className="w-3.5 h-3.5 text-gray-300 group-hover:text-purple-500 mt-0.5 flex-shrink-0 transition-colors" />
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
