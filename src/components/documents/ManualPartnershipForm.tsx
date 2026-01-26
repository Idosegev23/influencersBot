'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface ManualPartnershipFormData {
  brand_name: string;
  campaign_name?: string;
  start_date?: string;
  end_date?: string;
  total_amount?: number;
  currency?: string;
  deliverables?: Array<{
    description: string;
    quantity: number;
    platform: string;
  }>;
  milestones?: Array<{
    name: string;
    amount: number;
    due_date?: string;
  }>;
  notes?: string;
}

export interface ManualPartnershipFormProps {
  accountId: string;
  onSubmit: (data: ManualPartnershipFormData) => Promise<void>;
  onCancel?: () => void;
  initialData?: Partial<ManualPartnershipFormData>;
}

export function ManualPartnershipForm({
  accountId,
  onSubmit,
  onCancel,
  initialData,
}: ManualPartnershipFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<ManualPartnershipFormData>({
    brand_name: initialData?.brand_name || '',
    campaign_name: initialData?.campaign_name || '',
    start_date: initialData?.start_date || '',
    end_date: initialData?.end_date || '',
    total_amount: initialData?.total_amount || undefined,
    currency: initialData?.currency || 'ILS',
    deliverables: initialData?.deliverables || [
      { description: '', quantity: 1, platform: 'instagram' },
    ],
    milestones: initialData?.milestones || [
      { name: '', amount: 0, due_date: '' },
    ],
    notes: initialData?.notes || '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (
    field: keyof ManualPartnershipFormData,
    value: any
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const addDeliverable = () => {
    setFormData((prev) => ({
      ...prev,
      deliverables: [
        ...(prev.deliverables || []),
        { description: '', quantity: 1, platform: 'instagram' },
      ],
    }));
  };

  const removeDeliverable = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      deliverables: prev.deliverables?.filter((_, i) => i !== index),
    }));
  };

  const updateDeliverable = (
    index: number,
    field: string,
    value: any
  ) => {
    setFormData((prev) => ({
      ...prev,
      deliverables: prev.deliverables?.map((d, i) =>
        i === index ? { ...d, [field]: value } : d
      ),
    }));
  };

  const addMilestone = () => {
    setFormData((prev) => ({
      ...prev,
      milestones: [
        ...(prev.milestones || []),
        { name: '', amount: 0, due_date: '' },
      ],
    }));
  };

  const removeMilestone = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      milestones: prev.milestones?.filter((_, i) => i !== index),
    }));
  };

  const updateMilestone = (index: number, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      milestones: prev.milestones?.map((m, i) =>
        i === index ? { ...m, [field]: value } : m
      ),
    }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.brand_name?.trim()) {
      newErrors.brand_name = 'שם המותג הוא שדה חובה';
    }

    if (formData.start_date && formData.end_date) {
      if (new Date(formData.start_date) > new Date(formData.end_date)) {
        newErrors.end_date = 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(formData);
      router.push(`/influencer/${accountId}/partnerships`);
    } catch (error) {
      setErrors({ submit: 'שגיאה בשמירת השת"פ. אנא נסה שוב.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Basic Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">פרטים בסיסיים</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            שם המותג <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.brand_name}
            onChange={(e) => handleChange('brand_name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-right"
            placeholder="לדוגמה: Nike, Coca-Cola"
          />
          {errors.brand_name && (
            <p className="text-sm text-red-600 mt-1">{errors.brand_name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            שם הקמפיין
          </label>
          <input
            type="text"
            value={formData.campaign_name}
            onChange={(e) => handleChange('campaign_name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-right"
            placeholder="לדוגמה: קמפיין קיץ 2026"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              תאריך התחלה
            </label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => handleChange('start_date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              תאריך סיום
            </label>
            <input
              type="date"
              value={formData.end_date}
              onChange={(e) => handleChange('end_date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            {errors.end_date && (
              <p className="text-sm text-red-600 mt-1">{errors.end_date}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              סכום כולל
            </label>
            <input
              type="number"
              value={formData.total_amount || ''}
              onChange={(e) =>
                handleChange('total_amount', parseFloat(e.target.value))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-right"
              placeholder="0"
              min="0"
              step="0.01"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              מטבע
            </label>
            <select
              value={formData.currency}
              onChange={(e) => handleChange('currency', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-right"
            >
              <option value="ILS">₪ שקל</option>
              <option value="USD">$ דולר</option>
              <option value="EUR">€ יורו</option>
            </select>
          </div>
        </div>
      </div>

      {/* Deliverables */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">תוצרים</h3>
          <button
            type="button"
            onClick={addDeliverable}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + הוסף תוצר
          </button>
        </div>

        {formData.deliverables?.map((deliverable, index) => (
          <div
            key={index}
            className="p-4 border border-gray-200 rounded-lg space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">
                תוצר #{index + 1}
              </span>
              {formData.deliverables!.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDeliverable(index)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  הסר
                </button>
              )}
            </div>

            <input
              type="text"
              value={deliverable.description}
              onChange={(e) =>
                updateDeliverable(index, 'description', e.target.value)
              }
              placeholder="תיאור התוצר"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right"
            />

            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                value={deliverable.quantity}
                onChange={(e) =>
                  updateDeliverable(index, 'quantity', parseInt(e.target.value))
                }
                placeholder="כמות"
                min="1"
                className="px-3 py-2 border border-gray-300 rounded-lg text-right"
              />

              <select
                value={deliverable.platform}
                onChange={(e) =>
                  updateDeliverable(index, 'platform', e.target.value)
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-right"
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="tiktok">TikTok</option>
                <option value="youtube">YouTube</option>
                <option value="twitter">Twitter</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Milestones */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            אבני דרך (תשלומים)
          </h3>
          <button
            type="button"
            onClick={addMilestone}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + הוסף אבן דרך
          </button>
        </div>

        {formData.milestones?.map((milestone, index) => (
          <div
            key={index}
            className="p-4 border border-gray-200 rounded-lg space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">
                אבן דרך #{index + 1}
              </span>
              {formData.milestones!.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMilestone(index)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  הסר
                </button>
              )}
            </div>

            <input
              type="text"
              value={milestone.name}
              onChange={(e) =>
                updateMilestone(index, 'name', e.target.value)
              }
              placeholder="שם אבן הדרך"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right"
            />

            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                value={milestone.amount}
                onChange={(e) =>
                  updateMilestone(index, 'amount', parseFloat(e.target.value))
                }
                placeholder="סכום"
                min="0"
                step="0.01"
                className="px-3 py-2 border border-gray-300 rounded-lg text-right"
              />

              <input
                type="date"
                value={milestone.due_date}
                onChange={(e) =>
                  updateMilestone(index, 'due_date', e.target.value)
                }
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          הערות נוספות
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-right"
          placeholder="הערות, תנאים מיוחדים, וכו׳"
        />
      </div>

      {/* Submit Buttons */}
      <div className="flex gap-3 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            ביטול
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'שומר...' : 'צור שת"פ'}
        </button>
      </div>

      {errors.submit && (
        <div className="text-center text-red-600">{errors.submit}</div>
      )}
    </form>
  );
}
