/**
 * InfluencerBot Website Widget
 * Standalone embeddable chat widget — no dependencies
 *
 * Usage:
 * <script src="https://yourapp.com/widget.js" data-account-id="xxx"></script>
 */
(function () {
  'use strict';

  // ============================================
  // Configuration
  // ============================================

  const SCRIPT = document.currentScript;
  const ACCOUNT_ID = SCRIPT?.getAttribute('data-account-id');
  const BASE_URL = SCRIPT?.src ? new URL(SCRIPT.src).origin : '';

  if (!ACCOUNT_ID) {
    console.error('[InfluencerBot Widget] Missing data-account-id attribute');
    return;
  }

  // ============================================
  // State
  // ============================================

  let isOpen = false;
  let sessionId = localStorage.getItem('ibot_widget_' + ACCOUNT_ID) || null;
  let messages = [];
  let isLoading = false;
  let config = {
    primaryColor: '#6366f1',
    welcomeMessage: 'שלום! איך אפשר לעזור?',
    placeholder: 'שאלו משהו...',
    position: 'bottom-right',
  };

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
  container.style.cssText = 'position:fixed;z-index:2147483647;' +
    (config.position === 'bottom-left' ? 'bottom:24px;left:24px;' : 'bottom:24px;right:24px;') +
    'font-family:system-ui,-apple-system,sans-serif;direction:rtl;';
  document.body.appendChild(container);

  // ============================================
  // Render
  // ============================================

  function render() {
    var pc = config.primaryColor;

    if (!isOpen) {
      container.innerHTML =
        '<button id="ibot-toggle" style="' +
        'width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;' +
        'background:' + pc + ';color:#fff;' +
        'box-shadow:0 4px 20px rgba(0,0,0,0.3);' +
        'display:flex;align-items:center;justify-content:center;' +
        'transition:transform 0.2s,box-shadow 0.2s;' +
        '">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
        '</svg>' +
        '</button>';

      document.getElementById('ibot-toggle').onclick = function () {
        isOpen = true;
        render();
      };
      document.getElementById('ibot-toggle').onmouseover = function () {
        this.style.transform = 'scale(1.1)';
      };
      document.getElementById('ibot-toggle').onmouseout = function () {
        this.style.transform = 'scale(1)';
      };
      return;
    }

    // Chat panel
    var msgsHtml = messages.map(function (m) {
      var isUser = m.role === 'user';
      return '<div style="display:flex;justify-content:' + (isUser ? 'flex-start' : 'flex-end') + ';margin-bottom:8px;">' +
        '<div style="max-width:80%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.5;' +
        'background:' + (isUser ? pc + '15' : '#f3f4f6') + ';' +
        'color:#1f2937;word-break:break-word;">' +
        escapeHtml(m.content || (isLoading ? '...' : '')) +
        '</div></div>';
    }).join('');

    var isMobile = window.innerWidth < 640;
    var panelStyle = isMobile
      ? 'position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border-radius:0;'
      : 'width:340px;height:440px;border-radius:16px;';

    container.innerHTML =
      '<div id="ibot-panel" style="' + panelStyle +
      'background:#fff;box-shadow:0 8px 40px rgba(0,0,0,0.2);display:flex;flex-direction:column;overflow:hidden;">' +
      // Header
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:' + pc + ';color:#fff;">' +
      '<span style="font-weight:600;font-size:14px;">צ\'אט</span>' +
      '<button id="ibot-close" style="background:none;border:none;color:rgba(255,255,255,0.8);cursor:pointer;font-size:20px;padding:0;line-height:1;">&times;</button>' +
      '</div>' +
      // Messages
      '<div id="ibot-messages" style="flex:1;overflow-y:auto;padding:12px;direction:rtl;">' +
      msgsHtml +
      '</div>' +
      // Input
      '<div style="display:flex;align-items:center;gap:8px;padding:12px;border-top:1px solid #e5e7eb;">' +
      '<input id="ibot-input" type="text" placeholder="' + escapeHtml(config.placeholder) + '" ' +
      'style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;outline:none;direction:rtl;' +
      'font-family:inherit;" />' +
      '<button id="ibot-send" style="padding:8px 16px;background:' + pc + ';color:#fff;border:none;border-radius:8px;' +
      'font-size:14px;cursor:pointer;font-family:inherit;' + (isLoading ? 'opacity:0.5;' : '') + '">שלח</button>' +
      '</div>' +
      // Powered by
      '<div style="text-align:center;padding:4px;font-size:10px;color:#9ca3af;">Powered by InfluencerBot</div>' +
      '</div>';

    // Scroll to bottom
    var msgsEl = document.getElementById('ibot-messages');
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

    // Event listeners
    document.getElementById('ibot-close').onclick = function () {
      isOpen = false;
      render();
    };

    var inputEl = document.getElementById('ibot-input');
    var sendEl = document.getElementById('ibot-send');

    sendEl.onclick = sendMessage;
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
                  messages[messages.length - 1].content = fullText;
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

  // Initial render
  render();
})();
