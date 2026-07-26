import { describe, it, expect } from 'vitest';
import { findRedactionViolations } from '@/lib/bestie/redaction';

const clean = (text: string, names?: string[]) =>
  findRedactionViolations(text, names).length === 0;

describe('findRedactionViolations', () => {
  it('passes ordinary product-surface knowledge', () => {
    expect(clean('כדי לשנות את אישיות הבוט: הגדרות הבוט ← לשונית אישיות ← שמור.')).toBe(true);
    expect(clean('Bestie answers your customers on WhatsApp, Instagram and your website.')).toBe(true);
  });

  it('blocks another customer being named', () => {
    const names = ['Argania', 'LA BEAUTÉ', 'Carolina Lemke'];
    expect(clean('Argania uses this feature for their orders.', names)).toBe(false);
    expect(clean('לדוגמה אצל Carolina Lemke יש 200 מוצרים.', names)).toBe(false);
  });

  it('matches forbidden names case-insensitively but not inside a longer word', () => {
    expect(clean('argania is a client', ['Argania'])).toBe(false);
    // Substring inside an unrelated word is not a customer reference.
    expect(clean('The organization chart', ['Arga'])).toBe(true);
  });

  it('blocks infrastructure detail', () => {
    expect(clean('The value is read from process.env.SUPABASE_SERVICE_ROLE_KEY.')).toBe(false);
    expect(clean('See src/lib/rag/ingest.ts for how chunks are written.')).toBe(false);
    expect(clean('We store it in the document_chunks table.')).toBe(false);
    expect(clean('It runs as a Vercel cron via QStash.')).toBe(false);
  });

  it('blocks security-work language', () => {
    expect(clean('This closed an IDOR vulnerability in the profile route.')).toBe(false);
    expect(clean('RLS is disabled on that table.')).toBe(false);
    expect(clean('תוקנה פרצת אבטחה בטוקן.')).toBe(false);
  });

  it('reports every violation it found, not just the first', () => {
    const found = findRedactionViolations(
      'Argania hit an RLS bug in document_chunks.',
      ['Argania']
    );
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found.map(v => v.rule)).toContain('forbidden-name');
  });

  it('treats empty and whitespace input as clean', () => {
    expect(clean('')).toBe(true);
    expect(clean('   \n  ')).toBe(true);
  });
});
