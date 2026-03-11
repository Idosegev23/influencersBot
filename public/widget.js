/**
 * InfluencerBot Website Widget v2.0
 * Standalone embeddable chat widget — no dependencies
 * Features: glassmorphism, animations, dark mode, typing indicator, AI avatar
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
  var darkMode = false;
  var config = {
    primaryColor: '#6366f1',
    welcomeMessage: 'שלום! איך אפשר לעזור? ✨',
    placeholder: 'כתבו הודעה...',
    position: 'bottom-right',
    brandName: 'העוזר החכם',
  };

  // ============================================
  // Dark Mode Detection
  // ============================================

  function detectDarkMode() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      darkMode = true;
    }
    // Also check host page background
    var bodyBg = window.getComputedStyle(document.body).backgroundColor;
    if (bodyBg) {
      var match = bodyBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        var brightness = (parseInt(match[1]) * 299 + parseInt(match[2]) * 587 + parseInt(match[3]) * 114) / 1000;
        if (brightness < 128) darkMode = true;
      }
    }
  }
  detectDarkMode();

  // Listen for system theme changes
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        darkMode = e.matches;
        if (isOpen) render();
      });
    } catch (e) { /* old browsers */ }
  }

  // ============================================
  // Theme helpers
  // ============================================

  function theme() {
    return {
      bg: darkMode ? 'rgba(30,30,40,0.92)' : 'rgba(255,255,255,0.92)',
      msgBg: darkMode ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
      userBg: darkMode ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.08)',
      text: darkMode ? '#e5e7eb' : '#1f2937',
      textSecondary: darkMode ? '#9ca3af' : '#6b7280',
      border: darkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb',
      inputBg: darkMode ? 'rgba(255,255,255,0.06)' : '#fff',
      inputBorder: darkMode ? 'rgba(255,255,255,0.15)' : '#d1d5db',
      shadow: darkMode ? '0 8px 40px rgba(0,0,0,0.5)' : '0 8px 40px rgba(0,0,0,0.15)',
      backdrop: darkMode ? 'blur(20px) saturate(180%)' : 'blur(20px) saturate(180%)',
    };
  }

  // ============================================
  // Inject CSS Animations
  // ============================================

  var styleEl = document.createElement('style');
  styleEl.textContent =
    '@keyframes ibot-slide-up{from{opacity:0;transform:translateY(20px) scale(0.95);}to{opacity:1;transform:translateY(0) scale(1);}}' +
    '@keyframes ibot-fade-in{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}' +
    '@keyframes ibot-bounce{0%,80%,100%{transform:translateY(0);}40%{transform:translateY(-5px);}}' +
    '@keyframes ibot-pulse{0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0.4);}50%{box-shadow:0 0 0 8px rgba(99,102,241,0);}}' +
    '@keyframes ibot-msg-in{from{opacity:0;transform:translateX(10px);}to{opacity:1;transform:translateX(0);}}' +
    '#ibot-widget-container *{box-sizing:border-box;}' +
    '#ibot-widget-container input:focus{border-color:' + config.primaryColor + ' !important;box-shadow:0 0 0 2px rgba(99,102,241,0.2) !important;}' +
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
        config.primaryColor = data.theme.primaryColor || config.primaryColor;
        config.position = data.theme.position || config.position;
      }
      if (data.welcomeMessage) config.welcomeMessage = data.welcomeMessage;
      if (data.placeholder) config.placeholder = data.placeholder;
      if (data.brandName) config.brandName = data.brandName;
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
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;direction:rtl;';
  }

  // ============================================
  // Render
  // ============================================

  var msgCounter = 0;

  function render() {
    var pc = config.primaryColor;
    var t = theme();

    // ---- Closed state: toggle button ----
    if (!isOpen) {
      container.innerHTML =
        '<button id="ibot-toggle" style="' +
        'width:71px;height:71px;border-radius:50%;border:none;cursor:pointer;' +
        'background:transparent;padding:0;' +
        'box-shadow:0 4px 24px rgba(99,102,241,0.4);' +
        'display:flex;align-items:center;justify-content:center;' +
        'transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.3s;overflow:hidden;' +
        'animation:ibot-pulse 2.5s infinite;' +
        '">' +
        '<video autoplay loop muted playsinline style="width:100%;height:100%;border-radius:50%;object-fit:cover;">' +
        '<source src="' + BASE_URL + '/bot-avatar.webm" type="video/webm" />' +
        '<source src="' + BASE_URL + '/bot-avatar.mp4" type="video/mp4" />' +
        '</video>' +
        '</button>';

      document.getElementById('ibot-toggle').onclick = function () {
        isOpen = true;
        render();
      };
      document.getElementById('ibot-toggle').onmouseover = function () {
        this.style.transform = 'scale(1.12)';
        this.style.boxShadow = '0 6px 30px rgba(99,102,241,0.5)';
      };
      document.getElementById('ibot-toggle').onmouseout = function () {
        this.style.transform = 'scale(1)';
        this.style.boxShadow = '0 4px 24px rgba(99,102,241,0.4)';
      };
      return;
    }

    // ---- Open state: chat panel ----
    var msgsHtml = '';
    for (var mi = 0; mi < messages.length; mi++) {
      var m = messages[mi];
      var isUser = m.role === 'user';
      var isLast = mi === messages.length - 1;
      var isEmpty = !m.content && isLoading && isLast;

      // Typing indicator for empty loading message
      if (isEmpty) {
        msgsHtml +=
          '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;animation:ibot-msg-in 0.3s ease-out;">' +
          '<div style="display:flex;align-items:flex-end;gap:6px;max-width:85%;">' +
          // AI avatar
          '<div style="width:30px;height:30px;border-radius:50%;overflow:hidden;flex-shrink:0;">' +
          '<video autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;"><source src="' + BASE_URL + '/bot-avatar.webm" type="video/webm" /><source src="' + BASE_URL + '/bot-avatar.mp4" type="video/mp4" /></video>' +
          '</div>' +
          '<div style="padding:12px 16px;border-radius:16px 16px 4px 16px;font-size:14px;' +
          'background:' + t.msgBg + ';color:' + t.text + ';display:flex;gap:4px;align-items:center;">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:' + t.textSecondary + ';animation:ibot-bounce 1.2s ease-in-out infinite;"></span>' +
          '<span style="width:6px;height:6px;border-radius:50%;background:' + t.textSecondary + ';animation:ibot-bounce 1.2s ease-in-out 0.15s infinite;"></span>' +
          '<span style="width:6px;height:6px;border-radius:50%;background:' + t.textSecondary + ';animation:ibot-bounce 1.2s ease-in-out 0.3s infinite;"></span>' +
          '</div></div></div>';
        continue;
      }

      if (isUser) {
        msgsHtml +=
          '<div style="display:flex;justify-content:flex-start;margin-bottom:8px;animation:ibot-msg-in 0.3s ease-out;">' +
          '<div style="max-width:82%;padding:10px 14px;border-radius:16px 16px 16px 4px;font-size:14px;line-height:1.6;' +
          'background:linear-gradient(135deg,' + pc + ',' + pc + 'dd);color:#fff;word-break:break-word;' +
          'box-shadow:0 2px 8px rgba(99,102,241,0.2);">' +
          formatMessage(m.content) +
          '</div></div>';
      } else {
        msgsHtml +=
          '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;animation:ibot-msg-in 0.3s ease-out;">' +
          '<div style="display:flex;align-items:flex-end;gap:6px;max-width:85%;">' +
          // AI avatar
          '<div style="width:30px;height:30px;border-radius:50%;overflow:hidden;flex-shrink:0;">' +
          '<video autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;"><source src="' + BASE_URL + '/bot-avatar.webm" type="video/webm" /><source src="' + BASE_URL + '/bot-avatar.mp4" type="video/mp4" /></video>' +
          '</div>' +
          '<div style="padding:10px 14px;border-radius:16px 16px 4px 16px;font-size:14px;line-height:1.6;' +
          'background:' + t.msgBg + ';color:' + t.text + ';word-break:break-word;' +
          'box-shadow:0 1px 4px rgba(0,0,0,0.06);">' +
          formatMessage(m.content) +
          '</div></div></div>';
      }
    }

    var isMobile = window.innerWidth < 640;
    var panelStyle = isMobile
      ? 'position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border-radius:0;'
      : 'width:370px;height:520px;border-radius:20px;';

    container.innerHTML =
      '<div id="ibot-panel" style="' + panelStyle +
      'background:' + t.bg + ';' +
      'backdrop-filter:' + t.backdrop + ';-webkit-backdrop-filter:' + t.backdrop + ';' +
      'box-shadow:' + t.shadow + ';' +
      'border:1px solid ' + t.border + ';' +
      'display:flex;flex-direction:column;overflow:hidden;' +
      'animation:ibot-slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1);">' +

      // ---- Header with gradient ----
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;' +
      'background:linear-gradient(135deg,' + pc + ' 0%,#8b5cf6 50%,#a855f7 100%);color:#fff;' +
      'position:relative;overflow:hidden;">' +
      // Decorative glow
      '<div style="position:absolute;top:-20px;right:-20px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.1);"></div>' +
      '<div style="position:absolute;bottom:-30px;left:-10px;width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,0.07);"></div>' +
      // Icon
      '<div style="width:39px;height:39px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,0.3);flex-shrink:0;position:relative;z-index:1;">' +
      '<video autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;"><source src="' + BASE_URL + '/bot-avatar.webm" type="video/webm" /><source src="' + BASE_URL + '/bot-avatar.mp4" type="video/mp4" /></video>' +
      '</div>' +
      // Title
      '<div style="flex:1;position:relative;z-index:1;">' +
      '<div style="font-weight:700;font-size:15px;letter-spacing:-0.2px;">' + escapeHtml(config.brandName) + '</div>' +
      '<div style="font-size:11px;opacity:0.85;margin-top:1px;">מקוון עכשיו</div>' +
      '</div>' +
      // Close button
      '<button id="ibot-close" style="background:rgba(255,255,255,0.15);border:none;color:#fff;cursor:pointer;' +
      'width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
      'font-size:18px;transition:background 0.2s;position:relative;z-index:1;">&times;</button>' +
      '</div>' +

      // ---- Messages area ----
      '<div id="ibot-messages" style="flex:1;overflow-y:auto;padding:16px;direction:rtl;">' +
      msgsHtml +
      '</div>' +

      // ---- Input area ----
      '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;' +
      'border-top:1px solid ' + t.border + ';background:' + (darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(249,250,251,0.8)') + ';">' +
      '<input id="ibot-input" type="text" placeholder="' + escapeHtml(config.placeholder) + '" ' +
      'style="flex:1;padding:10px 14px;border:1px solid ' + t.inputBorder + ';border-radius:12px;font-size:14px;' +
      'outline:none;direction:rtl;font-family:inherit;background:' + t.inputBg + ';color:' + t.text + ';' +
      'transition:border-color 0.2s,box-shadow 0.2s;" />' +
      '<button id="ibot-send" style="width:38px;height:38px;background:linear-gradient(135deg,' + pc + ',' + pc + 'cc);' +
      'color:#fff;border:none;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
      'transition:transform 0.2s,opacity 0.2s;flex-shrink:0;' + (isLoading ? 'opacity:0.5;pointer-events:none;' : '') + '">' +
      // Send arrow SVG
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(180deg);">' +
      '<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>' +
      '</button>' +
      '</div>' +

      // ---- Powered by ----
      '<div style="text-align:center;padding:6px;font-size:10px;color:' + t.textSecondary + ';">Powered by InfluencerBot</div>' +
      '</div>';

    // Scroll to bottom
    var msgsEl = document.getElementById('ibot-messages');
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

    // Event listeners
    document.getElementById('ibot-close').onclick = function () {
      isOpen = false;
      render();
    };
    document.getElementById('ibot-close').onmouseover = function () {
      this.style.background = 'rgba(255,255,255,0.25)';
    };
    document.getElementById('ibot-close').onmouseout = function () {
      this.style.background = 'rgba(255,255,255,0.15)';
    };

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
              // Strip <<SUGGESTIONS>> tags before final render
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
                  // Hide <<SUGGESTIONS>> during streaming
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

  function formatMessage(str) {
    if (!str) return '';
    var pc = config.primaryColor;
    var t = theme();
    var lines = str.split('\n');
    var html = '';
    var inUl = false;
    var inOl = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      // Bullet list
      var bulletMatch = trimmed.match(/^[-•]\s+(.+)/) || (trimmed.match(/^\*\s+(.+)/) && !trimmed.match(/^\*\*[^*]/));
      // Numbered list
      var numMatch = trimmed.match(/^\d+[.)]\s+(.+)/);

      if (bulletMatch) {
        if (inOl) { html += '</ol>'; inOl = false; }
        if (!inUl) { html += '<ul style="margin:4px 0;padding-right:16px;list-style:none;">'; inUl = true; }
        html += '<li style="margin-bottom:3px;line-height:1.6;color:' + t.text + ';position:relative;padding-right:12px;">' +
          '<span style="position:absolute;right:0;color:' + pc + ';">•</span>' +
          formatInline(bulletMatch[1] || trimmed.replace(/^[-•*]\s+/, '')) + '</li>';
      } else if (numMatch) {
        if (inUl) { html += '</ul>'; inUl = false; }
        if (!inOl) { html += '<ol style="margin:4px 0;padding-right:16px;list-style:decimal inside;">'; inOl = true; }
        html += '<li style="margin-bottom:3px;line-height:1.6;color:' + t.text + ';">' + formatInline(numMatch[1]) + '</li>';
      } else {
        if (inUl) { html += '</ul>'; inUl = false; }
        if (inOl) { html += '</ol>'; inOl = false; }
        if (trimmed === '') {
          html += '<div style="height:6px;"></div>';
        } else {
          html += '<div style="margin-bottom:4px;line-height:1.6;">' + formatInline(trimmed) + '</div>';
        }
      }
    }
    if (inUl) html += '</ul>';
    if (inOl) html += '</ol>';
    return html;

    function formatInline(text) {
      var safe = escapeHtml(text);
      // Markdown images ![alt](url)
      safe = safe.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (_, alt, src) {
        return '<div style="margin:8px 0;"><img src="' + src + '" alt="' + alt + '" ' +
          'style="max-width:100%;max-height:180px;border-radius:10px;object-fit:cover;cursor:pointer;' +
          'box-shadow:0 2px 8px rgba(0,0,0,0.1);" ' +
          'onerror="this.style.display=\'none\'" ' +
          'onclick="window.open(\'' + src + '\',\'_blank\')" /></div>';
      });
      // Markdown links [text](url)
      safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, t, u) {
        return '<a href="' + u + '" target="_blank" rel="noopener" style="color:' + pc + ';text-decoration:none;' +
          'border-bottom:1px solid ' + pc + '40;font-weight:500;transition:border-color 0.2s;">' + t + '</a>';
      });
      // **bold**
      safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:600;">$1</strong>');
      // `inline code`
      safe = safe.replace(/`([^`]+)`/g, '<code style="background:' + (darkMode ? 'rgba(255,255,255,0.1)' : '#f3f4f6') +
        ';padding:1px 5px;border-radius:4px;font-size:0.9em;">$1</code>');
      return safe;
    }
  }

  // Initial render
  render();
})();
