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
  var config = {
    welcomeMessage: 'שלום! איך אפשר לעזור? ✨',
    placeholder: 'כתבו הודעה...',
    position: 'bottom-right',
    brandName: 'העוזר החכם',
    profilePic: null,
    primaryColor: '#0c1013',
  };

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
      window.open(product.productUrl, '_blank', 'noopener');
    }
  }

  // Expose card click handler globally (inline onclick uses it).
  window.__ibotCardClick = function (id, position) {
    var products = (window.__ibotLastCards && window.__ibotLastCards.products) || [];
    for (var i = 0; i < products.length; i++) {
      if (products[i].id === id) { onCardClick(products[i], position); return; }
    }
  };
  window.__ibotChipClick = function (idx) {
    if (chips[idx]) onChipClick(chips[idx], idx, 'initial');
  };

  // ============================================
  // Load Heebo Font
  // ============================================

  var fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap';
  document.head.appendChild(fontLink);

  // ============================================
  // Inject CSS Animations
  // ============================================

  var styleEl = document.createElement('style');
  styleEl.textContent =
    '@keyframes ibot-slide-up{from{opacity:0;transform:translateY(20px) scale(0.95);}to{opacity:1;transform:translateY(0) scale(1);}}' +
    '@keyframes ibot-bounce{0%,80%,100%{transform:translateY(0);}40%{transform:translateY(-5px);}}' +
    '@keyframes ibot-msg-in{from{opacity:0;transform:translateX(10px);}to{opacity:1;transform:translateX(0);}}' +
    '@keyframes ibot-fade-in{from{opacity:0;}to{opacity:1;}}' +
    '#ibot-widget-container *{box-sizing:border-box;font-family:"Heebo",system-ui,-apple-system,sans-serif;}' +
    '#ibot-widget-container input:focus{outline:none;}' +
    '#ibot-widget-container ::-webkit-scrollbar{width:4px;}' +
    '#ibot-widget-container ::-webkit-scrollbar-track{background:transparent;}' +
    '#ibot-widget-container ::-webkit-scrollbar-thumb{background:rgba(150,150,150,0.3);border-radius:4px;}';
  document.head.appendChild(styleEl);

  // ============================================
  // Load Config
  // ============================================

  fetch(BASE_URL + '/api/widget/config?accountId=' + ACCOUNT_ID)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.theme) {
        config.position = data.theme.position || config.position;
        if (data.theme.primaryColor) config.primaryColor = data.theme.primaryColor;
      }
      if (data.welcomeMessage) config.welcomeMessage = data.welcomeMessage;
      if (data.placeholder) config.placeholder = data.placeholder;
      if (data.brandName) config.brandName = data.brandName;
      if (data.profilePic) config.profilePic = data.profilePic;
      if (data.analyticsToken) ANALYTICS_TOKEN = data.analyticsToken;
      updateContainerPosition();
      messages = [{ role: 'assistant', content: config.welcomeMessage }];
      widgetTrack('widget_loaded', {});
      // Fire chip fetch in parallel — non-blocking; widget renders without chips
      // first, chips populate when ready (≈400ms on cache miss).
      fetchChips('initial');
      render();
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

  function updateContainerPosition() {
    container.style.cssText = 'position:fixed;z-index:2147483647;' +
      (config.position === 'bottom-left' ? 'bottom:24px;left:24px;' : 'bottom:24px;right:24px;') +
      'font-family:"Heebo",system-ui,sans-serif;direction:rtl;';
  }

  // ============================================
  // Avatar helper
  // ============================================

  function avatarHtml(size) {
    if (config.profilePic) {
      return '<img src="' + escapeHtml(config.profilePic) + '" alt="' + escapeHtml(config.brandName) + '" ' +
        'style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />';
    }
    return '<iframe src="' + BASE_URL + '/blob-animation.html" ' +
      'style="width:100%;height:100%;border:none;border-radius:50%;pointer-events:none;" title="Bot"></iframe>';
  }

  // ============================================
  // Render
  // ============================================

  function render() {
    if (!isOpen) {
      renderClosed();
    } else {
      renderOpen();
    }
  }

  // ---- Closed state: blob only ----
  function renderClosed() {
    container.innerHTML =
      '<div id="ibot-trigger" style="' +
      'width:60px;height:60px;cursor:pointer;' +
      'transition:transform 0.3s ease;animation:ibot-slide-up 0.35s ease-out;' +
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
          'background:#fff;color:#000;display:flex;gap:4px;align-items:center;">' +
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
        // Bot bubble: white, rounded-30px, left-aligned (flex-end in RTL) with small avatar
        msgsHtml +=
          '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;animation:ibot-msg-in 0.3s ease-out;">' +
          '<div style="display:flex;align-items:flex-end;gap:8px;max-width:85%;">' +
          '<div style="width:20px;height:20px;flex-shrink:0;">' +
          avatarHtml(20) + '</div>' +
          '<div style="padding:9px 12px;border-radius:30px;font-size:16px;line-height:1.5;' +
          'background:#fff;color:#000;word-break:break-word;">' +
          formatMessage(m.content, false) +
          '</div></div></div>';
      }
    }

    var isMobile = window.innerWidth < 640;

    // Panel dimensions per Figma
    var panelStyle = isMobile
      ? 'position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border-radius:0;'
      : 'width:370px;height:min(520px, calc(100vh - 140px));border-radius:18px;';

    container.innerHTML =
      // Main panel
      '<div id="ibot-panel" style="' + panelStyle +
      'background:#f4f5f7;' +
      'display:flex;flex-direction:column;overflow:hidden;' +
      'box-shadow:0 8px 40px rgba(0,0,0,0.15);' +
      'animation:ibot-slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1);">' +

      // ---- Dark header (81px) ----
      '<div style="display:flex;align-items:center;gap:10px;padding:0 16px;height:81px;flex-shrink:0;' +
      'background:' + pc + ';color:#fff;' +
      (isMobile ? '' : 'border-radius:18px 18px 0 0;') + '">' +
      // Avatar (52px)
      '<div style="width:52px;height:52px;flex-shrink:0;">' +
      avatarHtml(52) + '</div>' +
      // Title + status (no wrap)
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-weight:700;font-size:23px;line-height:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(config.brandName) + '</div>' +
      '<div style="display:flex;align-items:center;gap:4px;margin-top:2px;">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:#22c55e;flex-shrink:0;"></span>' +
      '<span style="font-size:16px;white-space:nowrap;">זמין</span>' +
      '</div></div>' +
      // Mobile: close button in header
      (isMobile
        ? '<button id="ibot-close-mobile" style="background:rgba(255,255,255,0.15);border:none;color:#fff;cursor:pointer;' +
          'width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
          'font-size:20px;transition:background 0.2s;">&times;</button>'
        : '') +
      '</div>' +

      // ---- Messages area (padding matches header 16px) ----
      '<div id="ibot-messages" style="flex:1;overflow-y:auto;padding:12px 16px;direction:rtl;">' +
      msgsHtml +
      '</div>' +

      // ---- Smart chips row (only when no user message yet AND chips loaded) ----
      ((chips.length > 0 && !messages.some(function (mm) { return mm.role === 'user'; }))
        ? renderChipsRow(chips, pc)
        : '') +

      // ---- Input area (centered, same 16px side padding as header) ----
      '<div style="padding:8px 16px 14px;flex-shrink:0;">' +
      '<div style="display:flex;align-items:center;gap:16px;background:#fff;border-radius:18px;' +
      'padding:8px 8px 8px 10px;height:60px;box-shadow:4px 6px 23px rgba(0,0,0,0.1);overflow:hidden;">' +
      // Send button (left side in RTL)
      '<button id="ibot-send" style="width:38px;height:38px;background:' + pc + ';color:#fff;border:none;' +
      'border-radius:60px;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
      'flex-shrink:0;transition:transform 0.2s,opacity 0.2s;' +
      (isLoading ? 'opacity:0.5;pointer-events:none;' : '') + '">' +
      // Up-arrow SVG (send icon)
      '<svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M7 1L1 7M7 1L13 7M7 1V15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      // Input field
      '<input id="ibot-input" type="text" placeholder="' + escapeHtml(config.placeholder) + '" ' +
      'style="flex:1;border:none;outline:none;font-size:16px;color:' + pc + ';background:transparent;' +
      'direction:rtl;font-family:inherit;text-align:right;min-width:0;" />' +
      '</div></div>' +

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

    fetch(BASE_URL + '/api/widget/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        accountId: ACCOUNT_ID,
        sessionId: sessionId,
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
                  thinkingText = null;
                  fullText += event.text;
                  // Strip both <<SUGGESTIONS>> and <<INTENT>> while streaming
                  // so partial envelope tokens never flash on screen.
                  var displayText = fullText
                    .replace(/<<SUGGESTIONS>>[\s\S]*/g, '')
                    .replace(/<<INTENT>>[\s\S]*/g, '')
                    .trim();
                  messages[messages.length - 1].content = displayText;
                  render();
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
                } else if (event.type === 'error') {
                  messages[messages.length - 1].content = event.message || 'שגיאה בעיבוד הבקשה.';
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
            messages[messages.length - 1].content = 'שגיאה בחיבור. נסו שוב.';
            render();
          });
        }

        read();
      })
      .catch(function () {
        isLoading = false;
        thinkingText = null;
        messages[messages.length - 1].content = 'שגיאה בחיבור. נסו שוב.';
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

  // ---- Smart chips row (above input) ----
  function renderChipsRow(items, pc) {
    var pills = '';
    for (var i = 0; i < items.length; i++) {
      var label = String(items[i] || '').trim();
      if (!label) continue;
      pills +=
        '<button onclick="window.__ibotChipClick(' + i + ')" ' +
        'style="background:#fff;border:1px solid #e5e7eb;color:#111;cursor:pointer;' +
        'border-radius:999px;padding:7px 12px;font-size:13px;line-height:1.2;' +
        'white-space:nowrap;flex-shrink:0;font-family:inherit;transition:transform 0.15s,border-color 0.15s;" ' +
        'onmouseover="this.style.transform=\'translateY(-1px)\';this.style.borderColor=\'' + pc + '\';" ' +
        'onmouseout="this.style.transform=\'\';this.style.borderColor=\'#e5e7eb\';">' +
        escapeHtml(label) + '</button>';
    }
    if (!pills) return '';
    return (
      '<div style="padding:0 16px 4px;display:flex;gap:6px;overflow-x:auto;direction:rtl;flex-shrink:0;' +
      '-webkit-overflow-scrolling:touch;scrollbar-width:none;" ' +
      'onwheel="if(this.scrollWidth>this.clientWidth){this.scrollLeft+=event.deltaY;event.preventDefault();}">' +
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
      var price = p.price != null ? '₪' + p.price : '';
      var orig = p.originalPrice && p.originalPrice > p.price
        ? '<span style="color:#9ca3af;text-decoration:line-through;font-size:12px;margin-right:6px;">₪' + p.originalPrice + '</span>'
        : '';
      var badge = '';
      if (p.badge) {
        var badgeColor = p.badge === 'SALE' ? '#dc2626' : (p.badge === 'NEW' ? '#16a34a' : '#7c3aed');
        var badgeText = p.badge === 'SALE' ? 'מבצע' : (p.badge === 'NEW' ? 'חדש' : 'מומלץ');
        badge =
          '<div style="position:absolute;top:6px;right:6px;background:' + badgeColor + ';color:#fff;' +
          'font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;letter-spacing:0.3px;">' +
          badgeText + '</div>';
      }
      var img = p.image
        ? '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name || '') + '" ' +
          'style="width:100%;height:120px;object-fit:cover;border-radius:10px 10px 0 0;background:#f3f4f6;" ' +
          'onerror="this.style.display=\'none\';this.parentNode.style.background=\'#f3f4f6\';this.parentNode.style.height=\'120px\';" />'
        : '<div style="width:100%;height:120px;background:#f3f4f6;border-radius:10px 10px 0 0;"></div>';
      var recFor = p.recommendedFor
        ? '<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">מומלץ ל: ' + escapeHtml(p.recommendedFor) + '</div>'
        : '';
      var sp = p.socialProof || {};
      var spLine = '';
      if (sp.rating || sp.review_count) {
        spLine += '<div style="font-size:11px;color:#6b7280;display:flex;align-items:center;gap:3px;margin-top:4px;">';
        if (sp.rating) spLine += '<span style="color:#f59e0b;">★</span><span>' + sp.rating + '</span>';
        if (sp.review_count) spLine += '<span>(' + sp.review_count + ')</span>';
        spLine += '</div>';
      }
      var purchase = sp.purchase_signal
        ? '<div style="font-size:11px;color:' + pc + ';margin-top:3px;font-weight:500;">' + escapeHtml(sp.purchase_signal) + '</div>'
        : '';
      var safeId = escapeHtml(p.id || '');
      cardsHtml +=
        '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;' +
        'flex-shrink:0;width:' + cardWidth + ';display:flex;flex-direction:column;position:relative;' +
        'box-shadow:0 1px 3px rgba(0,0,0,0.04);transition:transform 0.15s,box-shadow 0.15s;cursor:pointer;" ' +
        'onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 4px 12px rgba(0,0,0,0.08)\';" ' +
        'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'0 1px 3px rgba(0,0,0,0.04)\';" ' +
        'onclick="window.__ibotCardClick(\'' + safeId + '\',' + i + ')">' +
        img + badge +
        '<div style="padding:10px 12px 12px;display:flex;flex-direction:column;flex:1;">' +
        '<div style="font-weight:600;font-size:14px;line-height:1.3;color:#111;margin-bottom:4px;' +
        'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' +
        escapeHtml(p.name || '') + '</div>' +
        recFor +
        '<div style="margin-top:auto;display:flex;align-items:center;flex-wrap:wrap;">' +
        '<span style="font-weight:700;font-size:15px;color:#111;">' + price + '</span>' +
        orig +
        '</div>' +
        spLine + purchase +
        '<button style="margin-top:8px;background:' + pc + ';color:#fff;border:none;border-radius:8px;' +
        'padding:7px 10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;width:100%;" ' +
        'onclick="event.stopPropagation();window.__ibotCardClick(\'' + safeId + '\',' + i + ')">' +
        escapeHtml(p.ctaLabel || 'לפרטים') + '</button>' +
        '</div></div>';
    }
    if (!cardsHtml) return '';
    return (
      '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;animation:ibot-msg-in 0.3s ease-out;">' +
      '<div style="display:flex;gap:8px;overflow-x:auto;width:100%;padding-bottom:4px;direction:rtl;' +
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
      // Markdown links (with product click tracking for /product/ URLs)
      safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, t, u) {
        var isProductLink = u.indexOf('/product') !== -1;
        var trackAttr = isProductLink
          ? ' onclick="(function(e){try{fetch((window.IBOT_HOST||\'\')+\'/api/widget/recommendations/click\',{method:\'POST\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify({accountId:\'' + config.accountId + '\',productId:null})}).catch(function(){});}catch(x){}})()"'
          : '';
        return '<a href="' + u + '" target="_blank" rel="noopener"' + trackAttr +
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

  // Initial render + analytics: announce widget is on the page
  widgetTrack('widget_loaded', {});
  render();
})();
