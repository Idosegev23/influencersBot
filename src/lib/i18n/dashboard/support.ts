// Support inbox page.
export const support = {
  he: {
    pageTitle: 'פניות תמיכה',
    pageSubtitle: 'נהל/י את הפניות שהתקבלו מהבוט',
    empty: 'אין פניות עדיין',
    emptySub: 'כשמגיעות פניות מהווידג\'ט הן יופיעו כאן.',
    newest: 'חדש',
    oldest: 'ישן',
    searchPlaceholder: 'חיפוש לפי שם, חברה או נושא…',
    filterAll: 'הכל',
    statusNew: 'חדש',
    statusOpen: 'פתוח',
    statusInProgress: 'בעבודה',
    statusAwaitingCustomer: 'ממתין ללקוח',
    statusResolved: 'נפתר',
    statusClosed: 'סגור',
    statusCancelled: 'בוטל',
    sourceDemo: 'בקשת דמו',
    sourceSupport: 'תמיכה',
    sourceBrand: 'פנייה למותג',
    sourceFollower: 'אישור עוקב',
    sourceUnspecified: 'כללי',
    colCustomer: 'לקוח',
    colCompany: 'חברה',
    colSubject: 'נושא',
    colSource: 'מקור',
    colStatus: 'סטטוס',
    colReceived: 'התקבל',
    actionReply: 'השב',
    actionResolve: 'סמן כנפתר',
    actionReopen: 'פתח מחדש',
    actionViewDetails: 'פרטים',
    detailEmail: 'אימייל',
    detailPhone: 'טלפון',
    detailCompany: 'חברה',
    detailIssueType: 'סוג פנייה',
    detailTeamSize: 'גודל צוות',
    detailOrderNumber: 'מספר הזמנה',
    detailCreatedAt: 'נוצר',
    detailMessage: 'הודעה',
    replyPlaceholder: 'כתוב/י תשובה ללקוח…',
    replySend: 'שלח תשובה',
    replySending: 'שולח…',
    replySuccess: 'התשובה נשלחה',
    issueBug: 'באג',
    issueIntegration: 'אינטגרציה',
    issueBilling: 'חיוב',
    issueAccount: 'חשבון',
    issueFeature: 'בקשת פיצ\'ר',
    issueOther: 'אחר',

    // Agent header bar
    agentLoggedInAs: 'מחובר/ת כ:',
    adminBadge: 'אדמין',
    analyticsBtn: 'אנליטיקה',
    logout: 'התנתק',

    // Header actions
    dateFilterTooltip: 'סינון לפי תאריך',
    dateFilterActive: 'סינון פעיל',
    dateFilterLabel: 'תאריכים',
    exportTooltip: 'ייצוא לאקסל',
    exportBtn: 'ייצא לאקסל',
    exportFailed: 'הייצוא נכשל — נסי שוב',

    // Owner filters
    ownerAll: 'כל הפניות',
    ownerMine: 'בטיפולי',
    ownerUnassigned: 'ללא מטפל/ת',

    // Feedback filters
    feedbackFilterAll: 'כל הפידבקים',
    feedbackFilterIssue: '⚠ בעיה דווחה',
    feedbackFilterPositive: '✓ פידבק חיובי',
    feedbackFilterPending: '⏳ ממתינות לפידבק',

    // Date filter row
    dateFromLabel: 'מתאריך:',
    dateToLabel: 'עד:',
    clearDates: 'נקה תאריכים',
    dateFilterExportNote: 'הסינון משפיע גם על הייצוא לאקסל.',

    // Search
    clearSearch: 'נקה',

    // Empty / select states
    emptyForStatus: 'אין פניות בסטטוס הזה',
    selectTicketHint: 'בחר פנייה לצפייה בפרטים ולעדכון',

    // Ticket detail header
    receivedPrefix: 'התקבלה',

    // Feedback badge
    feedbackBadgePositive: '✓ פידבק חיובי מהלקוחה',
    feedbackBadgeIssue: '⚠ הלקוחה דיווחה על בעיה',
    feedbackBadgePending: '⏳ ממתין לפידבק לקוחה',
    feedbackBadgeExpired: '⏱ חלון הפידבק פג',
    feedbackRespondedPrefix: 'הגיב/ה',
    feedbackSentPrefix: 'נשלח',

    // Assignee row
    assigneeLabel: 'מטפל/ת:',
    assigneeThatsMe: 'זה אני',
    assigneeUnassigned: 'ללא מטפל/ת',
    assignPull: 'משיכה אליי',
    assignPullCurrently: 'כרגע אצל',
    someoneElse: 'מישהו אחר',
    assignToMe: 'הקצה אליי',
    assignRelease: 'שחרר/י',

    // Customer block
    orderLabel: 'הזמנה:',
    brandLabel: 'מותג:',
    arrivedVia: '↗ הגיעה דרך:',

    // Original message
    originalMessage: 'הודעה מקורית',

    // Status actions
    changeStatus: 'שינוי סטטוס',

    // WhatsApp customer-update block
    waSectionTitle: 'שליחת עדכון ללקוחה (WhatsApp)',
    waNotifyInProgress: 'התחלנו לטפל',
    waNotifyAwaiting: 'צריכים פרטים',
    waNotifyShipped: 'יצא למשלוח',
    waNotifyResolved: 'הפנייה טופלה',
    waNoPhone: 'אין מספר טלפון בפנייה — אי אפשר לשלוח עדכון WhatsApp.',
    waLastUpdatePrefix: 'עדכון אחרון נשלח ללקוחה:',

    // Direct message block
    directTitle: 'שיחה ישירה ללקוחה',
    windowOpen: '✓ חלון 24 שעות פתוח',
    windowCloses: 'נסגר',
    windowClosed: 'חלון 24 שעות סגור',
    windowChecking: 'בודק חלון…',
    windowClosedNote: 'הלקוחה לא הגיבה ב-24 שעות האחרונות — ההודעה תישלח כתבנית WhatsApp (עד 900 תווים).',
    windowLastInboundPrefix: 'תגובה אחרונה ממנה:',
    directPlaceholderOpen: 'הודעה חופשית ללקוחה',
    directPlaceholderClosed: 'הודעה ללקוחה (תישלח כתבנית WhatsApp — עד 900 תווים)',
    directSend: 'שליחה',
    directSendAsTemplate: 'שליחה כתבנית',
    imagePick: 'בחירת תמונה',
    imageCancel: 'ביטול',
    imageCaptionPlaceholder: 'כיתוב לתמונה (אופציונלי)',
    imageSend: 'שליחת תמונה',
    imageTooLarge: 'הקובץ גדול מ-10MB',

    // Editable details
    internalNotesLabel: 'הערות פנימיות (לא מוצגות ללקוחה)',
    internalNotesPlaceholder: 'פרטי טיפול, נציג שטיפל, החלטות...',
    focusTrackingLabel: 'מספר משלוח Focus (אופציונלי — אם קיבלת מערוץ אחר)',
    resolutionSummaryLabel: 'סיכום הטיפול',
    resolutionSummaryPlaceholder: 'מה נעשה לסגירת הפנייה (יוצג ללקוחה אם תשלחי הודעת WhatsApp \'הפנייה טופלה\')',
    saveDetails: 'שמירה',

    // History
    historyTitle: 'היסטוריה ושיחה',
    historyNewReply: 'תגובה חדשה',
    historySentToCustomer: 'נשלח ללקוחה',
    attachmentPrefix: 'קובץ מצורף:',
    attachmentFallback: 'קובץ',

    // Danger zone
    dangerZone: 'אזור מסוכן',
    dangerZoneNote: ' — מחיקה לחלוטין כולל היסטוריה וקבצים. לא הפיך.',
    deleteTicket: 'מחיקת פנייה',
    deleteConfirm: 'למחוק את הפנייה לחלוטין?\n\nכולל היסטוריית השיחה, ההערות הפנימיות, וכל הקבצים שהועלו. פעולה לא הפיכה.',
    deleteFailed: 'מחיקה נכשלה:',

    // Toasts
    sendFailed: 'שליחה נכשלה:',
    genericError: 'שגיאה',
    messageTooLong: 'הודעה ארוכה מדי — מקסימום 900 תווים, נשלחו',
    moveFailed: 'העברה נכשלה:',

    // Focus shipment card
    focusNoOrder: 'אין מספר הזמנה בפנייה — אי אפשר לאתר משלוח אוטומטית.',
    focusLoadingPrefix: 'מאתר ב-Focus לפי הזמנה',
    focusLoadingSub: 'מאחזר את מספר המשלוח האמיתי וסטטוס מהמערכת של חברת השילוח.',
    focusPendingTitle: 'ההזמנה עדיין לא יצאה למשלוח',
    focusPendingSubA: 'Focus עוד לא קיבלו את הזמנה',
    focusPendingSubB: '. ברגע שהיא תצא — מספר המשלוח יופיע כאן אוטומטית.',
    focusRetryTooltip: 'נסי שוב',
    focusErrorTitle: 'שגיאה בקבלת סטטוס המשלוח מ-Focus',
    focusErrorSub: 'לחיצה על Refresh תנסה שוב.',
    focusShipmentNumberLabel: 'מספר משלוח Focus',
    focusCopyTooltip: 'העתק',
    focusOrderPrefix: 'הזמנה',
    focusAutoResolved: '↻ אותר אוטומטית',
    focusRefreshTooltip: 'רענן',
    focusDestBranch: 'סניף יעד',
    focusLastUpdate: 'עדכון אחרון',
    focusDeliveryType: 'סוג מסירה',

    // Pagination
    paginationOf: 'מתוך',
    paginationPrev: '← הקודם',
    paginationNext: 'הבא →',

    // Ambiguity banner
    ambiguityText: 'זיהוי אוטומטי — באותו חלון נשלחה הודעה גם למותג אחר. אם התגובה לא לטיקט הנוכחי, אפשר להעביר:',
    ambiguityBrandFallback: 'מותג',
    ambiguityCustomerFallback: 'לקוחה',

    // History line labels
    historyStatusPrefix: 'סטטוס:',
    historyNoteUpdated: 'הערה פנימית עודכנה',
    historyAutoAssigned: '🤖 הקצאה אוטומטית:',
    historyAssignedTo: 'הוקצה ל:',
    historySendAttemptFailed: 'ניסיון שליחה נכשל',
    historyMsgToCustomer: 'הודעה ללקוחה:',
    historyMsgFallback: 'הודעה',
    historyCustomerReply: 'תגובת הלקוחה',
    historyReplyMovedOut: 'תגובה הועברה לטיקט אחר',
    historyReplyMovedIn: 'תגובה התקבלה מטיקט אחר',
    historyBrandAlertFailed: 'התראה למותג נכשלה',
    historyBrandAlertSent: 'התראת WhatsApp נשלחה למותג',
    historyAgentMsgFailed: 'ניסיון שליחת הודעה חופשית נכשל',
    historyAgentMsg: 'הודעה חופשית ללקוחה',
    historyAgentImgFailed: 'ניסיון שליחת תמונה נכשל',
    historyAgentImg: 'תמונה ללקוחה',
    historyFeedbackPositive: '✓ הלקוחה: הכל מצוין',
    historyFeedbackGeneric: 'פידבק לקוחה',

    // Template friendly names (customer_notified history)
    tmplInProgress: 'התחלנו לטפל',
    tmplAwaiting: 'בקשה לפרטים נוספים',
    tmplShipped: 'יצא למשלוח',
    tmplResolved: 'הפנייה טופלה',
    tmplFreeform: 'הודעה חופשית',
    tmplFollowerConfirm: 'אישור פתיחת פנייה ללקוחה',
    tmplBrandAlert: 'התראה למותג',

    // Shipment event labels
    shipDispatched: 'נקלט אצל חברת השליחויות',
    shipInTransit: 'בדרך אל הלקוחה',
    shipAtBranch: 'הגיע לסניף',
    shipOutForDelivery: 'יצא למסירה אחרונה',
    shipDelivered: 'נמסר ללקוחה ✓',
    shipReturned: 'הוחזר',
    shipCancelled: 'בוטל',
    shipFailedDelivery: 'מסירה נכשלה',
    shipUnknown: 'עדכון משלוח',

    // Send dialog (WhatsApp template composer)
    sendDialogTitle: 'שליחת הודעת WhatsApp ללקוחה',
    sendWhichDetail: 'איזה פרט חסר?',
    sendDetailPlaceholder: 'לדוגמה: תמונה של המוצר הפגום',
    sendReplacementLabel: 'שם המוצר החלופי שנשלח',
    sendReplacementPlaceholder: 'לדוגמה: סרום INTENSIVE 100ml',
    sendEtaLabel: 'זמן הגעה משוער',
    sendEta35Days: 'תוך 3-5 ימי עסקים',
    sendEtaThisWeek: 'השבוע',
    sendEtaTomorrow: 'מחר',
    sendEta24h: 'תוך 24 שעות',
    sendTrackingLabel: 'מספר משלוח Focus',
    sendTrackingResolving: 'מאתר ב-Focus...',
    sendTrackingPlaceholder: 'מאתר...',
    sendTrackingNotFound: 'לא נמצא מספר משלוח אוטומטית — ייתכן שההזמנה עוד לא יצאה. אפשר להזין ידנית.',
    sendResolutionLabel: 'סיכום הטיפול',
    sendResolutionPlaceholder: 'פירוט מלא של מה שנעשה כדי לסגור את הפנייה — כל הפרטים שהלקוחה צריכה לראות',
    sendResolutionDefault: 'הטיפול הושלם.',
    sendPreviewLabel: 'תצוגה מקדימה (כפי שיראה הלקוחה)',
    sendWillBeSentTo: 'ההודעה תישלח ל-',
    sendCancel: 'ביטול',
    sendButton: 'שלח',
    sendCustomerFallback: 'לקוחה',
    sendBrandFallback: 'המותג',
  },
  en: {
    pageTitle: 'Support Tickets',
    pageSubtitle: 'Manage requests coming in from the bot.',
    empty: 'No tickets yet',
    emptySub: 'When visitors submit a ticket from the widget, it will appear here.',
    newest: 'Newest',
    oldest: 'Oldest',
    searchPlaceholder: 'Search by name, company, or subject…',
    filterAll: 'All',
    statusNew: 'New',
    statusOpen: 'Open',
    statusInProgress: 'In progress',
    statusAwaitingCustomer: 'Awaiting customer',
    statusResolved: 'Resolved',
    statusClosed: 'Closed',
    statusCancelled: 'Cancelled',
    sourceDemo: 'Demo request',
    sourceSupport: 'Support',
    sourceBrand: 'Brand contact',
    sourceFollower: 'Follower confirmation',
    sourceUnspecified: 'General',
    colCustomer: 'Customer',
    colCompany: 'Company',
    colSubject: 'Subject',
    colSource: 'Source',
    colStatus: 'Status',
    colReceived: 'Received',
    actionReply: 'Reply',
    actionResolve: 'Mark resolved',
    actionReopen: 'Reopen',
    actionViewDetails: 'Details',
    detailEmail: 'Email',
    detailPhone: 'Phone',
    detailCompany: 'Company',
    detailIssueType: 'Issue type',
    detailTeamSize: 'Team size',
    detailOrderNumber: 'Order #',
    detailCreatedAt: 'Created',
    detailMessage: 'Message',
    replyPlaceholder: 'Write a reply to the customer…',
    replySend: 'Send reply',
    replySending: 'Sending…',
    replySuccess: 'Reply sent',
    issueBug: 'Bug',
    issueIntegration: 'Integration',
    issueBilling: 'Billing',
    issueAccount: 'Account',
    issueFeature: 'Feature request',
    issueOther: 'Other',

    // Agent header bar
    agentLoggedInAs: 'Signed in as:',
    adminBadge: 'Admin',
    analyticsBtn: 'Analytics',
    logout: 'Log out',

    // Header actions
    dateFilterTooltip: 'Filter by date',
    dateFilterActive: 'Filter active',
    dateFilterLabel: 'Dates',
    exportTooltip: 'Export to Excel',
    exportBtn: 'Export to Excel',
    exportFailed: 'Export failed — please try again',

    // Owner filters
    ownerAll: 'All tickets',
    ownerMine: 'Assigned to me',
    ownerUnassigned: 'Unassigned',

    // Feedback filters
    feedbackFilterAll: 'All feedback',
    feedbackFilterIssue: '⚠ Issue reported',
    feedbackFilterPositive: '✓ Positive feedback',
    feedbackFilterPending: '⏳ Awaiting feedback',

    // Date filter row
    dateFromLabel: 'From:',
    dateToLabel: 'To:',
    clearDates: 'Clear dates',
    dateFilterExportNote: 'This filter also applies to the Excel export.',

    // Search
    clearSearch: 'Clear',

    // Empty / select states
    emptyForStatus: 'No tickets with this status',
    selectTicketHint: 'Select a ticket to view its details and update it',

    // Ticket detail header
    receivedPrefix: 'Received',

    // Feedback badge
    feedbackBadgePositive: '✓ Positive feedback from the customer',
    feedbackBadgeIssue: '⚠ The customer reported an issue',
    feedbackBadgePending: '⏳ Awaiting customer feedback',
    feedbackBadgeExpired: '⏱ Feedback window expired',
    feedbackRespondedPrefix: 'Responded',
    feedbackSentPrefix: 'Sent',

    // Assignee row
    assigneeLabel: 'Assigned to:',
    assigneeThatsMe: "That's me",
    assigneeUnassigned: 'Unassigned',
    assignPull: 'Take over',
    assignPullCurrently: 'currently with',
    someoneElse: 'someone else',
    assignToMe: 'Assign to me',
    assignRelease: 'Release',

    // Customer block
    orderLabel: 'Order:',
    brandLabel: 'Brand:',
    arrivedVia: '↗ Came in via:',

    // Original message
    originalMessage: 'Original message',

    // Status actions
    changeStatus: 'Change status',

    // WhatsApp customer-update block
    waSectionTitle: 'Send a customer update (WhatsApp)',
    waNotifyInProgress: "We're on it",
    waNotifyAwaiting: 'Need details',
    waNotifyShipped: 'Shipped',
    waNotifyResolved: 'Ticket resolved',
    waNoPhone: 'No phone number on this ticket — WhatsApp updates cannot be sent.',
    waLastUpdatePrefix: 'Last update sent to the customer:',

    // Direct message block
    directTitle: 'Direct chat with the customer',
    windowOpen: '✓ 24-hour window open',
    windowCloses: 'closes',
    windowClosed: '24-hour window closed',
    windowChecking: 'Checking window…',
    windowClosedNote: "The customer hasn't replied in the last 24 hours — your message will be sent as a WhatsApp template (up to 900 characters).",
    windowLastInboundPrefix: 'Their last reply:',
    directPlaceholderOpen: 'Free-form message to the customer',
    directPlaceholderClosed: 'Message to the customer (sent as a WhatsApp template — up to 900 characters)',
    directSend: 'Send',
    directSendAsTemplate: 'Send as template',
    imagePick: 'Choose image',
    imageCancel: 'Cancel',
    imageCaptionPlaceholder: 'Image caption (optional)',
    imageSend: 'Send image',
    imageTooLarge: 'File is larger than 10MB',

    // Editable details
    internalNotesLabel: 'Internal notes (not shown to the customer)',
    internalNotesPlaceholder: 'Handling details, who handled it, decisions…',
    focusTrackingLabel: 'Focus tracking number (optional — if you got it another way)',
    resolutionSummaryLabel: 'Resolution summary',
    resolutionSummaryPlaceholder: "What was done to close the ticket (shown to the customer if you send the 'Ticket resolved' WhatsApp message)",
    saveDetails: 'Save',

    // History
    historyTitle: 'History & conversation',
    historyNewReply: 'New reply',
    historySentToCustomer: 'Sent to customer',
    attachmentPrefix: 'Attachment:',
    attachmentFallback: 'file',

    // Danger zone
    dangerZone: 'Danger zone',
    dangerZoneNote: ' — permanently deletes the ticket, including history and files. This cannot be undone.',
    deleteTicket: 'Delete ticket',
    deleteConfirm: 'Delete this ticket permanently?\n\nThis includes the conversation history, internal notes, and any uploaded files. This action cannot be undone.',
    deleteFailed: 'Delete failed:',

    // Toasts
    sendFailed: 'Send failed:',
    genericError: 'Something went wrong',
    messageTooLong: 'Message too long — 900 characters max, you entered',
    moveFailed: 'Move failed:',

    // Focus shipment card
    focusNoOrder: 'No order number on this ticket — a shipment cannot be located automatically.',
    focusLoadingPrefix: 'Looking up in Focus for order',
    focusLoadingSub: 'Fetching the real shipment number and status from the carrier system.',
    focusPendingTitle: 'The order has not shipped yet',
    focusPendingSubA: "Focus hasn't received order",
    focusPendingSubB: '. As soon as it ships, the shipment number will appear here automatically.',
    focusRetryTooltip: 'Try again',
    focusErrorTitle: 'Error getting shipment status from Focus',
    focusErrorSub: 'Click Refresh to try again.',
    focusShipmentNumberLabel: 'Focus shipment number',
    focusCopyTooltip: 'Copy',
    focusOrderPrefix: 'Order',
    focusAutoResolved: '↻ auto-resolved',
    focusRefreshTooltip: 'Refresh',
    focusDestBranch: 'Destination branch',
    focusLastUpdate: 'Last update',
    focusDeliveryType: 'Delivery type',

    // Pagination
    paginationOf: 'of',
    paginationPrev: '← Previous',
    paginationNext: 'Next →',

    // Ambiguity banner
    ambiguityText: "Auto-detected — another brand also messaged this number in the same window. If this reply isn't for the current ticket, you can move it:",
    ambiguityBrandFallback: 'Brand',
    ambiguityCustomerFallback: 'Customer',

    // History line labels
    historyStatusPrefix: 'Status:',
    historyNoteUpdated: 'Internal note updated',
    historyAutoAssigned: '🤖 Auto-assigned:',
    historyAssignedTo: 'Assigned to:',
    historySendAttemptFailed: 'Send attempt failed',
    historyMsgToCustomer: 'Message to customer:',
    historyMsgFallback: 'message',
    historyCustomerReply: 'Customer reply',
    historyReplyMovedOut: 'Reply moved to another ticket',
    historyReplyMovedIn: 'Reply received from another ticket',
    historyBrandAlertFailed: 'Brand alert failed',
    historyBrandAlertSent: 'WhatsApp alert sent to the brand',
    historyAgentMsgFailed: 'Free-form message send failed',
    historyAgentMsg: 'Free-form message to customer',
    historyAgentImgFailed: 'Image send failed',
    historyAgentImg: 'Image to customer',
    historyFeedbackPositive: '✓ Customer: all good',
    historyFeedbackGeneric: 'Customer feedback',

    // Template friendly names (customer_notified history)
    tmplInProgress: "We're on it",
    tmplAwaiting: 'Request for more details',
    tmplShipped: 'Shipped',
    tmplResolved: 'Ticket resolved',
    tmplFreeform: 'Free-form message',
    tmplFollowerConfirm: 'Ticket confirmation to customer',
    tmplBrandAlert: 'Brand alert',

    // Shipment event labels
    shipDispatched: 'Picked up by the courier',
    shipInTransit: 'On the way to the customer',
    shipAtBranch: 'Arrived at pickup point',
    shipOutForDelivery: 'Out for final delivery',
    shipDelivered: 'Delivered to the customer ✓',
    shipReturned: 'Returned',
    shipCancelled: 'Cancelled',
    shipFailedDelivery: 'Delivery failed',
    shipUnknown: 'Shipment update',

    // Send dialog (WhatsApp template composer)
    sendDialogTitle: 'Send a WhatsApp message to the customer',
    sendWhichDetail: 'Which detail is missing?',
    sendDetailPlaceholder: 'e.g. a photo of the damaged product',
    sendReplacementLabel: 'Name of the replacement product being sent',
    sendReplacementPlaceholder: 'e.g. INTENSIVE serum 100ml',
    sendEtaLabel: 'Estimated arrival',
    sendEta35Days: 'Within 3–5 business days',
    sendEtaThisWeek: 'This week',
    sendEtaTomorrow: 'Tomorrow',
    sendEta24h: 'Within 24 hours',
    sendTrackingLabel: 'Focus tracking number',
    sendTrackingResolving: 'Looking up in Focus…',
    sendTrackingPlaceholder: 'Looking up…',
    sendTrackingNotFound: 'No tracking number found automatically — the order may not have shipped yet. You can enter one manually.',
    sendResolutionLabel: 'Resolution summary',
    sendResolutionPlaceholder: 'A full description of what was done to close the ticket — everything the customer needs to see',
    sendResolutionDefault: 'The issue has been resolved.',
    sendPreviewLabel: 'Preview (as the customer will see it)',
    sendWillBeSentTo: 'This message will be sent to ',
    sendCancel: 'Cancel',
    sendButton: 'Send',
    sendCustomerFallback: 'there',
    sendBrandFallback: 'the brand',
  },
} as const;
