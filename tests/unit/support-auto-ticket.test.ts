import { describe, it, expect } from 'vitest';
import {
  alreadyTriedOfficialChannels,
  extractContactDetails,
  assessServiceTurn,
} from '@/lib/support/auto-ticket';

// Every string below is a real customer message from the Argania chat log
// (window 2026-07-21 → 2026-07-27), kept verbatim on purpose.

describe('alreadyTriedOfficialChannels', () => {
  it.each([
    'לא עונים לי',
    'אתם לא עונים השירות לקוחות גם במייל גם בטלפון',
    'אני מנסה לתפוס אתכם מלא זמן',
    'אני מנסה לפנות לשירות לקוחות ללא הצלחה',
    'היי רכשתי מוצרים וקיבלתי מוצרים לא שלי הזמנה של מישהי אחרת שלחתי מייל ואין מענה',
    'קיבלתי הזמנה מלפני יותר משבועיים ולא הגיע לי פריט אחד ואני מנסה להשיג אותכם ואתם לא עונים',
    'היי אני מנסה לתפוס אתכם טלפונית כבר עשרה ימים ואני לא מצליחה',
  ])('detects an exhausted channel: %s', (msg) => {
    expect(alreadyTriedOfficialChannels(msg)).toBe(true);
  });

  it.each([
    'מה מומלץ לעידוד צמיחת השיער?',
    'מתי המשלוח יגיע?',
    'איפה טופס יצירת קשר?',
    'יש משלוח חינם?',
  ])('does not fire when the customer has not tried yet: %s', (msg) => {
    expect(alreadyTriedOfficialChannels(msg)).toBe(false);
  });
});

describe('extractContactDetails', () => {
  it('pulls an Israeli mobile number', () => {
    const c = extractContactDetails('בבקשה תחזרו אליי לפלאפון 0504063896');
    expect(c.phone).toBe('0504063896');
  });

  it('pulls a phone out of a name + address line', () => {
    const c = extractContactDetails('0503222225 לחזור אליי לינור בכר גני תקווה ים המלח 4');
    expect(c.phone).toBe('0503222225');
  });

  it('pulls an email address', () => {
    const c = extractContactDetails('gilibar576@gmail.com');
    expect(c.email).toBe('gilibar576@gmail.com');
  });

  it('pulls a 5-digit order number', () => {
    const c = extractContactDetails('הזמנה מספר 27003 רוצה לדעת מתי אקבל אותה ?');
    expect(c.orderNumber).toBe('27003');
  });

  it('does not mistake the phone for an order number', () => {
    const c = extractContactDetails('0504063896');
    expect(c.phone).toBe('0504063896');
    expect(c.orderNumber).toBeNull();
  });

  it('returns nulls for a product question', () => {
    const c = extractContactDetails('מה מתאים לשיער יבש?');
    expect(c).toEqual({ phone: null, email: null, orderNumber: null });
  });
});

describe('assessServiceTurn', () => {
  const convo = (...msgs: string[]) => msgs.join('\n');

  it('files a ticket when the customer is stuck and left a phone number', () => {
    const r = assessServiceTurn(convo(
      'היי רכשתי מוצרים וקיבלתי מוצרים לא שלי הזמנה של מישהי אחרת שלחתי מייל ואין מענה',
      '0503222225 לחזור אליי לינור בכר גני תקווה ים המלח 4',
    ));
    expect(r.shouldFileTicket).toBe(true);
    expect(r.contact.phone).toBe('0503222225');
    expect(r.suppressContactDeflection).toBe(true);
  });

  it('suppresses the "call us" deflection even with no contact handle yet', () => {
    const r = assessServiceTurn('אתם לא עונים השירות לקוחות גם במייל גם בטלפון');
    expect(r.suppressContactDeflection).toBe(true);
    expect(r.shouldFileTicket).toBe(false);   // nothing to reach them on yet
    expect(r.needsContactHandle).toBe(true);
  });

  it('files a ticket for a damaged delivery once an order number is known', () => {
    const r = assessServiceTurn(convo(
      'הגיעו לי שני מוצרים פגומים',
      'השמפו הגיע מפוצץ והמסיכה חצי ריקה',
      '26960',
    ));
    expect(r.shouldFileTicket).toBe(true);
    expect(r.contact.orderNumber).toBe('26960');
  });

  it('treats a legal threat as urgent', () => {
    const r = assessServiceTurn(
      'לא קיבלנו זיכוי על הזמנה 24140 שבוטלה ב6 ליולי. מעל שבועיים וחצי . אם הכסף לא מועבר אתם עומדים בפני תביעה משפטית.',
    );
    expect(r.shouldFileTicket).toBe(true);
    expect(r.urgent).toBe(true);
  });

  it('stays out of the way for product discovery', () => {
    const r = assessServiceTurn(convo('מה מתאים לשיער מתולתל?', 'לחות והגדרה'));
    expect(r.shouldFileTicket).toBe(false);
    expect(r.suppressContactDeflection).toBe(false);
    expect(r.isServiceIssue).toBe(false);
  });

  it('does not file for a plain delivery-time question', () => {
    const r = assessServiceTurn('כמה זמן לוקח למשלוח להגיע ליעד');
    expect(r.shouldFileTicket).toBe(false);
  });
});
