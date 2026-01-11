/**
 * Input sanitization utilities for security
 */

/**
 * Sanitize user input for XSS protection
 * Escapes HTML special characters
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Remove potentially dangerous prompt injection patterns
 * This helps protect against users trying to manipulate AI behavior
 */
export function sanitizePromptInput(input: string): string {
  if (typeof input !== 'string') return '';
  
  // Remove common prompt injection patterns
  const patterns = [
    // Ignore/override instructions
    /ignore\s*(previous|all|above|prior)\s*(instructions?|prompts?|rules?)/gi,
    /disregard\s*(previous|all|above|prior)\s*(instructions?|prompts?|rules?)/gi,
    /forget\s*(previous|all|above|prior)\s*(instructions?|prompts?|rules?)/gi,
    
    // System/assistant role manipulation
    /\[system\]/gi,
    /\[assistant\]/gi,
    /\[user\]/gi,
    /<system>/gi,
    /<assistant>/gi,
    
    // Jailbreak attempts
    /you\s*are\s*now\s*(DAN|evil|unrestricted)/gi,
    /pretend\s*you\s*are/gi,
    /act\s*as\s*if\s*you\s*are/gi,
    /roleplay\s*as/gi,
    /bypass\s*(your|all)\s*(restrictions?|limits?|rules?)/gi,
    
    // Developer mode tricks
    /developer\s*mode/gi,
    /admin\s*mode/gi,
    /sudo\s*mode/gi,
    /god\s*mode/gi,
    /debug\s*mode/gi,
    
    // Hebrew injection attempts
    /התעלם\s*מכל\s*ההוראות/gi,
    /שכח\s*את\s*ההוראות/gi,
    /בטל\s*את\s*ההגבלות/gi,
  ];
  
  let sanitized = input;
  
  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, '[filtered]');
  }
  
  return sanitized;
}

/**
 * Validate and sanitize username/identifier
 * Only allows alphanumeric, underscore, and dot
 */
export function sanitizeUsername(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 50); // Max 50 chars
}

/**
 * Validate and sanitize URL
 */
export function sanitizeUrl(input: string): string | null {
  if (typeof input !== 'string') return null;
  
  try {
    const url = new URL(input);
    
    // Only allow http/https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }
    
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Limit message length to prevent abuse
 */
export function limitMessageLength(input: string, maxLength = 2000): string {
  if (typeof input !== 'string') return '';
  return input.slice(0, maxLength);
}

/**
 * Full sanitization for chat messages
 */
export function sanitizeChatMessage(input: string): string {
  let message = input;
  
  // Limit length first
  message = limitMessageLength(message, 2000);
  
  // Remove prompt injection attempts
  message = sanitizePromptInput(message);
  
  // Trim whitespace
  message = message.trim();
  
  return message;
}

/**
 * Validate session ID format (UUID)
 */
export function isValidSessionId(id: string): boolean {
  if (typeof id !== 'string') return false;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Validate response ID format
 */
export function isValidResponseId(id: string): boolean {
  if (typeof id !== 'string') return false;
  
  // OpenAI response IDs typically start with 'resp_' and are alphanumeric
  return /^resp_[a-zA-Z0-9]+$/.test(id) || /^[a-zA-Z0-9_-]+$/.test(id);
}








