// AI Parser Types

export type DocumentType = 'quote' | 'contract' | 'brief' | 'invoice' | 'receipt' | 'other';

export type AIModel = 'gemini' | 'claude' | 'openai' | 'manual';

export type Language = 'auto' | 'he' | 'en' | 'ar' | 'ru';

export interface ParseOptions {
  file: File;
  documentType: DocumentType;
  language?: Language;
}

export interface ParseResult {
  success: boolean;
  data: any | null;
  confidence: number;
  model: AIModel;
  attemptNumber: number;
  error?: string;
  duration_ms?: number;
}

// Parsed Document Structures

export interface ParsedQuote {
  brandName: string | null;
  campaignName: string | null;
  totalAmount: number | null;
  currency: string | null;
  deliverables: Deliverable[];
  timeline: {
    startDate: string | null; // YYYY-MM-DD
    endDate: string | null;
  };
  paymentTerms: {
    milestones: PaymentMilestone[];
  };
  specialTerms: string[];
  contactPerson: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
}

export interface Deliverable {
  type: string; // post, story, reel, video, etc.
  quantity: number;
  platform: string; // instagram, tiktok, youtube
  dueDate: string | null; // YYYY-MM-DD
  description?: string;
}

export interface PaymentMilestone {
  percentage: number;
  amount: number;
  trigger: string;
  dueDate: string | null; // YYYY-MM-DD
}

export interface ParsedContract {
  parties: {
    brand: string | null;
    influencer: string | null;
    agent: string | null;
  };
  contractNumber: string | null;
  signedDate: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  autoRenewal: boolean;
  scope: string | null;
  exclusivity: {
    isExclusive: boolean;
    categories: string[];
  };
  paymentTerms: {
    totalAmount: number | null;
    schedule: PaymentMilestone[];
  };
  deliverables: Deliverable[];
  terminationClauses: string[];
  liabilityClauses: string[];
  confidentiality: string | null;
  keyDates: KeyDate[];
}

export interface KeyDate {
  event: string;
  date: string; // YYYY-MM-DD
}

export interface ParsedBrief {
  campaignGoal: string | null;
  targetAudience: string | null;
  keyMessages: string[];
  tone: string | null;
  dosList: string[];
  dontsList: string[];
  hashtags: string[];
  mentions: string[];
  contentGuidelines: {
    format: string | null;
    length: string | null;
    style: string | null;
  };
  assets: Asset[];
  tasks: BriefTask[];
  approvalProcess: string | null;
  references: string[];
}

export interface Asset {
  type: string; // logo, image, video
  description: string;
  url?: string;
}

export interface BriefTask {
  title: string;
  description: string;
  dueDate: string | null; // YYYY-MM-DD
  priority: 'low' | 'medium' | 'high';
}

// Supported File Types
export const SUPPORTED_MIME_TYPES = {
  // Documents
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  
  // Spreadsheets
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  
  // Presentations
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-powerpoint': '.ppt',
  
  // Images
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  
  // Other
  'text/plain': '.txt',
} as const;

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const CONFIDENCE_THRESHOLD = 0.75; // 75% minimum

