/**
 * bestieAI Website Widget v4.0
 * Standalone embeddable chat widget — no dependencies
 *
 * v4 (Phase 1): structured product cards (NDJSON `cards` event) + smart
 * starter chips (page-aware via /api/widget/chips). NDJSON events that the
 * client doesn't recognize are silently ignored, so this is fully
 * backwards-compatible with older backends.
 *
 * Usage:
 * <script src="https://yourapp.com/widget.js" data-account-id="xxx"></script>
 */
(function () {
  'use strict';

  // ============================================
  // Configuration
  // ============================================

  var SCRIPT = document.currentScript;
  var ACCOUNT_ID = SCRIPT && SCRIPT.getAttribute('data-account-id');
  var BASE_URL = SCRIPT && SCRIPT.src ? new URL(SCRIPT.src).origin : '';

  if (!ACCOUNT_ID) {
    console.error('[bestieAI Widget] Missing data-account-id attribute');
    return;
  }

  // ============================================
  // State
  // ============================================

  var isOpen = false;
  var sessionId = localStorage.getItem('ibot_widget_' + ACCOUNT_ID) || null;
  var messages = [];
  var isLoading = false;
  var thinkingText = null;
  // Smart starter chips (Phase 1): page-aware quick prompts shown above the input
  // until the visitor sends their first message. After each bot turn we refetch
  // follow-up chips. Empty array = render nothing.
  var chips = [];
  var lastTopic = null;
  try { lastTopic = localStorage.getItem('ibot_last_topic_' + ACCOUNT_ID); } catch (e) { /* */ }

  // ---- View state (Phase: concierge) ----
  // The widget is no longer a chat-only surface. `view` switches the panel
  // between chat, the inline support-ticket form, and the post-submit
  // confirmation. Other modes (leads, bookings) will follow the same pattern.
  var view = 'chat'; // 'chat' | 'support_form' | 'support_success' | 'lead_form' | 'lead_success' | 'book_demo_form' | 'book_demo_success'
  var modules = { support: { enabled: false }, leads: { enabled: false }, bookings: { enabled: false } };
  var supportForm = { name: '', email: '', phone: '', orderNumber: '', category: '', message: '', urgent: false, attachment: null, attachmentUploading: false, error: null, submitting: false };
  var leadForm = { name: '', email: '', phone: '', interest: '', error: null, submitting: false };
  var bookDemoForm = { name: '', email: '', company: '', teamSize: '', message: '', preferredTime: '', error: null, submitting: false };
  var orderForm = { orderNumber: '', email: '', error: null, submitting: false, result: null };
  var lastTicketRef = null;
  // Per-bot-message ratings keyed by message index. Used by the chat renderer
  // to show 👍/👎 state without re-fetching from the server.
  var ratings = {};
  // Transient toast — short message that fades after a few seconds.
  // Used for "Coupon copied", "Transcript sent", etc.
  var toastText = null;
  var toastTimer = null;
  // Returning-visitor signal — persisted across sessions. Used to personalize
  // the welcome message and skip the generic "how can I help?" when we know
  // they were interested in something specific last visit.
  var hasVisitedBefore = false;
  try { hasVisitedBefore = !!localStorage.getItem('ibot_visited_' + ACCOUNT_ID); } catch (e) { /* */ }
  try { localStorage.setItem('ibot_visited_' + ACCOUNT_ID, '1'); } catch (e) { /* */ }
  // Proactive open trigger — fired at most ONCE per visitor per 24h to avoid
  // becoming annoying. Tracked separately from sessionId so it survives
  // tab-close/return-tomorrow patterns.
  var proactiveLastFired = 0;
  try {
    var pf = localStorage.getItem('ibot_proactive_' + ACCOUNT_ID);
    if (pf) proactiveLastFired = parseInt(pf, 10) || 0;
  } catch (e) { /* */ }
  // Bot-initiated action card (rendered inline in chat). Set when the model
  // emits an <<ACTION>> envelope proposing e.g. opening the support form
  // prefilled with the topic/category it inferred.
  var pendingAction = null;
  // Voice input state — Web Speech API listening session. `isListening` drives
  // the mic button's pulsing animation; `voiceRecognizer` holds the active SR.
  var isListening = false;
  var voiceRecognizer = null;
  // Page context — extracted from the embedding page DOM once at boot. Passed
  // to the chat endpoint on every turn so the bot can answer in-context
  // ("I see you're looking at X — about that...") instead of generically.
  var pageContext = null;

  // ============================================
  // Locales — every visible string + layout direction lives here.
  // New languages: add another entry; widget picks via `language` from config
  // (default 'he' for back-compat with existing Hebrew accounts).
  // ============================================
  var LOCALES = {
    he: {
      dir: 'rtl',
      font: 'Heebo',
      googleFont: 'Heebo:wght@400;500;600;700',
      welcomeMessage: 'שלום! איך אפשר לעזור? ✨',
      placeholder: 'כתבו הודעה...',
      brandName: 'העוזר החכם',
      status: 'זמין',
      defaultCta: 'לפרטים',
      recommendedFor: 'מומלץ ל: ',
      currencyPrefix: '₪',
      currencyPosition: 'prefix',
      badge: { SALE: 'מבצע', NEW: 'חדש', DEFAULT: 'מומלץ' },
      errorMessage: 'שגיאה בעיבוד הבקשה.',
      connectionError: 'שגיאה בחיבור. נסו שוב.',
      support: {
        openLink: 'פתיחת פנייה',
        backToChat: '← חזרה לצ׳אט',
        title: 'פנייה לתמיכה',
        subtitle: 'נחזור אליך במייל בהקדם.',
        nameLabel: 'שם מלא',
        namePlaceholder: 'איך לפנות אליך?',
        emailLabel: 'אימייל',
        emailPlaceholder: 'name@example.com',
        phoneLabel: 'טלפון (אופציונלי)',
        phonePlaceholder: '050-1234567',
        orderLabel: 'מספר הזמנה (אופציונלי)',
        orderPlaceholder: 'אם רלוונטי',
        categoryLabel: 'נושא הפנייה',
        messageLabel: 'איך נוכל לעזור?',
        messagePlaceholder: 'תאר/י את הבעיה או הבקשה...',
        submit: 'שליחת פנייה',
        submitting: 'שולח...',
        required: 'שדה חובה',
        invalidEmail: 'אימייל לא תקין',
        successTitle: 'הפנייה נשלחה ✓',
        successBody: 'קיבלנו את הפנייה שלך. נחזור אליך בהקדם.',
        successRef: 'מספר פנייה: ',
        successBack: 'חזרה לצ׳אט',
        submitError: 'שגיאה בשליחה. נסו שוב.',
        categories: {
          order: 'בעיה בהזמנה',
          product: 'שאלה על מוצר',
          return: 'החזרה / החלפה',
          shipping: 'משלוח',
          other: 'אחר',
        },
        actionPrompt: 'רוצה לפתוח פנייה?',
        actionOpen: 'פתיחת טופס',
        actionDismiss: 'לא תודה',
        couponCopied: 'הקופון הועתק: ',
        humanLink: 'דבר/י עם נציג',
        humanBadge: 'סומן כדחוף — נחזור אליך מהר',
        humanTitle: 'בקשה דחופה',
        humanSubtitle: 'נחזור אליך בהקדם.',
        ratingPositive: 'תודה על הפידבק!',
        ratingNegative: 'תודה — נשתפר.',
        transcriptLink: 'שלח/י לי את השיחה',
        transcriptSent: 'נשלח למייל ✓',
        navigatePrompt: 'רוצה שאקח אותך לעמוד הזה?',
        navigateOpen: 'בואו נעבור',
      },
      order: {
        title: 'מעקב הזמנה',
        subtitle: 'מספר הזמנה + מייל שאיתו הזמנת.',
        orderNumberLabel: 'מספר הזמנה',
        orderNumberPlaceholder: 'למשל 12345',
        emailLabel: 'מייל ההזמנה',
        emailPlaceholder: 'name@example.com',
        submit: 'בדיקת סטטוס',
        searching: 'מחפש...',
        notFound: 'לא נמצאה הזמנה תואמת. בדוק את המספר והמייל.',
        statusLabel: 'סטטוס:',
        placedLabel: 'הוזמנה:',
        itemsLabel: 'פריטים:',
        trackingLabel: 'מספר מעקב:',
        trackUrlLabel: 'מעקב חי',
        unavailable: 'מעקב הזמנות לא זמין באתר הזה כרגע.',
        actionPrompt: 'רוצה לבדוק את סטטוס ההזמנה?',
        actionOpen: 'בדיקת סטטוס',
      },
      lead: {
        title: 'תיצרו איתי קשר',
        subtitle: 'נחזור אליך תוך יום עסקים.',
        nameLabel: 'שם',
        emailLabel: 'אימייל',
        phoneLabel: 'טלפון (אופציונלי)',
        interestLabel: 'מה מעניין אותך?',
        interestPlaceholder: 'במה אפשר לעזור...',
        submit: 'שלח/י פרטים',
        successTitle: 'תודה ✓',
        successBody: 'קיבלנו את הפרטים — הצוות יחזור אליך בהקדם.',
        actionPrompt: 'רוצה שניצור איתך קשר?',
        actionOpen: 'שלח/י פרטים',
      },
      bookDemo: {
        title: 'תיאום דמו',
        subtitle: 'נחזור לתאם תוך יום עסקים.',
        nameLabel: 'שם מלא',
        emailLabel: 'אימייל עבודה',
        companyLabel: 'חברה',
        teamSizeLabel: 'גודל צוות',
        teamSizes: ['1-5', '6-20', '21-50', '51-200', '200+'],
        messageLabel: 'מה תרצה לראות בדמו? (אופציונלי)',
        messagePlaceholder: 'איזה use case הכי מעניין אותך...',
        preferredTimeLabel: 'שעה מועדפת לחזרה (אופציונלי)',
        preferredTimes: ['בוקר (9-12)', 'צהריים (12-15)', 'אחה"צ (15-18)', 'ערב (18-21)', 'גמיש'],
        submit: 'בקש/י דמו',
        successTitle: 'הבקשה נקלטה ✓',
        successBody: 'הצוות יחזור אליך לתיאום תוך יום עסקים.',
        actionPrompt: 'רוצה לתאם דמו?',
        actionOpen: 'תיאום דמו',
      },
    },
    en: {
      dir: 'ltr',
      font: 'Inter',
      googleFont: 'Inter:wght@400;500;600;700',
      welcomeMessage: 'Hi! How can I help? ✨',
      placeholder: 'Type a message...',
      brandName: 'AI Assistant',
      status: 'Online',
      defaultCta: 'View',
      recommendedFor: 'Recommended for: ',
      currencyPrefix: '$',
      currencyPosition: 'prefix',
      badge: { SALE: 'SALE', NEW: 'NEW', DEFAULT: 'PICK' },
      errorMessage: 'Something went wrong processing your request.',
      connectionError: 'Connection error. Please try again.',
      support: {
        openLink: 'Get support',
        backToChat: '← Back to chat',
        title: 'Contact support',
        subtitle: "We'll get back to you by email shortly.",
        nameLabel: 'Full name',
        namePlaceholder: 'How should we address you?',
        emailLabel: 'Email',
        emailPlaceholder: 'name@example.com',
        phoneLabel: 'Phone (optional)',
        phonePlaceholder: '+1 555 0100',
        orderLabel: 'Order number (optional)',
        orderPlaceholder: 'If applicable',
        categoryLabel: 'Topic',
        messageLabel: 'How can we help?',
        messagePlaceholder: 'Describe your issue or request...',
        submit: 'Send request',
        submitting: 'Sending...',
        required: 'Required',
        invalidEmail: 'Invalid email',
        successTitle: 'Request received ✓',
        successBody: "We've got your request. We'll be in touch shortly.",
        successRef: 'Reference: ',
        successBack: 'Back to chat',
        submitError: 'Could not send. Please try again.',
        categories: {
          order: 'Order issue',
          product: 'Product question',
          return: 'Return / exchange',
          shipping: 'Shipping',
          other: 'Other',
        },
        actionPrompt: 'Want to open a support request?',
        actionOpen: 'Open form',
        actionDismiss: 'Not now',
        couponCopied: 'Coupon copied: ',
        humanLink: 'Talk to a human',
        humanBadge: 'Marked urgent — we\'ll respond quickly',
        humanTitle: 'Urgent request',
        humanSubtitle: "We'll get back to you as soon as possible.",
        ratingPositive: 'Thanks for the feedback!',
        ratingNegative: 'Thanks — we\'ll improve.',
        transcriptLink: 'Email me this chat',
        transcriptSent: 'Sent to your email ✓',
        navigatePrompt: 'Want me to take you there?',
        navigateOpen: 'Go to page',
      },
      order: {
        title: 'Order tracking',
        subtitle: 'Enter your order number and email used at checkout.',
        orderNumberLabel: 'Order number',
        orderNumberPlaceholder: 'e.g. 12345',
        emailLabel: 'Order email',
        emailPlaceholder: 'name@example.com',
        submit: 'Check status',
        searching: 'Searching...',
        notFound: "We couldn't find a matching order. Check the number and email.",
        statusLabel: 'Status:',
        placedLabel: 'Placed:',
        itemsLabel: 'Items:',
        trackingLabel: 'Tracking:',
        trackUrlLabel: 'Live tracking',
        unavailable: 'Order tracking is not available on this site right now.',
        actionPrompt: 'Want to check your order status?',
        actionOpen: 'Check status',
      },
      lead: {
        title: 'Get in touch',
        subtitle: "We'll get back within one business day.",
        nameLabel: 'Name',
        emailLabel: 'Email',
        phoneLabel: 'Phone (optional)',
        interestLabel: 'What are you interested in?',
        interestPlaceholder: 'Tell us a bit about what you need...',
        submit: 'Send my info',
        successTitle: 'Thanks ✓',
        successBody: "Got your details — we'll be in touch shortly.",
        actionPrompt: 'Want us to reach out?',
        actionOpen: 'Share details',
      },
      bookDemo: {
        title: 'Book a demo',
        subtitle: "We'll reach out within one business day to schedule.",
        nameLabel: 'Full name',
        emailLabel: 'Work email',
        companyLabel: 'Company',
        teamSizeLabel: 'Team size',
        teamSizes: ['1-5', '6-20', '21-50', '51-200', '200+'],
        messageLabel: 'What would you like to see? (optional)',
        messagePlaceholder: 'Which use case interests you most...',
        preferredTimeLabel: 'Preferred callback time (optional)',
        preferredTimes: ['Morning (9-12)', 'Midday (12-15)', 'Afternoon (15-18)', 'Evening (18-21)', 'Flexible'],
        submit: 'Request demo',
        successTitle: 'Request received ✓',
        successBody: "We'll reach out within one business day to schedule.",
        actionPrompt: 'Want to book a demo?',
        actionOpen: 'Book demo',
      },
    },
  };
  var locale = LOCALES.he; // overwritten once /api/widget/config responds

  var config = {
    language: 'he',
    welcomeMessage: locale.welcomeMessage,
    placeholder: locale.placeholder,
    position: 'bottom-right',
    brandName: locale.brandName,
    profilePic: null,
    coverImage: null,
    socialLinks: [],
    tooltip: null,
    enabled: true,
    primaryColor: '#0c1013',
    darkMode: false,
  };

  // ---- Theme palette ----
  // Single source of truth for surface/text/border colors. Every render
  // function reads `theme()` instead of hardcoding hex values, so flipping
  // darkMode flips the whole widget without touching individual blocks.
  function theme() {
    var d = config.darkMode;
    return {
      panelBg: d ? '#0f1115' : '#f4f5f7',
      surface: d ? '#1a1d23' : '#ffffff',
      surfaceAlt: d ? '#23272e' : '#f3f4f6',
      textPrimary: d ? '#f1f5f9' : '#111111',
      textSecondary: d ? '#94a3b8' : '#4b5563',
      textMuted: d ? '#64748b' : '#6b7280',
      border: d ? '#2a2f37' : '#e5e7eb',
      inputBg: d ? '#1a1d23' : '#ffffff',
      inputBorder: d ? '#2a2f37' : '#e5e7eb',
      labelText: d ? '#cbd5e1' : '#374151',
      // Per-message bubble colors
      botBubbleBg: d ? '#1f232a' : '#ffffff',
      botBubbleText: d ? '#f1f5f9' : '#000000',
      errorBg: d ? '#3f1d1d' : '#fef2f2',
      errorBorder: d ? '#7f1d1d' : '#fecaca',
      errorText: d ? '#fca5a5' : '#b91c1c',
      successBg: d ? '#14532d' : '#dcfce7',
      successText: d ? '#86efac' : '#15803d',
    };
  }

  // ============================================
  // Analytics — queue events and ship them to bestieAI's own /api/analytics/widget
  // endpoint via sendBeacon (cross-origin, no preflight, fire-and-forget).
  // The host site's gtag/fbq/ttq are intentionally NOT used: most embedding
  // sites have no pixels installed, so piggybacking on them dropped data
  // silently. Internal pipeline persists every event to Supabase.
  // ============================================

  var ANALYTICS_TOKEN = null;
  var ANON_KEY = 'ibot_anon_' + ACCOUNT_ID;
  var ANON_ID = (function () {
    try {
      var v = localStorage.getItem(ANON_KEY);
      if (v) return v;
      var n = 'aw_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(ANON_KEY, n);
      return n;
    } catch (e) {
      return 'aw_' + Math.random().toString(36).slice(2, 10);
    }
  })();

  var EVENT_QUEUE = [];
  var FLUSH_TIMER = null;
  var FLUSH_INTERVAL_MS = 3000;
  var MAX_BATCH = 25;

  function captureWidgetAttribution() {
    try {
      var p = new URLSearchParams(window.location.search);
      var ref = document.referrer || '';
      var referrerHost = '';
      try {
        if (ref) referrerHost = new URL(ref).host;
      } catch (e) { /* */ }
      return {
        utm_source: p.get('utm_source') || undefined,
        utm_medium: p.get('utm_medium') || undefined,
        utm_campaign: p.get('utm_campaign') || undefined,
        utm_term: p.get('utm_term') || undefined,
        utm_content: p.get('utm_content') || undefined,
        gclid: p.get('gclid') || undefined,
        fbclid: p.get('fbclid') || undefined,
        ttclid: p.get('ttclid') || undefined,
        referrer: ref || undefined,
        referrer_host: referrerHost || undefined,
        host: window.location.host,
        path: window.location.pathname,
      };
    } catch (e) {
      return {};
    }
  }
  var WIDGET_ATTRIBUTION = captureWidgetAttribution();

  function flushAnalytics() {
    if (FLUSH_TIMER) { clearTimeout(FLUSH_TIMER); FLUSH_TIMER = null; }
    if (!ANALYTICS_TOKEN || EVENT_QUEUE.length === 0) return;
    var events = EVENT_QUEUE.splice(0, EVENT_QUEUE.length);
    var body = JSON.stringify({
      accountId: ACCOUNT_ID,
      sessionId: sessionId || null,
      anonId: ANON_ID,
      token: ANALYTICS_TOKEN,
      events: events,
    });
    var url = BASE_URL + '/api/analytics/widget';
    try {
      if (navigator && typeof navigator.sendBeacon === 'function') {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) return;
      }
    } catch (e) { /* fall through */ }
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        mode: 'cors',
      }).catch(function () { /* fire-and-forget */ });
    } catch (e) { /* fire-and-forget */ }
  }

  function widgetTrack(eventName, params) {
    params = params || {};
    var enriched = {
      widget_version: '4.0',
      attribution: WIDGET_ATTRIBUTION,
    };
    for (var k in params) enriched[k] = params[k];
    // Dual-write funnel events into the new /api/widget/events pipeline too
    // (transition period — see Behavioral Events block below). MUST run before
    // the EVENT_QUEUE batch early-return below, else a funnel event landing on
    // the MAX_BATCH boundary would skip the new pipeline. The old
    // /api/analytics/widget send is left untouched.
    try {
      if (BEHAVIOR_FUNNEL_TYPES[eventName]) behaviorTrack(eventName, enriched);
    } catch (e) { /* never break the host page */ }
    EVENT_QUEUE.push({ name: eventName, ts: Date.now(), payload: enriched });
    if (EVENT_QUEUE.length >= MAX_BATCH) {
      flushAnalytics();
      return;
    }
    if (!FLUSH_TIMER) {
      FLUSH_TIMER = setTimeout(flushAnalytics, FLUSH_INTERVAL_MS);
    }
  }

  // Flush on tab hide / page unload so we don't lose tail events.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushAnalytics();
  });
  window.addEventListener('pagehide', flushAnalytics);

  // ============================================
  // Behavioral Events — richer client telemetry (page views, scroll depth,
  // time on page, exit intent, clicks, product/cart snapshots) shipped to
  // the dedicated /api/widget/events ingest pipeline (Redis buffer → drain
  // cron → widget_events table). Runs alongside the funnel-event queue
  // above; during the transition, funnel events (widget_loaded/opened/
  // closed/message_sent/message_received) are dual-written into both
  // pipelines from widgetTrack() below.
  // ============================================

  var BEHAVIOR_QUEUE = [];
  var BEHAVIOR_FLUSH_TIMER = null;
  var BEHAVIOR_FLUSH_INTERVAL_MS = 3000;
  var BEHAVIOR_MAX_BATCH = 25;
  var BEHAVIOR_UID_COUNTER = 0;
  // Overridden from /api/widget/config `sampling.click` when the server
  // provides one; defaults to tracking every click.
  var CLICK_SAMPLE_RATE = 1.0;
  // Funnel event names (already whitelisted server-side) that should also
  // flow into the new events pipeline — see widgetTrack() below.
  var BEHAVIOR_FUNNEL_TYPES = {
    widget_loaded: 1,
    widget_opened: 1,
    widget_closed: 1,
    widget_message_sent: 1,
    widget_message_received: 1,
  };

  function flushBehavior() {
    if (BEHAVIOR_FLUSH_TIMER) { clearTimeout(BEHAVIOR_FLUSH_TIMER); BEHAVIOR_FLUSH_TIMER = null; }
    if (!ANALYTICS_TOKEN || BEHAVIOR_QUEUE.length === 0) return;
    var events = BEHAVIOR_QUEUE.splice(0, BEHAVIOR_QUEUE.length);
    var body = JSON.stringify({
      accountId: ACCOUNT_ID,
      token: ANALYTICS_TOKEN,
      anonId: ANON_ID,
      sessionId: sessionId || null,
      events: events,
    });
    var url = BASE_URL + '/api/widget/events';
    try {
      if (navigator && typeof navigator.sendBeacon === 'function') {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) return;
      }
    } catch (e) { /* fall through */ }
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        mode: 'cors',
      }).catch(function () { /* fire-and-forget */ });
    } catch (e) { /* fire-and-forget */ }
  }

  function behaviorTrack(type, payload) {
    try {
      if (!type) return;
      var uid = ANON_ID + '_' + Date.now() + '_' + (BEHAVIOR_UID_COUNTER++);
      BEHAVIOR_QUEUE.push({
        type: type,
        uid: uid,
        path: location.pathname,
        payload: payload || {},
        ts: Date.now(),
      });
      if (BEHAVIOR_QUEUE.length >= BEHAVIOR_MAX_BATCH) {
        flushBehavior();
        return;
      }
      if (!BEHAVIOR_FLUSH_TIMER) {
        BEHAVIOR_FLUSH_TIMER = setTimeout(flushBehavior, BEHAVIOR_FLUSH_INTERVAL_MS);
      }
    } catch (e) { /* never break the host page */ }
  }

  // ---- page_view — fired once at boot (see Boot section) ----
  function trackPageView() {
    try {
      var referrerHost = '';
      try { if (document.referrer) referrerHost = new URL(document.referrer).host; } catch (e2) { /* */ }
      behaviorTrack('page_view', { title: document.title || '', referrer_host: referrerHost || null });
    } catch (e) { /* */ }
  }

  // ---- scroll_depth — throttled sampling of max scroll %, final value on pagehide ----
  var SCROLL_MAX_PCT = 0;
  var SCROLL_LAST_SAMPLE_AT = 0;
  var SCROLL_SAMPLE_INTERVAL_MS = 1000;
  function sampleScrollDepth() {
    try {
      var doc = document.documentElement;
      var scrollable = (doc ? doc.scrollHeight : 0) - (window.innerHeight || 0);
      var scrollTop = window.scrollY || (doc && doc.scrollTop) || 0;
      var pct = scrollable > 0 ? Math.min(100, Math.max(0, Math.round((scrollTop / scrollable) * 100))) : 0;
      if (pct > SCROLL_MAX_PCT) SCROLL_MAX_PCT = pct;
    } catch (e) { /* */ }
  }
  try {
    if (window.addEventListener) {
      window.addEventListener('scroll', function () {
        try {
          var now = Date.now();
          if (now - SCROLL_LAST_SAMPLE_AT < SCROLL_SAMPLE_INTERVAL_MS) return;
          SCROLL_LAST_SAMPLE_AT = now;
          sampleScrollDepth();
        } catch (e) { /* */ }
      }, { passive: true });
    }
  } catch (e) { /* */ }

  // ---- time_on_page — accumulate visible ms only (pauses while tab hidden), emit on pagehide ----
  var TIME_ON_PAGE_MS = 0;
  var TIME_ON_PAGE_SEGMENT_START = Date.now();
  var TIME_ON_PAGE_VISIBLE = typeof document.visibilityState === 'undefined' || document.visibilityState !== 'hidden';
  function accumulateVisibleTime() {
    try {
      if (TIME_ON_PAGE_VISIBLE) {
        TIME_ON_PAGE_MS += Date.now() - TIME_ON_PAGE_SEGMENT_START;
      }
    } catch (e) { /* */ }
  }

  // ---- exit_intent — mouseout above the viewport top, once per pageview ----
  var EXIT_INTENT_FIRED = false;
  try {
    document.addEventListener('mouseout', function (e) {
      try {
        if (EXIT_INTENT_FIRED || !e) return;
        if (e.clientY <= 0) {
          EXIT_INTENT_FIRED = true;
          behaviorTrack('exit_intent', {});
        }
      } catch (err) { /* */ }
    });
  } catch (e) { /* */ }

  // ---- click — delegated, sampled, never reads input values ----
  try {
    document.addEventListener('click', function (e) {
      try {
        if (CLICK_SAMPLE_RATE < 1 && Math.random() > CLICK_SAMPLE_RATE) return;
        var el = e && e.target;
        if (!el || el.nodeType !== 1) return;
        behaviorTrack('click', {
          tag: el.tagName || null,
          text: ((el.textContent || '') + '').trim().slice(0, 80),
          href: el.href || null,
        });
      } catch (err) { /* */ }
    }, true);
  } catch (e) { /* */ }

  // ---- visibility tracking (pauses/resumes time_on_page) + flush on hide ----
  document.addEventListener('visibilitychange', function () {
    try {
      if (document.visibilityState === 'hidden') {
        accumulateVisibleTime();
        TIME_ON_PAGE_VISIBLE = false;
        flushBehavior();
      } else {
        TIME_ON_PAGE_VISIBLE = true;
        TIME_ON_PAGE_SEGMENT_START = Date.now();
      }
    } catch (e) { /* */ }
  });

  // ---- final scroll_depth + time_on_page emission on unload, then flush ----
  window.addEventListener('pagehide', function () {
    try {
      sampleScrollDepth();
      behaviorTrack('scroll_depth', { pct: SCROLL_MAX_PCT });
      accumulateVisibleTime();
      behaviorTrack('time_on_page', { ms: TIME_ON_PAGE_MS });
    } catch (e) { /* */ }
    flushBehavior();
  });

  // ============================================
  // Smart Chips (Phase 1: page-aware + history-aware)
  // ============================================

  function fetchChips(mode, lastUserMsg, lastBotMsg) {
    try {
      var body = {
        accountId: ACCOUNT_ID,
        pageUrl: location.href,
        pageTitle: document.title || '',
        pagePath: location.pathname || '/',
        isReturning: !!sessionId,
        lastTopic: lastTopic || null,
        lang: document.documentElement.lang || 'he',
        mode: mode || 'initial',
        lastUserMsg: lastUserMsg || null,
        lastBotMsg: lastBotMsg || null,
      };
      fetch(BASE_URL + '/api/widget/chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && Array.isArray(data.chips) && data.chips.length) {
            chips = data.chips;
            // Only repaint if the chat panel is open — chips never show in closed state.
            if (isOpen) render();
          }
        })
        .catch(function () { /* fail silently — chips are optional */ });
    } catch (e) { /* */ }
  }

  function onChipClick(text, position, source) {
    widgetTrack('widget_chip_clicked', { chip: text, position: position, source: source || 'initial' });
    var inputEl = document.getElementById('ibot-input');
    if (inputEl) inputEl.value = text;
    // Clear chips immediately so they don't flash during send.
    chips = [];
    sendMessage();
  }

  function onCardClick(product, position) {
    if (!product) return;
    widgetTrack('widget_product_click', {
      product_id: product.id || null,
      product_name: product.name || null,
      position: position,
      badge: product.badge || null,
    });
    // Fire-and-forget click attribution to the existing recommendations table.
    try {
      fetch(BASE_URL + '/api/widget/recommendations/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: ACCOUNT_ID, productId: product.id, sessionId: sessionId }),
        keepalive: true,
      }).catch(function () { /* */ });
    } catch (e) { /* */ }
    if (product.productUrl) {
      // Navigate the CURRENT tab to the product page — the e-commerce norm
      // (keep the shopping flow in one tab, don't spawn a new one). The click
      // beacon above uses keepalive:true so it still lands during the unload,
      // and the widget restores its conversation on the destination page.
      window.location.href = bestieTag(product.productUrl, 'card');
    }
  }

  // Expose card click handler globally (inline onclick uses it).
  window.__ibotCardClick = function (id, position) {
    var products = (window.__ibotLastCards && window.__ibotLastCards.products) || [];
    for (var i = 0; i < products.length; i++) {
      if (products[i].id === id) { onCardClick(products[i], position); return; }
    }
  };
  // Inline product links carry no product id (they come from free-text markdown),
  // so we record a generic click instead of calling the attribution endpoint with
  // a null id (which 400s). Card clicks remain the attributed path.
  window.__ibotInlineProductClick = function (href) {
    widgetTrack('widget_product_click', { surface: 'inline_link', href: href || null });
  };
  window.__ibotChipClick = function (idx) {
    if (chips[idx]) onChipClick(chips[idx], idx, 'initial');
  };

  // ============================================
  // Inject CSS Animations (font loaded once locale is resolved)
  // ============================================

  var fontLinkEl = null;
  var styleEl = document.createElement('style');
  document.head.appendChild(styleEl);

  function applyLocaleAssets() {
    // Google Font for the resolved locale — loaded once.
    if (!fontLinkEl) {
      fontLinkEl = document.createElement('link');
      fontLinkEl.rel = 'stylesheet';
      fontLinkEl.href = 'https://fonts.googleapis.com/css2?family=' + locale.googleFont + '&display=swap';
      document.head.appendChild(fontLinkEl);
    }
    // CSS variables drive light/dark mode. Each render fn uses var(--ibot-*)
    // in its inline styles, so flipping darkMode = repainting the whole widget
    // without re-rendering individual blocks.
    var t = theme();
    var vars =
      '#ibot-widget-container{' +
      '--ibot-surface:' + t.surface + ';' +
      '--ibot-surface-alt:' + t.surfaceAlt + ';' +
      '--ibot-panel-bg:' + t.panelBg + ';' +
      '--ibot-text-primary:' + t.textPrimary + ';' +
      '--ibot-text-secondary:' + t.textSecondary + ';' +
      '--ibot-text-muted:' + t.textMuted + ';' +
      '--ibot-label-text:' + t.labelText + ';' +
      '--ibot-border:' + t.border + ';' +
      '--ibot-input-bg:' + t.inputBg + ';' +
      '--ibot-bot-bubble-bg:' + t.botBubbleBg + ';' +
      '--ibot-bot-bubble-text:' + t.botBubbleText + ';' +
      '--ibot-error-bg:' + t.errorBg + ';' +
      '--ibot-error-border:' + t.errorBorder + ';' +
      '--ibot-error-text:' + t.errorText + ';' +
      '--ibot-success-bg:' + t.successBg + ';' +
      '--ibot-success-text:' + t.successText + ';' +
      '}';
    styleEl.textContent =
      vars +
      '@keyframes ibot-slide-up{from{opacity:0;transform:translateY(20px) scale(0.95);}to{opacity:1;transform:translateY(0) scale(1);}}' +
      '@keyframes ibot-bounce{0%,80%,100%{transform:translateY(0);}40%{transform:translateY(-5px);}}' +
      '@keyframes ibot-msg-in{from{opacity:0;transform:translateX(10px);}to{opacity:1;transform:translateX(0);}}' +
      '@keyframes ibot-fade-in{from{opacity:0;}to{opacity:1;}}' +
      '#ibot-widget-container *{box-sizing:border-box;font-family:"' + locale.font + '",system-ui,-apple-system,sans-serif;}' +
      '#ibot-widget-container input:focus,#ibot-widget-container textarea:focus,#ibot-widget-container select:focus{outline:none;}' +
      '#ibot-widget-container ::-webkit-scrollbar{width:4px;}' +
      '#ibot-widget-container ::-webkit-scrollbar-track{background:transparent;}' +
      '#ibot-widget-container ::-webkit-scrollbar-thumb{background:rgba(150,150,150,0.3);border-radius:4px;}';
  }
  applyLocaleAssets();

  // ============================================
  // Complementary Products — Trigger Engine + Popup
  // ============================================

  var COMP_COOLDOWN_KEY = 'ibot_comp_cd_' + ACCOUNT_ID;
  var lastCompShown = 0;
  var lastCompProducts = [];   // products currently shown in the popup — click dispatches by index (never interpolate the URL into markup)
  function complementCooldownActive() {
    try { var v = parseInt(localStorage.getItem(COMP_COOLDOWN_KEY) || '0', 10); return v && Date.now() < v; } catch (e) { return false; }
  }
  function onCartAdd(added) {
    if (isOpen) return;                                   // never over the open chat
    if (Date.now() - lastCompShown < 90000) return;       // max 1 / 90s
    if (complementCooldownActive()) return;               // dismissed recently
    lastCompShown = Date.now();
    fetch(BASE_URL + '/api/widget/complementary', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: ACCOUNT_ID, productId: added && added.sku ? added.sku : null, productName: added ? added.name : null, sessionId: sessionId }),
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.products && d.products.length) showComplementPopup(d.products); })
      .catch(function () { /* */ });
  }
  function dismissComplements() {
    try { localStorage.setItem(COMP_COOLDOWN_KEY, String(Date.now() + 10 * 60 * 1000)); } catch (e) { /* */ }
    var el = document.getElementById('ibot-comp'); if (el) el.parentNode.removeChild(el);
  }
  window.__ibotComplementDismiss = dismissComplements;
  window.__ibotComplementClick = function (idx) {
    // Dispatch by index (like __ibotChipClick) so no untrusted URL is ever
    // interpolated into inline-onclick markup — avoids attribute/JS-string XSS.
    var p = lastCompProducts[idx];
    var url = (p && p.productUrl) ? String(p.productUrl) : '';
    widgetTrack('widget_product_click', { surface: 'complement_popup', href: url || null });
    // Navigate only to http(s) or site-relative targets; block javascript:/data:
    // schemes and protocol-relative (//host) open-redirects.
    if (/^https?:\/\//i.test(url) || (url.charAt(0) === '/' && url.charAt(1) !== '/')) {
      window.location.href = bestieTag(url, 'complementary');   // same-tab, e-commerce norm
    }
  };
  function showComplementPopup(products) {
    if (document.getElementById('ibot-comp')) return;
    var pc = config.primaryColor;
    lastCompProducts = products.slice(0, 3);   // index in the button below maps into this array
    var cards = lastCompProducts.map(function (p, i) {
      var price = p.price != null
        ? ((p.isOnSale && p.originalPrice != null)
            ? '<span style="text-decoration:line-through;color:var(--ibot-text-muted);font-size:11px;margin-inline-end:4px;">' + locale.currencyPrefix + p.originalPrice + '</span>' + locale.currencyPrefix + p.price
            : locale.currencyPrefix + p.price)
        : '';
      var img = p.image ? '<img src="' + escapeHtml(p.image) + '" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0;" onerror="this.style.display=\'none\'"/>' : '';
      return '<button onclick="window.__ibotComplementClick(' + i + ')" style="display:flex;align-items:center;gap:8px;width:100%;text-align:' + (locale.dir === 'rtl' ? 'right' : 'left') + ';background:var(--ibot-surface);border:1px solid var(--ibot-border);border-radius:10px;padding:7px 9px;cursor:pointer;font-family:inherit;margin-bottom:6px;">' +
        img + '<span style="flex:1;min-width:0;"><span style="display:block;font-size:12.5px;font-weight:600;color:var(--ibot-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(p.name || '') + '</span><span style="font-size:12px;color:' + pc + ';font-weight:700;">' + price + '</span></span></button>';
    }).join('');
    var el = document.createElement('div');
    el.id = 'ibot-comp';
    el.style.cssText = 'position:fixed;z-index:2147483646;bottom:calc(96px + env(safe-area-inset-bottom));' + (config.position === 'bottom-left' ? 'left:20px;' : 'right:20px;') + 'width:260px;max-width:calc(100vw - 40px);background:var(--ibot-panel-bg);border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,0.18);padding:12px;animation:ibot-slide-up 0.3s ease-out;direction:' + locale.dir + ';';
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<span style="font-size:13px;font-weight:700;color:var(--ibot-text-primary);">' + escapeHtml(wlbl('משלים מצוין 👇', 'Goes great with it 👇')) + '</span>' +
      '<button onclick="window.__ibotComplementDismiss()" style="background:transparent;border:none;color:var(--ibot-text-muted);cursor:pointer;font-size:18px;line-height:1;">&times;</button></div>' + cards;
    document.body.appendChild(el);
    widgetTrack('widget_action_proposed', { type: 'complementary', count: products.length });
  }

  // ============================================
  // Load Config
  // ============================================

  fetch(BASE_URL + '/api/widget/config?accountId=' + ACCOUNT_ID)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      // Resolve locale FIRST so default strings reflect the account's language
      // before we apply per-account overrides.
      if (data.language && LOCALES[data.language]) {
        config.language = data.language;
        locale = LOCALES[data.language];
        config.welcomeMessage = locale.welcomeMessage;
        config.placeholder = locale.placeholder;
        config.brandName = locale.brandName;
        applyLocaleAssets();
      }
      if (data.theme) {
        config.position = data.theme.position || config.position;
        if (data.theme.primaryColor) config.primaryColor = data.theme.primaryColor;
        config.darkMode = data.theme.darkMode === true;
      }
      if (data.welcomeMessage) config.welcomeMessage = data.welcomeMessage;
      if (data.placeholder) config.placeholder = data.placeholder;
      if (data.brandName) config.brandName = data.brandName;
      if (data.profilePic) config.profilePic = data.profilePic;
      if (data.coverImage) config.coverImage = data.coverImage;
      if (Array.isArray(data.socialLinks)) config.socialLinks = data.socialLinks;
      if (data.cartWatcher) config.cartWatcher = data.cartWatcher;
      if (data.tooltip && data.tooltip.text) config.tooltip = data.tooltip;
      // Master on/off from the admin toggle. Default ON: only an explicit
      // false hides the widget, so accounts that never set it are unaffected.
      config.enabled = data.enabled !== false;
      if (data.analyticsToken) ANALYTICS_TOKEN = data.analyticsToken;
      // Optional server-side sampling knob for the high-volume `click`
      // collector; absent on most accounts, which keeps the 1.0 default.
      if (data.sampling && typeof data.sampling.click === 'number') CLICK_SAMPLE_RATE = data.sampling.click;
      // Token just arrived — flush anything queued by boot-time collectors
      // (page_view/product_view/cart_state) that fired before config loaded.
      try { flushBehavior(); } catch (e) { /* */ }
      // Module toggles drive which affordances the widget surfaces (Support
      // link in header, lead capture, etc). Defaults are all-off; the server
      // sets `enabled: true` per module only when the account owner opted in.
      if (data.modules && typeof data.modules === 'object') {
        modules = {
          support: {
            enabled: !!(data.modules.support && data.modules.support.enabled),
            categories: (data.modules.support && data.modules.support.categories) || ['order','product','return','other'],
          },
          leads: { enabled: !!(data.modules.leads && data.modules.leads.enabled) },
          bookings: { enabled: !!(data.modules.bookings && data.modules.bookings.enabled) },
        };
      }
      updateContainerPosition();
      messages = [{ role: 'assistant', content: config.welcomeMessage }];
      widgetTrack('widget_loaded', { modules: modules });
      // Fire chip fetch in parallel — non-blocking; widget renders without chips
      // first, chips populate when ready (≈400ms on cache miss).
      fetchChips('initial');
      // Restore prior conversation when sessionId is known. Covers: visitor
      // closes widget then reopens, page reload, returning visit, and the
      // support-form-then-back-to-chat path. Welcome is shown until history
      // arrives so the panel never flashes empty.
      if (sessionId) {
        fetch(BASE_URL + '/api/widget/session/' + encodeURIComponent(sessionId) + '?accountId=' + ACCOUNT_ID)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (data && Array.isArray(data.messages) && data.messages.length) {
              messages = data.messages;
              if (isOpen) render();
            }
          })
          .catch(function () { /* fail silently — keep welcome */ });
      }
      render();
      try { initCartWatcher(onCartAdd); } catch (e) { /* */ }
    })
    .catch(function () {
      messages = [{ role: 'assistant', content: config.welcomeMessage }];
      render();
    });

  // ============================================
  // DOM Setup
  // ============================================

  var container = document.createElement('div');
  container.id = 'ibot-widget-container';
  updateContainerPosition();
  document.body.appendChild(container);

  // Keyboard handling: when the on-screen keyboard opens, visualViewport shrinks.
  // Resize the open mobile sheet to the visible height so the input bar stays
  // above the keyboard instead of being covered. Registered once.
  if (window.visualViewport && !window.__ibotVVBound) {
    window.__ibotVVBound = true;
    var applyVV = function () {
      var panel = document.getElementById('ibot-panel');
      if (!panel || !isOpen || window.innerWidth >= 640) return;
      var vh = window.visualViewport.height;
      var kb = window.innerHeight - vh;   // space below the visible viewport (keyboard + browser chrome)
      if (kb > 120) {
        // Keyboard up → shrink the full-screen panel to exactly the visible
        // viewport rect so the input bar sits just above the keyboard. The
        // full-screen panel is top:0 via inset:0, so we pin top+height (bottom
        // is ignored when both top and height are set) — unlike the old
        // bottom-sheet which offset `bottom`.
        panel.style.height = Math.round(vh) + 'px';
        panel.style.top = Math.round(window.visualViewport.offsetTop || 0) + 'px';
        panel.style.bottom = 'auto';
      } else {
        // Keyboard down → clear the overrides so the CSS inset:0 / 100dvh governs.
        panel.style.height = '';
        panel.style.top = '';
        panel.style.bottom = '';
      }
      var msgs = document.getElementById('ibot-messages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    };
    window.visualViewport.addEventListener('resize', applyVV);
    window.visualViewport.addEventListener('scroll', applyVV);
  }

  // Scroll-aware bubble: on mobile, hide the closed bubble while the visitor
  // scrolls DOWN (so it never covers the site's own bottom bar / cart), and
  // bring it back when they scroll up or stop. No-op when the widget is open.
  if (!window.__ibotScrollBound) {
    window.__ibotScrollBound = true;
    var lastY = 0, hideTimer = null;
    window.addEventListener('scroll', function () {
      if (isOpen || window.innerWidth >= 640) return;
      var t = document.getElementById('ibot-trigger');
      if (!t) return;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (y > lastY + 8) { t.style.transform = 'translateY(140%)'; t.style.opacity = '0'; }
      else if (y < lastY - 8) { t.style.transform = ''; t.style.opacity = '1'; }
      lastY = y;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { if (t) { t.style.transform = ''; t.style.opacity = '1'; } }, 900);
    }, { passive: true });
  }

  function updateContainerPosition() {
    container.style.cssText = 'position:fixed;z-index:2147483647;' +
      (config.position === 'bottom-left'
        ? 'bottom:calc(20px + env(safe-area-inset-bottom));left:20px;'
        : 'bottom:calc(20px + env(safe-area-inset-bottom));right:20px;') +
      'font-family:"' + locale.font + '",system-ui,sans-serif;direction:' + locale.dir + ';';
  }

  // Mobile open-state = clean full-screen (not a bottom sheet). Full dynamic
  // viewport, safe-area aware, slides up. z-index:1 keeps it under the backdrop-less stack.
  function mobilePanelStyle() {
    return 'position:fixed;inset:0;width:100%;height:100dvh;max-height:100dvh;' +
      'border-radius:0;z-index:1;animation:ibot-slide-up 0.28s ease-out;';
  }

  // Full-screen mobile has no backdrop — the panel fills the viewport.
  function mobileBackdropHtml() { return ''; }

  // ============================================
  // Avatar helper
  // ============================================

  function avatarHtml(size) {
    // Brand image (logo / profile) — NOT the old animated blob iframe, which was
    // heavy and unfriendly on mobile. Falls back to the cover image, then a
    // branded monogram; the blob is gone entirely.
    var img = config.profilePic || config.coverImage;
    if (img) {
      return '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(config.brandName) + '" ' +
        'style="width:100%;height:100%;object-fit:cover;border-radius:50%;" ' +
        'onerror="this.style.display=\'none\';this.parentNode.style.background=\'' + config.primaryColor + '\';" />';
    }
    var letter = escapeHtml(((config.brandName || '?').trim().charAt(0) || '?').toUpperCase());
    return '<div style="width:100%;height:100%;border-radius:50%;background:' + config.primaryColor + ';' +
      'color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-family:inherit;' +
      'font-size:' + Math.round((size || 40) * 0.45) + 'px;line-height:1;">' + letter + '</div>';
  }

  // ============================================
  // Header / social / footer helpers (v4.2 redesign)
  // ============================================

  // Tiny bilingual label helper (avoids editing every LOCALES object).
  function wlbl(he, en) { return config.language === 'en' ? en : he; }

  function socialIconSvg(platform) {
    var p = (platform || '').toLowerCase();
    var a = 'width="17" height="17" viewBox="0 0 24 24" fill="currentColor"';
    if (p === 'instagram') return '<svg ' + a + '><path d="M12 2.2c3.2 0 3.58 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.43.36 1.06.41 2.23.07 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.43.16-1.06.36-2.23.41-1.27.07-1.65.07-4.85.07s-3.58 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.43-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s0-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.43-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2zm0 4.86A4.94 4.94 0 1 0 16.94 12 4.94 4.94 0 0 0 12 7.06zm0 8.14A3.2 3.2 0 1 1 15.2 12 3.2 3.2 0 0 1 12 15.2zm5.13-8.34a1.15 1.15 0 1 0 1.15 1.15 1.15 1.15 0 0 0-1.15-1.15z"/></svg>';
    if (p === 'facebook') return '<svg ' + a + '><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z"/></svg>';
    if (p === 'tiktok') return '<svg ' + a + '><path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.27 0 .53.04.78.12V9.86a5.74 5.74 0 1 0 4.98 5.68V9.4a7.3 7.3 0 0 0 4.27 1.37V7.66a4.28 4.28 0 0 1-3.27-1.84z"/></svg>';
    if (p === 'youtube') return '<svg ' + a + '><path d="M23 12s0-3.2-.4-4.74a2.5 2.5 0 0 0-1.77-1.77C19.3 5.3 12 5.3 12 5.3s-7.3 0-8.83.4A2.5 2.5 0 0 0 1.4 7.46 26 26 0 0 0 1 12a26 26 0 0 0 .4 4.54 2.5 2.5 0 0 0 1.77 1.77c1.53.4 8.83.4 8.83.4s7.3 0 8.83-.4a2.5 2.5 0 0 0 1.77-1.77C23 15.2 23 12 23 12zM9.75 15.5v-7l6 3.5z"/></svg>';
    return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18"/></svg>';
  }

  function socialRowHtml() {
    var links = Array.isArray(config.socialLinks) ? config.socialLinks : [];
    var items = '';
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      if (!l || !l.url) continue;
      // Skip the website link — the widget already lives on the site, so a
      // "go to website" icon is dead weight on the welcome screen.
      var plat = (l.platform || '').toLowerCase();
      if (plat === 'website' || plat === 'web' || plat === 'site' || plat === 'globe') continue;
      items += '<a href="' + escapeHtml(l.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + escapeHtml(l.platform || 'link') + '" ' +
        'onclick="window.__ibotSocialClick(\'' + escapeHtml(plat) + '\')" ' +
        'style="width:34px;height:34px;border-radius:50%;background:var(--ibot-surface);border:1px solid var(--ibot-border);' +
        'display:flex;align-items:center;justify-content:center;color:var(--ibot-text-primary);text-decoration:none;flex-shrink:0;">' +
        socialIconSvg(l.platform) + '</a>';
    }
    if (!items) return '';
    return '<div style="display:flex;justify-content:center;gap:13px;padding:6px 0 12px;">' + items + '</div>';
  }

  // Social icon exit tracking — reuses the catalog's external_link_clicked
  // so these clicks roll into the "יציאות" analytics like other exits.
  window.__ibotSocialClick = function (platform) {
    widgetTrack('external_link_clicked', { platform: platform, from: 'widget_social_row' });
  };

  // "New conversation" icon: chat bubble with a plus — not the refresh
  // arrow, which read as "reload" instead of "start fresh".
  function newChatIconSvg(size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' +
      '<line x1="12" y1="8.5" x2="12" y2="14.5"/><line x1="9" y1="11.5" x2="15" y2="11.5"/></svg>';
  }

  // Small "new conversation" pill (welcome state, absolute top-right).
  function newChatBtnHtml() {
    return '<button onclick="window.__ibotNewChat()" title="' + escapeHtml(wlbl('שיחה חדשה','New chat')) + '" ' +
      'style="position:absolute;top:10px;right:12px;z-index:6;background:rgba(255,255,255,0.92);border:1px solid var(--ibot-border);' +
      'color:#333;border-radius:999px;cursor:pointer;display:flex;align-items:center;gap:5px;font-family:inherit;font-size:12px;padding:5px 10px;line-height:1;">' +
      newChatIconSvg(13) +
      '<span>' + escapeHtml(wlbl('שיחה חדשה','New chat')) + '</span></button>';
  }

  function poweredByFooterHtml() {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 16px 10px;flex-shrink:0;font-size:10.5px;color:var(--ibot-text-muted);">' +
      '<span style="display:flex;align-items:center;gap:5px;">' + escapeHtml(wlbl('מבוסס על','Powered by')) +
      ' <img src="' + BASE_URL + '/brand/bestie-icon.svg" alt="Bestie" style="width:14px;height:14px;border-radius:4px;" onerror="this.style.display=\'none\'"/>' +
      ' <b style="color:var(--ibot-text-muted);font-weight:700;">Bestie</b></span>' +
      '<span>' + escapeHtml(wlbl('AI עלול לטעות','AI can make mistakes')) + '</span></div>';
  }

  // Header: rich cover+logo on the welcome screen, compact bar once chatting.
  function headerHtml(pc, isMobile) {
    var hasUser = messages.some(function (mm) { return mm.role === 'user'; });
    var radius = isMobile ? '' : 'border-radius:18px 18px 0 0;';
    if (!hasUser) {
      var coverUrl = config.coverImage ? String(config.coverImage).replace(/['"]/g, '') : '';
      // No cover image → plain panel background (white in light mode), not a
      // gradient — accounts without a cover shouldn't get a random color wash.
      var coverBg = coverUrl
        ? "background-color:var(--ibot-surface);background-image:url('" + coverUrl + "');background-size:cover;background-position:center;"
        : 'background:var(--ibot-panel-bg);';
      return '<div style="position:relative;flex-shrink:0;' + radius + 'overflow:hidden;">' +
        newChatBtnHtml() +
        '<div style="position:absolute;top:12px;left:14px;z-index:6;display:flex;align-items:center;gap:5px;background:rgba(255,255,255,0.85);padding:3px 8px;border-radius:999px;font-size:11.5px;color:#15803d;">' +
        '<span style="width:7px;height:7px;border-radius:50%;background:#22c55e;"></span>' + escapeHtml(locale.status) + '</div>' +
        '<div style="height:' + (isMobile ? '132px' : '112px') + ';position:relative;' + coverBg + '"><div style="position:absolute;left:0;right:0;bottom:0;height:46px;background:linear-gradient(to bottom,transparent,var(--ibot-panel-bg));"></div></div>' +
        '<div style="width:84px;height:84px;margin:-42px auto 0;border-radius:50%;border:4px solid var(--ibot-panel-bg);overflow:hidden;position:relative;z-index:2;box-shadow:0 4px 14px rgba(0,0,0,0.12);">' + avatarHtml(84) + '</div>' +
        '<div style="text-align:center;font-weight:800;font-size:20px;color:var(--ibot-text-primary);margin:9px 12px 2px;">' + escapeHtml(config.brandName) + '</div>' +
        socialRowHtml() +
        (isMobile ? '<button id="ibot-close-mobile" style="position:absolute;top:10px;left:54px;background:rgba(0,0,0,0.32);border:none;color:#fff;cursor:pointer;width:30px;height:30px;border-radius:50%;font-size:18px;display:flex;align-items:center;justify-content:center;z-index:6;">&times;</button>' : '') +
        '</div>';
    }
    return '<div style="display:flex;align-items:center;gap:10px;padding:0 12px;height:62px;flex-shrink:0;position:relative;z-index:2;' +
      'background:var(--ibot-surface);border-bottom:1px solid var(--ibot-border);' + radius + '">' +
      '<div style="width:40px;height:40px;flex-shrink:0;border-radius:50%;overflow:hidden;">' + avatarHtml(40) + '</div>' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-weight:700;font-size:16px;color:var(--ibot-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(config.brandName) + '</div>' +
      '<div style="display:flex;align-items:center;gap:4px;margin-top:1px;"><span style="width:7px;height:7px;border-radius:50%;background:#22c55e;"></span><span style="font-size:11.5px;color:#15803d;">' + escapeHtml(locale.status) + '</span></div>' +
      '</div>' +
      '<button onclick="window.__ibotNewChat()" title="' + escapeHtml(wlbl('שיחה חדשה','New chat')) + '" style="background:transparent;border:none;color:var(--ibot-text-muted);cursor:pointer;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
      newChatIconSvg(17) + '</button>' +
      (modules.support.enabled ? '<button id="ibot-open-support" title="' + escapeHtml(locale.support.openLink) + '" style="background:transparent;border:none;color:var(--ibot-text-muted);cursor:pointer;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></button>' : '') +
      (isMobile ? '<button id="ibot-close-mobile" style="background:transparent;border:none;color:var(--ibot-text-muted);cursor:pointer;width:34px;height:34px;font-size:22px;flex-shrink:0;line-height:1;">&times;</button>' : '') +
      '</div>';
  }

  // New-conversation reset (confirm → clear session + history).
  window.__ibotNewChat = function () {
    // No confirm prompt — starting a new chat is a one-tap action. The prior
    // conversation stays in the DB (visual history restores it on return),
    // so there is nothing to warn about losing.
    widgetTrack('widget_new_chat_clicked', { msg_count: messages.length });
    try { localStorage.removeItem('ibot_widget_' + ACCOUNT_ID); } catch (e) { /* */ }
    sessionId = null;
    messages = [{ role: 'assistant', content: config.welcomeMessage }];
    chips = [];
    ratings = {};
    pendingAction = null;
    view = 'chat';
    fetchChips('initial');
    render();
  };

  // ============================================
  // Render
  // ============================================

  function render() {
    // Mobile: lock the host page's scroll while the chat is open (it's a
    // full-screen takeover on phones) so the site doesn't scroll behind it and
    // feel "stuck". Restored the moment the widget closes.
    try {
      var lockScroll = isOpen && window.innerWidth < 640 && config.enabled !== false;
      document.documentElement.style.overflow = lockScroll ? 'hidden' : '';
      document.body.style.overflow = lockScroll ? 'hidden' : '';
    } catch (e) { /* */ }
    // Master switch (admin toggle): when disabled, render nothing at all.
    if (config.enabled === false) { try { container.innerHTML = ''; } catch (e) { /* */ } return; }
    if (!isOpen) {
      renderClosed();
      return;
    }
    if (view === 'support_form') { renderSupportForm(); }
    else if (view === 'support_success') { renderSupportSuccess(); }
    else if (view === 'lead_form') { renderLeadForm(); }
    else if (view === 'lead_success') { renderGenericSuccess(locale.lead); }
    else if (view === 'book_demo_form') { renderBookDemoForm(); }
    else if (view === 'book_demo_success') { renderGenericSuccess(locale.bookDemo); }
    else if (view === 'order_form') { renderOrderForm(); }
    else if (view === 'order_result') { renderOrderResult(); }
    else { renderOpen(); }
    attachSheetBehaviors();
  }

  // Shared close: used by the backdrop tap (and available to later tasks'
  // drag/keyboard-close behaviors). Mirrors the inline isOpen/track/render
  // sequence the close buttons already use.
  function closeWidget() {
    isOpen = false;
    view = 'chat';
    widgetTrack('widget_closed', { msg_count: messages.length });
    render();
  }

  // Wires mobile-sheet interactions after each open render: tap-backdrop closes,
  // drag-the-handle-down dismisses.
  // (Keyboard is added in a later task to this same function.)
  function attachSheetBehaviors() {
    if (window.innerWidth >= 640 || !isOpen) return;
    // Re-apply keyboard-safe geometry after every render — render() fires on
    // send/thinking/reply while the keyboard stays open, with no visualViewport
    // event to trigger it. applyVV sets the geometry when the keyboard is up and
    // clears it (→ CSS 100dvh) when down. Single source of truth. (applyVV is
    // var-hoisted to this IIFE; undefined only if visualViewport is unsupported.)
    if (typeof applyVV === 'function') applyVV();
    var bd = document.getElementById('ibot-backdrop');
    if (bd) bd.onclick = function () { closeWidget(); };

    var panel = document.getElementById('ibot-panel');
    var handle = document.querySelector('#ibot-widget-container [data-ibot-drag="1"]');
    if (panel && handle) {
      var startY = 0, dy = 0, dragging = false;
      handle.ontouchstart = function (e) {
        dragging = true; dy = 0;
        startY = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
        panel.style.transition = 'none';
      };
      handle.ontouchmove = function (e) {
        if (!dragging) return;
        var y = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
        dy = Math.max(0, y - startY);           // only downward
        panel.style.transform = 'translateY(' + dy + 'px)';
      };
      handle.ontouchend = function () {
        if (!dragging) return;
        dragging = false;
        panel.style.transition = 'transform 0.25s ease-out';
        if (dy > 120) { closeWidget(); }         // dragged far enough → dismiss
        else { panel.style.transform = 'translateY(0)'; }  // snap back
      };
    }
  }

  // ---- Closed state: blob only ----
  function renderClosed() {
    container.innerHTML =
      '<div id="ibot-trigger" style="' +
      'width:60px;height:60px;cursor:pointer;' +
      'transition:transform 0.3s ease, opacity 0.25s ease;animation:ibot-slide-up 0.35s ease-out;' +
      'border-radius:50%;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">' +
      avatarHtml(60) +
      '</div>';

    var trigger = document.getElementById('ibot-trigger');
    trigger.onclick = function () {
      isOpen = true;
      widgetTrack('widget_opened', {});
      render();
    };
    trigger.onmouseover = function () { this.style.transform = 'scale(1.03)'; };
    trigger.onmouseout = function () { this.style.transform = 'scale(1)'; };
  }

  // ---- Open state: chat panel ----
  function renderOpen() {
    var pc = config.primaryColor; // per-widget color
    // Build messages HTML
    var msgsHtml = '';
    for (var mi = 0; mi < messages.length; mi++) {
      var m = messages[mi];
      var isUser = m.role === 'user';
      var isLast = mi === messages.length - 1;
      var isEmpty = !m.content && isLoading && isLast;

      // Phase 1: structured product cards rendered as their own row inside the chat.
      if (m.role === 'cards' && Array.isArray(m.products) && m.products.length) {
        msgsHtml += renderCardsRow(m.products, m.layout || 'stack', pc);
        continue;
      }

      // Typing / thinking indicator
      if (isEmpty) {
        var indicatorContent = thinkingText
          ? '<span style="animation:ibot-fade-in 0.3s ease-out;">' + escapeHtml(thinkingText) + '</span>'
          : '<span style="width:6px;height:6px;border-radius:50%;background:#676767;animation:ibot-bounce 1.2s ease-in-out infinite;"></span>' +
            '<span style="width:6px;height:6px;border-radius:50%;background:#676767;animation:ibot-bounce 1.2s ease-in-out 0.15s infinite;"></span>' +
            '<span style="width:6px;height:6px;border-radius:50%;background:#676767;animation:ibot-bounce 1.2s ease-in-out 0.3s infinite;"></span>';
        msgsHtml +=
          '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;animation:ibot-msg-in 0.3s ease-out;">' +
          '<div style="display:flex;align-items:flex-end;gap:8px;max-width:85%;">' +
          '<div style="width:20px;height:20px;flex-shrink:0;">' +
          avatarHtml(20) + '</div>' +
          '<div style="padding:9px 12px;border-radius:30px;font-size:16px;' +
          'background:var(--ibot-surface);color:#000;display:flex;gap:4px;align-items:center;">' +
          indicatorContent +
          '</div></div></div>';
        continue;
      }

      if (isUser) {
        // User bubble: primary color, rounded-30px, right-aligned (flex-start in RTL)
        msgsHtml +=
          '<div style="display:flex;justify-content:flex-start;margin-bottom:12px;animation:ibot-msg-in 0.3s ease-out;">' +
          '<div style="max-width:82%;padding:9px 12px;border-radius:30px;font-size:16px;line-height:1.5;' +
          'background:' + pc + ';color:#fff;word-break:break-word;">' +
          formatMessage(m.content, true) +
          '</div></div>';
      } else {
        // Bot bubble — palette-aware. Rating row (👍👎) only on the LAST bot
        // turn so historical messages stay clean; vanishes once visitor rates.
        var showRating = isLast && !isLoading && mi > 0 && !ratings[mi];
        var ratingRow = showRating
          ? ('<div style="display:flex;gap:4px;margin-top:6px;padding-' + (locale.dir === 'rtl' ? 'right' : 'left') + ':28px;">' +
             '<button onclick="window.__ibotRate(' + mi + ',\'up\')" title="טוב" style="background:transparent;border:1px solid var(--ibot-border);border-radius:999px;width:26px;height:26px;cursor:pointer;color:var(--ibot-text-muted);font-size:13px;display:flex;align-items:center;justify-content:center;font-family:inherit;">👍</button>' +
             '<button onclick="window.__ibotRate(' + mi + ',\'down\')" title="לא" style="background:transparent;border:1px solid var(--ibot-border);border-radius:999px;width:26px;height:26px;cursor:pointer;color:var(--ibot-text-muted);font-size:13px;display:flex;align-items:center;justify-content:center;font-family:inherit;">👎</button>' +
             '</div>')
          : '';
        // Mark the actively-streaming bubble so delta events can update its
        // text directly without re-rendering the whole panel (which caused
        // visible flicker, scroll jumps, and input focus loss on every token).
        var streamingId = isLast && isLoading ? ' id="ibot-streaming-bubble"' : '';
        msgsHtml +=
          '<div style="display:flex;flex-direction:column;align-items:flex-end;margin-bottom:12px;animation:ibot-msg-in 0.3s ease-out;">' +
          '<div style="display:flex;align-items:flex-end;gap:8px;max-width:85%;">' +
          '<div style="width:20px;height:20px;flex-shrink:0;">' +
          avatarHtml(20) + '</div>' +
          '<div' + streamingId + ' style="padding:9px 12px;border-radius:30px;font-size:16px;line-height:1.5;' +
          'background:var(--ibot-bot-bubble-bg);color:var(--ibot-bot-bubble-text);word-break:break-word;">' +
          formatMessage(m.content, false) +
          '</div></div>' + ratingRow + '</div>';
      }
    }

    // Bot-initiated action card — rendered after the latest bot message when
    // the model proposed an action (e.g. "open support form prefilled with X").
    // Visitor confirms → we open the form with the bot's prefill; dismisses → card disappears.
    if (pendingAction) {
      msgsHtml += renderActionCard(pendingAction, pc);
    }

    var isMobile = window.innerWidth < 640;

    // Panel dimensions per Figma
    var panelStyle = isMobile
      ? mobilePanelStyle()
      : 'width:400px;height:auto;max-height:min(680px, calc(100vh - 80px));border-radius:18px;position:relative;';

    container.innerHTML =
      (isMobile ? mobileBackdropHtml() : '') +
      // Main panel
      '<div id="ibot-panel" style="' + panelStyle +
      'background:var(--ibot-panel-bg);' +
      'display:flex;flex-direction:column;overflow:hidden;' +
      'box-shadow:0 8px 40px rgba(0,0,0,0.15);' +
      'animation:ibot-slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1);">' +

      // ---- Header (v4.2: cover+logo on welcome, compact bar in chat) ----
      headerHtml(pc, isMobile) +

      // ---- Toast overlay (transient confirmations) ----
      renderToastHtml(pc) +

      // ---- Messages area (padding matches header 16px) ----
      '<div id="ibot-messages" style="flex:1;min-height:0;overflow-y:auto;padding:12px 16px;direction:' + locale.dir + ';">' +
      msgsHtml +
      '</div>' +

      // ---- Smart chips row (only when no user message yet AND chips loaded) ----
      ((chips.length > 0 && !messages.some(function (mm) { return mm.role === 'user'; }))
        ? renderChipsRow(chips, pc)
        : '') +

      // ---- Footer actions row — visible only after first user turn so it
      // doesn't compete with the smart chips on cold start. Each link is
      // module-gated: human handoff only when support is on, transcript only
      // when there's a conversation worth sending.
      (messages.some(function (mm) { return mm.role === 'user'; })
        ? '<div style="padding:0 16px 4px;display:flex;gap:14px;justify-content:center;flex-shrink:0;flex-wrap:wrap;">' +
          (modules.support.enabled
            ? '<button onclick="window.__ibotHuman()" style="background:transparent;border:none;color:var(--ibot-text-muted);cursor:pointer;font-size:11.5px;text-decoration:underline;text-underline-offset:2px;font-family:inherit;padding:0;">' + escapeHtml(locale.support.humanLink) + '</button>'
            : '') +
          '<button onclick="window.__ibotTranscript()" style="background:transparent;border:none;color:var(--ibot-text-muted);cursor:pointer;font-size:11.5px;text-decoration:underline;text-underline-offset:2px;font-family:inherit;padding:0;">' + escapeHtml(locale.support.transcriptLink) + '</button>' +
          '</div>'
        : '') +

      // ---- Input area (centered, same 16px side padding as header) ----
      '<div style="padding:8px 16px 14px;flex-shrink:0;">' +
      '<div style="display:flex;align-items:center;gap:8px;background:var(--ibot-surface);border-radius:18px;' +
      'padding:8px 8px 8px 10px;height:60px;box-shadow:4px 6px 23px rgba(0,0,0,0.1);overflow:hidden;">' +
      // Send button (left side in RTL)
      '<button id="ibot-send" style="width:38px;height:38px;background:' + pc + ';color:#fff;border:none;' +
      'border-radius:60px;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
      'flex-shrink:0;transition:transform 0.2s,opacity 0.2s;' +
      (isLoading ? 'opacity:0.5;pointer-events:none;' : '') + '">' +
      '<svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M7 1L1 7M7 1L13 7M7 1V15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      // Voice input (Web Speech API). Hidden when API unavailable so users
      // on unsupported browsers don't see a dead button. Tap-to-talk model.
      (hasVoiceSupport()
        ? '<button id="ibot-mic" title="Voice input" style="width:34px;height:34px;background:var(--ibot-surface-alt);border:1px solid var(--ibot-border);color:var(--ibot-text-muted);' +
          'border-radius:60px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;' +
          (isListening ? 'background:' + pc + ';color:#fff;animation:ibot-bounce 1.5s ease-in-out infinite;' : '') + '">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>' +
          '</svg></button>'
        : '') +
      // Input field
      '<input id="ibot-input" type="text" placeholder="' + escapeHtml(config.placeholder) + '" ' +
      'style="flex:1;border:none;outline:none;font-size:16px;color:var(--ibot-text-primary);background:transparent;' +
      'direction:' + locale.dir + ';font-family:inherit;text-align:' + (locale.dir === 'rtl' ? 'right' : 'left') + ';min-width:0;" />' +
      '</div></div>' +

      // ---- Powered by Bestie footer ----
      poweredByFooterHtml() +

      '</div>' +

      // ---- Close button below panel (desktop only, Figma: dark circle with chevron-down) ----
      (isMobile ? '' :
        '<div style="display:flex;justify-content:flex-end;margin-top:12px;">' +
        '<button id="ibot-close" style="width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;' +
        'background:' + pc + ';color:#fff;display:flex;align-items:center;justify-content:center;' +
        'box-shadow:0 2px 32px rgba(0,0,0,0.16),0 1px 6px rgba(0,0,0,0.06);' +
        'transition:transform 0.2s;">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="6 9 12 15 18 9"></polyline></svg>' +
        '</button></div>');

    // Scroll to bottom
    var msgsEl = document.getElementById('ibot-messages');
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

    // Event listeners
    var closeEl = document.getElementById('ibot-close');
    if (closeEl) {
      closeEl.onclick = function () {
        isOpen = false;
        widgetTrack('widget_closed', { msg_count: messages.length });
        render();
      };
      closeEl.onmouseover = function () { this.style.transform = 'scale(1.08)'; };
      closeEl.onmouseout = function () { this.style.transform = 'scale(1)'; };
    }

    var closeMobileEl = document.getElementById('ibot-close-mobile');
    if (closeMobileEl) {
      closeMobileEl.onclick = function () {
        isOpen = false;
        widgetTrack('widget_closed', { msg_count: messages.length });
        render();
      };
      closeMobileEl.onmouseover = function () { this.style.background = 'rgba(255,255,255,0.25)'; };
      closeMobileEl.onmouseout = function () { this.style.background = 'rgba(255,255,255,0.15)'; };
    }

    var supportBtn = document.getElementById('ibot-open-support');
    if (supportBtn) {
      supportBtn.onclick = function () {
        widgetTrack('widget_support_opened', { from: 'header' });
        openSupportForm(null);
      };
      supportBtn.onmouseover = function () { this.style.background = 'rgba(255,255,255,0.22)'; };
      supportBtn.onmouseout = function () { this.style.background = 'rgba(255,255,255,0.12)'; };
    }

    var micBtn = document.getElementById('ibot-mic');
    if (micBtn) {
      micBtn.onclick = toggleVoiceInput;
    }

    var inputEl = document.getElementById('ibot-input');
    var sendEl = document.getElementById('ibot-send');

    sendEl.onclick = sendMessage;
    sendEl.onmouseover = function () { if (!isLoading) this.style.transform = 'scale(1.08)'; };
    sendEl.onmouseout = function () { this.style.transform = 'scale(1)'; };
    inputEl.onkeydown = function (e) {
      if (e.key === 'Enter') sendMessage();
    };
    inputEl.focus();
  }

  // ============================================
  // Send Message
  // ============================================

  function sendMessage() {
    var inputEl = document.getElementById('ibot-input');
    var text = inputEl ? inputEl.value.trim() : '';
    if (!text || isLoading) return;

    inputEl.value = '';
    messages.push({ role: 'user', content: text });
    messages.push({ role: 'assistant', content: '' });
    isLoading = true;
    widgetTrack('widget_message_sent', { length: text.length, msg_index: messages.length - 2 });
    render();

    // Re-extract page context each turn — pages within a SPA can change without
    // a reload (cart/product transitions). Cheap (<2ms) for the sync part; the
    // async Shopify /cart.js refresh is fire-and-forget so it doesn't add
    // latency to this turn (it lands in time for the next one).
    pageContext = extractPageContext();
    if (typeof isLikelyShopify === 'function' && isLikelyShopify()) {
      extractPageContextAsync().then(function (enriched) { pageContext = enriched; });
    }

    fetch(BASE_URL + '/api/widget/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        accountId: ACCOUNT_ID,
        sessionId: sessionId,
        anonId: ANON_ID,
        language: config.language,
        pageContext: pageContext,
        modules: { support: !!modules.support.enabled, leads: !!modules.leads.enabled, bookings: !!modules.bookings.enabled },
      }),
    })
      .then(function (res) {
        if (!res.ok || !res.body) throw new Error('Request failed');
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var fullText = '';

        function read() {
          reader.read().then(function (result) {
            if (result.done) {
              isLoading = false;
              thinkingText = null;
              var clean = fullText
                .replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '')
                .replace(/<<INTENT>>[\s\S]*?<<\/INTENT>>/g, '')
                .replace(/<<ACTION>>[\s\S]*?<<\/ACTION>>/g, '')
                .replace(/<<PRODUCTS>>[\s\S]*?<<\/PRODUCTS>>/g, '')
                .trim();
              // Find the bot text message (cards messages may have been pushed
              // after it; walk backwards to the first assistant text node).
              for (var bi = messages.length - 1; bi >= 0; bi--) {
                if (messages[bi].role === 'assistant') {
                  messages[bi].content = clean;
                  break;
                }
              }
              widgetTrack('widget_message_received', { length: clean.length });
              render();
              // Refresh follow-up chips for the next visitor tap. Non-blocking.
              var lastUserMsg = '';
              for (var ui = messages.length - 1; ui >= 0; ui--) {
                if (messages[ui].role === 'user') { lastUserMsg = messages[ui].content; break; }
              }
              fetchChips('follow_up', lastUserMsg, clean);
              return;
            }

            var chunk = decoder.decode(result.value, { stream: true });
            var lines = chunk.split('\n').filter(Boolean);

            for (var i = 0; i < lines.length; i++) {
              try {
                var event = JSON.parse(lines[i]);
                if (event.type === 'thinking' && event.text) {
                  thinkingText = event.text;
                  render();
                } else if (event.type === 'delta' && event.text) {
                  fullText += event.text;
                  // Strip all three envelope types while streaming so partial
                  // tokens never flash on screen (incl. <<ACTION>> which arrives
                  // mid-stream before the server can finalize the action event).
                  var displayText = fullText
                    .replace(/<<SUGGESTIONS>>[\s\S]*/g, '')
                    .replace(/<<INTENT>>[\s\S]*/g, '')
                    .replace(/<<ACTION>>[\s\S]*/g, '')
                    .replace(/<<PRODUCTS>>[\s\S]*/g, '')
                    .trim();
                  messages[messages.length - 1].content = displayText;
                  // Throttle the actual DOM write to one paint per frame via
                  // requestAnimationFrame. Without this, fast LLMs stream
                  // 50+ tokens/sec → each token triggered an innerHTML rewrite
                  // → visible flicker even with the streaming-bubble surgical
                  // update. Coalescing to ~60fps gives a smooth typewriter feel.
                  scheduleStreamPaint();
                } else if (event.type === 'intent') {
                  // Phase 2: persist last topic for next-page-load chip relevance.
                  // Track for analytics. Layout is already encoded in the cards event.
                  widgetTrack('widget_intent_classified', {
                    stage: event.stage || null,
                    objection: event.objection || null,
                    topic: event.topic || null,
                    confidence: event.confidence || null,
                  });
                  if (event.topic) {
                    lastTopic = event.topic;
                    try { localStorage.setItem('ibot_last_topic_' + ACCOUNT_ID, event.topic); } catch (e) { /* */ }
                  }
                } else if (event.type === 'cards' && Array.isArray(event.products)) {
                  // Phase 1: structured product cards. Push as a separate message
                  // node so the renderer can lay them out under the bot bubble.
                  // Empty products = no-op (no cards row).
                  if (event.products.length > 0) {
                    window.__ibotLastCards = { products: event.products, layout: event.layout || 'stack' };
                    messages.push({
                      role: 'cards',
                      products: event.products,
                      layout: event.layout || 'stack',
                    });
                    render();
                  }
                } else if (event.type === 'action' && event.action) {
                  // Concierge action — the bot inferred the visitor wants to do
                  // something the widget can actually carry out (open a support
                  // ticket, capture a lead, etc). Render an inline confirmation
                  // card; one click confirms with the prefill the bot proposed.
                  pendingAction = event.action;
                  widgetTrack('widget_action_proposed', {
                    type: event.action.type || null,
                    has_prefill: !!event.action.prefill,
                  });
                  render();
                } else if (event.type === 'error') {
                  messages[messages.length - 1].content = event.message || locale.errorMessage;
                  isLoading = false;
                  render();
                } else if (event.type === 'done') {
                  if (event.sessionId) {
                    sessionId = event.sessionId;
                    localStorage.setItem('ibot_widget_' + ACCOUNT_ID, sessionId);
                  }
                }
                // Unknown event types intentionally ignored — forward-compat.
              } catch (e) {
                // Skip malformed lines
              }
            }

            read();
          }).catch(function () {
            isLoading = false;
            thinkingText = null;
            messages[messages.length - 1].content = locale.connectionError;
            render();
          });
        }

        read();
      })
      .catch(function () {
        isLoading = false;
        thinkingText = null;
        messages[messages.length - 1].content = locale.connectionError;
        render();
      });
  }

  // ============================================
  // Utilities
  // ============================================

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Stamp Bestie attribution onto outbound store/product links so the click
  // shows up as source "bestie" in the merchant's analytics (Shopify, GA4…).
  // Only tags absolute http(s) URLs and never overrides utm_* the merchant set.
  // `content` distinguishes the surface (card vs inline). Returns the URL
  // unchanged on any parse failure — attribution must never break a click.
  function bestieTag(url, content) {
    if (!url) return url;
    try {
      var u = new URL(url, document.baseURI);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return url;
      if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'bestie');
      if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', 'chat');
      if (content && !u.searchParams.has('utm_content')) u.searchParams.set('utm_content', content);
      return u.href;
    } catch (e) {
      return url;
    }
  }

  // ---- Smart chips row (above input) ----
  // Cap at 3 chips with wrap. Earlier we used overflow-x:auto which felt
  // broken in the 370px panel — a chip got cut off and visitors didn't
  // realize there was more behind a horizontal scroll. Wrap + cap keeps
  // everything visible in the small surface.
  function renderChipsRow(items, pc) {
    var pills = '';
    var rendered = 0;
    for (var i = 0; i < items.length && rendered < 4; i++) {
      var label = String(items[i] || '').trim();
      if (!label) continue;
      // Full question always shown — a chip cut to "מה מומלץ לשי…" doesn't
      // tell the visitor what they're about to ask. Long labels wrap to a
      // second line instead of truncating.
      pills +=
        '<button onclick="window.__ibotChipClick(' + i + ')" ' +
        'style="background:var(--ibot-surface);border:1px solid var(--ibot-border);color:var(--ibot-text-primary);cursor:pointer;' +
        'border-radius:999px;padding:6px 11px;font-size:12.5px;line-height:1.3;white-space:normal;text-align:center;' +
        'font-family:inherit;transition:transform 0.15s,border-color 0.15s;max-width:100%;" ' +
        'onmouseover="this.style.transform=\'translateY(-1px)\';this.style.borderColor=\'' + pc + '\';" ' +
        'onmouseout="this.style.transform=\'\';this.style.borderColor=\'var(--ibot-border)\';">' +
        escapeHtml(label) + '</button>';
      rendered++;
    }
    if (!pills) return '';
    return (
      '<div style="padding:4px 16px;display:flex;flex-wrap:wrap;gap:6px;direction:' + locale.dir + ';flex-shrink:0;">' +
      pills +
      '</div>'
    );
  }

  // ---- Product cards row (inside messages) ----
  function renderCardsRow(products, layout, pc) {
    var isCompare = layout === 'compare';
    var cardWidth = isCompare ? '47%' : '180px';
    var cardsHtml = '';
    for (var i = 0; i < products.length; i++) {
      var p = products[i] || {};
      var price = p.price != null ? locale.currencyPrefix + p.price : '';
      var orig = p.originalPrice && p.originalPrice > p.price
        ? '<span style="color:var(--ibot-text-muted);text-decoration:line-through;font-size:12px;margin-right:6px;">' + locale.currencyPrefix + p.originalPrice + '</span>'
        : '';
      var badge = '';
      if (p.badge) {
        var badgeColor = p.badge === 'SALE' ? '#dc2626' : (p.badge === 'NEW' ? '#16a34a' : '#7c3aed');
        var badgeText = locale.badge[p.badge] || locale.badge.DEFAULT;
        badge =
          '<div style="position:absolute;top:6px;right:6px;background:' + badgeColor + ';color:#fff;' +
          'font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;letter-spacing:0.3px;">' +
          badgeText + '</div>';
      }
      var img = p.image
        ? '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name || '') + '" ' +
          'style="width:100%;height:120px;object-fit:cover;border-radius:10px 10px 0 0;background:var(--ibot-surface-alt);" ' +
          'onerror="this.style.display=\'none\';this.parentNode.style.background=\'#f3f4f6\';this.parentNode.style.height=\'120px\';" />'
        : '<div style="width:100%;height:120px;background:var(--ibot-surface-alt);border-radius:10px 10px 0 0;"></div>';
      var recFor = p.recommendedFor
        ? '<div style="font-size:11px;color:var(--ibot-text-muted);margin-bottom:4px;">' + escapeHtml(locale.recommendedFor) + escapeHtml(p.recommendedFor) + '</div>'
        : '';
      var sp = p.socialProof || {};
      var spLine = '';
      if (sp.rating || sp.review_count) {
        spLine += '<div style="font-size:11px;color:var(--ibot-text-muted);display:flex;align-items:center;gap:3px;margin-top:4px;">';
        if (sp.rating) spLine += '<span style="color:#f59e0b;">★</span><span>' + sp.rating + '</span>';
        if (sp.review_count) spLine += '<span>(' + sp.review_count + ')</span>';
        spLine += '</div>';
      }
      var purchase = sp.purchase_signal
        ? '<div style="font-size:11px;color:' + pc + ';margin-top:3px;font-weight:500;">' + escapeHtml(sp.purchase_signal) + '</div>'
        : '';
      var safeId = escapeHtml(p.id || '');
      cardsHtml +=
        '<div style="background:var(--ibot-surface);border:1px solid var(--ibot-border);border-radius:12px;overflow:hidden;' +
        'flex-shrink:0;width:' + cardWidth + ';display:flex;flex-direction:column;position:relative;' +
        'box-shadow:0 1px 3px rgba(0,0,0,0.04);transition:transform 0.15s,box-shadow 0.15s;cursor:pointer;" ' +
        'onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 4px 12px rgba(0,0,0,0.08)\';" ' +
        'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'0 1px 3px rgba(0,0,0,0.04)\';" ' +
        'onclick="window.__ibotCardClick(\'' + safeId + '\',' + i + ')">' +
        img + badge +
        '<div style="padding:10px 12px 12px;display:flex;flex-direction:column;flex:1;">' +
        '<div style="font-weight:600;font-size:14px;line-height:1.3;color:var(--ibot-text-primary);margin-bottom:4px;' +
        'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' +
        escapeHtml(p.name || '') + '</div>' +
        recFor +
        '<div style="margin-top:auto;display:flex;align-items:center;flex-wrap:wrap;">' +
        '<span style="font-weight:700;font-size:15px;color:var(--ibot-text-primary);">' + price + '</span>' +
        orig +
        '</div>' +
        spLine + purchase +
        '<button style="margin-top:8px;background:' + pc + ';color:#fff;border:none;border-radius:8px;' +
        'padding:7px 10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;width:100%;" ' +
        'onclick="event.stopPropagation();window.__ibotCardClick(\'' + safeId + '\',' + i + ')">' +
        escapeHtml(p.ctaLabel || locale.defaultCta) + '</button>' +
        '</div></div>';
    }
    if (!cardsHtml) return '';
    return (
      '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;animation:ibot-msg-in 0.3s ease-out;">' +
      '<div style="display:flex;gap:8px;overflow-x:auto;width:100%;padding-bottom:4px;direction:' + locale.dir + ';' +
      '-webkit-overflow-scrolling:touch;scrollbar-width:none;">' +
      cardsHtml +
      '</div></div>'
    );
  }

  function formatMessage(str, isUserMsg) {
    if (!str) return '';
    var textColor = isUserMsg ? '#fff' : '#000';
    var linkColor = isUserMsg ? '#93c5fd' : config.primaryColor;
    var lines = str.split('\n');
    var html = '';
    var inUl = false;
    var inOl = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      var bulletMatch = trimmed.match(/^[-•]\s+(.+)/) || (trimmed.match(/^\*\s+(.+)/) && !trimmed.match(/^\*\*[^*]/));
      var numMatch = trimmed.match(/^\d+[.)]\s+(.+)/);

      if (bulletMatch) {
        if (inOl) { html += '</ol>'; inOl = false; }
        if (!inUl) { html += '<ul style="margin:4px 0;padding-right:16px;list-style:none;">'; inUl = true; }
        html += '<li style="margin-bottom:3px;line-height:1.5;color:' + textColor + ';position:relative;padding-right:12px;">' +
          '<span style="position:absolute;right:0;">•</span>' +
          formatInline(bulletMatch[1] || trimmed.replace(/^[-•*]\s+/, '')) + '</li>';
      } else if (numMatch) {
        if (inUl) { html += '</ul>'; inUl = false; }
        if (!inOl) { html += '<ol style="margin:4px 0;padding-right:16px;list-style:decimal inside;">'; inOl = true; }
        html += '<li style="margin-bottom:3px;line-height:1.5;color:' + textColor + ';">' + formatInline(numMatch[1]) + '</li>';
      } else {
        if (inUl) { html += '</ul>'; inUl = false; }
        if (inOl) { html += '</ol>'; inOl = false; }
        if (trimmed === '') {
          html += '<div style="height:6px;"></div>';
        } else {
          html += '<div style="margin-bottom:4px;line-height:1.5;">' + formatInline(trimmed) + '</div>';
        }
      }
    }
    if (inUl) html += '</ul>';
    if (inOl) html += '</ol>';
    return html;

    function formatInline(text) {
      var safe = escapeHtml(text);
      // Markdown images
      safe = safe.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (_, alt, src) {
        return '<div style="margin:8px 0;"><img src="' + src + '" alt="' + alt + '" ' +
          'style="max-width:100%;max-height:180px;border-radius:10px;object-fit:cover;cursor:pointer;" ' +
          'onerror="this.style.display=\'none\'" ' +
          'onclick="window.open(\'' + src + '\',\'_blank\')" /></div>';
      });
      // Markdown links (with product click tracking for /product/ URLs).
      // Resolve relative URLs against document.baseURI — in the customer's
      // site that's their own origin; in our admin preview iframe it's the
      // customer's URL via the <base href> injection we add server-side.
      // Without this, `[צור קשר](/contact)` would resolve to OUR origin
      // inside the preview iframe → 404.
      safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, t, u) {
        var href = u;
        try {
          // new URL() resolves relative against baseURI; absolute URLs pass through.
          href = new URL(u, document.baseURI).href;
        } catch (e) { /* malformed — fall back to raw */ }
        var isProductLink = href.indexOf('/product') !== -1;
        if (isProductLink) href = bestieTag(href, 'inline');
        var trackAttr = isProductLink
          ? ' onclick="try{window.__ibotInlineProductClick&&window.__ibotInlineProductClick(this.href)}catch(e){}"'
          : '';
        // Product links navigate the CURRENT tab (e-commerce norm, same as the
        // cards); other links (contact, external references) still open a new tab.
        return '<a href="' + escapeHtml(href) + '" rel="noopener"' + (isProductLink ? '' : ' target="_blank"') + trackAttr +
          ' style="color:' + linkColor + ';text-decoration:underline;' +
          'text-underline-offset:2px;font-weight:500;">' + t + '</a>';
      });
      // **bold**
      safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:600;">$1</strong>');
      // `inline code`
      safe = safe.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:4px;font-size:0.9em;">$1</code>');
      return safe;
    }
  }

  // ============================================
  // Page Context — what the visitor is looking at, extracted from the
  // embedding site. Reads schema.org JSON-LD (Product, Article, FAQPage),
  // OpenGraph meta, dataLayer (GTM ecommerce), and structural cues (h1,
  // breadcrumb). Cheap, ~1ms. Re-extracted before every chat turn.
  // ============================================
  function extractPageContext() {
    var ctx = {
      url: location.href,
      path: location.pathname,
      title: document.title || '',
      h1: null,
      lang: document.documentElement.lang || null,
      product: null, // {name, price, currency, image, sku, brand, availability}
      article: null, // {title, author, section}
      breadcrumb: null,
      cart: null,    // {item_count, total}
    };
    try {
      var h1El = document.querySelector('h1');
      if (h1El) ctx.h1 = (h1El.textContent || '').trim().slice(0, 200);
    } catch (e) { /* */ }

    // ---- OpenGraph fallback (most sites have these) ----
    function metaContent(prop) {
      try {
        var el = document.querySelector('meta[property="' + prop + '"]') ||
                 document.querySelector('meta[name="' + prop + '"]');
        return el ? (el.getAttribute('content') || '').trim() : null;
      } catch (e) { return null; }
    }
    var ogType = (metaContent('og:type') || '').toLowerCase();
    var ogTitle = metaContent('og:title');
    var ogImage = metaContent('og:image');
    var ogPrice = metaContent('product:price:amount') || metaContent('og:price:amount');
    var ogCurr  = metaContent('product:price:currency') || metaContent('og:price:currency');
    if (ogType === 'product' && ogTitle) {
      ctx.product = {
        name: ogTitle,
        image: ogImage || null,
        price: ogPrice ? parseFloat(ogPrice) : null,
        currency: ogCurr || null,
        source: 'og',
      };
    }
    if (ogType === 'article' && ogTitle) {
      ctx.article = { title: ogTitle, author: metaContent('article:author'), section: metaContent('article:section') };
    }

    // ---- JSON-LD (schema.org) — preferred, more structured ----
    try {
      var scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var si = 0; si < scripts.length && si < 8; si++) {
        var raw = scripts[si].textContent || '';
        if (!raw.trim()) continue;
        var parsed;
        try { parsed = JSON.parse(raw); } catch (e) { continue; }
        var arr = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
        for (var ai = 0; ai < arr.length; ai++) {
          var node = arr[ai] || {};
          var t = node['@type'] || '';
          var typeStr = Array.isArray(t) ? t.join(',').toLowerCase() : String(t).toLowerCase();
          if (typeStr.indexOf('product') !== -1) {
            var offers = node.offers && (Array.isArray(node.offers) ? node.offers[0] : node.offers) || {};
            ctx.product = {
              name: node.name || ctx.product?.name || ogTitle || null,
              image: (Array.isArray(node.image) ? node.image[0] : node.image) || ogImage || null,
              price: offers.price ? parseFloat(offers.price) : (ogPrice ? parseFloat(ogPrice) : null),
              currency: offers.priceCurrency || ogCurr || null,
              sku: node.sku || null,
              brand: (node.brand && (node.brand.name || node.brand)) || null,
              availability: offers.availability ? String(offers.availability).split('/').pop() : null,
              source: 'jsonld',
            };
          } else if (typeStr.indexOf('breadcrumb') !== -1 && Array.isArray(node.itemListElement)) {
            ctx.breadcrumb = node.itemListElement.map(function (it) {
              return (it && it.name) || (it && it.item && it.item.name) || '';
            }).filter(Boolean).slice(0, 6);
          } else if (typeStr.indexOf('article') !== -1 && !ctx.article) {
            ctx.article = {
              title: node.headline || node.name || ogTitle || null,
              author: (node.author && (node.author.name || node.author)) || null,
              section: node.articleSection || null,
            };
          }
        }
      }
    } catch (e) { /* malformed JSON-LD — skip */ }

    // ---- dataLayer (GTM e-commerce) — cart, product context ----
    try {
      if (Array.isArray(window.dataLayer)) {
        for (var di = window.dataLayer.length - 1; di >= 0 && di > window.dataLayer.length - 20; di--) {
          var ev = window.dataLayer[di] || {};
          var ec = ev.ecommerce || (ev[0] && ev[0].ecommerce);
          if (ec && ec.cart && !ctx.cart) {
            ctx.cart = { item_count: ec.cart.items ? ec.cart.items.length : null, total: ec.cart.value || null };
          }
        }
      }
    } catch (e) { /* */ }

    return ctx;
  }

  // Multi-strategy add-to-cart detection for SPA stores (QuickShop = Next.js, no /cart.js).
  // Heuristics + optional per-account overrides from config.cartWatcher. Best-effort.
  function initCartWatcher(onAdd) {
    var cw = (config.cartWatcher || {});
    var lastFire = 0;
    var fire = function () {
      try {
        if (Date.now() - lastFire < 1500) return;   // collapse multi-strategy duplicates for one add
        lastFire = Date.now();
        var pc = (typeof extractPageContext === 'function') ? extractPageContext() : { product: null, cart: null };
        var added = pc.product || null;
        behaviorTrack('cart_change', { added_product: added ? { name: added.name, price: added.price, sku: added.sku } : null, value: pc.cart ? pc.cart.total : null });
        if (onAdd) onAdd(added);
      } catch (e) { /* never break host page */ }
    };
    // (a) Delegated click on add-to-cart controls.
    try {
      document.addEventListener('click', function (e) {
        try {  // guard the callback itself: a bad selector override must never throw into the host page
          var el = e.target;
          for (var i = 0; el && i < 5; i++, el = el.parentElement) {
            var sel = cw.addToCartSelector;
            var match = sel ? (el.matches && el.matches(sel)) :
              ((el.getAttribute && (/(add[-_ ]?to[-_ ]?cart|הוסף|לסל|לעגלה)/i).test((el.getAttribute('class') || '') + ' ' + (el.textContent || '').slice(0, 40))));
            if (match) { setTimeout(fire, 600); break; }  // let the SPA update the cart first
          }
        } catch (e2) { /* swallow: never break host page on click */ }
      }, true);
    } catch (e) { /* */ }
    // (b) MutationObserver on the cart-count element.
    try {
      var countEl = cw.cartCountSelector ? document.querySelector(cw.cartCountSelector) : null;
      if (countEl && window.MutationObserver) {
        var last = (countEl.textContent || '').trim();
        new MutationObserver(function () {
          try {  // guard the callback itself: never throw into the host page
            var now = (countEl.textContent || '').trim();
            if (now !== last && (parseInt(now, 10) || 0) > (parseInt(last, 10) || 0)) fire();
            last = now;
          } catch (e2) { /* swallow: never break host page on mutation */ }
        }).observe(countEl, { childList: true, characterData: true, subtree: true });
      }
    } catch (e) { /* */ }
    // (c) localStorage cart diff (poll every 2s; low cost).
    try {
      var key = cw.cartStorageKey || null;
      var readCount = function () {
        try {
          var raw = key ? localStorage.getItem(key) : null;
          if (!key) { for (var k = 0; k < localStorage.length; k++) { var kk = localStorage.key(k); if (kk && /cart/i.test(kk)) { raw = localStorage.getItem(kk); break; } } }
          if (!raw) return 0;
          var v = JSON.parse(raw);
          var items = v.items || v.lines || v.products || (Array.isArray(v) ? v : []);
          return Array.isArray(items) ? items.length : 0;
        } catch (e) { return 0; }
      };
      var lastCount = readCount();
      setInterval(function () { var c = readCount(); if (c > lastCount) fire(); lastCount = c; }, 2000);
    } catch (e) { /* */ }
  }

  // ============================================
  // Support form — view + submit + success states.
  // ============================================
  function openSupportForm(prefill) {
    prefill = prefill || {};
    supportForm = {
      name: prefill.name || supportForm.name || '',
      email: prefill.email || supportForm.email || '',
      phone: prefill.phone || supportForm.phone || '',
      orderNumber: prefill.orderNumber || prefill.order_number || '',
      category: prefill.category || (modules.support.categories && modules.support.categories[0]) || 'other',
      message: prefill.message || '',
      error: null,
      submitting: false,
    };
    pendingAction = null; // dismiss any inline action card
    view = 'support_form';
    render();
  }

  function closeSupportForm() {
    view = 'chat';
    render();
  }

  function readSupportInputs() {
    supportForm.name = (document.getElementById('ibot-sf-name') || {}).value || '';
    supportForm.email = (document.getElementById('ibot-sf-email') || {}).value || '';
    supportForm.phone = (document.getElementById('ibot-sf-phone') || {}).value || '';
    supportForm.orderNumber = (document.getElementById('ibot-sf-order') || {}).value || '';
    supportForm.category = (document.getElementById('ibot-sf-category') || {}).value || supportForm.category;
    supportForm.message = (document.getElementById('ibot-sf-message') || {}).value || '';
  }

  function validateSupportForm() {
    var s = locale.support;
    if (!supportForm.name.trim()) return s.nameLabel + ': ' + s.required;
    if (!supportForm.email.trim()) return s.emailLabel + ': ' + s.required;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportForm.email.trim())) return s.invalidEmail;
    if (!supportForm.message.trim()) return s.messageLabel + ': ' + s.required;
    return null;
  }

  function submitSupportTicket() {
    readSupportInputs();
    var err = validateSupportForm();
    if (err) {
      supportForm.error = err;
      render();
      return;
    }
    supportForm.submitting = true;
    supportForm.error = null;
    render();

    // Build a context-rich message: visitor's text + page context tail so the
    // brand reading the ticket knows which page they were on.
    var pc = pageContext || extractPageContext();
    var contextLines = [];
    if (pc.product && pc.product.name) contextLines.push('Product: ' + pc.product.name + (pc.product.price ? ' (' + (pc.product.currency || '') + pc.product.price + ')' : ''));
    if (pc.url) contextLines.push('Page: ' + pc.url);
    var fullMessage = supportForm.message.trim();
    if (contextLines.length) fullMessage += '\n\n---\n' + contextLines.join('\n');

    var body = {
      accountId: ACCOUNT_ID,
      customerName: supportForm.name.trim(),
      customerEmail: supportForm.email.trim(),
      customerPhone: supportForm.phone.trim() || null,
      orderNumber: supportForm.orderNumber.trim() || null,
      message: fullMessage + (supportForm.attachment ? '\n\nAttachment: ' + supportForm.attachment.url : ''),
      sessionId: sessionId || null,
      source: supportForm.urgent ? 'widget_support_urgent' : 'widget_support',
      refSource: pc.url || null,
      metadata: {
        widget_version: '4.1',
        category: supportForm.category,
        priority: supportForm.urgent ? 'urgent' : 'normal',
        page_url: pc.url || null,
        page_title: pc.title || null,
        product_name: (pc.product && pc.product.name) || null,
        product_sku: (pc.product && pc.product.sku) || null,
        attachment_url: supportForm.attachment ? supportForm.attachment.url : null,
        attachment_filename: supportForm.attachment ? supportForm.attachment.filename : null,
      },
    };

    widgetTrack('widget_support_submitted', { category: supportForm.category, urgent: !!supportForm.urgent, has_attachment: !!supportForm.attachment });

    fetch(BASE_URL + '/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (j) { throw new Error(j.error || 'submit failed'); }); })
      .then(function (data) {
        supportForm.submitting = false;
        lastTicketRef = (data && data.requestId) ? String(data.requestId).split('-')[0].toUpperCase() : null;
        view = 'support_success';
        widgetTrack('widget_support_success', { ref: lastTicketRef });
        render();
      })
      .catch(function (e) {
        supportForm.submitting = false;
        supportForm.error = locale.support.submitError;
        widgetTrack('widget_support_failed', { error: String(e && e.message || e).slice(0, 200) });
        render();
      });
  }

  function renderSupportForm() {
    var pc = config.primaryColor;
    var s = locale.support;
    var isMobile = window.innerWidth < 640;
    var panelStyle = isMobile
      ? mobilePanelStyle()
      : 'width:370px;height:min(560px, calc(100vh - 140px));border-radius:18px;position:relative;';

    var categories = (modules.support.categories || ['order','product','return','other']).map(function (key) {
      var label = (s.categories && s.categories[key]) || key;
      var sel = supportForm.category === key ? ' selected' : '';
      return '<option value="' + escapeHtml(key) + '"' + sel + '>' + escapeHtml(label) + '</option>';
    }).join('');

    function field(id, label, value, type, placeholder, required) {
      var asterisk = required ? ' <span style="color:#dc2626;">*</span>' : '';
      return '<div style="margin-bottom:12px;">' +
        '<label for="' + id + '" style="display:block;font-size:12px;font-weight:600;color:var(--ibot-label-text);margin-bottom:4px;">' + escapeHtml(label) + asterisk + '</label>' +
        '<input id="' + id + '" type="' + (type || 'text') + '" value="' + escapeHtml(value || '') + '" placeholder="' + escapeHtml(placeholder || '') + '" ' +
        'style="width:100%;border:1px solid var(--ibot-border);border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;background:var(--ibot-input-bg);color:var(--ibot-text-primary);direction:' + locale.dir + ';" />' +
        '</div>';
    }

    container.innerHTML =
      (isMobile ? mobileBackdropHtml() : '') +
      '<div id="ibot-panel" style="' + panelStyle +
      'background:var(--ibot-panel-bg);display:flex;flex-direction:column;overflow:hidden;' +
      'box-shadow:0 8px 40px rgba(0,0,0,0.15);animation:ibot-slide-up 0.3s ease-out;">' +
      // Header (compact: back arrow + title)
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;flex-shrink:0;' +
      'background:' + pc + ';color:#fff;' + (isMobile ? '' : 'border-radius:18px 18px 0 0;') + '">' +
      '<button id="ibot-sf-back" style="background:rgba(255,255,255,0.12);border:none;color:#fff;cursor:pointer;' +
      'border-radius:999px;padding:6px 10px;font-size:13px;font-family:inherit;">' + escapeHtml(s.backToChat) + '</button>' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-weight:700;font-size:17px;">' + escapeHtml(s.title) + '</div>' +
      '<div style="font-size:12px;opacity:0.85;">' + escapeHtml(s.subtitle) + '</div>' +
      '</div></div>' +
      // Form body
      '<div style="flex:1;overflow-y:auto;padding:16px;direction:' + locale.dir + ';">' +
      // Urgent banner — shown when this is a human-handoff variant of the form
      (supportForm.urgent
        ? '<div style="background:' + pc + '15;border:1px solid ' + pc + '40;color:' + pc + ';border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' +
          escapeHtml(s.humanBadge) + '</div>'
        : '') +
      field('ibot-sf-name', s.nameLabel, supportForm.name, 'text', s.namePlaceholder, true) +
      field('ibot-sf-email', s.emailLabel, supportForm.email, 'email', s.emailPlaceholder, true) +
      field('ibot-sf-phone', s.phoneLabel, supportForm.phone, 'tel', s.phonePlaceholder, false) +
      field('ibot-sf-order', s.orderLabel, supportForm.orderNumber, 'text', s.orderPlaceholder, false) +
      // Category dropdown
      '<div style="margin-bottom:12px;">' +
      '<label for="ibot-sf-category" style="display:block;font-size:12px;font-weight:600;color:var(--ibot-label-text);margin-bottom:4px;">' + escapeHtml(s.categoryLabel) + '</label>' +
      '<select id="ibot-sf-category" style="width:100%;border:1px solid var(--ibot-border);border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;background:var(--ibot-input-bg);color:var(--ibot-text-primary);direction:' + locale.dir + ';">' +
      categories + '</select>' +
      '</div>' +
      // Message textarea
      '<div style="margin-bottom:12px;">' +
      '<label for="ibot-sf-message" style="display:block;font-size:12px;font-weight:600;color:var(--ibot-label-text);margin-bottom:4px;">' + escapeHtml(s.messageLabel) + ' <span style="color:#dc2626;">*</span></label>' +
      '<textarea id="ibot-sf-message" rows="4" placeholder="' + escapeHtml(s.messagePlaceholder) + '" ' +
      'style="width:100%;border:1px solid var(--ibot-border);border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;background:var(--ibot-input-bg);color:var(--ibot-text-primary);resize:vertical;min-height:90px;direction:' + locale.dir + ';">' + escapeHtml(supportForm.message) + '</textarea>' +
      '</div>' +
      // Attachment (photo / pdf) — opens native file picker; uploads on selection
      '<div style="margin-bottom:12px;">' +
      '<label style="display:block;font-size:12px;font-weight:600;color:var(--ibot-label-text);margin-bottom:4px;">' + (locale.dir === 'rtl' ? 'תמונה / קובץ (אופציונלי)' : 'Photo / file (optional)') + '</label>' +
      '<input type="file" id="ibot-sf-file" accept="image/*,application/pdf" ' +
      'style="width:100%;border:1px dashed var(--ibot-border);border-radius:10px;padding:10px 12px;font-size:13px;font-family:inherit;background:var(--ibot-input-bg);color:var(--ibot-text-secondary);direction:' + locale.dir + ';" />' +
      (supportForm.attachmentUploading
        ? '<div style="font-size:12px;color:var(--ibot-text-muted);margin-top:4px;">' + (locale.dir === 'rtl' ? 'מעלה...' : 'Uploading...') + '</div>'
        : supportForm.attachment
        ? '<div style="font-size:12px;color:var(--ibot-success-text);margin-top:4px;">✓ ' + escapeHtml(supportForm.attachment.filename || 'attached') + '</div>'
        : '') +
      '</div>' +
      // Error
      (supportForm.error
        ? '<div style="background:var(--ibot-error-bg);border:1px solid var(--ibot-error-border);color:var(--ibot-error-text);border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:10px;">' + escapeHtml(supportForm.error) + '</div>'
        : '') +
      '</div>' +
      // Submit
      '<div style="padding:12px 16px 16px;flex-shrink:0;border-top:1px solid var(--ibot-border);background:var(--ibot-surface);">' +
      '<button id="ibot-sf-submit"' + (supportForm.submitting ? ' disabled' : '') + ' ' +
      'style="width:100%;background:' + pc + ';color:#fff;border:none;border-radius:12px;padding:13px;font-size:15px;font-weight:600;cursor:' + (supportForm.submitting ? 'wait' : 'pointer') + ';font-family:inherit;opacity:' + (supportForm.submitting ? '0.7' : '1') + ';transition:transform 0.15s;">' +
      escapeHtml(supportForm.submitting ? s.submitting : s.submit) + '</button>' +
      '</div>' +
      '</div>' +
      // Desktop close-pill below the panel (mirrors chat view)
      (isMobile ? '' :
        '<div style="display:flex;justify-content:flex-end;margin-top:12px;">' +
        '<button id="ibot-close" style="width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;' +
        'background:' + pc + ';color:#fff;display:flex;align-items:center;justify-content:center;' +
        'box-shadow:0 2px 32px rgba(0,0,0,0.16),0 1px 6px rgba(0,0,0,0.06);">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="6 9 12 15 18 9"></polyline></svg></button></div>');

    var back = document.getElementById('ibot-sf-back');
    if (back) back.onclick = closeSupportForm;
    var sub = document.getElementById('ibot-sf-submit');
    if (sub) sub.onclick = submitSupportTicket;
    var closeBtn = document.getElementById('ibot-close');
    if (closeBtn) closeBtn.onclick = function () { isOpen = false; view = 'chat'; render(); };
    // File picker — uploads on selection so the visitor sees ✓ before submitting.
    var fileInput = document.getElementById('ibot-sf-file');
    if (fileInput) {
      fileInput.onchange = function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        // Snapshot current input values BEFORE re-rendering — otherwise the
        // new DOM is rebuilt from supportForm state (which doesn't know what
        // the visitor just typed), wiping their work on every upload tick.
        readSupportInputs();
        supportForm.attachmentUploading = true; supportForm.attachment = null;
        render();
        var fd = new FormData();
        fd.append('accountId', ACCOUNT_ID);
        fd.append('file', f);
        fetch(BASE_URL + '/api/widget/upload', { method: 'POST', body: fd })
          .then(function (r) { return r.ok ? r.json() : r.json().then(function (j) { throw new Error(j.error || 'upload failed'); }); })
          .then(function (data) {
            supportForm.attachmentUploading = false;
            supportForm.attachment = { url: data.url, filename: data.filename, contentType: data.contentType };
            widgetTrack('widget_support_attached', { content_type: data.contentType });
            render();
          })
          .catch(function (err) {
            supportForm.attachmentUploading = false;
            supportForm.error = String(err && err.message || err).slice(0, 200);
            render();
          });
      };
    }
  }

  function renderSupportSuccess() {
    var pc = config.primaryColor;
    var s = locale.support;
    var isMobile = window.innerWidth < 640;
    var panelStyle = isMobile
      ? mobilePanelStyle()
      : 'width:400px;height:auto;max-height:min(680px, calc(100vh - 80px));border-radius:18px;position:relative;';

    container.innerHTML =
      (isMobile ? mobileBackdropHtml() : '') +
      '<div id="ibot-panel" style="' + panelStyle +
      'background:var(--ibot-panel-bg);display:flex;flex-direction:column;overflow:hidden;' +
      'box-shadow:0 8px 40px rgba(0,0,0,0.15);animation:ibot-slide-up 0.3s ease-out;">' +
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;flex-shrink:0;' +
      'background:' + pc + ';color:#fff;' + (isMobile ? '' : 'border-radius:18px 18px 0 0;') + '">' +
      '<div style="font-weight:700;font-size:17px;">' + escapeHtml(s.title) + '</div>' +
      '</div>' +
      '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;">' +
      '<div style="width:64px;height:64px;border-radius:50%;background:var(--ibot-success-bg);color:var(--ibot-success-text);display:flex;align-items:center;justify-content:center;margin-bottom:18px;">' +
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
      '<div style="font-size:18px;font-weight:700;color:var(--ibot-text-primary);margin-bottom:8px;">' + escapeHtml(s.successTitle) + '</div>' +
      '<div style="font-size:14px;color:var(--ibot-text-secondary);margin-bottom:16px;line-height:1.5;max-width:280px;">' + escapeHtml(s.successBody) + '</div>' +
      (lastTicketRef ? '<div style="font-size:13px;color:var(--ibot-text-muted);font-family:ui-monospace,monospace;margin-bottom:24px;">' + escapeHtml(s.successRef + lastTicketRef) + '</div>' : '') +
      '<button id="ibot-ss-back" style="background:' + pc + ';color:#fff;border:none;border-radius:12px;padding:11px 22px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">' + escapeHtml(s.successBack) + '</button>' +
      '</div></div>' +
      (isMobile ? '' :
        '<div style="display:flex;justify-content:flex-end;margin-top:12px;">' +
        '<button id="ibot-close" style="width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;' +
        'background:' + pc + ';color:#fff;display:flex;align-items:center;justify-content:center;' +
        'box-shadow:0 2px 32px rgba(0,0,0,0.16),0 1px 6px rgba(0,0,0,0.06);">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="6 9 12 15 18 9"></polyline></svg></button></div>');

    var back = document.getElementById('ibot-ss-back');
    if (back) back.onclick = closeSupportForm;
    var closeBtn = document.getElementById('ibot-close');
    if (closeBtn) closeBtn.onclick = function () { isOpen = false; view = 'chat'; render(); };
  }

  // Inline action card — rendered inside the chat after the bot proposes
  // a concierge action via <<ACTION>>. One click opens the prefilled flow.
  function renderActionCard(action, pc) {
    if (!action || !action.type) return '';
    var s = locale.support;
    // Type-specific defaults so each action card has a sensible button label
    // when the model didn't supply a custom one. Bot's `label` always wins.
    var defaultsByType = {
      open_support: { prompt: s.actionPrompt, open: s.actionOpen },
      capture_lead: { prompt: locale.lead.actionPrompt, open: locale.lead.actionOpen },
      book_demo: { prompt: locale.bookDemo.actionPrompt, open: locale.bookDemo.actionOpen },
      track_order: { prompt: locale.order.actionPrompt, open: locale.order.actionOpen },
      navigate: { prompt: s.navigatePrompt, open: s.navigateOpen },
      apply_coupon: { prompt: s.actionPrompt, open: s.actionOpen },
    };
    var d = defaultsByType[action.type] || defaultsByType.open_support;
    var label = action.label || d.prompt;
    var open = d.open;
    var dismiss = s.actionDismiss;
    return (
      '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;animation:ibot-msg-in 0.3s ease-out;">' +
      '<div style="background:var(--ibot-surface);border:1px solid var(--ibot-border);border-radius:14px;padding:12px 14px;max-width:85%;box-shadow:0 1px 3px rgba(0,0,0,0.04);">' +
      '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">' +
      '<div style="width:32px;height:32px;border-radius:50%;background:' + pc + '14;color:' + pc + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>' +
      '</div>' +
      '<div style="font-size:14px;color:var(--ibot-text-primary);line-height:1.4;">' + escapeHtml(label) + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button onclick="window.__ibotActionConfirm()" style="background:' + pc + ';color:#fff;border:none;border-radius:10px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;flex:1;">' + escapeHtml(open) + '</button>' +
      '<button onclick="window.__ibotActionDismiss()" style="background:transparent;color:var(--ibot-text-muted);border:1px solid var(--ibot-border);border-radius:10px;padding:8px 14px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;">' + escapeHtml(dismiss) + '</button>' +
      '</div></div></div>'
    );
  }

  window.__ibotActionConfirm = function () {
    if (!pendingAction) return;
    var act = pendingAction;
    widgetTrack('widget_action_confirmed', { type: act.type || null });
    if (act.type === 'open_support') {
      openSupportForm(act.prefill || {});
    } else if (act.type === 'capture_lead') {
      openLeadForm(act.prefill || {});
    } else if (act.type === 'book_demo') {
      openBookDemoForm(act.prefill || {});
    } else if (act.type === 'track_order') {
      openOrderForm(act.prefill || {});
    } else if (act.type === 'navigate' && act.prefill && act.prefill.url) {
      // Navigation flow: widget.js runs in the customer's page (or our preview
      // proxy iframe — both same-origin to the iframe). Navigating top-level
      // takes the visitor to the target page. window.top guards against being
      // sandboxed somewhere we can't navigate.
      var navUrl = String(act.prefill.url);
      widgetTrack('widget_navigate_confirmed', { url: navUrl.slice(0, 200) });
      try {
        if (window.top && window.top !== window) {
          window.top.location.href = navUrl;
        } else {
          window.location.href = navUrl;
        }
      } catch (e) {
        // Cross-origin top frame — fall back to opening in a new tab.
        window.open(navUrl, '_blank', 'noopener');
      }
      pendingAction = null;
      render();
    } else if (act.type === 'apply_coupon' && act.prefill && act.prefill.code) {
      // Two-pronged coupon flow:
      //   1) postMessage to host site for programmatic cart application
      //      (sites that wired the listener — apply at checkout silently).
      //   2) Copy code to visitor's clipboard + toast confirmation —
      //      universal fallback for sites that didn't wire the listener.
      var code = String(act.prefill.code).trim();
      try { window.parent.postMessage({ type: 'bestieai:apply_coupon', code: code }, '*'); } catch (e) { /* */ }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).catch(function () { /* */ });
        }
      } catch (e) { /* */ }
      showToast(locale.support.couponCopied + code);
      pendingAction = null;
      render();
    } else {
      pendingAction = null;
      render();
    }
  };
  window.__ibotActionDismiss = function () {
    widgetTrack('widget_action_dismissed', { type: pendingAction && pendingAction.type || null });
    pendingAction = null;
    render();
  };

  // ============================================
  // Stream paint scheduler — coalesces streaming-token updates to one paint
  // per animation frame. The model can stream 50+ tokens/sec; rewriting the
  // bubble innerHTML on each one caused visible flicker even with surgical
  // updates. RAF naturally batches to 60fps and respects browser paint timing.
  // ============================================
  var _streamRAF = null;
  function scheduleStreamPaint() {
    if (_streamRAF) return;
    _streamRAF = requestAnimationFrame(function () {
      _streamRAF = null;
      var msg = messages[messages.length - 1];
      if (!msg || msg.role !== 'assistant') return;
      var streamingEl = document.getElementById('ibot-streaming-bubble');
      if (streamingEl && !thinkingText) {
        streamingEl.innerHTML = formatMessage(msg.content, false);
        var msgsScroll = document.getElementById('ibot-messages');
        if (msgsScroll) msgsScroll.scrollTop = msgsScroll.scrollHeight;
      } else {
        // First paint after thinking dots — full render to swap dot bubble for text bubble.
        thinkingText = null;
        render();
      }
    });
  }

  // ============================================
  // Toast — transient one-line notification at top of chat panel.
  // Auto-fades after 3s. Used for "Coupon copied", "Transcript sent", "Rating recorded".
  // ============================================
  function showToast(text) {
    toastText = String(text || '');
    if (toastTimer) { clearTimeout(toastTimer); }
    render();
    toastTimer = setTimeout(function () {
      toastText = null;
      toastTimer = null;
      render();
    }, 3000);
  }

  function renderToastHtml(pc) {
    if (!toastText) return '';
    return (
      '<div style="position:absolute;top:90px;left:16px;right:16px;z-index:5;' +
      'background:' + pc + ';color:#fff;border-radius:10px;padding:9px 14px;' +
      'font-size:13px;font-weight:500;text-align:center;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:ibot-fade-in 0.3s ease-out;">' +
      escapeHtml(toastText) + '</div>'
    );
  }

  // ============================================
  // Human handoff — opens the support form pre-flagged urgent.
  // The form renders a banner so the visitor sees their request is prioritized;
  // the ticket carries metadata.priority='urgent' so the admin queue can route
  // it through whatever escalation path the brand has wired (WhatsApp, on-call rotation).
  // ============================================
  function openHumanRequest() {
    widgetTrack('widget_human_handoff_opened', {});
    supportForm = {
      name: supportForm.name || '', email: supportForm.email || '', phone: supportForm.phone || '',
      orderNumber: '', category: 'other', message: supportForm.message || '',
      urgent: true, attachment: null, attachmentUploading: false,
      error: null, submitting: false,
    };
    pendingAction = null;
    view = 'support_form';
    render();
  }

  // ============================================
  // Email transcript — POSTs the chat_messages to the backend, which emails
  // them to the visitor's address. Visitor enters their email inline.
  // ============================================
  function requestEmailTranscript() {
    var email = window.prompt(locale.dir === 'rtl' ? 'מייל לשליחת התמלול:' : 'Email to send transcript to:', supportForm.email || leadForm.email || '');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    widgetTrack('widget_transcript_requested', {});
    fetch(BASE_URL + '/api/widget/transcript', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: ACCOUNT_ID, sessionId: sessionId, email: email.trim() }),
    })
      .then(function (r) { if (!r.ok) throw new Error('transcript failed'); })
      .then(function () { showToast(locale.support.transcriptSent); })
      .catch(function () { showToast(locale.support.submitError); });
  }

  // ============================================
  // Conversation rating — 👍/👎 on each bot turn.
  // Stored client-side in `ratings` (msgIdx → 'up'|'down') so renderer shows
  // selected state; POSTed to backend for aggregation/analytics.
  // ============================================
  function rateMessage(msgIdx, rating) {
    if (ratings[msgIdx]) return; // one rating per message
    ratings[msgIdx] = rating;
    var msg = messages[msgIdx] || {};
    widgetTrack('widget_message_rated', { rating: rating, msg_index: msgIdx });
    fetch(BASE_URL + '/api/widget/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: ACCOUNT_ID,
        sessionId: sessionId,
        msgIndex: msgIdx,
        rating: rating,
        messageContent: (msg.content || '').slice(0, 500),
      }),
    }).catch(function () { /* fire-and-forget */ });
    showToast(rating === 'up' ? locale.support.ratingPositive : locale.support.ratingNegative);
    render();
  }
  window.__ibotRate = function (idx, r) { rateMessage(idx, r); };
  window.__ibotHuman = function () { openHumanRequest(); };
  window.__ibotTranscript = function () { requestEmailTranscript(); };

  // ============================================
  // Voice input — Web Speech API. Tap mic → listen → drop transcript into
  // the input. Explicit Send keeps visitor in control (no auto-submit).
  // ============================================
  function hasVoiceSupport() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
  function toggleVoiceInput() {
    if (isListening && voiceRecognizer) {
      try { voiceRecognizer.stop(); } catch (e) { /* */ }
      return;
    }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    var recog = new SR();
    recog.lang = config.language === 'en' ? 'en-US' : 'he-IL';
    recog.interimResults = false;
    recog.continuous = false;
    recog.onstart = function () { isListening = true; widgetTrack('widget_voice_started', {}); render(); };
    recog.onresult = function (e) {
      var transcript = '';
      for (var i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      var inp = document.getElementById('ibot-input');
      if (inp) { inp.value = (inp.value ? inp.value + ' ' : '') + transcript.trim(); inp.focus(); }
      widgetTrack('widget_voice_result', { length: transcript.length });
    };
    recog.onerror = function (e) { widgetTrack('widget_voice_error', { error: String(e.error || 'unknown') }); };
    recog.onend = function () { isListening = false; voiceRecognizer = null; render(); };
    voiceRecognizer = recog;
    try { recog.start(); } catch (e) { isListening = false; voiceRecognizer = null; }
  }

  // ============================================
  // Generic form shell — reused by Support, Lead, and Book-demo forms.
  // Keeps the chrome (header with back arrow, scrollable body, sticky submit,
  // desktop close-pill) consistent across all three flows so the visitor's
  // muscle memory transfers between them.
  // ============================================
  function formShell(opts) {
    var pc = config.primaryColor;
    var isMobile = window.innerWidth < 640;
    var panelStyle = isMobile
      ? mobilePanelStyle()
      : 'width:370px;height:min(560px, calc(100vh - 140px));border-radius:18px;position:relative;';

    return (
      (isMobile ? mobileBackdropHtml() : '') +
      '<div id="ibot-panel" style="' + panelStyle +
      'background:var(--ibot-panel-bg);display:flex;flex-direction:column;overflow:hidden;' +
      'box-shadow:0 8px 40px rgba(0,0,0,0.15);animation:ibot-slide-up 0.3s ease-out;">' +
      // Header
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;flex-shrink:0;' +
      'background:' + pc + ';color:#fff;' + (isMobile ? '' : 'border-radius:18px 18px 0 0;') + '">' +
      '<button id="ibot-form-back" style="background:rgba(255,255,255,0.12);border:none;color:#fff;cursor:pointer;' +
      'border-radius:999px;padding:6px 10px;font-size:13px;font-family:inherit;">' + escapeHtml(locale.support.backToChat) + '</button>' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-weight:700;font-size:17px;">' + escapeHtml(opts.title) + '</div>' +
      '<div style="font-size:12px;opacity:0.85;">' + escapeHtml(opts.subtitle) + '</div>' +
      '</div></div>' +
      // Body
      '<div style="flex:1;overflow-y:auto;padding:16px;direction:' + locale.dir + ';">' +
      opts.fieldsHtml +
      (opts.error ? '<div style="background:var(--ibot-error-bg);border:1px solid var(--ibot-error-border);color:var(--ibot-error-text);border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:10px;">' + escapeHtml(opts.error) + '</div>' : '') +
      '</div>' +
      // Submit
      '<div style="padding:12px 16px 16px;flex-shrink:0;border-top:1px solid var(--ibot-border);background:var(--ibot-surface);">' +
      '<button id="ibot-form-submit"' + (opts.submitting ? ' disabled' : '') + ' ' +
      'style="width:100%;background:' + pc + ';color:#fff;border:none;border-radius:12px;padding:13px;font-size:15px;font-weight:600;cursor:' + (opts.submitting ? 'wait' : 'pointer') + ';font-family:inherit;opacity:' + (opts.submitting ? '0.7' : '1') + ';">' +
      escapeHtml(opts.submitting ? locale.support.submitting : opts.submitLabel) + '</button>' +
      '</div></div>' +
      (isMobile ? '' :
        '<div style="display:flex;justify-content:flex-end;margin-top:12px;">' +
        '<button id="ibot-close" style="width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;' +
        'background:' + pc + ';color:#fff;display:flex;align-items:center;justify-content:center;' +
        'box-shadow:0 2px 32px rgba(0,0,0,0.16),0 1px 6px rgba(0,0,0,0.06);">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="6 9 12 15 18 9"></polyline></svg></button></div>')
    );
  }

  // Shared field builders — extracted from renderSupportForm so all three
  // forms get the same look without duplicated 50-line HTML strings.
  function inputFieldHtml(id, label, value, type, placeholder, required) {
    var asterisk = required ? ' <span style="color:#dc2626;">*</span>' : '';
    return '<div style="margin-bottom:12px;">' +
      '<label for="' + id + '" style="display:block;font-size:12px;font-weight:600;color:var(--ibot-label-text);margin-bottom:4px;">' + escapeHtml(label) + asterisk + '</label>' +
      '<input id="' + id + '" type="' + (type || 'text') + '" value="' + escapeHtml(value || '') + '" placeholder="' + escapeHtml(placeholder || '') + '" ' +
      'style="width:100%;border:1px solid var(--ibot-border);border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;background:var(--ibot-input-bg);color:var(--ibot-text-primary);direction:' + locale.dir + ';" />' +
      '</div>';
  }
  function textareaFieldHtml(id, label, value, placeholder, required, rows) {
    var asterisk = required ? ' <span style="color:#dc2626;">*</span>' : '';
    return '<div style="margin-bottom:12px;">' +
      '<label for="' + id + '" style="display:block;font-size:12px;font-weight:600;color:var(--ibot-label-text);margin-bottom:4px;">' + escapeHtml(label) + asterisk + '</label>' +
      '<textarea id="' + id + '" rows="' + (rows || 4) + '" placeholder="' + escapeHtml(placeholder || '') + '" ' +
      'style="width:100%;border:1px solid var(--ibot-border);border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;background:var(--ibot-input-bg);color:var(--ibot-text-primary);resize:vertical;min-height:90px;direction:' + locale.dir + ';">' + escapeHtml(value || '') + '</textarea>' +
      '</div>';
  }
  function selectFieldHtml(id, label, value, options, required) {
    var asterisk = required ? ' <span style="color:#dc2626;">*</span>' : '';
    var opts = options.map(function (opt) {
      var key = typeof opt === 'string' ? opt : opt.value;
      var lbl = typeof opt === 'string' ? opt : opt.label;
      var sel = value === key ? ' selected' : '';
      return '<option value="' + escapeHtml(key) + '"' + sel + '>' + escapeHtml(lbl) + '</option>';
    }).join('');
    return '<div style="margin-bottom:12px;">' +
      '<label for="' + id + '" style="display:block;font-size:12px;font-weight:600;color:var(--ibot-label-text);margin-bottom:4px;">' + escapeHtml(label) + asterisk + '</label>' +
      '<select id="' + id + '" style="width:100%;border:1px solid var(--ibot-border);border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;background:var(--ibot-input-bg);color:var(--ibot-text-primary);direction:' + locale.dir + ';">' +
      opts + '</select>' +
      '</div>';
  }

  function bindFormShell() {
    var back = document.getElementById('ibot-form-back');
    if (back) back.onclick = function () { view = 'chat'; render(); };
    var closeBtn = document.getElementById('ibot-close');
    if (closeBtn) closeBtn.onclick = function () { isOpen = false; view = 'chat'; render(); };
  }

  // ============================================
  // Lead capture form
  // ============================================
  function openLeadForm(prefill) {
    prefill = prefill || {};
    leadForm = {
      name: prefill.name || leadForm.name || '',
      email: prefill.email || leadForm.email || '',
      phone: prefill.phone || leadForm.phone || '',
      interest: prefill.interest || prefill.message || '',
      error: null, submitting: false,
    };
    pendingAction = null;
    view = 'lead_form';
    widgetTrack('widget_lead_opened', { has_prefill: Object.keys(prefill).length > 0 });
    render();
  }

  function submitLeadTicket() {
    leadForm.name = (document.getElementById('ibot-lf-name') || {}).value || '';
    leadForm.email = (document.getElementById('ibot-lf-email') || {}).value || '';
    leadForm.phone = (document.getElementById('ibot-lf-phone') || {}).value || '';
    leadForm.interest = (document.getElementById('ibot-lf-interest') || {}).value || '';

    var s = locale.support; // shared validation strings
    if (!leadForm.name.trim()) { leadForm.error = locale.lead.nameLabel + ': ' + s.required; render(); return; }
    if (!leadForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadForm.email.trim())) { leadForm.error = s.invalidEmail; render(); return; }
    leadForm.submitting = true; leadForm.error = null; render();

    // Leads ride the same support_requests table as tickets — one inbox, one
    // notification flow. The `source` field segments them in the admin queue.
    var pc = pageContext || extractPageContext();
    var msg = leadForm.interest.trim() || '(no message)';
    if (pc.product?.name) msg += '\n\nViewing: ' + pc.product.name;
    if (pc.url) msg += '\nPage: ' + pc.url;

    fetch(BASE_URL + '/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: ACCOUNT_ID,
        customerName: leadForm.name.trim(),
        customerEmail: leadForm.email.trim(),
        customerPhone: leadForm.phone.trim() || null,
        message: msg,
        sessionId: sessionId || null,
        source: 'widget_lead',
        refSource: pc.url || null,
        metadata: { widget_version: '4.1', page_url: pc.url || null, product_name: pc.product?.name || null },
      }),
    })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (j) { throw new Error(j.error || 'submit failed'); }); })
      .then(function () {
        leadForm.submitting = false;
        view = 'lead_success';
        widgetTrack('widget_lead_success', {});
        render();
      })
      .catch(function (e) {
        leadForm.submitting = false;
        leadForm.error = locale.support.submitError;
        widgetTrack('widget_lead_failed', { error: String(e && e.message || e).slice(0, 200) });
        render();
      });
  }

  function renderLeadForm() {
    var L = locale.lead;
    var fieldsHtml =
      inputFieldHtml('ibot-lf-name', L.nameLabel, leadForm.name, 'text', '', true) +
      inputFieldHtml('ibot-lf-email', L.emailLabel, leadForm.email, 'email', '', true) +
      inputFieldHtml('ibot-lf-phone', L.phoneLabel, leadForm.phone, 'tel', '', false) +
      textareaFieldHtml('ibot-lf-interest', L.interestLabel, leadForm.interest, L.interestPlaceholder, false, 3);
    container.innerHTML = formShell({
      title: L.title, subtitle: L.subtitle, fieldsHtml: fieldsHtml,
      submitLabel: L.submit, submitting: leadForm.submitting, error: leadForm.error,
    });
    bindFormShell();
    var sub = document.getElementById('ibot-form-submit');
    if (sub) sub.onclick = submitLeadTicket;
  }

  // ============================================
  // Book demo form
  // ============================================
  function openBookDemoForm(prefill) {
    prefill = prefill || {};
    bookDemoForm = {
      name: prefill.name || bookDemoForm.name || '',
      email: prefill.email || bookDemoForm.email || '',
      company: prefill.company || bookDemoForm.company || '',
      teamSize: prefill.team_size || prefill.teamSize || (locale.bookDemo.teamSizes && locale.bookDemo.teamSizes[0]) || '',
      message: prefill.message || '',
      error: null, submitting: false,
    };
    pendingAction = null;
    view = 'book_demo_form';
    widgetTrack('widget_book_demo_opened', { has_prefill: Object.keys(prefill).length > 0 });
    render();
  }

  function submitBookDemo() {
    bookDemoForm.name = (document.getElementById('ibot-bd-name') || {}).value || '';
    bookDemoForm.email = (document.getElementById('ibot-bd-email') || {}).value || '';
    bookDemoForm.company = (document.getElementById('ibot-bd-company') || {}).value || '';
    bookDemoForm.teamSize = (document.getElementById('ibot-bd-team') || {}).value || bookDemoForm.teamSize;
    bookDemoForm.preferredTime = (document.getElementById('ibot-bd-time') || {}).value || '';
    bookDemoForm.message = (document.getElementById('ibot-bd-message') || {}).value || '';

    var s = locale.support;
    if (!bookDemoForm.name.trim()) { bookDemoForm.error = locale.bookDemo.nameLabel + ': ' + s.required; render(); return; }
    if (!bookDemoForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bookDemoForm.email.trim())) { bookDemoForm.error = s.invalidEmail; render(); return; }
    if (!bookDemoForm.company.trim()) { bookDemoForm.error = locale.bookDemo.companyLabel + ': ' + s.required; render(); return; }
    bookDemoForm.submitting = true; bookDemoForm.error = null; render();

    var pc = pageContext || extractPageContext();
    var msg = (bookDemoForm.message.trim() || '(no message)') +
      '\n\nCompany: ' + bookDemoForm.company.trim() +
      '\nTeam size: ' + bookDemoForm.teamSize +
      (bookDemoForm.preferredTime ? '\nPreferred time: ' + bookDemoForm.preferredTime : '') +
      (pc.url ? '\nPage: ' + pc.url : '');

    fetch(BASE_URL + '/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: ACCOUNT_ID,
        customerName: bookDemoForm.name.trim(),
        customerEmail: bookDemoForm.email.trim(),
        brand: bookDemoForm.company.trim(),
        message: msg,
        sessionId: sessionId || null,
        source: 'widget_book_demo',
        refSource: pc.url || null,
        metadata: { widget_version: '4.1', team_size: bookDemoForm.teamSize, preferred_time: bookDemoForm.preferredTime || null, page_url: pc.url || null },
      }),
    })
      .then(function (r) { return r.ok ? r.json() : r.json().then(function (j) { throw new Error(j.error || 'submit failed'); }); })
      .then(function () {
        bookDemoForm.submitting = false;
        view = 'book_demo_success';
        widgetTrack('widget_book_demo_success', {});
        render();
      })
      .catch(function (e) {
        bookDemoForm.submitting = false;
        bookDemoForm.error = locale.support.submitError;
        widgetTrack('widget_book_demo_failed', { error: String(e && e.message || e).slice(0, 200) });
        render();
      });
  }

  function renderBookDemoForm() {
    var B = locale.bookDemo;
    var fieldsHtml =
      inputFieldHtml('ibot-bd-name', B.nameLabel, bookDemoForm.name, 'text', '', true) +
      inputFieldHtml('ibot-bd-email', B.emailLabel, bookDemoForm.email, 'email', '', true) +
      inputFieldHtml('ibot-bd-company', B.companyLabel, bookDemoForm.company, 'text', '', true) +
      selectFieldHtml('ibot-bd-team', B.teamSizeLabel, bookDemoForm.teamSize, B.teamSizes, true) +
      selectFieldHtml('ibot-bd-time', B.preferredTimeLabel, bookDemoForm.preferredTime, [{value:'', label: locale.dir === 'rtl' ? '— ללא העדפה —' : '— No preference —'}].concat(B.preferredTimes.map(function(t){return {value: t, label: t};})), false) +
      textareaFieldHtml('ibot-bd-message', B.messageLabel, bookDemoForm.message, B.messagePlaceholder, false, 3);
    container.innerHTML = formShell({
      title: B.title, subtitle: B.subtitle, fieldsHtml: fieldsHtml,
      submitLabel: B.submit, submitting: bookDemoForm.submitting, error: bookDemoForm.error,
    });
    bindFormShell();
    var sub = document.getElementById('ibot-form-submit');
    if (sub) sub.onclick = submitBookDemo;
  }

  // ============================================
  // Order tracking — calls /api/widget/order-lookup which talks to Shopify
  // server-side (account's Admin API token never reaches the client).
  // Two views: form (2 fields) → result (status card with tracking links).
  // ============================================
  function openOrderForm(prefill) {
    prefill = prefill || {};
    orderForm = {
      orderNumber: prefill.orderNumber || prefill.order_number || orderForm.orderNumber || '',
      email: prefill.email || orderForm.email || supportForm.email || '',
      error: null, submitting: false, result: null,
    };
    pendingAction = null;
    view = 'order_form';
    widgetTrack('widget_order_lookup_opened', { has_prefill: Object.keys(prefill).length > 0 });
    render();
  }

  function submitOrderLookup() {
    orderForm.orderNumber = (document.getElementById('ibot-of-num') || {}).value || '';
    orderForm.email = (document.getElementById('ibot-of-email') || {}).value || '';
    var s = locale.support, O = locale.order;
    if (!orderForm.orderNumber.trim()) { orderForm.error = O.orderNumberLabel + ': ' + s.required; render(); return; }
    if (!orderForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orderForm.email.trim())) { orderForm.error = s.invalidEmail; render(); return; }
    orderForm.submitting = true; orderForm.error = null; render();

    fetch(BASE_URL + '/api/widget/order-lookup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: ACCOUNT_ID,
        orderNumber: orderForm.orderNumber.trim(),
        email: orderForm.email.trim(),
      }),
    })
      .then(function (r) {
        if (r.status === 503) return r.json().then(function (j) { throw new Error(j.code === 'integration_missing' ? '__missing__' : (j.error || 'failed')); });
        return r.ok ? r.json() : r.json().then(function (j) { throw new Error(j.error || 'failed'); });
      })
      .then(function (data) {
        orderForm.submitting = false;
        orderForm.result = data || { found: false };
        view = 'order_result';
        widgetTrack('widget_order_lookup_result', { found: !!data?.found });
        render();
      })
      .catch(function (err) {
        orderForm.submitting = false;
        var m = String(err && err.message || err);
        orderForm.error = m === '__missing__' ? locale.order.unavailable : locale.support.submitError;
        widgetTrack('widget_order_lookup_failed', { error: m.slice(0, 80) });
        render();
      });
  }

  function renderOrderForm() {
    var O = locale.order;
    var fieldsHtml =
      inputFieldHtml('ibot-of-num', O.orderNumberLabel, orderForm.orderNumber, 'text', O.orderNumberPlaceholder, true) +
      inputFieldHtml('ibot-of-email', O.emailLabel, orderForm.email, 'email', O.emailPlaceholder, true);
    container.innerHTML = formShell({
      title: O.title, subtitle: O.subtitle, fieldsHtml: fieldsHtml,
      submitLabel: O.submit, submitting: orderForm.submitting, error: orderForm.error,
    });
    bindFormShell();
    var sub = document.getElementById('ibot-form-submit');
    if (sub) sub.onclick = submitOrderLookup;
  }

  function renderOrderResult() {
    var pc = config.primaryColor;
    var O = locale.order;
    var isMobile = window.innerWidth < 640;
    var panelStyle = isMobile
      ? mobilePanelStyle()
      : 'width:370px;height:min(560px, calc(100vh - 140px));border-radius:18px;position:relative;';
    var r = orderForm.result || { found: false };

    var statusCard = r.found
      ? '<div style="background:var(--ibot-surface);border:1px solid var(--ibot-border);border-radius:14px;padding:16px;margin-bottom:14px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<div style="font-weight:700;font-size:16px;color:var(--ibot-text-primary);">' + escapeHtml(r.orderNumber || '') + '</div>' +
        (r.total ? '<div style="font-size:14px;color:var(--ibot-text-muted);">' + escapeHtml(r.total) + '</div>' : '') +
        '</div>' +
        '<div style="display:inline-block;background:' + pc + '15;color:' + pc + ';padding:5px 12px;border-radius:999px;font-size:12px;font-weight:600;margin-bottom:10px;">' + escapeHtml(r.status || '') + '</div>' +
        (r.placedAt ? '<div style="font-size:12px;color:var(--ibot-text-muted);margin-bottom:8px;">' + escapeHtml(O.placedLabel + ' ' + new Date(r.placedAt).toLocaleDateString()) + '</div>' : '') +
        (r.itemSummary ? '<div style="font-size:13px;color:var(--ibot-text-secondary);margin-bottom:10px;"><strong>' + escapeHtml(O.itemsLabel) + '</strong> ' + escapeHtml(r.itemSummary) + '</div>' : '') +
        (Array.isArray(r.trackingNumbers) && r.trackingNumbers.length
          ? '<div style="font-size:12px;color:var(--ibot-text-muted);margin-bottom:8px;font-family:ui-monospace,monospace;"><strong style="font-family:inherit;">' + escapeHtml(O.trackingLabel) + '</strong> ' + escapeHtml(r.trackingNumbers.join(', ')) + '</div>'
          : '') +
        (Array.isArray(r.trackingUrls) && r.trackingUrls.length
          ? r.trackingUrls.map(function (u) {
            return '<a href="' + escapeHtml(u) + '" target="_blank" rel="noopener" style="display:inline-block;background:' + pc + ';color:#fff;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:600;text-decoration:none;margin-top:6px;">' + escapeHtml(O.trackUrlLabel) + ' →</a>';
          }).join(' ')
          : '') +
        '</div>'
      : '<div style="background:var(--ibot-surface);border:1px solid var(--ibot-border);border-radius:12px;padding:16px;color:var(--ibot-text-secondary);font-size:14px;text-align:center;">' + escapeHtml(O.notFound) + '</div>';

    container.innerHTML =
      (isMobile ? mobileBackdropHtml() : '') +
      '<div id="ibot-panel" style="' + panelStyle +
      'background:var(--ibot-panel-bg);display:flex;flex-direction:column;overflow:hidden;' +
      'box-shadow:0 8px 40px rgba(0,0,0,0.15);animation:ibot-slide-up 0.3s ease-out;">' +
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;flex-shrink:0;background:' + pc + ';color:#fff;' + (isMobile ? '' : 'border-radius:18px 18px 0 0;') + '">' +
      '<button id="ibot-form-back" style="background:rgba(255,255,255,0.12);border:none;color:#fff;cursor:pointer;border-radius:999px;padding:6px 10px;font-size:13px;font-family:inherit;">' + escapeHtml(locale.support.backToChat) + '</button>' +
      '<div style="flex:1;font-weight:700;font-size:17px;">' + escapeHtml(O.title) + '</div>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:16px;direction:' + locale.dir + ';">' + statusCard + '</div>' +
      '</div>' +
      (isMobile ? '' :
        '<div style="display:flex;justify-content:flex-end;margin-top:12px;">' +
        '<button id="ibot-close" style="width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;background:' + pc + ';color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 32px rgba(0,0,0,0.16),0 1px 6px rgba(0,0,0,0.06);">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button></div>');
    bindFormShell();
  }

  // ============================================
  // Generic success view — shared between lead + book-demo flows.
  // Support has its own (renderSupportSuccess) because it surfaces the ticket ref.
  // ============================================
  function renderGenericSuccess(L) {
    var pc = config.primaryColor;
    var isMobile = window.innerWidth < 640;
    var panelStyle = isMobile
      ? mobilePanelStyle()
      : 'width:400px;height:auto;max-height:min(680px, calc(100vh - 80px));border-radius:18px;position:relative;';
    container.innerHTML =
      (isMobile ? mobileBackdropHtml() : '') +
      '<div id="ibot-panel" style="' + panelStyle +
      'background:var(--ibot-panel-bg);display:flex;flex-direction:column;overflow:hidden;' +
      'box-shadow:0 8px 40px rgba(0,0,0,0.15);animation:ibot-slide-up 0.3s ease-out;">' +
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;flex-shrink:0;background:' + pc + ';color:#fff;' + (isMobile ? '' : 'border-radius:18px 18px 0 0;') + '">' +
      '<div style="font-weight:700;font-size:17px;">' + escapeHtml(L.title) + '</div></div>' +
      '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;">' +
      '<div style="width:64px;height:64px;border-radius:50%;background:var(--ibot-success-bg);color:var(--ibot-success-text);display:flex;align-items:center;justify-content:center;margin-bottom:18px;">' +
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
      '<div style="font-size:18px;font-weight:700;color:var(--ibot-text-primary);margin-bottom:8px;">' + escapeHtml(L.successTitle) + '</div>' +
      '<div style="font-size:14px;color:var(--ibot-text-secondary);margin-bottom:24px;line-height:1.5;max-width:280px;">' + escapeHtml(L.successBody) + '</div>' +
      '<button id="ibot-gs-back" style="background:' + pc + ';color:#fff;border:none;border-radius:12px;padding:11px 22px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">' + escapeHtml(locale.support.successBack) + '</button>' +
      '</div></div>' +
      (isMobile ? '' :
        '<div style="display:flex;justify-content:flex-end;margin-top:12px;">' +
        '<button id="ibot-close" style="width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;background:' + pc + ';color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 32px rgba(0,0,0,0.16),0 1px 6px rgba(0,0,0,0.06);">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button></div>');
    var back = document.getElementById('ibot-gs-back');
    if (back) back.onclick = function () { view = 'chat'; render(); };
    var closeBtn = document.getElementById('ibot-close');
    if (closeBtn) closeBtn.onclick = function () { isOpen = false; view = 'chat'; render(); };
  }

  // ============================================
  // Shopify cart adapter — fetches /cart.js when the page looks like a
  // Shopify store. Merges into pageContext.cart so the bot/admin can see
  // what's in the visitor's cart even without GTM dataLayer wiring.
  //
  // Shopify exposes /cart.js as same-origin JSON on every storefront page.
  // We trigger detection only when likely signals are present so we don't
  // fire a request on every site.
  // ============================================
  function isLikelyShopify() {
    try {
      if (window.Shopify && typeof window.Shopify === 'object') return true;
      // Shopify CDN reference in any meta/link is a strong signal.
      var links = document.querySelectorAll('link[href*="cdn.shopify.com"], script[src*="cdn.shopify.com"]');
      if (links.length) return true;
      var gen = document.querySelector('meta[name="generator"]');
      if (gen && (gen.getAttribute('content') || '').toLowerCase().indexOf('shopify') !== -1) return true;
    } catch (e) { /* */ }
    return false;
  }

  var _shopifyCartCache = null;
  var _shopifyCartTs = 0;
  function fetchShopifyCart() {
    // 30-second cache — cart changes slowly relative to chat turns; cheap to refresh.
    if (Date.now() - _shopifyCartTs < 30000 && _shopifyCartCache) {
      return Promise.resolve(_shopifyCartCache);
    }
    return fetch('/cart.js', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return null;
        _shopifyCartCache = {
          item_count: data.item_count || 0,
          total: data.total_price != null ? data.total_price / 100 : null,
          currency: data.currency || null,
          items: (data.items || []).slice(0, 5).map(function (it) {
            return { title: it.product_title || it.title, qty: it.quantity, price: it.price != null ? it.price / 100 : null };
          }),
          source: 'shopify',
        };
        _shopifyCartTs = Date.now();
        return _shopifyCartCache;
      })
      .catch(function () { return null; });
  }

  // Wrap the existing extractPageContext to enrich with Shopify cart when applicable.
  // Async because of /cart.js fetch — sendMessage awaits when Shopify is detected.
  var _baseExtractPageContext = extractPageContext;
  function extractPageContextAsync() {
    var ctx = _baseExtractPageContext();
    if (!isLikelyShopify()) return Promise.resolve(ctx);
    return fetchShopifyCart().then(function (cart) {
      if (cart) ctx.cart = cart; // Shopify wins over dataLayer guess
      return ctx;
    });
  }

  // ============================================
  // Smart greeting — personalize welcome when we know something about the
  // visitor. Three layers:
  //   1) Returning visitor with lastTopic → "still thinking about X?"
  //   2) First-time visitor on a product page → reference the product
  //   3) Default brand welcome message
  // Falls back to the original welcomeMessage if no signal is strong enough.
  // ============================================
  function buildSmartGreeting(defaultMsg) {
    var isEn = config.language === 'en';
    var ctx = pageContext || _baseExtractPageContext();
    var product = ctx && ctx.product && ctx.product.name;

    if (hasVisitedBefore && lastTopic) {
      return isEn
        ? 'Welcome back! Still thinking about ' + lastTopic + '? Happy to pick up where we left off ✨'
        : 'ברוך/ה הבא/ה בחזרה! עוד חושב/ת על ' + lastTopic + '? אשמח להמשיך מאיפה שעצרנו ✨';
    }
    if (product) {
      return isEn
        ? 'Hi! I see you\'re checking out "' + product + '" — want help deciding if it\'s right for you? ✨'
        : 'היי! ראיתי שאת/ה מסתכל/ת על "' + product + '" — רוצה עזרה להחליט אם זה מתאים? ✨';
    }
    return defaultMsg;
  }

  // ============================================
  // Proactive triggers — open the widget unprompted in two scenarios:
  //   A) Exit-intent (desktop only): mouse leaves the top of the viewport.
  //      Highest-converting pattern for last-chance offers without being
  //      mid-flow disruptive.
  //   B) 30s dwell on a product page with no scroll past first viewport:
  //      visitor is stuck — chat is faster than scrolling reviews.
  //
  // Frequency cap: at most once per visitor per 24h, regardless of trigger.
  // ============================================
  var PROACTIVE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  function canFireProactive() {
    if (isOpen) return false; // visitor already engaged
    if (Date.now() - proactiveLastFired < PROACTIVE_COOLDOWN_MS) return false;
    return true;
  }
  function fireProactive(reason) {
    if (!canFireProactive()) return;
    proactiveLastFired = Date.now();
    try { localStorage.setItem('ibot_proactive_' + ACCOUNT_ID, String(proactiveLastFired)); } catch (e) { /* */ }
    widgetTrack('widget_proactive_opened', { reason: reason });
    isOpen = true;
    render();
  }

  function armProactiveTriggers() {
    var isMobile = window.innerWidth < 640;

    // Exit-intent: desktop only, mouse exits top of viewport
    if (!isMobile) {
      var exitHandler = function (e) {
        // e.clientY < 5 = mouse near top edge; e.relatedTarget null = leaving window
        if (e.clientY <= 5 && !e.relatedTarget) {
          fireProactive('exit_intent');
        }
      };
      document.addEventListener('mouseleave', exitHandler);
    }

    // 30s on a product page with low scroll → assume stuck
    var ctx = pageContext || _baseExtractPageContext();
    if (ctx && ctx.product && ctx.product.name) {
      setTimeout(function () {
        // If they've scrolled past 1.5 viewports, they're engaging — leave them alone.
        if (window.scrollY > window.innerHeight * 1.5) return;
        fireProactive('product_dwell_30s');
      }, 30000);
    }
  }

  // ============================================
  // Boot
  // ============================================
  pageContext = _baseExtractPageContext();
  // Defer Shopify enrichment — non-blocking, fills cart context if applicable.
  if (isLikelyShopify()) {
    extractPageContextAsync().then(function (enriched) { pageContext = enriched; });
  }
  // Behavioral collectors that fire once at load, from the synchronous page
  // context (Shopify cart enrichment above is out of scope here — Phase C
  // covers live cart tracking; this is a passive load-time snapshot only).
  trackPageView();
  try {
    if (pageContext && pageContext.product && pageContext.product.name) {
      behaviorTrack('product_view', {
        product_name: pageContext.product.name,
        price: pageContext.product.price != null ? pageContext.product.price : null,
        sku: pageContext.product.sku || null,
      });
    }
    if (pageContext && pageContext.cart) {
      behaviorTrack('cart_state', {
        item_count: pageContext.cart.item_count != null ? pageContext.cart.item_count : null,
        value: pageContext.cart.total != null ? pageContext.cart.total : null,
      });
    }
  } catch (e) { /* */ }
  // Apply smart greeting after config loads — the welcomeMessage will have
  // been set from /api/widget/config; wrap it with personalization.
  setTimeout(function () {
    if (messages.length === 1 && messages[0].role === 'assistant') {
      messages[0].content = buildSmartGreeting(messages[0].content);
      if (isOpen) render();
    }
  }, 500);
  armProactiveTriggers();
  render();
})();
