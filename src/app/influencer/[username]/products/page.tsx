'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Plus,
  Package,
  Trash2,
  Edit2,
  Save,
  X,
  Link as LinkIcon,
  Tag,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import {
  getInfluencerByUsername,
  getProductsByInfluencer,
  createProduct,
  updateProduct,
  deleteProduct,
} from '@/lib/supabase';
import type { Influencer, Product } from '@/types';

interface ProductFormData {
  name: string;
  brand: string;
  category: string;
  link: string;
  coupon_code: string;
  image_url: string;
}

const emptyForm: ProductFormData = {
  name: '',
  brand: '',
  category: '',
  link: '',
  coupon_code: '',
  image_url: '',
};

export default function InfluencerProductsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const router = useRouter();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // Check authentication
        const authRes = await fetch(`/api/influencer/auth?username=${username}`);
        const authData = await authRes.json();

        if (!authData.authenticated) {
          router.push(`/influencer/${username}`);
          return;
        }

        // Load influencer data
        const inf = await getInfluencerByUsername(username);
        if (!inf) {
          router.push(`/influencer/${username}`);
          return;
        }

        setInfluencer(inf);

        // Load products
        const prods = await getProductsByInfluencer(inf.id);
        setProducts(prods);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!influencer) return;

    setSaving(true);

    try {
      if (editingId) {
        // Update existing product
        await updateProduct(editingId, {
          name: formData.name,
          brand: formData.brand,
          category: formData.category,
          link: formData.link,
          coupon_code: formData.coupon_code || null,
          image_url: formData.image_url || null,
        });

        setProducts((prev) =>
          prev.map((p) =>
            p.id === editingId
              ? { ...p, ...formData, coupon_code: formData.coupon_code || null }
              : p
          )
        );
      } else {
        // Create new product
        const newProduct = await createProduct({
          influencer_id: influencer.id,
          name: formData.name,
          brand: formData.brand,
          category: formData.category,
          link: formData.link,
          short_link: null,
          coupon_code: formData.coupon_code || null,
          image_url: formData.image_url || null,
          source_post_id: null,
          is_manual: true,
        });

        if (newProduct) {
          setProducts((prev) => [newProduct, ...prev]);
        }
      }

      setFormData(emptyForm);
      setShowForm(false);
      setEditingId(null);
    } catch (error) {
      console.error('Error saving product:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (product: Product) => {
    setFormData({
      name: product.name,
      brand: product.brand,
      category: product.category,
      link: product.link,
      coupon_code: product.coupon_code || '',
      image_url: product.image_url || '',
    });
    setEditingId(product.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  const handleCancel = () => {
    setFormData(emptyForm);
    setShowForm(false);
    setEditingId(null);
  };

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
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#6366f1_1px,transparent_0)] bg-[length:50px_50px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-slate-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <Link
              href={`/influencer/${username}/dashboard`}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
              חזרה לדשבורד
            </Link>
            <h1 className="font-semibold text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-400" />
              ניהול מוצרים
            </h1>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Add Button */}
        {!showForm && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowForm(true)}
            className="w-full mb-6 py-4 border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-2xl text-gray-400 hover:text-indigo-400 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            הוספת מוצר חדש
          </motion.button>
        )}

        {/* Form */}
        <AnimatePresence>
          {showForm && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleSubmit}
              className="mb-6 bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-6 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">
                  {editingId ? 'עריכת מוצר' : 'מוצר חדש'}
                </h2>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">שם המוצר *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    placeholder="למשל: סיר לחץ חשמלי"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">מותג *</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    placeholder="למשל: InstaPot"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">קטגוריה *</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    required
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    placeholder="למשל: מטבח, אופנה, טכנולוגיה"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">קוד קופון</label>
                  <div className="relative">
                    <Tag className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      type="text"
                      value={formData.coupon_code}
                      onChange={(e) => setFormData({ ...formData, coupon_code: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-3 pr-10 bg-gray-700/50 border border-gray-600 rounded-xl text-white font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                      placeholder="SAVE20"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-2">קישור לרכישה *</label>
                  <div className="relative">
                    <LinkIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      type="url"
                      value={formData.link}
                      onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                      required
                      className="w-full px-4 py-3 pr-10 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                      placeholder="https://..."
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-400 mb-2">קישור לתמונה</label>
                  <input
                    type="url"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    placeholder="https://..."
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      {editingId ? 'עדכון' : 'שמירה'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-colors"
                >
                  ביטול
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Products List */}
        {products.length > 0 ? (
          <div className="space-y-4">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-4 hover:border-gray-600 transition-all"
              >
                <div className="flex items-start gap-4">
                  {/* Image */}
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <Package className="w-8 h-8 text-gray-500" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-white">{product.name}</h3>
                        <p className="text-sm text-gray-400">{product.brand}</p>
                      </div>
                      {product.coupon_code && (
                        <span className="px-3 py-1 text-sm bg-green-500/20 text-green-400 rounded-lg font-mono flex-shrink-0">
                          {product.coupon_code}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <span className="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded">
                        {product.category}
                      </span>
                      <span className="text-xs text-gray-500">
                        {product.click_count} קליקים
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
                  <a
                    href={product.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <ExternalLink className="w-4 h-4" />
                    לינק לרכישה
                  </a>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(product)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {deleteConfirm === product.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-400"
                        >
                          אישור
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-3 py-1 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                        >
                          ביטול
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(product.id)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">אין עדיין מוצרים</h3>
            <p className="text-gray-400 mb-6">התחילו על ידי הוספת המוצר הראשון שלכם</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all"
            >
              <Plus className="w-5 h-5" />
              הוסף מוצר
            </button>
          </motion.div>
        )}
      </main>
    </div>
  );
}




