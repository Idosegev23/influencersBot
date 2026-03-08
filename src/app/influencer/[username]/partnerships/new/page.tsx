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
      console.log('🔍 parseResult keys:', Object.keys(parseResult));
      console.log('🔍 parseResult.results:', parseResult.results);
      console.log('🔍 parseResult.results[0]:', parseResult.results?.[0]);

      // 5. Get parsed data from API response
      const data = parseResult.results?.[0]?.data;
      console.log('🔍 data extracted:', data);
      console.log('🔍 data.parties:', data?.parties);
      console.log('🔍 data.parties.brand:', data?.parties?.brand);

      if (!data) {
        throw new Error('לא נמצאו נתונים מנותחים');
      }

      // Save raw data for review screen
      console.log('💾 Saving to parsedRawData:', JSON.stringify(data, null, 2));
      setParsedRawData(data);
      console.log('✅ parsedRawData saved');

      // Map to form fields - SIMPLE AND DIRECT
      // Keep deliverables as text for form display
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
        deliverables: deliverablesText, // Text for editing
        notes: '',
      });

      console.log('[Partnership Creation] ✅ Form data set:', {
        brand_name: data.parties?.brand,
        amount: data.paymentTerms?.totalAmount,
        deliverables_count: data.deliverables?.length,
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
      // Prepare partnership data
      const partnershipData: any = {
        username,
        ...formData,
        contract_amount: formData.contract_amount ? parseFloat(formData.contract_amount) : null,
      };

      // Add full parsed contract data if available (from AI parsing)
      if (parsedRawData) {
        console.log('[Partnership Creation] 💾 Saving full parsed data to partnership');

        partnershipData.payment_schedule = parsedRawData.paymentTerms?.schedule || [];
        partnershipData.exclusivity = parsedRawData.exclusivity || null;
        partnershipData.termination_clauses = parsedRawData.terminationClauses || [];
        partnershipData.liability_clauses = parsedRawData.liabilityClauses || [];
        partnershipData.confidentiality = parsedRawData.confidentiality || null;
        partnershipData.key_dates = parsedRawData.keyDates || [];
        partnershipData.contract_scope = parsedRawData.scope || null;
        partnershipData.auto_renewal = parsedRawData.autoRenewal || false;
        partnershipData.parsed_contract_data = parsedRawData; // Full backup

        // Save deliverables as structured JSONB array (not text!)
        if (Array.isArray(parsedRawData.deliverables)) {
          partnershipData.deliverables = parsedRawData.deliverables;
          console.log(`[Partnership Creation] 📋 Saving ${parsedRawData.deliverables.length} deliverables as JSONB`);
        }
      } else {
        console.log('[Partnership Creation] ℹ️ No parsed data - manual creation');
      }

      // Create partnership
      const response = await fetch(`/api/influencer/partnerships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partnershipData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Partnership creation failed:', errorData);
        throw new Error(errorData.details || errorData.error || 'Failed to create partnership');
      }

      const result = await response.json();
      const partnershipId = result.partnership.id;

      // Update uploaded document with partnership_id (if was uploaded during creation)
      if (uploadedDocumentId) {
        try {
          console.log('[Partnership Creation] 🔗 Linking document to partnership:', uploadedDocumentId, '→', partnershipId);

          await fetch(`/api/influencer/documents/${uploadedDocumentId}/update-parsed`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              partnership_id: partnershipId,
            }),
          });

          console.log('[Partnership Creation] ✅ Document linked to partnership');
        } catch (linkError) {
          console.error('[Partnership Creation] ⚠️ Failed to link document:', linkError);
          // Don't fail the whole creation - just log it
        }
      }

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
    <div className="max-w-4xl mx-auto py-8 px-4" style={{ background: 'var(--dash-bg)', color: 'var(--dash-text)' }}>
      {/* Back Button */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 transition-colors"
          style={{ color: 'var(--dash-text-2)' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>חזור</span>
        </button>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--dash-text)' }}>שת"פ חדש</h1>
        <p className="mt-2" style={{ color: 'var(--dash-text-2)' }}>
          {creationMode === 'select' ? 'בחר אופן יצירה' : 'הוסף שת"פ חדש עם מותג'}
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 rounded-xl border p-4" style={{ borderColor: 'var(--dash-negative)', background: 'var(--dash-surface)', color: 'var(--dash-negative)' }}>
          {error}
        </div>
      )}

      {/* MODE SELECTOR */}
      {creationMode === 'select' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Option 1: Upload + AI */}
          <button
            onClick={() => setCreationMode('upload')}
            className="rounded-xl border-2 p-8 text-center transition-all group"
            style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--dash-border)'; }}
          >
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: 'var(--dash-surface-hover)' }}>
                <Upload className="h-8 w-8" style={{ color: 'var(--color-primary)' }} />
              </div>
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--dash-text)' }}>
              העלה מסמך + AI
            </h3>
            <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>
              העלה חוזה או ברייף והמערכת תמלא את הפרטים אוטומטית
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
              <span>מומלץ</span>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
          </button>

          {/* Option 2: Manual */}
          <button
            onClick={() => setCreationMode('manual')}
            className="rounded-xl border-2 p-8 text-center transition-all group"
            style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--dash-border)'; }}
          >
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: 'var(--dash-surface-hover)' }}>
                <FileText className="h-8 w-8" style={{ color: 'var(--dash-text-2)' }} />
              </div>
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--dash-text)' }}>
              צור ידנית
            </h3>
            <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>
              מלא את כל הפרטים באופן ידני
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--dash-text-3)' }}>
              <span>מתאים לשת"פ ללא מסמך</span>
            </div>
          </button>
        </div>
      )}

      {/* UPLOAD MODE */}
      {creationMode === 'upload' && (
        <div className="rounded-xl border p-8" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
          <div className="max-w-xl mx-auto">
            {!isUploading && !isParsing && (
              <>
                <div className="text-center mb-6">
                  <Upload className="h-16 w-16 mx-auto mb-4" style={{ color: 'var(--color-primary)' }} />
                  <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--dash-text)' }}>
                    העלה מסמך חוזה או ברייף
                  </h3>
                  <p style={{ color: 'var(--dash-text-2)' }}>
                    ה-AI ינתח את המסמך וימלא את הפרטים אוטומטית
                  </p>
                </div>

                <div className="border-2 border-dashed rounded-lg p-8 text-center" style={{ borderColor: 'var(--dash-border)' }}>
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
                    <Upload className="h-12 w-12 mb-3" style={{ color: 'var(--dash-text-3)' }} />
                    <span className="text-lg font-medium mb-1" style={{ color: 'var(--dash-text-2)' }}>
                      לחץ להעלאת מסמך
                    </span>
                    <span className="text-sm" style={{ color: 'var(--dash-text-3)' }}>
                      PDF, Word (עד 10MB)
                    </span>
                  </label>
                </div>

                <button
                  onClick={() => setCreationMode('select')}
                  className="mt-6 w-full px-4 py-2 border rounded-lg transition-colors"
                  style={{ borderColor: 'var(--dash-border)', color: 'var(--dash-text-2)' }}
                >
                  חזור לבחירת שיטה
                </button>
              </>
            )}

            {isUploading && (
              <div className="text-center py-12" style={{ background: 'var(--dash-bg)' }}>
                <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" style={{ color: 'var(--color-primary)' }} />
                <p className="text-lg font-medium" style={{ color: 'var(--dash-text)' }}>מעלה מסמך...</p>
                <p className="text-sm mt-2" style={{ color: 'var(--dash-text-3)' }}>אנא המתן</p>
              </div>
            )}

            {isParsing && (
              <div className="text-center py-12" style={{ background: 'var(--dash-bg)' }}>
                <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" style={{ color: 'var(--color-primary)' }} />
                <p className="text-lg font-medium" style={{ color: 'var(--dash-text)' }}>מנתח את החוזה...</p>
                <p className="text-sm mt-2" style={{ color: 'var(--dash-text-3)' }}>זה עשוי לקחת 30 שניות - 8 דקות</p>
                <div className="mt-6 max-w-md mx-auto text-right">
                  <div className="rounded-xl border p-4" style={{ background: 'var(--dash-surface)', borderColor: 'var(--color-info)' }}>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-info)' }}>מחלץ מהמסמך:</p>
                    <ul className="text-xs space-y-1" style={{ color: 'var(--dash-text-2)' }}>
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
        <div className="rounded-xl border p-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ background: 'var(--dash-positive)', opacity: 0.15 }}>
                <svg className="h-6 w-6" style={{ color: 'var(--dash-positive)' }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold" style={{ color: 'var(--dash-text)' }}>החוזה נותח בהצלחה!</h3>
                <p className="text-sm" style={{ color: 'var(--dash-text-2)' }}>המערכת זיהתה את הפרטים הבאים:</p>
              </div>
            </div>

            {/* Extracted Data Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Brand */}
              <div className="rounded-lg p-4" style={{ background: 'var(--dash-surface-hover)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-primary)' }}>מותג</p>
                <p className="text-lg font-bold" style={{ color: 'var(--dash-text)' }}>{parsedRawData.parties?.brand || '—'}</p>
              </div>

              {/* Amount */}
              <div className="rounded-lg p-4" style={{ background: 'var(--dash-surface-hover)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--dash-positive)' }}>סכום</p>
                <p className="text-lg font-bold" style={{ color: 'var(--dash-text)' }}>
                  {parsedRawData.paymentTerms?.totalAmount
                    ? `₪${parsedRawData.paymentTerms.totalAmount.toLocaleString()}`
                    : '—'}
                </p>
              </div>

              {/* Dates */}
              <div className="rounded-lg p-4" style={{ background: 'var(--dash-surface-hover)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-info)' }}>תאריכים</p>
                <p className="text-sm font-bold" style={{ color: 'var(--dash-text)' }}>
                  {parsedRawData.effectiveDate || '—'} → {parsedRawData.expiryDate || '—'}
                </p>
              </div>

              {/* Deliverables */}
              <div className="rounded-lg p-4" style={{ background: 'var(--dash-surface-hover)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-warning)' }}>דליברבלס</p>
                <p className="text-lg font-bold" style={{ color: 'var(--dash-text)' }}>
                  {parsedRawData.deliverables?.length || 0} פריטים
                </p>
              </div>
            </div>

            {/* Payment Schedule */}
            {parsedRawData.paymentTerms?.schedule?.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium mb-3 text-right" style={{ color: 'var(--dash-text-2)' }}>מועדי תשלום שזוהו:</p>
                <div className="space-y-2">
                  {parsedRawData.paymentTerms.schedule.map((payment: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border p-3" style={{ background: 'var(--dash-surface-hover)', borderColor: 'var(--dash-border)' }}>
                      <div className="text-right flex-1">
                        <p className="font-bold" style={{ color: 'var(--dash-positive)' }}>
                          ₪{payment.amount?.toLocaleString()} ({payment.percentage}%)
                        </p>
                        <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>{payment.trigger}</p>
                      </div>
                      {payment.dueDate && (
                        <span className="text-sm font-medium" style={{ color: 'var(--dash-text-2)' }}>
                          {new Date(payment.dueDate).toLocaleDateString('he-IL')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deliverables Details */}
            {parsedRawData.deliverables?.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium mb-3 text-right" style={{ color: 'var(--dash-text-2)' }}>דליברבלס שזוהו:</p>
                <ul className="space-y-2">
                  {parsedRawData.deliverables.map((d: any, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm rounded-lg border p-3" style={{ background: 'var(--dash-surface-hover)', borderColor: 'var(--dash-border)', color: 'var(--dash-text-2)' }}>
                      <span className="font-bold" style={{ color: 'var(--color-primary)' }}>{i + 1}.</span>
                      <span className="flex-1 text-right">
                        {d.quantity && <strong>{d.quantity}x </strong>}
                        {d.type && <span className="font-medium">{d.type}</span>}
                        {d.description && <> - {d.description}</>}
                        {d.platform && <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}> ({d.platform})</span>}
                        {d.dueDate && (
                          <span className="block text-xs mt-1" style={{ color: 'var(--color-primary)' }}>
                            {new Date(d.dueDate).toLocaleDateString('he-IL')}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Important Terms Preview */}
            <div className="mb-6">
              <p className="text-sm font-medium mb-3 text-right" style={{ color: 'var(--dash-text-2)' }}>תנאים חשובים:</p>
              <div className="space-y-2">
                {parsedRawData.exclusivity?.isExclusive && (
                  <div className="rounded-lg border p-3 text-right" style={{ background: 'var(--dash-surface-hover)', borderColor: 'var(--dash-border)' }}>
                    <p className="text-sm font-bold" style={{ color: 'var(--color-warning)' }}>חוזה אקסקלוסיבי</p>
                    {parsedRawData.exclusivity.categories?.length > 0 && (
                      <p className="text-xs mt-1" style={{ color: 'var(--dash-text-2)' }}>
                        {parsedRawData.exclusivity.categories.join(', ')}
                      </p>
                    )}
                  </div>
                )}

                {parsedRawData.terminationClauses?.[0] && (
                  <div className="rounded-lg border p-3 text-right" style={{ background: 'var(--dash-surface-hover)', borderColor: 'var(--dash-border)' }}>
                    <p className="text-xs" style={{ color: 'var(--dash-text-2)' }}>{parsedRawData.terminationClauses[0]}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setCreationMode('select')}
              className="flex-1 px-6 py-3 border rounded-lg transition-colors"
              style={{ borderColor: 'var(--dash-border)', color: 'var(--dash-text-2)' }}
            >
              התחל מחדש
            </button>
            <button
              onClick={() => {
                console.log('[Partnership Creation] 🎯 Moving to form edit mode');
                setCreationMode('manual');
              }}
              className="flex-1 px-6 py-3 rounded-lg transition-colors font-medium"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
            >
              המשך לעריכה
            </button>
          </div>
        </div>
      )}

      {/* FORM (shown in manual mode or after parsing) */}
      {creationMode === 'manual' && (
        <>
          {/* AI Parsing Success Notice */}
          {uploadedDocumentId && (
            <div className="mb-6 rounded-xl border p-4" style={{ background: 'var(--dash-surface)', borderColor: 'var(--color-info)' }}>
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 mt-0.5" style={{ color: 'var(--color-info)' }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>
                    הטופס מולא אוטומטית מהחוזה
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'var(--dash-text-2)' }}>
                    בדוק את הפרטים, ערוך והשלם את החסר לפי הצורך.
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="rounded-xl border p-6 space-y-6" style={{ background: 'var(--dash-surface)', borderColor: 'var(--dash-border)' }}>
        {/* Brand Name */}
        <div>
          <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
            שם המותג <span style={{ color: 'var(--dash-negative)' }}>*</span>
          </label>
          <input
            type="text"
            required
            value={formData.brand_name}
            onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            placeholder="לדוגמה: Nike, Adidas"
          />
        </div>

        {/* Campaign Name */}
        <div>
          <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
            שם הקמפיין
          </label>
          <input
            type="text"
            value={formData.campaign_name}
            onChange={(e) => setFormData({ ...formData, campaign_name: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            placeholder="לדוגמה: Summer Collection 2024"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
            סטטוס
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
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
            <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
              תאריך התחלה
            </label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
              תאריך סיום
            </label>
            <input
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            />
          </div>
        </div>

        {/* Contract Amount */}
        <div>
          <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
            סכום החוזה (₪)
          </label>
          <input
            type="number"
            step="0.01"
            value={formData.contract_amount}
            onChange={(e) => setFormData({ ...formData, contract_amount: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            placeholder="0.00"
          />
        </div>

        {/* Deliverables */}
        <div>
          <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
            דליברבלס
          </label>
          <textarea
            value={formData.deliverables}
            onChange={(e) => setFormData({ ...formData, deliverables: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 border rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            placeholder="לדוגמה: 3 פוסטים באינסטגרם, 2 סטוריז, 1 ריל"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
            הערות
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 border rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
            placeholder="הערות נוספות..."
          />
        </div>

        {/* Document Upload */}
        <div>
          <label className="block text-sm font-medium mb-2 text-right" style={{ color: 'var(--dash-text-2)' }}>
            העלה מסמכים (חוזה, ברייף, וכו')
          </label>
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileChange}
            className="w-full px-4 py-2 border rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ background: 'var(--dash-bg)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
          />
          {uploadedFiles.length > 0 && (
            <div className="mt-2 text-sm" style={{ color: 'var(--dash-text-2)' }}>
              {uploadedFiles.length} קובץ/ים נבחרו: {uploadedFiles.map(f => f.name).join(', ')}
            </div>
          )}
          <p className="mt-1 text-xs text-right" style={{ color: 'var(--dash-text-3)' }}>
            גודל מקסימלי: 10MB לכל קובץ
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t" style={{ borderColor: 'var(--dash-border)' }}>
          <button
            type="button"
            onClick={() => {
              if (uploadedDocumentId) {
                setCreationMode('select');
              } else {
                router.back();
              }
            }}
            className="px-6 py-2 border rounded-lg transition-colors"
            style={{ borderColor: 'var(--dash-border)', color: 'var(--dash-text-2)' }}
          >
            {uploadedDocumentId ? 'חזור לבחירת שיטה' : 'ביטול'}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
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
