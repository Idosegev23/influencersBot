/**
 * Chat UI strings — single source of truth for every Hebrew/English label
 * rendered on /chat/[username] and inside the embedded widget UI.
 *
 * Usage in components:
 *   const ui = getChatUiStrings(influencer?.language);
 *   <input placeholder={ui.input.placeholder} />
 *
 * Why centralised: the chat surface is shared by 28 Hebrew accounts and the
 * first English account (IMAI). Per-component i18n drifted — the agent sweep
 * found ~40 Hebrew strings scattered across NavTabs, ChatInput, BrandSupportTab,
 * empty states, and stream handlers. Funnelling them through this file keeps
 * future English (and Arabic, Russian) accounts from missing surfaces.
 */

export type ChatLang = 'he' | 'en';

const STRINGS = {
  he: {
    // --- Top bar / input ---
    input: {
      placeholder: 'משהו שבא לך לשאול?',
      send: 'שלח הודעה',
      disclaimer: 'העמוד עשוי לכלול תוכן שיווקי ושיתופי פעולה מסחריים',
    },

    // --- Loading + empty states ---
    loading: {
      working: 'מתקדמים...',
      content: 'טוען תוכן...',
      submitting: 'שולח...',
    },
    empty: {
      generic: 'אין תוכן להצגה',
      noResults: 'לא נמצאו תוצאות',
      noLists: 'אין רשימות זמינות כרגע',
      noQuestionsYet: 'עדיין אין שאלות השבוע. תהיו הראשונים!',
      noUpdates: 'אין עדכונים כרגע',
      noContentInCategory: 'אין תוכן זמין לקטגוריה זו',
      noContentYet: 'אין תוכן זמין עדיין',
      noProducts: 'לא נמצאו מוצרים',
      noProductsYet: 'אין מוצרים עדיין',
      noServices: 'אין שירותים להצגה',
    },

    // --- Discovery tab ---
    discovery: {
      heading: 'גלו',
      picksByPrefix: 'הבחירות של',
      questionsSectionLabel: 'שאלות שתמיד רציתם לשאול',
    },

    // --- Navigation ---
    back: 'חזרה',
    continue: 'המשך',
    cancel: 'ביטול',
    close: 'סגור',

    // --- Support tab (problem reporting + shipment tracking) ---
    support: {
      sectionHeadings: {
        problemTitle: 'בעיה במוצר',
        shipmentStatus: 'סטטוס משלוח',
        orderStatus: 'סטטוס הזמנה',
      },
      problemTypes: {
        defective: 'מוצר פגום',
        wrong: 'מוצר שגוי',
        shipping: 'בעיית משלוח',
        coupon: 'בעיה בקופון',
        payment: 'בעיה בתשלום',
        quality: 'איכות מוצר',
        other: 'אחר',
      },
      validation: {
        enterOrderNumber: 'נא להזין מספר הזמנה',
        digitsOnly: 'המספר צריך להכיל ספרות בלבד',
        connectionError: 'אירעה שגיאה בחיבור לשירות המשלוחים',
        requiredFields: 'נא למלא את כל השדות החובה',
        submitError: 'שגיאה בשליחת הפנייה',
      },
      placeholders: {
        orderNumberHint: 'הזיני את מספר ההזמנה מאישור הרכישה',
        orderNumber: 'מספר הזמנה',
        fullName: 'השם המלא...',
        orderNumberInput: 'מספר הזמנה...',
        problemDetails: 'תארי את הבעיה...',
      },
      labels: {
        fullName: 'שם מלא',
        phone: 'מספר נייד',
        orderNumber: 'מספר הזמנה',
        problemDetails: 'פירוט הבעיה',
        shipmentNumber: 'מספר משלוח',
      },
      buttons: {
        checkStatus: 'בדיקת סטטוס',
      },
      tracking: {
        notFoundTitle: 'לא נמצא',
        notFoundDetails: 'ההזמנה הזו עדיין לא נמצאה במערכת השילוח',
        delivered: 'נמסר',
        returnedToBranch: 'הוחזר לסניף',
        cancelled: 'בוטל',
      },
    },

    // --- Recipe / content feed (won't render for b2b_saas, kept for parity) ---
    recipe: {
      ingredients: 'מרכיבים',
      preparation: 'אופן הכנה',
      instructions: 'הוראות הכנה',
      steps: 'שלבי הכנה',
    },

    // --- Generic error / fallback strings used inside streams ---
    streamErrors: {
      emptyMessage: 'הודעה ריקה',
      invalidUsername: 'שם משתמש לא תקין',
      accountNotFound: 'המשפיען לא נמצא',
      processingRetry: 'הבקשה בעיבוד, נסה שוב בעוד רגע',
      rateLimit: 'אופס, יותר מדי הודעות ברגע 😅 נסה שוב עוד כמה שניות!',
      timeout: 'לקח לי יותר מדי זמן לענות 😊 אפשר לנסות שוב? אולי תנסח/י את השאלה קצת אחרת',
      generic: 'אופס, משהו השתבש אצלי 😅 נסה לשלוח שוב או לנסח את השאלה אחרת',
      streamRetry: 'אופס, משהו השתבש. נסה לשלוח שוב',
      botFallback: 'מצטער, משהו השתבש. נסה שוב!',
    },
  },

  en: {
    // --- Top bar / input ---
    input: {
      placeholder: 'Ask me anything…',
      send: 'Send message',
      disclaimer: 'This page may include marketing content and commercial partnerships',
    },

    // --- Loading + empty states ---
    loading: {
      working: 'Working on it…',
      content: 'Loading…',
      submitting: 'Sending…',
    },
    empty: {
      generic: 'Nothing to show yet',
      noResults: 'No results found',
      noLists: 'No lists available yet',
      noQuestionsYet: "No questions yet this week. Be the first!",
      noUpdates: 'No updates right now',
      noContentInCategory: 'No content available for this category',
      noContentYet: 'No content available yet',
      noProducts: 'No products found',
      noProductsYet: 'No products yet',
      noServices: 'No services to show',
    },

    // --- Discovery tab ---
    discovery: {
      heading: 'Discover',
      picksByPrefix: 'Picks by',
      questionsSectionLabel: 'Questions you always wanted to ask',
    },

    // --- Navigation ---
    back: 'Back',
    continue: 'Continue',
    cancel: 'Cancel',
    close: 'Close',

    // --- Support tab ---
    support: {
      sectionHeadings: {
        problemTitle: 'Get support',
        shipmentStatus: 'Shipment status',
        orderStatus: 'Order status',
      },
      problemTypes: {
        defective: 'Defective item',
        wrong: 'Wrong item',
        shipping: 'Shipping issue',
        coupon: 'Coupon issue',
        payment: 'Payment issue',
        quality: 'Product quality',
        other: 'Other',
      },
      validation: {
        enterOrderNumber: 'Please enter an order number',
        digitsOnly: 'Number must contain digits only',
        connectionError: 'Could not connect to the shipping service',
        requiredFields: 'Please fill in all required fields',
        submitError: 'Error submitting your request',
      },
      placeholders: {
        orderNumberHint: 'Enter the order number from your purchase confirmation',
        orderNumber: 'Order number',
        fullName: 'Your full name…',
        orderNumberInput: 'Order number…',
        problemDetails: 'Describe the issue…',
      },
      labels: {
        fullName: 'Full name',
        phone: 'Phone number',
        orderNumber: 'Order number',
        problemDetails: 'Issue details',
        shipmentNumber: 'Tracking number',
      },
      buttons: {
        checkStatus: 'Check status',
      },
      tracking: {
        notFoundTitle: 'Not found',
        notFoundDetails: "We couldn't find this order in the shipping system yet",
        delivered: 'Delivered',
        returnedToBranch: 'Returned to branch',
        cancelled: 'Cancelled',
      },
    },

    // --- Recipe / content feed ---
    recipe: {
      ingredients: 'Ingredients',
      preparation: 'Preparation',
      instructions: 'Instructions',
      steps: 'Steps',
    },

    // --- Generic error / fallback strings used inside streams ---
    streamErrors: {
      emptyMessage: 'Empty message',
      invalidUsername: 'Invalid username',
      accountNotFound: 'Account not found',
      processingRetry: 'Your request is processing. Please try again in a moment.',
      rateLimit: 'Whoa, too many messages at once 😅 Try again in a few seconds!',
      timeout: "That took longer than expected 😊 Want to try again? Maybe rephrase the question slightly.",
      generic: 'Something went wrong on my side 😅 Please try sending again or rephrase your question.',
      streamRetry: 'Something went wrong. Please try sending again.',
      botFallback: 'Sorry, something went wrong. Try again!',
    },
  },
} as const;

export type ChatUiStrings = typeof STRINGS.he;

/**
 * Resolve the i18n bundle for a given account language. Anything other than
 * 'en' falls back to Hebrew so existing accounts behave identically.
 */
export function getChatUiStrings(lang: string | null | undefined): ChatUiStrings {
  const key = (lang || 'he').toLowerCase() === 'en' ? 'en' : 'he';
  // The two bundles have the same shape; the literal-string types diverge,
  // so we erase down to the structural shape (ChatUiStrings = he's shape).
  return STRINGS[key] as unknown as ChatUiStrings;
}

/**
 * Convenience: pick the LTR vs RTL layout direction for a given language.
 */
export function dirForLang(lang: string | null | undefined): 'ltr' | 'rtl' {
  return (lang || 'he').toLowerCase() === 'en' ? 'ltr' : 'rtl';
}
