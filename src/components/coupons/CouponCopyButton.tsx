'use client';

import { useState } from 'react';
import { useCouponCopy } from '@/hooks/useCouponCopy';

type CouponCopyButtonProps = {
  couponId: string;
  couponCode: string;
  userIdentifier?: string;
  isFollower?: boolean;
  copiedFrom?: 'web' | 'chatbot' | 'instagram';
  onCopySuccess?: () => void;
};

export default function CouponCopyButton({
  couponId,
  couponCode,
  userIdentifier,
  isFollower = false,
  copiedFrom = 'web',
  onCopySuccess,
}: CouponCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { trackCopy, copying } = useCouponCopy();

  const handleCopy = async () => {
    try {
      // Copy to clipboard
      await navigator.clipboard.writeText(couponCode);
      
      // Track the copy event
      await trackCopy({
        couponId,
        userIdentifier,
        isFollower,
        copiedFrom,
      });

      // Show success
      setCopied(true);
      onCopySuccess?.();

      // Reset after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('שגיאה בהעתקת הקופון');
    }
  };

  return (
    <button
      onClick={handleCopy}
      disabled={copying}
      className={`
        px-6 py-3 rounded-lg font-medium transition-all
        ${copied 
          ? 'bg-green-500 text-white' 
          : 'bg-blue-600 hover:bg-blue-700 text-white'
        }
        ${copying ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {copying ? (
        'מעתיק...'
      ) : copied ? (
        <>✓ הועתק!</>
      ) : (
        <>📋 העתק קופון</>
      )}
    </button>
  );
}
