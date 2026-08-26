import { describe, it, expect } from 'vitest';
import { outputLanguageDirective } from '@/lib/chatbot/archetypes/output-language';

/**
 * Regression: only the English side ever had an output-language directive
 * (`isEnglish ? LANG_DIRECTIVE_EN : ''`). A Hebrew account had NOTHING pinning
 * the output language, so once an English turn entered a thread the model stayed
 * in English with nothing to pull it back.
 *
 * On ldrs_group (`accounts.language = 'he'`) that is exactly what happened:
 * 2026-07-27 "היי" → "Hey, how's it going? ✨", and on 2026-08-13 a brand wrote
 * five consecutive Hebrew messages ("היי אנחנו מותג אופנה…", "מחר", "מכירות")
 * and every reply, including the one that collected the lead, came back in
 * English.
 */
describe('outputLanguageDirective', () => {
  it('pins Hebrew output for a Hebrew account — the case that was missing entirely', () => {
    const d = outputLanguageDirective('he');
    expect(d).toBeTruthy();
    expect(d).toContain('עברית');
    // It has to survive an English turn already sitting in the history.
    expect(d.toLowerCase()).toContain('english');
  });

  it('pins English output for an English account, as before', () => {
    const d = outputLanguageDirective('en');
    expect(d).toBeTruthy();
    expect(d).toContain('English');
    expect(d).not.toContain('עברית');
  });

  it('treats a missing / unknown language as Hebrew — the product default', () => {
    for (const lang of [undefined, null, '', 'HE', ' he ']) {
      expect(outputLanguageDirective(lang as any)).toBe(outputLanguageDirective('he'));
    }
  });

  it('never emits both directives at once', () => {
    for (const lang of ['he', 'en', undefined]) {
      const d = outputLanguageDirective(lang as any);
      const pinsHebrew = d.includes('עברית');
      const pinsEnglish = /ONLY in English/i.test(d);
      expect(pinsHebrew && pinsEnglish).toBe(false);
    }
  });

  it('leaves the structural tags literal in both languages', () => {
    for (const lang of ['he', 'en']) {
      expect(outputLanguageDirective(lang)).toContain('<<SUGGESTIONS>>');
    }
  });
});
