'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  FileText,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Loader2,
  ChefHat,
  Shirt,
  Lightbulb,
  Dumbbell,
  Star,
  Search,
} from 'lucide-react';
import { getInfluencerByUsername, getContentByInfluencer } from '@/lib/supabase';
import type { Influencer, ContentItem } from '@/types';

const contentTypeLabels: Record<string, { label: string; icon: typeof ChefHat; color: string }> = {
  recipe: { label: 'מתכון', icon: ChefHat, color: 'text-orange-400' },
  look: { label: 'לוק', icon: Shirt, color: 'text-pink-400' },
  tip: { label: 'טיפ', icon: Lightbulb, color: 'text-yellow-400' },
  workout: { label: 'אימון', icon: Dumbbell, color: 'text-green-400' },
  review: { label: 'ביקורת', icon: Star, color: 'text-purple-400' },
  tutorial: { label: 'מדריך', icon: FileText, color: 'text-blue-400' },
};

export default function ContentPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();

        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }

        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          router.push(`/influencer/${username}`);
          return;
        }

        setInfluencer(inf);
        const contentItems = await getContentByInfluencer(inf.id);
        setContent(contentItems);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username, router]);

  const handleSaveEdit = async () => {
    if (!editingItem || !influencer) return;

    setSaving(true);
    try {
      const res = await fetch('/api/influencer/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          id: editingItem.id,
          title: editingItem.title,
          description: editingItem.description,
          content: editingItem.content,
        }),
      });

      if (res.ok) {
        setContent(content.map(c => c.id === editingItem.id ? editingItem : c));
        setEditingItem(null);
      }
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('האם למחוק את התוכן?')) return;

    try {
      const res = await fetch(`/api/influencer/content?username=${username}&id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setContent(content.filter(c => c.id !== id));
      }
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  const filteredContent = content.filter(item => {
    const matchesSearch = !searchQuery || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = !filterType || item.type === filterType;
    return matchesSearch && matchesType;
  });

  const contentTypes = [...new Set(content.map(c => c.type))];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!influencer) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" dir="rtl">
      <div className="fixed inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#6366f1_1px,transparent_0)] bg-[length:50px_50px]" />
      </div>

      <header className="relative z-10 sticky top-0 bg-slate-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/influencer/${username}/dashboard`}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">חזרה</span>
              </Link>
              <div className="h-6 w-px bg-gray-700" />
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="w-6 h-6 text-blue-400" />
                תוכן
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">{content.length} פריטים</span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש תוכן..."
              className="w-full bg-gray-800/50 border border-gray-700 rounded-xl pr-10 pl-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterType(null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !filterType ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              הכל
            </button>
            {contentTypes.map((type) => {
              const typeInfo = contentTypeLabels[type] || { label: type, icon: FileText, color: 'text-gray-400' };
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type === filterType ? null : type)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    filterType === type ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <typeInfo.icon className={`w-4 h-4 ${filterType === type ? 'text-white' : typeInfo.color}`} />
                  {typeInfo.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Grid */}
        {filteredContent.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">אין תוכן עדיין</h3>
            <p className="text-gray-400 mb-6">התוכן נסרק אוטומטית מהפוסטים שלך באינסטגרם</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredContent.map((item) => {
                const typeInfo = contentTypeLabels[item.type] || { label: item.type, icon: FileText, color: 'text-gray-400' };
                const TypeIcon = typeInfo.icon;

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-colors"
                  >
                    {item.image_url && (
                      <div className="relative h-40 bg-gray-900">
                        <Image
                          src={item.image_url}
                          alt={item.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    )}

                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TypeIcon className={`w-4 h-4 ${typeInfo.color}`} />
                        <span className="text-xs text-gray-400">{typeInfo.label}</span>
                      </div>

                      <h3 className="font-semibold text-white mb-2 line-clamp-2">{item.title}</h3>
                      
                      {item.description && (
                        <p className="text-sm text-gray-400 mb-4 line-clamp-3">{item.description}</p>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingItem(item)}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                          עריכה
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
            onClick={() => setEditingItem(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">עריכת תוכן</h3>
                <button
                  onClick={() => setEditingItem(null)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">כותרת</label>
                  <input
                    type="text"
                    value={editingItem.title}
                    onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">תיאור</label>
                  <textarea
                    value={editingItem.description || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    rows={4}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                {editingItem.type === 'recipe' && editingItem.content && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">מרכיבים</label>
                    <textarea
                      value={(editingItem.content as { ingredients?: string[] })?.ingredients?.join('\n') || ''}
                      onChange={(e) => setEditingItem({
                        ...editingItem,
                        content: {
                          ...(editingItem.content as object),
                          ingredients: e.target.value.split('\n').filter(Boolean),
                        },
                      })}
                      rows={4}
                      placeholder="מרכיב אחד בכל שורה"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setEditingItem(null)}
                  className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  ביטול
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  שמירה
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


