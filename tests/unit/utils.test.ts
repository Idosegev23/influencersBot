import { describe, it, expect } from 'vitest';
import { formatNumber, formatRelativeTime, cn } from '@/lib/utils';

describe('Utils', () => {
  describe('formatNumber', () => {
    it('should format numbers under 1000', () => {
      expect(formatNumber(500)).toBe('500');
      expect(formatNumber(999)).toBe('999');
    });

    it('should format thousands with K', () => {
      expect(formatNumber(1000)).toBe('1K');
      expect(formatNumber(1500)).toBe('1.5K');
      expect(formatNumber(10000)).toBe('10K');
    });

    it('should format millions with M', () => {
      expect(formatNumber(1000000)).toBe('1M');
      expect(formatNumber(1500000)).toBe('1.5M');
    });

    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0');
    });
  });

  describe('formatRelativeTime', () => {
    it('should format recent times as "just now"', () => {
      const now = new Date();
      const result = formatRelativeTime(now.toISOString());
      expect(result).toMatch(/עכשיו|לפני/);
    });

    it('should format hours correctly', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const result = formatRelativeTime(twoHoursAgo.toISOString());
      expect(result).toContain('שע');
    });
  });

  describe('cn', () => {
    it('should merge class names', () => {
      const result = cn('px-4', 'py-2');
      expect(result).toBe('px-4 py-2');
    });

    it('should handle conflicting classes', () => {
      const result = cn('px-4', 'px-6');
      expect(result).toBe('px-6');
    });

    it('should handle conditional classes', () => {
      const result = cn('base', true && 'active', false && 'disabled');
      expect(result).toBe('base active');
    });
  });
});




