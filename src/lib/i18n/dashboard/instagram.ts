// Instagram control page (/influencer/[username]/instagram).
export const instagram = {
  he: {
    pageTitle: 'אינסטגרם',
    pageSubtitle: 'ניהול הודעות ה-DM והבוט של האינסטגרם',
    loading: 'טוען…',

    // Connection + bot control
    connectedAs: 'מחובר כ-',
    notConnected: 'אין חשבון אינסטגרם מחובר',
    connect: 'חבר/י אינסטגרם',
    connectHint: 'חברו את חשבון האינסטגרם העסקי כדי שהבוט יוכל לענות להודעות DM.',
    disconnect: 'נתק',
    disconnectConfirm: 'לנתק את חשבון האינסטגרם? הבוט יפסיק לענות ל-DM עד לחיבור מחדש.',
    disconnecting: 'מנתק…',
    botSectionTitle: 'תשובות DM אוטומטיות',
    botOn: 'פעיל',
    botOff: 'כבוי',
    botToggleHint: 'כשמופעל, הבוט עונה אוטומטית להודעות DM נכנסות. אפשר לכבות ולענות ידנית בכל רגע.',

    // Inbox
    inboxTitle: 'שיחות',
    threadsEmpty: 'אין עדיין שיחות DM',
    selectThread: 'בחר/י שיחה כדי לקרוא ולהשיב',
    you: 'את/ה',
    bot: 'בוט',
    replyPlaceholder: 'כתוב/י תשובה…',
    sendReply: 'שלח',
    sending: 'שולח…',
    sendError: 'שליחת ההודעה נכשלה',
    outside24h: 'מחוץ לחלון 24 השעות של אינסטגרם — אי אפשר להשיב עד שהלקוח/ה ישלח/תשלח הודעה חדשה',
    flag: 'סמן לטיפול',
    unflag: 'הסר סימון',
    flagged: 'מסומן',

    // Analytics
    analyticsTitle: 'סיכום תגובות',
    statConversations: 'שיחות',
    statBotReplies: 'תשובות בוט',
    statHumanReplies: 'תשובות ידניות',
    statFlagged: 'מסומנות',
  },
  en: {
    pageTitle: 'Instagram',
    pageSubtitle: 'Manage your Instagram DMs and the automated bot',
    loading: 'Loading…',

    // Connection + bot control
    connectedAs: 'Connected as',
    notConnected: 'No Instagram account connected',
    connect: 'Connect Instagram',
    connectHint: 'Connect your Instagram Business account so the bot can reply to DMs.',
    disconnect: 'Disconnect',
    disconnectConfirm: 'Disconnect this Instagram account? The bot will stop replying to DMs until you reconnect.',
    disconnecting: 'Disconnecting…',
    botSectionTitle: 'Automated DM responses',
    botOn: 'On',
    botOff: 'Off',
    botToggleHint: 'When on, the bot replies to incoming DMs automatically. You can turn it off and reply manually at any time.',

    // Inbox
    inboxTitle: 'Conversations',
    threadsEmpty: 'No DM conversations yet',
    selectThread: 'Select a conversation to read and reply',
    you: 'You',
    bot: 'Bot',
    replyPlaceholder: 'Write a reply…',
    sendReply: 'Send',
    sending: 'Sending…',
    sendError: 'Failed to send the message',
    outside24h: 'Outside Instagram’s 24-hour window — you can reply once the customer sends a new message',
    flag: 'Flag for attention',
    unflag: 'Remove flag',
    flagged: 'Flagged',

    // Analytics
    analyticsTitle: 'Response summary',
    statConversations: 'Conversations',
    statBotReplies: 'Bot replies',
    statHumanReplies: 'Manual replies',
    statFlagged: 'Flagged',
  },
} as const;
