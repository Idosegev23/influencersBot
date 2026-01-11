// AI Parser Utilities

import { SUPPORTED_MIME_TYPES, MAX_FILE_SIZE } from './types';
import type { DocumentType } from './types';

/**
 * Convert File to base64
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:image/png;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

/**
 * Validate file
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `הקובץ גדול מדי. מקסימום ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  // Check type
  if (!SUPPORTED_MIME_TYPES[file.type as keyof typeof SUPPORTED_MIME_TYPES]) {
    return {
      valid: false,
      error: `סוג קובץ לא נתמך: ${file.type}. נתמכים: PDF, Word, Excel, PowerPoint, תמונות`,
    };
  }

  return { valid: true };
}

/**
 * Detect language from text
 */
export function detectLanguage(text: string): string {
  const patterns = {
    he: /[\u0590-\u05FF]/, // Hebrew
    ar: /[\u0600-\u06FF]/, // Arabic
    ru: /[\u0400-\u04FF]/, // Russian
    en: /^[A-Za-z\s]+$/, // English
  };

  const sample = text.substring(0, 500);

  for (const [lang, pattern] of Object.entries(patterns)) {
    if (pattern.test(sample)) {
      return lang;
    }
  }

  return 'en'; // default
}

/**
 * Calculate confidence score based on field completeness
 */
export function calculateConfidence(parsed: any, documentType: DocumentType): number {
  const requiredFields = REQUIRED_FIELDS[documentType];
  if (!requiredFields) return 0;

  let score = 0;
  let totalWeight = 0;

  for (const [field, weight] of Object.entries(requiredFields)) {
    totalWeight += weight;

    const value = parsed[field];
    if (value !== null && value !== undefined) {
      // Field exists
      score += weight * 0.5;

      // Field is valid (not empty string, not zero, not empty array)
      if (isValidValue(value)) {
        score += weight * 0.5;
      }
    }
  }

  return Math.min(score / totalWeight, 1.0);
}

/**
 * Check if value is valid (not empty)
 */
function isValidValue(value: any): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (typeof value === 'number') {
    return value > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return true;
}

/**
 * Required fields by document type with weights
 */
const REQUIRED_FIELDS: Record<DocumentType, Record<string, number>> = {
  quote: {
    brandName: 1.0,
    totalAmount: 1.0,
    deliverables: 0.8,
    timeline: 0.6,
    contactPerson: 0.4,
  },

  contract: {
    parties: 1.0,
    signedDate: 0.9,
    expiryDate: 0.9,
    paymentTerms: 0.8,
    deliverables: 0.7,
  },

  brief: {
    campaignGoal: 1.0,
    targetAudience: 0.8,
    keyMessages: 0.7,
    tasks: 0.6,
  },

  invoice: {
    invoiceNumber: 1.0,
    amount: 1.0,
    dueDate: 0.8,
  },

  receipt: {
    amount: 1.0,
    date: 0.8,
  },

  other: {
    content: 1.0,
  },
};

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = baseDelay * Math.pow(2, i);
      console.log(`[Retry] ניסיון ${i + 1} נכשל. מנסה שוב בעוד ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

