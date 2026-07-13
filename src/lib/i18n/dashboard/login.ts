// Login page (/influencer/[username]/login).
export const login = {
  he: {
    backToChat: "← חזרה לצ'אט",
    title: 'כניסה לפאנל ניהול',
    passwordLabel: 'סיסמה',
    passwordPlaceholder: 'הזן את הסיסמה שלך',
    signingIn: 'מתחבר...',
    signIn: 'התחבר',
    contactSupport: 'יש בעיה? צור קשר עם התמיכה',
    defaultError: 'שגיאה בהתחברות',
  },
  en: {
    backToChat: '← Back to chat',
    title: 'Sign in to admin panel',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    signingIn: 'Signing in…',
    signIn: 'Sign in',
    contactSupport: 'Trouble signing in? Contact support.',
    defaultError: 'Sign in failed',
  },
} as const;
