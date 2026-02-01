'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase-client';

export default function NewPartnershipPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [formData, setFormData] = useState({
    brand_name: '',
    campaign_name: '',
    status: 'lead',
    start_date: '',
    end_date: '',
    contract_amount: '',
    deliverables: '',
    notes: '',
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUploadedFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Create partnership first
      const response = await fetch(`/api/influencer/partnerships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          ...formData,
          contract_amount: formData.contract_amount ? parseFloat(formData.contract_amount) : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Partnership creation failed:', errorData);
        throw new Error(errorData.details || errorData.error || 'Failed to create partnership');
      }

      const result = await response.json();
      const partnershipId = result.partnership.id;

      // Upload documents if any - DIRECT to Supabase Storage (bypasses Vercel 4.5MB limit)
      if (uploadedFiles.length > 0) {
        const accountId = result.partnership.account_id;
        
        for (const file of uploadedFiles) {
          try {
            // Check file size (max 10MB)
            const MAX_SIZE = 10 * 1024 * 1024;
            if (file.size > MAX_SIZE) {
              console.warn(`${file.name} גדול מדי (${(file.size / 1024 / 1024).toFixed(2)}MB). מקסימום 10MB.`);
              continue;
            }

            // 1. Upload directly to Supabase Storage (client-side, no API route)
            const timestamp = Date.now();
            const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const storagePath = `${accountId}/partnerships/${partnershipId}/${timestamp}_${cleanFilename}`;

            const { data: uploadData, error: uploadError } = await supabaseClient.storage
              .from('partnership-documents')
              .upload(storagePath, file, {
                contentType: file.type,
                upsert: false,
              });

            if (uploadError) {
              console.error(`Failed to upload ${file.name}:`, uploadError);
              continue;
            }

            // 2. Get public URL
            const { data: urlData } = supabaseClient.storage
              .from('partnership-documents')
              .getPublicUrl(storagePath);

            // 3. Save metadata to DB via lightweight API (only JSON, no file payload)
            await fetch('/api/influencer/documents/metadata', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username,
                accountId,
                partnershipId,
                filename: file.name,
                fileSize: file.size,
                mimeType: file.type,
                storagePath,
                publicUrl: urlData.publicUrl,
                documentType: 'contract',
              }),
            });

            console.log(`✓ Uploaded ${file.name}`);
          } catch (err) {
            console.error(`Error uploading ${file.name}:`, err);
          }
        }
      }

      router.push(`/influencer/${username}/partnerships/${partnershipId}`);
    } catch (err) {
      console.error('Error creating partnership:', err);
      setError('שגיאה ביצירת השת"פ. נסה שוב.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>חזור</span>
        </button>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">שת"פ חדש</h1>
        <p className="text-gray-600 mt-2">הוסף שת"פ חדש עם מותג</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {/* Brand Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
            שם המותג <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.brand_name}
            onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="לדוגמה: Nike, Adidas"
          />
        </div>

        {/* Campaign Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
            שם הקמפיין
          </label>
          <input
            type="text"
            value={formData.campaign_name}
            onChange={(e) => setFormData({ ...formData, campaign_name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="לדוגמה: Summer Collection 2024"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
            סטטוס
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="lead">Lead</option>
            <option value="negotiation">משא ומתן</option>
            <option value="active">פעיל</option>
            <option value="in_progress">בעבודה</option>
            <option value="completed">הושלם</option>
            <option value="cancelled">בוטל</option>
          </select>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
              תאריך התחלה
            </label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
              תאריך סיום
            </label>
            <input
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Contract Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
            סכום החוזה (₪)
          </label>
          <input
            type="number"
            step="0.01"
            value={formData.contract_amount}
            onChange={(e) => setFormData({ ...formData, contract_amount: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0.00"
          />
        </div>

        {/* Deliverables */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
            דליברבלס
          </label>
          <textarea
            value={formData.deliverables}
            onChange={(e) => setFormData({ ...formData, deliverables: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="לדוגמה: 3 פוסטים באינסטגרם, 2 סטוריז, 1 ריל"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
            הערות
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="הערות נוספות..."
          />
        </div>

        {/* Document Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-right">
            העלה מסמכים (חוזה, ברייף, וכו')
          </label>
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {uploadedFiles.length > 0 && (
            <div className="mt-2 text-sm text-gray-600">
              {uploadedFiles.length} קובץ/ים נבחרו: {uploadedFiles.map(f => f.name).join(', ')}
            </div>
          )}
          <p className="mt-1 text-xs text-gray-500 text-right">
            גודל מקסימלי: 10MB לכל קובץ
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'שומר...' : 'צור שת"פ'}
          </button>
        </div>
      </form>
    </div>
  );
}
