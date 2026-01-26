import { useState } from 'react';

type UseCouponCopyProps = {
  couponId: string;
  userIdentifier?: string;
  isFollower?: boolean;
  copiedFrom?: 'web' | 'chatbot' | 'instagram';
};

export function useCouponCopy() {
  const [copying, setCopying] = useState(false);

  const trackCopy = async ({
    couponId,
    userIdentifier,
    isFollower = false,
    copiedFrom = 'web',
  }: UseCouponCopyProps) => {
    setCopying(true);

    try {
      const response = await fetch(`/api/influencer/coupons/${couponId}/copy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_identifier: userIdentifier,
          is_follower: isFollower,
          copied_from: copiedFrom,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to track copy');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to track coupon copy:', error);
      throw error;
    } finally {
      setCopying(false);
    }
  };

  return { trackCopy, copying };
}
