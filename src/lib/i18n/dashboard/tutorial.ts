// First-run dashboard tutorial (shown once for a freshly-onboarded account).
export const tutorial = {
  he: {
    skip: 'דלג',
    back: 'הקודם',
    next: 'הבא',
    finish: 'יאללה, מתחילים! 🚀',
    steps: [
      { title: 'החשבון שלך מוכן! 🎉', body: 'בנינו לך עוזר AI חכם שסרק את כל התוכן שלך. בוא נעשה סיבוב קצר של 20 שניות.' },
      { title: 'הדשבורד', body: 'כאן רואים את כל הנתונים שלך — עוקבים, engagement, הפוסטים האחרונים והביצועים.' },
      { title: 'אינסטגרם', body: 'בטאב אינסטגרם מנהלים את ה-DM: מדליקים/מכבים את הבוט, קוראים שיחות ועונים ידנית מתי שרוצים.' },
      { title: 'אנליטיקס ושיחות', body: 'רואים על מה הלקוחות מדברים, כמה שיחות היו, וכמה הבוט חסך לך זמן.' },
    ],
  },
  en: {
    skip: 'Skip',
    back: 'Back',
    next: 'Next',
    finish: "Let's go! 🚀",
    steps: [
      { title: 'Your account is ready! 🎉', body: 'We built you a smart AI assistant that scanned all your content. Let’s take a quick 20-second tour.' },
      { title: 'Dashboard', body: 'This is where all your numbers live — followers, engagement, recent posts and performance.' },
      { title: 'Instagram', body: 'The Instagram tab manages your DMs: turn the bot on/off, read conversations and reply manually whenever you want.' },
      { title: 'Analytics & conversations', body: 'See what customers talk about, how many conversations came in, and how much time the bot saved you.' },
    ],
  },
} as const;
