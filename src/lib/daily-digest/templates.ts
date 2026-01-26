import { DailyDigestData } from './generator';

/**
 * Generate email HTML for daily digest
 */
export function generateEmailHTML(data: DailyDigestData): string {
  const { user, summary, yesterday, today, alerts, metrics } = data;

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>סיכום יומי - ${summary.date}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .section { padding: 20px; border-bottom: 1px solid #eee; }
    .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #667eea; }
    .metric { display: inline-block; margin: 10px 15px; text-align: center; }
    .metric-value { font-size: 32px; font-weight: bold; color: #667eea; }
    .metric-label { font-size: 12px; color: #666; }
    .task { padding: 12px; margin: 8px 0; background: #f9f9f9; border-right: 4px solid #667eea; }
    .alert { padding: 12px; margin: 8px 0; background: #fff3cd; border-right: 4px solid #ffc107; }
    .alert-urgent { background: #f8d7da; border-right-color: #dc3545; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #999; }
    .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>🌅 בוקר טוב, ${user.name}!</h1>
      <p>${summary.dayOfWeek}, ${summary.date}</p>
    </div>

    <!-- Yesterday Summary -->
    <div class="section">
      <div class="section-title">📊 מה קרה אתמול</div>
      <div style="display: flex; justify-content: space-around; flex-wrap: wrap;">
        <div class="metric">
          <div class="metric-value">${yesterday.tasksCompleted}</div>
          <div class="metric-label">משימות הושלמו</div>
        </div>
        <div class="metric">
          <div class="metric-value">${yesterday.newPartnerships}</div>
          <div class="metric-label">שת"פים חדשים</div>
        </div>
        <div class="metric">
          <div class="metric-value">${yesterday.messagesReceived}</div>
          <div class="metric-label">הודעות התקבלו</div>
        </div>
        <div class="metric">
          <div class="metric-value">${yesterday.couponUsages}</div>
          <div class="metric-label">שימושי קופון</div>
        </div>
      </div>
    </div>

    <!-- Today's Tasks -->
    ${today.tasks.length > 0 ? `
    <div class="section">
      <div class="section-title">✅ משימות להיום (${today.tasks.length})</div>
      ${today.tasks.map(task => `
        <div class="task">
          <strong>${task.title}</strong>
          ${task.partnership_name ? `<br><small>🤝 ${task.partnership_name}</small>` : ''}
          <br><small>⏰ ${new Date(task.due_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</small>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Alerts -->
    ${alerts.overdue.length > 0 ? `
    <div class="section">
      <div class="section-title">⚠️ דברים שדורשים תשומת לב (${alerts.overdue.length})</div>
      ${alerts.overdue.slice(0, 5).map(alert => `
        <div class="${alert.days_overdue > 7 ? 'alert-urgent' : 'alert'}">
          <strong>${alert.type === 'task' ? '📋' : alert.type === 'payment' ? '💰' : '💬'} ${alert.title}</strong>
          <br><small>באיחור של ${alert.days_overdue} ימים</small>
        </div>
      `).join('')}
      ${alerts.overdue.length > 5 ? `<p style="text-align:center;">ועוד ${alerts.overdue.length - 5}...</p>` : ''}
    </div>
    ` : ''}

    <!-- Upcoming Deadlines -->
    ${today.deadlines.length > 0 ? `
    <div class="section">
      <div class="section-title">📅 תאריכי יעד בקרוב</div>
      ${today.deadlines.slice(0, 5).map(deadline => `
        <div class="task">
          <strong>${deadline.title}</strong>
          <br><small>${new Date(deadline.due_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}</small>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Metrics -->
    <div class="section">
      <div class="section-title">📈 מדדים חשובים</div>
      <div style="display: flex; justify-content: space-around; flex-wrap: wrap;">
        <div class="metric">
          <div class="metric-value">${metrics.activePartnerships}</div>
          <div class="metric-label">שת"פים פעילים</div>
        </div>
        <div class="metric">
          <div class="metric-value">${metrics.pendingPayments}</div>
          <div class="metric-label">תשלומים ממתינים</div>
        </div>
        <div class="metric">
          <div class="metric-value">${metrics.unreadCommunications}</div>
          <div class="metric-label">הודעות שלא נקראו</div>
        </div>
      </div>
      <div style="margin-top: 20px; padding: 15px; background: #f0f7ff; border-radius: 8px;">
        <strong>📊 ביצועי קופונים (7 ימים אחרונים):</strong><br>
        <span style="color: #667eea; font-size: 18px;">${metrics.couponPerformance.copied}</span> הועתקו,
        <span style="color: #667eea; font-size: 18px;">${metrics.couponPerformance.used}</span> נוצלו,
        <span style="color: #667eea; font-size: 18px;">₪${metrics.couponPerformance.revenue.toLocaleString()}</span> הכנסות
      </div>
    </div>

    <!-- CTA -->
    <div class="section" style="text-align: center;">
      <a href="https://influencer-os.com/dashboard" class="button">לדשבורד המלא →</a>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>מערכת Influencer OS | סיכום יומי אוטומטי</p>
      <p><a href="#">הגדרות</a> | <a href="#">ביטול מנוי</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate WhatsApp message for daily digest
 */
export function generateWhatsAppMessage(data: DailyDigestData): string {
  const { user, summary, yesterday, today, alerts, metrics } = data;

  let message = `🌅 *בוקר טוב, ${user.name}!*\n`;
  message += `${summary.dayOfWeek}, ${summary.date}\n\n`;

  // Yesterday summary
  message += `📊 *מה קרה אתמול:*\n`;
  message += `✅ ${yesterday.tasksCompleted} משימות הושלמו\n`;
  message += `🤝 ${yesterday.newPartnerships} שת"פים חדשים\n`;
  message += `💬 ${yesterday.messagesReceived} הודעות התקבלו\n`;
  message += `🎫 ${yesterday.couponUsages} שימושי קופון\n\n`;

  // Today's tasks
  if (today.tasks.length > 0) {
    message += `✅ *משימות להיום (${today.tasks.length}):*\n`;
    today.tasks.slice(0, 3).forEach(task => {
      const time = new Date(task.due_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      message += `• ${task.title} (${time})\n`;
    });
    if (today.tasks.length > 3) {
      message += `ועוד ${today.tasks.length - 3}...\n`;
    }
    message += '\n';
  }

  // Alerts
  if (alerts.overdue.length > 0) {
    message += `⚠️ *דברים שדורשים תשומת לב (${alerts.overdue.length}):*\n`;
    alerts.overdue.slice(0, 3).forEach(alert => {
      const icon = alert.type === 'task' ? '📋' : alert.type === 'payment' ? '💰' : '💬';
      message += `${icon} ${alert.title} (${alert.days_overdue} ימים)\n`;
    });
    if (alerts.overdue.length > 3) {
      message += `ועוד ${alerts.overdue.length - 3}...\n`;
    }
    message += '\n';
  }

  // Metrics
  message += `📈 *מצב כללי:*\n`;
  message += `🤝 ${metrics.activePartnerships} שת"פים פעילים\n`;
  message += `💰 ${metrics.pendingPayments} תשלומים ממתינים\n`;
  message += `💬 ${metrics.unreadCommunications} הודעות שלא נקראו\n\n`;

  // Coupon performance
  if (metrics.couponPerformance.used > 0) {
    message += `🎫 *קופונים (7 ימים):*\n`;
    message += `${metrics.couponPerformance.copied} הועתקו, `;
    message += `${metrics.couponPerformance.used} נוצלו, `;
    message += `₪${metrics.couponPerformance.revenue.toLocaleString()} הכנסות\n\n`;
  }

  message += `🔗 לדשבורד המלא: https://influencer-os.com/dashboard`;

  return message;
}

/**
 * Generate plain text email for daily digest
 */
export function generateEmailText(data: DailyDigestData): string {
  const { user, summary, yesterday, today, alerts, metrics } = data;

  let text = `בוקר טוב, ${user.name}!\n`;
  text += `${summary.dayOfWeek}, ${summary.date}\n\n`;

  text += `=== מה קרה אתמול ===\n`;
  text += `משימות הושלמו: ${yesterday.tasksCompleted}\n`;
  text += `שת"פים חדשים: ${yesterday.newPartnerships}\n`;
  text += `הודעות התקבלו: ${yesterday.messagesReceived}\n`;
  text += `שימושי קופון: ${yesterday.couponUsages}\n\n`;

  if (today.tasks.length > 0) {
    text += `=== משימות להיום (${today.tasks.length}) ===\n`;
    today.tasks.forEach(task => {
      const time = new Date(task.due_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      text += `• ${task.title} (${time})\n`;
    });
    text += '\n';
  }

  if (alerts.overdue.length > 0) {
    text += `=== דברים שדורשים תשומת לב (${alerts.overdue.length}) ===\n`;
    alerts.overdue.forEach(alert => {
      text += `• ${alert.title} (באיחור של ${alert.days_overdue} ימים)\n`;
    });
    text += '\n';
  }

  text += `=== מצב כללי ===\n`;
  text += `שת"פים פעילים: ${metrics.activePartnerships}\n`;
  text += `תשלומים ממתינים: ${metrics.pendingPayments}\n`;
  text += `הודעות שלא נקראו: ${metrics.unreadCommunications}\n\n`;

  text += `קופונים (7 ימים): ${metrics.couponPerformance.copied} הועתקו, `;
  text += `${metrics.couponPerformance.used} נוצלו, ₪${metrics.couponPerformance.revenue.toLocaleString()} הכנסות\n\n`;

  text += `לדשבורד המלא: https://influencer-os.com/dashboard\n\n`;
  text += `---\n`;
  text += `מערכת Influencer OS | סיכום יומי אוטומטי`;

  return text;
}
