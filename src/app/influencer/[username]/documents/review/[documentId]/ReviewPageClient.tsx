'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineEdit, DateInlineEdit, CurrencyInlineEdit } from '@/components/documents/InlineEdit';
import {
  ConfidenceIndicator,
  ConfidenceBar,
} from '@/components/documents/ConfidenceIndicator';
import { ManualPartnershipForm } from '@/components/documents/ManualPartnershipForm';

interface ParsedData {
  brand_name?: string;
  campaign_name?: string;
  start_date?: string;
  end_date?: string;
  total_amount?: number;
  currency?: string;
  deliverables?: any[];
  milestones?: any[];
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  notes?: string;
  [key: string]: any;
}

interface Document {
  id: string;
  account_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  document_type: string;
  status: string;
  parsed_data: ParsedData | null;
  confidence_score?: number;
  created_at: string;
}

interface ParsingLog {
  id: string;
  document_id: string;
  model_used: string;
  confidence_score: number;
  field_confidence: Record<string, number> | null;
  warnings: string[] | null;
  errors: string[] | null;
  created_at: string;
}

export function ReviewPageClient({
  document,
  parsingLog,
  accountId,
  username,
}: {
  document: Document;
  parsingLog: ParsingLog | null;
  accountId: string;
  username: string;
}) {
  const router = useRouter();
  const [parsedData, setParsedData] = useState<ParsedData>(
    document.parsed_data || {}
  );
  const [showManualForm, setShowManualForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const fieldConfidence = parsingLog?.field_confidence || {};
  const overallConfidence = parsingLog?.confidence_score || document.confidence_score || 0;

  const handleFieldUpdate = async (field: string, value: any) => {
    try {
      // Update in local state
      setParsedData((prev) => ({ ...prev, [field]: value }));

      // Update in database
      const response = await fetch(
        `/api/influencer/documents/${document.id}/update-parsed`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field, value }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update');
      }
    } catch (error) {
      console.error('Error updating field:', error);
      throw error;
    }
  };

  const handleCreatePartnership = async () => {
    setIsCreating(true);

    try {
      const response = await fetch(
        `/api/influencer/partnerships/create-from-parsed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id: accountId,
            document_id: document.id,
            parsed_data: parsedData,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create partnership');
      }

      const { partnership_id } = await response.json();

      // Redirect to partnership page
      router.push(`/influencer/${username}/partnerships/${partnership_id}`);
    } catch (error) {
      console.error('Error creating partnership:', error);
      alert('שגיאה ביצירת השת"פ. אנא נסה שוב.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleManualSubmit = async (data: any) => {
    const response = await fetch(
      `/api/influencer/partnerships/create-from-parsed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          document_id: document.id,
          parsed_data: data,
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to create partnership');
    }

    const { partnership_id } = await response.json();
    router.push(`/influencer/${username}/partnerships/${partnership_id}`);
  };

  if (showManualForm) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="mb-6">
          <button
            onClick={() => setShowManualForm(false)}
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            ← חזור למצב עריכה
          </button>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-right">
          מילוי ידני - שת"פ חדש
        </h1>
        <p className="text-gray-600 mb-8 text-right">
          מלא את כל הפרטים באופן ידני
        </p>

        <ManualPartnershipForm
          accountId={accountId}
          onSubmit={handleManualSubmit}
          onCancel={() => setShowManualForm(false)}
          initialData={parsedData}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="text-right">
            <h1 className="text-2xl font-bold text-gray-900">
              סקירת מסמך ואישור
            </h1>
            <p className="text-gray-600">בדוק ותקן את הנתונים שזוהו אוטומטית</p>
          </div>
          <ConfidenceIndicator
            confidence={overallConfidence}
            size="lg"
          />
        </div>

        {/* Document Info */}
        <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
          <div className="text-right">
            <div className="text-sm text-gray-600">קובץ</div>
            <div className="font-medium">{document.file_name}</div>
          </div>
          <div className="text-sm text-gray-500">
            {new Date(document.created_at).toLocaleDateString('he-IL')}
          </div>
        </div>

        {/* Warnings */}
        {parsingLog?.warnings && parsingLog.warnings.length > 0 && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <span className="text-yellow-600">⚠</span>
              <div className="flex-1 text-right">
                <div className="font-medium text-yellow-800 mb-2">
                  שים לב לשדות הבאים:
                </div>
                <ul className="text-sm text-yellow-700 space-y-1">
                  {parsingLog.warnings.map((warning, i) => (
                    <li key={i}>• {warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Preview */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 p-4 sticky top-4">
            <h3 className="font-semibold text-gray-900 mb-4 text-right">
              תצוגה מקדימה
            </h3>
            <div className="text-sm text-gray-600 space-y-2 text-right">
              <div>
                <span className="font-medium">מותג:</span>{' '}
                {parsedData.brand_name || '—'}
              </div>
              <div>
                <span className="font-medium">קמפיין:</span>{' '}
                {parsedData.campaign_name || '—'}
              </div>
              <div>
                <span className="font-medium">תאריכים:</span>{' '}
                {parsedData.start_date && parsedData.end_date
                  ? `${parsedData.start_date} - ${parsedData.end_date}`
                  : '—'}
              </div>
              <div>
                <span className="font-medium">סכום:</span>{' '}
                {parsedData.total_amount
                  ? `${parsedData.total_amount.toLocaleString('he-IL')} ${
                      parsedData.currency || '₪'
                    }`
                  : '—'}
              </div>
            </div>

            {/* Overall Confidence */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <ConfidenceBar confidence={overallConfidence} />
            </div>
          </div>
        </div>

        {/* Right Column - Editable Fields */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-right">
              פרטים בסיסיים
            </h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <InlineEdit
                    label="שם המותג"
                    value={parsedData.brand_name || ''}
                    onSave={(value) => handleFieldUpdate('brand_name', value)}
                    placeholder="שם המותג"
                    required
                  />
                </div>
                <ConfidenceIndicator
                  confidence={fieldConfidence.brand_name || 0}
                  size="sm"
                  showLabel={false}
                />
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <InlineEdit
                    label="שם הקמפיין"
                    value={parsedData.campaign_name || ''}
                    onSave={(value) => handleFieldUpdate('campaign_name', value)}
                    placeholder="שם הקמפיין"
                  />
                </div>
                <ConfidenceIndicator
                  confidence={fieldConfidence.campaign_name || 0}
                  size="sm"
                  showLabel={false}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <DateInlineEdit
                      label="תאריך התחלה"
                      value={parsedData.start_date || ''}
                      onSave={(value) => handleFieldUpdate('start_date', value)}
                    />
                  </div>
                  <ConfidenceIndicator
                    confidence={fieldConfidence.start_date || 0}
                    size="sm"
                    showLabel={false}
                  />
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <DateInlineEdit
                      label="תאריך סיום"
                      value={parsedData.end_date || ''}
                      onSave={(value) => handleFieldUpdate('end_date', value)}
                      minDate={parsedData.start_date}
                    />
                  </div>
                  <ConfidenceIndicator
                    confidence={fieldConfidence.end_date || 0}
                    size="sm"
                    showLabel={false}
                  />
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <CurrencyInlineEdit
                    label="סכום כולל"
                    value={parsedData.total_amount?.toString() || ''}
                    onSave={(value) =>
                      handleFieldUpdate('total_amount', parseFloat(value))
                    }
                    currency={parsedData.currency || '₪'}
                  />
                </div>
                <ConfidenceIndicator
                  confidence={fieldConfidence.total_amount || 0}
                  size="sm"
                  showLabel={false}
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-right">
              פרטי קשר
            </h3>

            <div className="space-y-4">
              <InlineEdit
                label="איש קשר"
                value={parsedData.contact_person || ''}
                onSave={(value) => handleFieldUpdate('contact_person', value)}
                placeholder="שם מלא"
              />

              <InlineEdit
                label="אימייל"
                type="email"
                value={parsedData.contact_email || ''}
                onSave={(value) => handleFieldUpdate('contact_email', value)}
                placeholder="email@example.com"
              />

              <InlineEdit
                label="טלפון"
                value={parsedData.contact_phone || ''}
                onSave={(value) => handleFieldUpdate('contact_phone', value)}
                placeholder="050-1234567"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-right">
              הערות
            </h3>
            <InlineEdit
              value={parsedData.notes || ''}
              onSave={(value) => handleFieldUpdate('notes', value)}
              type="textarea"
              placeholder="הערות נוספות..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowManualForm(true)}
              className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              מילוי ידני מלא
            </button>
            <button
              onClick={handleCreatePartnership}
              disabled={isCreating || !parsedData.brand_name}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? 'יוצר...' : 'צור שת"פ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
