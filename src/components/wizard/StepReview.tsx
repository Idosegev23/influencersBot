'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { 
  User, 
  Tag, 
  Package, 
  FileText, 
  Plus, 
  Trash2, 
  Edit2, 
  Check,
  X,
  ArrowLeft,
} from 'lucide-react';
import type { 
  ApifyProfileData, 
  InfluencerType, 
  InfluencerPersona,
  Product,
  ContentItem,
} from '@/types';
import { formatNumber } from '@/lib/utils';

interface StepReviewProps {
  profile: ApifyProfileData;
  influencerType: InfluencerType;
  persona: InfluencerPersona;
  products: Partial<Product>[];
  contentItems: Partial<ContentItem>[];
  onUpdateProducts: (products: Partial<Product>[]) => void;
  onUpdateContent: (content: Partial<ContentItem>[]) => void;
  onContinue: () => void;
  onBack: () => void;
}

const typeLabels: Record<InfluencerType, string> = {
  food: 'אוכל ומתכונים',
  fashion: 'אופנה',
  tech: 'טכנולוגיה',
  lifestyle: 'לייפסטייל',
  fitness: 'כושר',
  beauty: 'יופי וטיפוח',
  other: 'אחר',
};

export function StepReview({
  profile,
  influencerType,
  persona,
  products,
  contentItems,
  onUpdateProducts,
  onUpdateContent,
  onContinue,
  onBack,
}: StepReviewProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'products' | 'content'>('profile');
  const [editingProduct, setEditingProduct] = useState<number | null>(null);
  const [newProduct, setNewProduct] = useState<Partial<Product> | null>(null);

  const handleDeleteProduct = (index: number) => {
    const updated = [...products];
    updated.splice(index, 1);
    onUpdateProducts(updated);
  };

  const handleUpdateProduct = (index: number, updates: Partial<Product>) => {
    const updated = [...products];
    updated[index] = { ...updated[index], ...updates };
    onUpdateProducts(updated);
    setEditingProduct(null);
  };

  const handleAddProduct = () => {
    if (newProduct?.name) {
      onUpdateProducts([...products, { ...newProduct, is_manual: true }]);
      setNewProduct(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto"
    >
      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl">
        {[
          { id: 'profile' as const, label: 'פרופיל', icon: User },
          { id: 'products' as const, label: `מוצרים (${products.length})`, icon: Package },
          { id: 'content' as const, label: `תוכן (${contentItems.length})`, icon: FileText },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="card p-6">
            <div className="flex items-start gap-4">
              {profile.profilePicUrl && (
                <img
                  src={profile.profilePicUrl}
                  alt={profile.fullName}
                  className="w-20 h-20 rounded-2xl object-cover"
                />
              )}
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900">{profile.fullName}</h3>
                <p className="text-gray-500">@{profile.username}</p>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="text-gray-600">
                    <strong className="text-gray-900">{formatNumber(profile.followersCount)}</strong> עוקבים
                  </span>
                  <span className="text-gray-600">
                    <strong className="text-gray-900">{formatNumber(profile.postsCount)}</strong> פוסטים
                  </span>
                </div>
              </div>
              <span className="badge badge-primary">{typeLabels[influencerType]}</span>
            </div>
            {profile.biography && (
              <p className="mt-4 text-gray-700 whitespace-pre-line">{profile.biography}</p>
            )}
          </div>

          {/* Persona Card */}
          <div className="card p-6">
            <h4 className="font-semibold text-gray-900 mb-4">פרסונה שזוהתה</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-gray-500">טון</span>
                <p className="font-medium text-gray-900">{persona.tone}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">סגנון</span>
                <p className="font-medium text-gray-900">{persona.style}</p>
              </div>
              <div className="col-span-2">
                <span className="text-sm text-gray-500">תחומי עניין</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {persona.interests.map((interest, i) => (
                    <span key={i} className="px-2 py-1 bg-gray-100 rounded-lg text-sm text-gray-700">
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Products Tab */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Add Product Button */}
          <button
            onClick={() => setNewProduct({ name: '', brand: '', coupon_code: '', link: '' })}
            className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-all"
          >
            <Plus className="w-5 h-5" />
            הוסף מוצר ידנית
          </button>

          {/* New Product Form */}
          {newProduct && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="card p-4 space-y-3"
            >
              <input
                type="text"
                placeholder="שם המוצר"
                value={newProduct.name || ''}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                className="input"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="מותג"
                  value={newProduct.brand || ''}
                  onChange={(e) => setNewProduct({ ...newProduct, brand: e.target.value })}
                  className="input"
                />
                <input
                  type="text"
                  placeholder="קוד קופון"
                  value={newProduct.coupon_code || ''}
                  onChange={(e) => setNewProduct({ ...newProduct, coupon_code: e.target.value })}
                  className="input"
                  dir="ltr"
                />
              </div>
              <input
                type="text"
                placeholder="לינק"
                value={newProduct.link || ''}
                onChange={(e) => setNewProduct({ ...newProduct, link: e.target.value })}
                className="input"
                dir="ltr"
              />
              <div className="flex gap-2">
                <button onClick={handleAddProduct} className="btn-primary flex-1">
                  <Check className="w-4 h-4 ml-2" />
                  הוסף
                </button>
                <button onClick={() => setNewProduct(null)} className="btn-secondary">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Products List */}
          {products.map((product, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="card p-4"
            >
              {editingProduct === index ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={product.name || ''}
                    onChange={(e) => handleUpdateProduct(index, { name: e.target.value })}
                    className="input"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={product.brand || ''}
                      onChange={(e) => handleUpdateProduct(index, { brand: e.target.value })}
                      className="input"
                      placeholder="מותג"
                    />
                    <input
                      type="text"
                      value={product.coupon_code || ''}
                      onChange={(e) => handleUpdateProduct(index, { coupon_code: e.target.value })}
                      className="input"
                      placeholder="קופון"
                      dir="ltr"
                    />
                  </div>
                  <button
                    onClick={() => setEditingProduct(null)}
                    className="btn-primary w-full"
                  >
                    <Check className="w-4 h-4 ml-2" />
                    שמור
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Package className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <div className="flex items-center gap-2 text-sm">
                        {product.brand && <span className="text-gray-500">{product.brand}</span>}
                        {product.coupon_code && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-mono">
                            {product.coupon_code}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingProduct(index)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(index)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}

          {products.length === 0 && !newProduct && (
            <div className="text-center py-8 text-gray-500">
              לא נמצאו מוצרים. הוסיפו מוצרים ידנית.
            </div>
          )}
        </div>
      )}

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          {contentItems.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="card p-4"
            >
              <div className="flex items-start gap-3">
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-primary text-xs">{item.type}</span>
                    <h4 className="font-medium text-gray-900">{item.title}</h4>
                  </div>
                  {item.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.description}</p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {contentItems.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              לא נמצא תוכן מיוחד (מתכונים, לוקים וכו')
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4 mt-8">
        <button onClick={onBack} className="btn-secondary flex-1">
          חזור
        </button>
        <button onClick={onContinue} className="btn-primary flex-1 flex items-center justify-center gap-2">
          המשך לעיצוב
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
}



