import { describe, it, expect } from 'vitest';
import { CS_TEMPLATES, templateBody } from '@/lib/whatsapp-cloud/cs-templates';

describe('CS templates stay UTILITY', () => {
  it('has exactly the three the spec names', () => {
    expect(CS_TEMPLATES.map((t) => t.name).sort())
      .toEqual(['cs_followup', 'cs_human_reply', 'cs_order_update']);
  });

  it('every template is UTILITY with lowercase snake_case names', () => {
    for (const t of CS_TEMPLATES) {
      expect(t.category).toBe('UTILITY');
      expect(t.name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('carries no promotional vocabulary that would get it reclassified to MARKETING', () => {
    const banned = /(מבצע|הנחה|חינם|קנ[הי]|עכשיו בלבד|sale|discount|free|buy now|shop now)/i;
    for (const t of CS_TEMPLATES) {
      for (const lang of ['he', 'en'] as const) {
        expect(templateBody(t, lang).text).not.toMatch(banned);
      }
    }
  });

  it('every {{n}} placeholder has a matching example value, in both languages', () => {
    for (const t of CS_TEMPLATES) {
      for (const lang of ['he', 'en'] as const) {
        const body = templateBody(t, lang);
        const count = new Set(body.text.match(/\{\{\d+\}\}/g) ?? []).size;
        expect(body.example.body_text[0]).toHaveLength(count);
      }
    }
  });

  it('placeholders are numbered from 1 with no gaps — Meta rejects otherwise', () => {
    for (const t of CS_TEMPLATES) {
      for (const lang of ['he', 'en'] as const) {
        const nums = [...templateBody(t, lang).text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
        const unique = [...new Set(nums)].sort((a, b) => a - b);
        expect(unique).toEqual(unique.map((_, i) => i + 1));
      }
    }
  });
});

describe('variables never dominate the body', () => {
  it('keeps Meta\'s variable-to-length ratio in range (error_subcode 2388293)', () => {
    // cs_order_update was rejected live for having 4 variables in one short sentence.
    // Meta does not publish the exact ratio, so this asserts a conservative floor: at least
    // 25 characters of real text per variable.
    for (const t of CS_TEMPLATES) {
      for (const lang of ['he', 'en'] as const) {
        const body = t[lang];
        const vars = (body.text.match(/\{\{\d+\}\}/g) ?? []).length;
        const staticChars = body.text.replace(/\{\{\d+\}\}/g, '').trim().length;
        expect(vars, `${t.name}/${lang} variable count`).toBeLessThanOrEqual(3);
        expect(staticChars / Math.max(vars, 1), `${t.name}/${lang} chars per variable`).toBeGreaterThan(25);
      }
    }
  });
});
