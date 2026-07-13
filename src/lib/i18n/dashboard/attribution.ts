// Attribution page.
export const attribution = {
  he: {
    // Nav / breadcrumb label (shared).
    pageTitle: 'שיוך',
    pageSubtitle: 'מאיפה הגיעו המבקרים',
    empty: 'אין עדיין נתוני שיוך',

    // Header
    backToDashboard: 'חזרה לדשבורד',
    title: 'Attribution — לפי משפיענית',
    subtitle: 'ניתוח של תנועה, פניות והעתקות קופון לפי המקור שהביא את הלקוחה',

    // Range selector
    rangeLabel: 'טווח:',
    days7: '7 ימים',
    days14: '14 ימים',
    days30: '30 יום',
    days60: '60 יום',
    days90: '90 יום',

    // States
    errorLoading: 'שגיאה בטעינת הנתונים:',
    emptyRange: 'אין נתונים בתקופה זו',

    // Summary cards
    cardClicks: 'קליקים (ביקורים)',
    uniqueSuffix: 'ייחודיים',
    cardSessions: "סשני צ'אט",
    conversionSuffix: 'המרה',
    cardTickets: 'פניות תמיכה',
    inRange: 'בתקופה',
    cardCouponCopies: 'העתקות קופון',
    allTimeTotal: 'סך הכל היסטורי',

    // Breakdown table
    breakdownTitle: 'פירוט לפי מקור',
    colSource: 'משפיענית / מקור',
    colClicks: 'קליקים',
    colUnique: 'ייחודיים',
    colSessions: 'סשנים',
    colConversion: '% המרה',
    colTickets: 'פניות',
    colCouponCopies: 'קופון הועתק',
    colShareLink: 'לינק לשיתוף',
    copied: 'הועתק',

    // How-it-works note (rendered around a <code> and <u> element)
    howItWorksLead: 'איך זה עובד? כל משפיענית מקבלת לינק עם ',
    refPlaceholder: 'שם',
    howItWorksTail: '. ברגע שלקוחה נכנסת דרך הלינק — הסשן + כל הפניות שלה משויכים למשפיענית הזו, גם אם תרענן או תשוב מאוחר יותר.',
    importantLabel: 'חשוב:',
    importantLead: 'ה-Attribution קובע ',
    importantEmphasis: 'איך הגיעו',
    importantTail: ' אל הבוט, לא איזה קוד הועתק. עמודת "העתקות קופון" היא ספירה גלובלית של כמה פעמים הקוד הועתק (ללא קשר למקור הסשן).',
  },
  en: {
    // Nav / breadcrumb label (shared).
    pageTitle: 'Attribution',
    pageSubtitle: 'Where your visitors came from',
    empty: 'No attribution data yet',

    // Header
    backToDashboard: 'Back to dashboard',
    title: 'Attribution — by creator',
    subtitle: 'Traffic, requests and coupon copies broken down by the source that brought the visitor.',

    // Range selector
    rangeLabel: 'Range:',
    days7: '7 days',
    days14: '14 days',
    days30: '30 days',
    days60: '60 days',
    days90: '90 days',

    // States
    errorLoading: 'Error loading data:',
    emptyRange: 'No data in this range',

    // Summary cards
    cardClicks: 'Clicks (visits)',
    uniqueSuffix: 'unique',
    cardSessions: 'Chat sessions',
    conversionSuffix: 'conversion',
    cardTickets: 'Support tickets',
    inRange: 'In range',
    cardCouponCopies: 'Coupon copies',
    allTimeTotal: 'All-time total',

    // Breakdown table
    breakdownTitle: 'Breakdown by source',
    colSource: 'Creator / source',
    colClicks: 'Clicks',
    colUnique: 'Unique',
    colSessions: 'Sessions',
    colConversion: '% conv.',
    colTickets: 'Tickets',
    colCouponCopies: 'Coupon copies',
    colShareLink: 'Share link',
    copied: 'Copied',

    // How-it-works note (rendered around a <code> and <u> element)
    howItWorksLead: 'How it works: each creator gets a link with ',
    refPlaceholder: 'name',
    howItWorksTail: '. The moment a visitor arrives through that link, the session and every ticket they open are attributed to that creator — even on refresh or a later return.',
    importantLabel: 'Important:',
    importantLead: 'Attribution captures ',
    importantEmphasis: 'how',
    importantTail: ' visitors arrived at the bot, not which code was copied. The “Coupon copies” column is a global tally of how many times the code was copied (regardless of session source).',
  },
} as const;
