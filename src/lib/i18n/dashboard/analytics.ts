// Analytics page.
export const analytics = {
  he: {
    pageTitle: 'אנליטיקס',

    // Legacy KPI keys (kept for backwards compatibility with other callers).
    kpiVisitors: 'מבקרים',
    kpiSessions: 'שיחות',
    kpiMessages: 'הודעות',
    kpiTickets: 'פניות',
    kpiDemoRequests: 'בקשות דמו',
    kpiConversion: 'אחוז המרה',
    empty: 'אין נתונים להצגה',
    rangeToday: 'היום',
    range7d: '7 ימים',
    range14d: '14 ימים',
    range30d: '30 יום',
    range90d: '90 יום',
    rangeAllTime: 'מאז ומעולם',

    // Filters
    filterByCreator: 'סינון לפי משפיענית:',
    filterAll: 'הכל',
    searchPlaceholder: 'חיפוש בתוך השיחות (לדוגמה "דולף", "החזר")',
    clear: 'נקה',
    filterActiveLabel: 'סינון פעיל',
    filterMatchingPrefix: 'שיחות תואמות ב-',
    filterActiveSuffix: ' האחרונים',
    rangeWindow7d: '7 הימים',
    rangeWindow14d: '14 הימים',
    rangeWindow30d: '30 הימים',
    rangeWindow90d: '90 הימים',

    // Summary KPI cards
    cardUniqueVisitors: 'מבקרים ייחודיים',
    cardVisitorsSub: 'ביקורי דף בסך הכל',
    cardActiveConversations: 'שיחות בפועל',
    cardSessionsSubPrefix: 'מתוך',
    cardSessionsSubSuffix: 'פתיחות צ\'אט',
    cardCustomerMessages: 'הודעות מלקוחות',
    cardMessagesSubPrefix: 'ממוצע',
    cardMessagesSubSuffix: 'לשיחה',
    couponsCopied: 'קופונים הועתקו',
    productClicks: 'קליקים על מוצרים',

    // Topic distribution
    topicsTitle: 'על מה הלקוחות מדברים',
    topicsSubtitlePrefix: 'סיווג לפי ההודעה הראשונה בשיחה',
    topicsSubtitleCountSuffix: 'שיחות בטווח',
    topicLabels: {
      shipment_status: 'סטטוס משלוח',
      complaint: 'תלונה / מוצר פגום',
      return_or_exchange: 'החזרה / החלפה',
      support_request: 'פנייה לתמיכה',
      coupon: 'קופונים',
      product_question: 'שאלת מוצר',
      greeting: 'ברכה',
      other: 'אחר',
    },

    // Charts
    chartConversationsMessages: 'שיחות והודעות',
    seriesConversations: 'שיחות',
    seriesMessages: 'הודעות',
    chartCouponsClicks: 'קופונים וקליקים',

    // Top products table
    topProductsTitle: 'מוצרים מובילים',
    colProduct: 'מוצר',
    colBrand: 'מותג',
    colClicks: 'קליקים',
    colTotalActivity: 'סה״כ פעילות',
    noProductData: 'אין נתונים על מוצרים בתקופה זו',

    // Secondary stat cards
    avgMessagesPerChat: 'ממוצע הודעות לשיחה',
    conversionRate: 'שיעור המרה',
    conversionRateSub: 'קופונים / שיחות',

    // Internal analytics section
    internalTitle: 'אנליטיקס פנימי',
    internalSubtitle: 'נתונים שנאספים ישירות מהמערכת שלנו — חוצים adblockers ומקורות חיצוניים.',
    internalNew: 'חדשים',
    internalReturning: 'חוזרים',
    internalAvgDuration: 'זמן שיחה ממוצע',
    funnelTitle: 'פאנל המרה',
    funnelVisits: 'ביקורים',
    funnelSessions: 'שיחות',
    funnelEngaged: 'שיחות עם אינטראקציה',
    funnelLeads: 'לידים + פניות תמיכה',
    exitsTitle: 'יציאות',
    exitExternal: 'יציאות חיצוניות',
    exitBackToIg: 'חזרה לאינסטגרם',
    exitBackToSite: 'חזרה לאתר',
    trafficSourcesTitle: 'מקורות תנועה (Top 10)',
    noData: 'אין נתונים',
    gscNoQueries: 'אין שאילתות ב-7 הימים האחרונים.',
    gscNotConnected: 'GSC לא מחובר. צרו קשר עם הצוות לחיבור Search Console.',
  },
  en: {
    pageTitle: 'Analytics',

    // Legacy KPI keys (kept for backwards compatibility with other callers).
    kpiVisitors: 'Visitors',
    kpiSessions: 'Sessions',
    kpiMessages: 'Messages',
    kpiTickets: 'Tickets',
    kpiDemoRequests: 'Demo requests',
    kpiConversion: 'Conversion rate',
    empty: 'No data yet',
    rangeToday: 'Today',
    range7d: '7 days',
    range14d: '14 days',
    range30d: '30 days',
    range90d: '90 days',
    rangeAllTime: 'All time',

    // Filters
    filterByCreator: 'Filter by creator:',
    filterAll: 'All',
    searchPlaceholder: 'Search conversations (e.g. "leak", "refund")',
    clear: 'Clear',
    filterActiveLabel: 'Filter active',
    filterMatchingPrefix: 'matching conversations in the last ',
    filterActiveSuffix: '',
    rangeWindow7d: '7 days',
    rangeWindow14d: '14 days',
    rangeWindow30d: '30 days',
    rangeWindow90d: '90 days',

    // Summary KPI cards
    cardUniqueVisitors: 'Unique visitors',
    cardVisitorsSub: 'total page visits',
    cardActiveConversations: 'Active conversations',
    cardSessionsSubPrefix: 'out of',
    cardSessionsSubSuffix: 'chat opens',
    cardCustomerMessages: 'Customer messages',
    cardMessagesSubPrefix: 'avg',
    cardMessagesSubSuffix: 'per conversation',
    couponsCopied: 'Coupons copied',
    productClicks: 'Product clicks',

    // Topic distribution
    topicsTitle: 'What customers talk about',
    topicsSubtitlePrefix: 'Classified by first message in each conversation',
    topicsSubtitleCountSuffix: 'conversations in range',
    topicLabels: {
      shipment_status: 'Shipment status',
      complaint: 'Complaint / defective product',
      return_or_exchange: 'Return / exchange',
      support_request: 'Support request',
      coupon: 'Coupons',
      product_question: 'Product question',
      greeting: 'Greeting',
      other: 'Other',
    },

    // Charts
    chartConversationsMessages: 'Conversations & messages',
    seriesConversations: 'Conversations',
    seriesMessages: 'Messages',
    chartCouponsClicks: 'Coupons & clicks',

    // Top products table
    topProductsTitle: 'Top products',
    colProduct: 'Product',
    colBrand: 'Brand',
    colClicks: 'Clicks',
    colTotalActivity: 'Total activity',
    noProductData: 'No product data in this range',

    // Secondary stat cards
    avgMessagesPerChat: 'Avg messages per chat',
    conversionRate: 'Conversion rate',
    conversionRateSub: 'Coupons / conversations',

    // Internal analytics section
    internalTitle: 'Internal analytics',
    internalSubtitle: 'Data collected directly by our own system — bypassing adblockers and third-party sources.',
    internalNew: 'New',
    internalReturning: 'Returning',
    internalAvgDuration: 'Avg. session time',
    funnelTitle: 'Conversion funnel',
    funnelVisits: 'Visits',
    funnelSessions: 'Sessions',
    funnelEngaged: 'Engaged conversations',
    funnelLeads: 'Leads + support tickets',
    exitsTitle: 'Exits',
    exitExternal: 'External exits',
    exitBackToIg: 'Back to Instagram',
    exitBackToSite: 'Back to site',
    trafficSourcesTitle: 'Traffic sources (Top 10)',
    noData: 'No data',
    gscNoQueries: 'No queries in the last 7 days.',
    gscNotConnected: 'GSC isn’t connected. Contact the team to connect Search Console.',
  },
} as const;
