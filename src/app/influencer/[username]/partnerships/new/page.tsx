'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase-client';
import { Upload, FileText, Loader2 } from 'lucide-react';

type CreationMode = 'select' | 'upload' | 'review' | 'manual';

export default function NewPartnershipPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  // Creation mode state
  const [creationMode, setCreationMode] = useState<CreationMode>('select');
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);
  const [parsedRawData, setParsedRawData] = useState<any>(null);

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

  // Handle document upload + AI parsing (NEW FLOW)
  const handleDocumentUploadAndParse = async (file: File) => {
    setIsUploading(true);
    setError(null);

    try {
      // Get account ID first
      const accountResponse = await fetch(`/api/influencer/${username}`);
      if (!accountResponse.ok) throw new Error('Failed to get account');
      const { influencer } = await accountResponse.json();
      const accountId = influencer.id;

      // Check file size (max 10MB)
      const MAX_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        throw new Error(`הקובץ גדול מדי (${(file.size / 1024 / 1024).toFixed(2)}MB). מקסימום 10MB.`);
      }

      // 1. Upload to Supabase Storage
      const timestamp = Date.now();
      const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${accountId}/temp/${timestamp}_${cleanFilename}`;

      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('partnership-documents')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 2. Save metadata to DB (storage_path is enough to access file)
      const metadataResponse = await fetch('/api/influencer/documents/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          accountId,
          partnershipId: null, // No partnership yet
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          storagePath,
          documentType: 'contract',
        }),
      });

      if (!metadataResponse.ok) throw new Error('Failed to save document metadata');
      
      const { document } = await metadataResponse.json();
      setUploadedDocumentId(document.id);
      setIsUploading(false);

      // 4. Parse document with AI
      setIsParsing(true);
      console.log('[Partnership Creation] 🔄 Calling parse API for document:', document.id);
      
      const parseResponse = await fetch('/api/influencer/documents/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id,
          documentType: 'contract',
        }),
      });

      console.log('[Partnership Creation] 📡 Parse response status:', parseResponse.status);

      if (!parseResponse.ok) {
        const errorText = await parseResponse.text();
        console.error('[Partnership Creation] ❌ Parse API failed:', errorText);
        throw new Error('AI parsing failed');
      }

      const parseResult = await parseResponse.json();
      
      // 5. Get parsed data from API response
      const data = parseResult.results?.[0]?.data;
      
      if (!data) {
        throw new Error('לא נמצאו נתונים מנותחים');
      }
      
      // Save raw data for review screen
      setParsedRawData(data);
      
      // Map to form fields - SIMPLE AND DIRECT
      const deliverablesText = Array.isArray(data.deliverables)
        ? data.deliverables
            .map((d: any) => {
              const parts = [];
              if (d.quantity) parts.push(`${d.quantity}x`);
              if (d.type) parts.push(d.type);
              if (d.description) parts.push(`- ${d.description}`);
              return parts.join(' ');
            })
            .join('\n')
        : '';
      
      setFormData({
        brand_name: data.parties?.brand || '',
        campaign_name: data.scope || '',
        status: 'active',
        start_date: data.effectiveDate || '',
        end_date: data.expiryDate || '',
        contract_amount: data.paymentTerms?.totalAmount?.toString() || '',
        deliverables: deliverablesText,
        notes: '',
      });

      setIsParsing(false);
      console.log('[Partnership Creation] ✅ Switching to review mode');
      setCreationMode('review'); // Show review screen first
    } catch (err: any) {
      console.error('[Partnership Creation] ❌ Error uploading/parsing document:', err);
      console.error('[Partnership Creation] Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name,
      });
      setError(err.message || 'שגיאה בהעלאה/ניתוח המסמך');
      setIsUploading(false);
      setIsParsing(false);
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

            // 2. Save metadata to DB via lightweight API (only JSON, no file payload)
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
        <p className="text-gray-600 mt-2">
          {creationMode === 'select' ? 'בחר אופן יצירה' : 'הוסף שת"פ חדש עם מותג'}
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
          {error}
        </div>
      )}

      {/* MODE SELECTOR */}
      {creationMode === 'select' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Option 1: Upload + AI */}
          <button
            onClick={() => setCreationMode('upload')}
            className="bg-white rounded-lg border-2 border-gray-200 hover:border-blue-500 p-8 text-center transition-all group"
          >
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <Upload className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              העלה מסמך + AI
            </h3>
            <p className="text-gray-600 text-sm">
              העלה חוזה או ברייף והמערכת תמלא את הפרטים אוטומטית
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-blue-600 font-medium">
              <span>מומלץ</span>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
          </button>

          {/* Option 2: Manual */}
          <button
            onClick={() => setCreationMode('manual')}
            className="bg-white rounded-lg border-2 border-gray-200 hover:border-blue-500 p-8 text-center transition-all group"
          >
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                <FileText className="h-8 w-8 text-gray-600" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              צור ידנית
            </h3>
            <p className="text-gray-600 text-sm">
              מלא את כל הפרטים באופן ידני
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-gray-600 font-medium">
              <span>מתאים לשת"פ ללא מסמך</span>
            </div>
          </button>
        </div>
      )}

      {/* UPLOAD MODE */}
      {creationMode === 'upload' && (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="max-w-xl mx-auto">
            {!isUploading && !isParsing && (
              <>
                <div className="text-center mb-6">
                  <Upload className="h-16 w-16 text-blue-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    העלה מסמך חוזה או ברייף
                  </h3>
                  <p className="text-gray-600">
                    ה-AI ינתח את המסמך וימלא את הפרטים אוטומטית
                  </p>
                </div>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleDocumentUploadAndParse(file);
                    }}
                    className="hidden"
                    id="document-upload"
                  />
                  <label
                    htmlFor="document-upload"
                    className="cursor-pointer inline-flex flex-col items-center"
                  >
                    <Upload className="h-12 w-12 text-gray-400 mb-3" />
                    <span className="text-lg font-medium text-gray-700 mb-1">
                      לחץ להעלאת מסמך
                    </span>
                    <span className="text-sm text-gray-500">
                      PDF, Word (עד 10MB)
                    </span>
                  </label>
                </div>

                <button
                  onClick={() => setCreationMode('select')}
                  className="mt-6 w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  חזור לבחירת שיטה
                </button>
              </>
            )}

            {isUploading && (
              <div className="text-center py-12">
                <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900">מעלה מסמך...</p>
                <p className="text-sm text-gray-600 mt-2">אנא המתן</p>
              </div>
            )}

            {isParsing && (
              <div className="text-center py-12">
                <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900">🤖 Gemini 3 Pro מנתח את החוזה...</p>
                <p className="text-sm text-gray-600 mt-2">זה עשוי לקחת 30 שניות - 8 דקות</p>
                <div className="mt-6 max-w-md mx-auto text-right">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-xs font-medium text-blue-900 mb-2">מה ה-AI מחפש:</p>
                    <ul className="text-xs text-blue-700 space-y-1">
                      <li>✓ שמות הצדדים (מותג, משפיען, סוכן)</li>
                      <li>✓ תאריכים (תחילה, סיום, שנתי)</li>
                      <li>✓ סכום החוזה (בטבלאות ורשימות)</li>
                      <li>✓ דליברבלס (פוסטים, סרטונים, סטוריז)</li>
                      <li>✓ תנאי תשלום ומועדים</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REVIEW MODE - Show what AI found */}
      {creationMode === 'review' && parsedRawData && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">✅ החוזה נותח בהצלחה!</h3>
                <p className="text-sm text-gray-600">Gemini 3 Pro זיהה את הפרטים הבאים:</p>
              </div>
            </div>

            {/* Extracted Data Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Brand */}
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-xs font-medium text-blue-900 mb-1">מותג</p>
                <p className="text-lg font-bold text-blue-700">{parsedRawData.parties?.brand || '—'}</p>
              </div>

              {/* Amount */}
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-xs font-medium text-green-900 mb-1">סכום</p>
                <p className="text-lg font-bold text-green-700">
                  {parsedRawData.paymentTerms?.totalAmount 
                    ? `₪${parsedRawData.paymentTerms.totalAmount.toLocaleString()}`
                    : '—'}
                </p>
              </div>

              {/* Dates */}
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-xs font-medium text-purple-900 mb-1">תאריכים</p>
                <p className="text-sm font-bold text-purple-700">
                  {parsedRawData.effectiveDate || '—'} → {parsedRawData.expiryDate || '—'}
                </p>
              </div>

              {/* Deliverables */}
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-xs font-medium text-orange-900 mb-1">דליברבלס</p>
                <p className="text-lg font-bold text-orange-700">
                  {parsedRawData.deliverables?.length || 0} פריטים
                </p>
              </div>
            </div>

            {/* Deliverables Details */}
            {parsedRawData.deliverables?.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium text-gray-700 mb-2">דליברבלס שזוהו:</p>
                <ul className="space-y-2">
                  {parsedRawData.deliverables.map((d: any, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 rounded p-2">
                      <span className="font-bold text-blue-600">{i + 1}.</span>
                      <span>
                        {d.quantity && <strong>{d.quantity}x </strong>}
                        {d.type && <span className="font-medium">{d.type}</span>}
                        {d.description && <> - {d.description}</>}
                        {d.platform && <span className="text-xs text-gray-500"> ({d.platform})</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Confidence */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">רמת ביטחון של AI:</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(parsedRawData.confidence || 0.79) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-gray-700">
                  {((parsedRawData.confidence || 0.79) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setCreationMode('select')}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              התחל מחדש
            </button>
            <button
              onClick={() => {
                console.log('[Partnership Creation] 🎯 Moving to form edit mode');
                setCreationMode('manual');
              }}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              המשך לעריכה ←
            </button>
          </div>
        </div>
      )}

      {/* FORM (shown in manual mode or after parsing) */}
      {creationMode === 'manual' && (
        <>
          {/* AI Parsing Success Notice */}
          {uploadedDocumentId && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">
                    💡 הטופס מולא אוטומטית מהחוזה
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    בדוק את הפרטים, ערוך והשלם את החסר לפי הצורך.
                  </p>
                </div>
              </div>
            </div>
          )}

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
            onClick={() => {
              if (uploadedDocumentId) {
                setCreationMode('select');
              } else {
                router.back();
              }
            }}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {uploadedDocumentId ? 'חזור לבחירת שיטה' : 'ביטול'}
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
        </>
      )}
    </div>
  );
}
