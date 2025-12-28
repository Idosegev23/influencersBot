/**
 * GREEN-API WhatsApp Integration
 * 
 * Environment variables required:
 * - GREENAPI_INSTANCE_ID: Your GREEN-API instance ID
 * - GREENAPI_API_TOKEN: Your GREEN-API API token
 */

const GREENAPI_INSTANCE_ID = process.env.GREENAPI_INSTANCE_ID;
const GREENAPI_API_TOKEN = process.env.GREENAPI_API_TOKEN;
const GREENAPI_BASE_URL = 'https://api.green-api.com';

interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface WhatsAppMessage {
  phone: string; // Format: 972501234567 (no +)
  message: string;
}

/**
 * Format phone number for WhatsApp
 * Converts various formats to the required format (e.g., 972501234567)
 */
export function formatPhoneForWhatsApp(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // If starts with 0, assume Israeli number and replace with 972
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.slice(1);
  }
  
  // If doesn't start with country code, assume Israeli
  if (!cleaned.startsWith('972') && cleaned.length === 9) {
    cleaned = '972' + cleaned;
  }
  
  return cleaned;
}

/**
 * Send a WhatsApp message via GREEN-API
 */
export async function sendWhatsAppMessage({ phone, message }: WhatsAppMessage): Promise<SendMessageResult> {
  if (!GREENAPI_INSTANCE_ID || !GREENAPI_API_TOKEN) {
    console.error('GREEN-API credentials not configured');
    return { success: false, error: 'WhatsApp not configured' };
  }

  const formattedPhone = formatPhoneForWhatsApp(phone);
  const chatId = `${formattedPhone}@c.us`;

  try {
    const response = await fetch(
      `${GREENAPI_BASE_URL}/waInstance${GREENAPI_INSTANCE_ID}/sendMessage/${GREENAPI_API_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          message,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GREEN-API error:', errorText);
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    return { success: true, messageId: data.idMessage };
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Generate support request message for influencer
 */
export function generateSupportMessage(data: {
  influencerName: string;
  brandName: string;
  customerName: string;
  customerPhone: string;
  orderNumber?: string;
  problem: string;
}): string {
  const lines = [
    `🔔 *פניית תמיכה חדשה*`,
    ``,
    `👤 *שם הלקוח:* ${data.customerName}`,
    `📞 *טלפון:* ${data.customerPhone}`,
    `🏷️ *מותג:* ${data.brandName}`,
  ];

  if (data.orderNumber) {
    lines.push(`📦 *מספר הזמנה:* ${data.orderNumber}`);
  }

  lines.push(
    ``,
    `❓ *הבעיה:*`,
    data.problem,
    ``,
    `---`,
    `נשלח דרך הצ'אטבוט של ${data.influencerName}`
  );

  return lines.join('\n');
}

/**
 * Generate customer confirmation message
 */
export function generateCustomerConfirmation(data: {
  customerName: string;
  influencerName: string;
  brandName: string;
}): string {
  return `שלום ${data.customerName}! 👋

הפנייה שלך לתמיכה של ${data.brandName} התקבלה בהצלחה.
${data.influencerName} יחזור אליך בהקדם האפשרי.

תודה על הפנייה! 🙏`;
}

/**
 * Check if GREEN-API is configured
 */
export function isWhatsAppConfigured(): boolean {
  return !!(GREENAPI_INSTANCE_ID && GREENAPI_API_TOKEN);
}

/**
 * Send support request to influencer via WhatsApp
 */
export async function sendSupportToInfluencer(data: {
  influencerPhone: string;
  influencerName: string;
  brandName: string;
  customerName: string;
  customerPhone: string;
  orderNumber?: string;
  problem: string;
}): Promise<SendMessageResult> {
  const message = generateSupportMessage({
    influencerName: data.influencerName,
    brandName: data.brandName,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    orderNumber: data.orderNumber,
    problem: data.problem,
  });

  return sendWhatsAppMessage({
    phone: data.influencerPhone,
    message,
  });
}

/**
 * Send confirmation to customer via WhatsApp
 */
export async function sendConfirmationToCustomer(data: {
  customerPhone: string;
  customerName: string;
  influencerName: string;
  brandName: string;
}): Promise<SendMessageResult> {
  const message = generateCustomerConfirmation({
    customerName: data.customerName,
    influencerName: data.influencerName,
    brandName: data.brandName,
  });

  return sendWhatsAppMessage({
    phone: data.customerPhone,
    message,
  });
}

