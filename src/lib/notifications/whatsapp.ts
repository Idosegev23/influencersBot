// WhatsApp notification channel using GreenAPI

interface WhatsAppParams {
  phoneNumber: string;
  message: string;
}

// Helper function for backwards compatibility
export async function sendWhatsAppMessage(params: WhatsAppParams): Promise<boolean> {
  const channel = new WhatsAppChannel();
  return await channel.send(params);
}

export class WhatsAppChannel {
  private instanceId: string;
  private token: string;
  private baseUrl: string;

  constructor() {
    this.instanceId = process.env.GREEN_API_INSTANCE_ID || '';
    this.token = process.env.GREEN_API_TOKEN || '';
    this.baseUrl = `https://api.green-api.com/waInstance${this.instanceId}`;
  }

  /**
   * Send WhatsApp notification
   */
  async send(params: WhatsAppParams): Promise<boolean> {
    if (!this.instanceId || !this.token) {
      console.warn('GreenAPI credentials not configured, skipping WhatsApp send');
      return false;
    }

    try {
      // Clean phone number (remove non-digits)
      const cleanPhone = params.phoneNumber.replace(/\D/g, '');

      // Add country code if not present (assume Israel +972)
      const phoneWithCountry = cleanPhone.startsWith('972')
        ? cleanPhone
        : cleanPhone.startsWith('0')
        ? '972' + cleanPhone.slice(1)
        : '972' + cleanPhone;

      const response = await fetch(
        `${this.baseUrl}/sendMessage/${this.token}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId: `${phoneWithCountry}@c.us`,
            message: params.message,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('GreenAPI error:', error);
        return false;
      }

      const result = await response.json();
      console.log('WhatsApp sent successfully:', result);
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp:', error);
      return false;
    }
  }

  /**
   * Format notification for WhatsApp
   */
  formatNotification(title: string, message: string, actionUrl?: string): string {
    let text = `🔔 *${title}*\n\n${message}`;

    if (actionUrl) {
      text += `\n\n👉 צפה במערכת: ${actionUrl}`;
    }

    return text;
  }

  /**
   * Check if phone number is valid WhatsApp number
   */
  async isValidWhatsAppNumber(phoneNumber: string): Promise<boolean> {
    if (!this.instanceId || !this.token) {
      return false;
    }

    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const phoneWithCountry = cleanPhone.startsWith('972')
        ? cleanPhone
        : '972' + cleanPhone.slice(1);

      const response = await fetch(
        `${this.baseUrl}/checkWhatsapp/${this.token}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phoneNumber: phoneWithCountry,
          }),
        }
      );

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.existsWhatsapp === true;
    } catch (error) {
      console.error('Error checking WhatsApp number:', error);
      return false;
    }
  }
}

export default WhatsAppChannel;
