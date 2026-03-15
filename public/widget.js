/**
 * InfluencerBot Website Widget v3.0
 * Standalone embeddable chat widget — no dependencies
 * Matches Figma spec 68:448 (Leaders-Chat)
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
    console.error('[InfluencerBot Widget] Missing data-account-id attribute');
    return;
  }

  // ============================================
  // State
  // ============================================

  var isOpen = false;
  var sessionId = localStorage.getItem('ibot_widget_' + ACCOUNT_ID) || null;
  var messages = [];
  var isLoading = false;
  var config = {
    welcomeMessage: 'שלום! איך אפשר לעזור? ✨',
    placeholder: 'כתבו הודעה...',
    position: 'bottom-right',
    brandName: 'העוזר החכם',
    profilePic: null,
    primaryColor: '#0c1013',
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
      updateContainerPosition();
      messages = [{ role: 'assistant', content: config.welcomeMessage }];
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
    trigger.onclick = function () { isOpen = true; render(); };
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

      // Typing indicator
      if (isEmpty) {
        msgsHtml +=
          '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;animation:ibot-msg-in 0.3s ease-out;">' +
          '<div style="display:flex;align-items:flex-end;gap:8px;max-width:85%;">' +
          '<div style="width:20px;height:20px;flex-shrink:0;">' +
          avatarHtml(20) + '</div>' +
          '<div style="padding:9px 12px;border-radius:30px;font-size:16px;' +
          'background:#fff;color:#000;display:flex;gap:4px;align-items:center;">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:#676767;animation:ibot-bounce 1.2s ease-in-out infinite;"></span>' +
          '<span style="width:6px;height:6px;border-radius:50%;background:#676767;animation:ibot-bounce 1.2s ease-in-out 0.15s infinite;"></span>' +
          '<span style="width:6px;height:6px;border-radius:50%;background:#676767;animation:ibot-bounce 1.2s ease-in-out 0.3s infinite;"></span>' +
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
      closeEl.onclick = function () { isOpen = false; render(); };
      closeEl.onmouseover = function () { this.style.transform = 'scale(1.08)'; };
      closeEl.onmouseout = function () { this.style.transform = 'scale(1)'; };
    }

    var closeMobileEl = document.getElementById('ibot-close-mobile');
    if (closeMobileEl) {
      closeMobileEl.onclick = function () { isOpen = false; render(); };
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
              messages[messages.length - 1].content = fullText.replace(/<<SUGGESTIONS>>[\s\S]*?<<\/SUGGESTIONS>>/g, '').trim();
              render();
              return;
            }

            var chunk = decoder.decode(result.value, { stream: true });
            var lines = chunk.split('\n').filter(Boolean);

            for (var i = 0; i < lines.length; i++) {
              try {
                var event = JSON.parse(lines[i]);
                if (event.type === 'delta' && event.text) {
                  fullText += event.text;
                  var displayText = fullText.replace(/<<SUGGESTIONS>>[\s\S]*/g, '').trim();
                  messages[messages.length - 1].content = displayText;
                  render();
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
              } catch (e) {
                // Skip malformed lines
              }
            }

            read();
          }).catch(function () {
            isLoading = false;
            messages[messages.length - 1].content = 'שגיאה בחיבור. נסו שוב.';
            render();
          });
        }

        read();
      })
      .catch(function () {
        isLoading = false;
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

  // Initial render
  render();
})();
