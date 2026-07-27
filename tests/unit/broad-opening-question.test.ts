import { describe, it, expect } from 'vitest';
import { isBroadOpeningQuestion } from '@/lib/chatbot/broad-question';

describe('isBroadOpeningQuestion', () => {
  // The four chips that opened 73% of Argania conversations.
  it.each([
    'מה מומלץ לעידוד צמיחת השיער?',
    'מה מתאים לשיער יבש?',
    'מה מתאים לשיער אחרי החלקה?',
    'מה מתאים לשיער מתולתל?',
    'מה מומלץ לשיער שומני?',
    'מה טוב לשיער נפוח?',
  ])('flags the broad category opener: %s', (msg) => {
    expect(isBroadOpeningQuestion(msg, 0)).toBe(true);
  });

  it('does not flag once the conversation is under way', () => {
    expect(isBroadOpeningQuestion('מה מתאים לשיער יבש?', 4)).toBe(false);
  });

  it.each([
    // Already carries the detail a diagnostic question would ask for.
    'היי, אני סובלת מיובש בשיער, השיער שלי מאוד יבש ויש לי הרבה קצוות מפוצלים. בנוסף, יש לי נשירה משמעותית',
    'השיער שלי עבר החלקה וגוונים מה אתם ממליצים?',
    'מה ההבדל בין קיק לקיק זעפרן בחבילות',
    'האם המוצרים טבעוניים?',
    'כמה זמן לוקח למשלוח להגיע ליעד',
    'איפה ההזמנה שלי',
  ])('does not flag a specific or non-product opener: %s', (msg) => {
    expect(isBroadOpeningQuestion(msg, 0)).toBe(false);
  });

  it('ignores an empty message', () => {
    expect(isBroadOpeningQuestion('', 0)).toBe(false);
  });
});
