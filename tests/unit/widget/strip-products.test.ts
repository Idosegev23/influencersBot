import { describe, it, expect } from 'vitest';
import { stripProducts } from '@/lib/chatbot/widget-objections';

describe('stripProducts', () => {
  it('extracts positions and strips the envelope', () => {
    const { cleanText, positions } = stripProducts('בול בשבילך INTENSIVE ✨<<PRODUCTS>>1,3<</PRODUCTS>>');
    expect(positions).toEqual([1, 3]);
    expect(cleanText).toBe('בול בשבילך INTENSIVE ✨');
  });
  it('tolerates spaces and dedupes, ignores non-numbers', () => {
    const { positions } = stripProducts('x <<PRODUCTS>> 2 , 2, foo, 5 <</PRODUCTS>>');
    expect(positions).toEqual([2, 5]);
  });
  it('no envelope → empty positions, not present, text unchanged', () => {
    const { cleanText, positions, present } = stripProducts('just a reply');
    expect(positions).toEqual([]);
    expect(present).toBe(false);
    expect(cleanText).toBe('just a reply');
  });
  it('empty envelope → empty positions but PRESENT (deliberate no-cards)', () => {
    const { positions, present } = stripProducts('hi <<PRODUCTS>><</PRODUCTS>>');
    expect(positions).toEqual([]);
    expect(present).toBe(true);
  });
  it('populated envelope → present true', () => {
    const { present } = stripProducts('x<<PRODUCTS>>1<</PRODUCTS>>');
    expect(present).toBe(true);
  });
});
