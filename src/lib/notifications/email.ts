// Email notification channel using SendGrid or Resend

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailChannel {
  private apiKey: string;
  private fromEmail: string;
  private provider: 'sendgrid' | 'resend';

  constructor() {
    this.apiKey = process.env.EMAIL_API_KEY || '';
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@influencerbot.com';
    this.provider = (process.env.EMAIL_PROVIDER as 'sendgrid' | 'resend') || 'resend';
  }

  /**
   * Send email notification
   */
  async send(params: EmailParams): Promise<boolean> {
    if (!this.apiKey) {
      console.warn('Email API key not configured, skipping email send');
      return false;
    }

    try {
      if (this.provider === 'resend') {
        return await this.sendViaResend(params);
      } else {
        return await this.sendViaSendGrid(params);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  /**
   * Send via Resend
   */
  private async sendViaResend(params: EmailParams): Promise<boolean> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text || this.htmlToText(params.html),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend API error:', error);
      return false;
    }

    return true;
  }

  /**
   * Send via SendGrid
   */
  private async sendViaSendGrid(params: EmailParams): Promise<boolean> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: params.to }],
            subject: params.subject,
          },
        ],
        from: { email: this.fromEmail },
        content: [
          {
            type: 'text/html',
            value: params.html,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('SendGrid API error:', error);
      return false;
    }

    return true;
  }

  /**
   * Convert HTML to plain text (basic)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  /**
   * Build notification email HTML
   */
  buildNotificationEmail(title: string, message: string, actionUrl?: string, actionLabel?: string): string {
    return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px; text-align: right; background-color: #3b82f6; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                ${title}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px; text-align: right;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                ${message.replace(/\n/g, '<br>')}
              </p>

              ${actionUrl ? `
                <table cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                  <tr>
                    <td style="text-align: center;">
                      <a href="${actionUrl}" 
                         style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
                        ${actionLabel || 'צפה במערכת'}
                      </a>
                    </td>
                  </tr>
                </table>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; text-align: right; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                InfluencerBot - מערכת ניהול משפיענים
              </p>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 12px;">
                הודעה אוטומטית - אין צורך להשיב
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }
}

export default EmailChannel;
