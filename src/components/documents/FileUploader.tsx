'use client';

/**
 * FileUploader Component - העלאת מסמכים עם drag & drop
 * 
 * Features:
 * - Drag & drop zone
 * - Multiple file selection
 * - File type validation
 * - Size validation (max 10MB) - Direct to Supabase Storage
 * - Preview thumbnails
 * - Auto-upload on select
 * - Direct client-side upload (bypasses Vercel 4.5MB limit)
 * 
 * Usage:
 * <FileUploader 
 *   accountId="account-id"
 *   partnershipId="partnership-id" (optional)
 *   username="username" (required for auth)
 *   onUploadComplete={(files) => console.log(files)}
 * />
 */

import { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, Image, AlertCircle } from 'lucide-react';
import { supabaseClient } from '@/lib/supabase-client';

export interface UploadedFile {
  id: string;
  filename: string;
  size: number;
  type: string;
  storagePath: string;
}

export interface FileUploaderProps {
  accountId: string;
  username: string; // Required for auth
  partnershipId?: string;
  onUploadComplete: (files: UploadedFile[]) => void;
  onError?: (error: string) => void;
  acceptedTypes?: string[];
  maxSize?: number; // in MB (max 10MB for direct upload)
  multiple?: boolean;
}

interface FilePreview {
  file: File;
  preview?: string;
  error?: string;
}

const DEFAULT_ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

const DEFAULT_MAX_SIZE = 10; // MB (Vercel limit bypass via client-side upload)

const ACCEPTED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
];

export function FileUploader({
  accountId,
  username,
  partnershipId,
  onUploadComplete,
  onError,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  maxSize = DEFAULT_MAX_SIZE,
  multiple = true,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate file
  const validateFile = (file: File): string | null => {
    // Check size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSize) {
      return `הקובץ גדול מדי (${fileSizeMB.toFixed(1)}MB). גודל מקסימלי: ${maxSize}MB`;
    }

    // Check type
    if (!acceptedTypes.includes(file.type)) {
      return `סוג קובץ לא נתמך: ${file.type}`;
    }

    return null;
  };

  // Handle file selection
  const handleFiles = useCallback(
    (selectedFiles: FileList | null) => {
      if (!selectedFiles || selectedFiles.length === 0) return;

      const newFiles: FilePreview[] = [];
      
      Array.from(selectedFiles).forEach((file) => {
        const error = validateFile(file);
        
        if (error) {
          newFiles.push({ file, error });
          return;
        }

        // Create preview for images
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            setFiles((prev) =>
              prev.map((f) =>
                f.file === file ? { ...f, preview: e.target?.result as string } : f
              )
            );
          };
          reader.readAsDataURL(file);
        }

        newFiles.push({ file });
      });

      setFiles((prev) => (multiple ? [...prev, ...newFiles] : newFiles));

      // Auto-upload if no errors
      const validFiles = newFiles.filter((f) => !f.error);
      if (validFiles.length > 0) {
        uploadFiles(validFiles.map((f) => f.file));
      }
    },
    [multiple, maxSize, acceptedTypes]
  );

  // Upload files directly to Supabase Storage (bypasses Vercel 4.5MB limit)
  const uploadFiles = async (filesToUpload: File[]) => {
    setIsUploading(true);

    try {
      const uploadedFiles: UploadedFile[] = [];

      for (const file of filesToUpload) {
        // 1. Upload directly to Supabase Storage (client-side)
        const timestamp = Date.now();
        const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = partnershipId
          ? `${accountId}/partnerships/${partnershipId}/${timestamp}_${cleanFilename}`
          : `${accountId}/documents/${timestamp}_${cleanFilename}`;

        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from('partnership-documents')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          console.error(`[FileUploader] Failed to upload ${file.name}:`, uploadError);
          onError?.(`העלאת ${file.name} נכשלה: ${uploadError.message}`);
          continue;
        }

        // 2. Get public URL
        const { data: urlData } = supabaseClient.storage
          .from('partnership-documents')
          .getPublicUrl(storagePath);

        // 3. Save metadata to DB via lightweight API (only JSON, no file payload)
        const metadataResponse = await fetch('/api/influencer/documents/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            accountId,
            partnershipId: partnershipId || null,
            filename: file.name,
            fileSize: file.size,
            mimeType: file.type,
            storagePath,
            publicUrl: urlData.publicUrl,
            documentType: 'other', // Can be customized
          }),
        });

        if (!metadataResponse.ok) {
          const error = await metadataResponse.json();
          console.error(`[FileUploader] Failed to save metadata for ${file.name}:`, error);
          onError?.(`שמירת ${file.name} נכשלה`);
          continue;
        }

        const metadata = await metadataResponse.json();

        uploadedFiles.push({
          id: metadata.document.id,
          filename: file.name,
          size: file.size,
          type: file.type,
          storagePath: storagePath,
        });

        console.log(`✓ Uploaded ${file.name}`);
      }

      // Call success callback
      if (uploadedFiles.length > 0) {
        onUploadComplete(uploadedFiles);
      }

      // Clear uploaded files from preview
      setFiles((prev) =>
        prev.filter((f) => !filesToUpload.includes(f.file))
      );
    } catch (error: any) {
      console.error('[FileUploader] Upload error:', error);
      onError?.(error.message || 'העלאה נכשלה');
    } finally {
      setIsUploading(false);
    }
  };

  // Remove file from preview
  const removeFile = (file: File) => {
    setFiles((prev) => prev.filter((f) => f.file !== file));
  };

  // Drag & drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    handleFiles(droppedFiles);
  };

  // File input handler
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  // Click to select
  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      {/* Drop Zone */}
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-all duration-200
          ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={handleFileInput}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-4">
          <Upload
            className={`h-12 w-12 ${
              isDragging ? 'text-blue-500' : 'text-gray-400'
            }`}
          />

          {isDragging ? (
            <p className="text-lg font-medium text-blue-600">
              שחרר את הקבצים כאן...
            </p>
          ) : (
            <>
              <p className="text-lg font-medium text-gray-700">
                גרור קבצים לכאן או לחץ לבחירה
              </p>
              <p className="text-sm text-gray-500">
                PDF, Word, Excel, תמונות (עד {maxSize}MB)
              </p>
              {multiple && (
                <p className="text-xs text-gray-400">
                  ניתן להעלות מספר קבצים בו-זמנית
                </p>
              )}
            </>
          )}
        </div>

        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-gray-700">
                מעלה קבצים...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* File Preview List */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-medium text-gray-700">קבצים לעיון:</h3>
          
          {files.map((filePreview) => (
            <FilePreviewItem
              key={filePreview.file.name + filePreview.file.size}
              filePreview={filePreview}
              onRemove={() => removeFile(filePreview.file)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// File Preview Item Component
function FilePreviewItem({
  filePreview,
  onRemove,
}: {
  filePreview: FilePreview;
  onRemove: () => void;
}) {
  const { file, preview, error } = filePreview;
  const isImage = file.type.startsWith('image/');
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

  return (
    <div
      className={`
        flex items-center gap-3 p-3 rounded-lg border
        ${error ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}
      `}
    >
      {/* Icon / Preview */}
      <div className="flex-shrink-0">
        {isImage && preview ? (
          <img
            src={preview}
            alt={file.name}
            className="h-12 w-12 object-cover rounded"
          />
        ) : isImage ? (
          <Image className="h-6 w-6 text-gray-400" />
        ) : (
          <FileText className="h-6 w-6 text-gray-400" />
        )}
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {file.name}
        </p>
        <p className="text-xs text-gray-500">
          {sizeMB} MB • {file.type.split('/')[1]?.toUpperCase()}
        </p>
        {error && (
          <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}
      </div>

      {/* Remove Button */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 p-1 hover:bg-gray-100 rounded transition-colors"
        title="הסר קובץ"
      >
        <X className="h-5 w-5 text-gray-400" />
      </button>
    </div>
  );
}
