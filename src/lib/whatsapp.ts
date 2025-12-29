/**
 * GREEN-API WhatsApp Integration
 * 
 * Uses GREEN-API to send WhatsApp messages
 * Docs: https://green-api.com/docs/api/
 */

interface SendMessageParams {
  phoneNumber: string;
  message: string;
}

interface SendMessageResult {
  success: boolean;
  idMessage?: string;
  error?: string;
}

interface SupportRequestParams {
  influencerName: string;
  influencerPhone: string;
  customerName: string;
  customerPhone?: string;
  message: string;
  couponCode?: string;
  productName?: string;
}

// Format phone number to international format
function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Handle Israeli numbers
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.slice(1);
  }
  
  // If no country code, assume Israel
  if (cleaned.length === 9) {
    cleaned = '972' + cleaned;
  }
  
  return cleaned;
}

/**
 * Send a WhatsApp message using GREEN-API
 */
export async function sendWhatsAppMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const instanceId = process.env.GREEN_API_INSTANCE_ID;
  const apiToken = process.env.GREEN_API_TOKEN;
  
  if (!instanceId || !apiToken) {
    console.error('GREEN-API credentials not configured');
    return { success: false, error: 'WhatsApp not configured' };
  }
  
  const phoneNumber = formatPhoneNumber(params.phoneNumber);
  
  try {
    const response = await fetch(
      `https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: `${phoneNumber}@c.us`,
          message: params.message,
        }),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('GREEN-API error:', errorText);
      return { success: false, error: 'Failed to send message' };
    }
    
    const data = await response.json();
    return { success: true, idMessage: data.idMessage };
  } catch (error) {
    console.error('WhatsApp send error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Send support request notification to brand
 */
export async function notifyBrandSupport(params: {
  brandName: string;
  brandPhone: string;
  influencerName: string;
  customerName: string;
  customerPhone: string;
  orderNumber?: string;
  problemDetails: string;
}): Promise<SendMessageResult> {
  const { brandName, brandPhone, influencerName, customerName, customerPhone, orderNumber, problemDetails } = params;
  
  let message = `🔔 *פנייה חדשה מהצ'אטבוט של ${influencerName}!*\n\n`;
  message += `🏷️ *מותג:* ${brandName}\n`;
  message += `👤 *שם לקוח:* ${customerName}\n`;
  message += `📱 *טלפון:* ${customerPhone}\n`;
  
  if (orderNumber && orderNumber !== 'אין') {
    message += `📦 *מספר הזמנה:* ${orderNumber}\n`;
  }
  
  message += `\n💬 *פרטי הבעיה:*\n${problemDetails}\n\n`;
  message += `---\n`;
  message += `_אנא צרו קשר עם הלקוח בהקדם_`;
  
  return sendWhatsAppMessage({
    phoneNumber: brandPhone,
    message,
  });
}

/**
 * Send support request notification to influencer (legacy)
 */
export async function notifyInfluencerSupport(params: SupportRequestParams): Promise<SendMessageResult> {
  const { influencerName, influencerPhone, customerName, customerPhone, message, couponCode, productName } = params;
  
  let whatsappMessage = `🔔 *פנייה חדשה!*\n\n`;
  whatsappMessage += `👤 *מאת:* ${customerName}\n`;
  
  if (customerPhone) {
    whatsappMessage += `📱 *טלפון:* ${customerPhone}\n`;
  }
  
  if (productName) {
    whatsappMessage += `🛍️ *מוצר:* ${productName}\n`;
  }
  
  if (couponCode) {
    whatsappMessage += `🎟️ *קופון:* ${couponCode}\n`;
  }
  
  whatsappMessage += `\n💬 *הודעה:*\n${message}\n\n`;
  whatsappMessage += `---\n`;
  whatsappMessage += `_הודעה נשלחה מהצ'אטבוט של ${influencerName}_`;
  
  return sendWhatsAppMessage({
    phoneNumber: influencerPhone,
    message: whatsappMessage,
  });
}

/**
 * Send coupon to customer via WhatsApp
 */
export async function sendCouponToCustomer(
  customerPhone: string,
  influencerName: string,
  couponCode: string,
  productName?: string,
  productLink?: string
): Promise<SendMessageResult> {
  let message = `🎉 *קופון הנחה מ-${influencerName}!*\n\n`;
  message += `🎟️ קוד הקופון שלך: *${couponCode}*\n\n`;
  
  if (productName) {
    message += `🛍️ מוצר: ${productName}\n`;
  }
  
  if (productLink) {
    message += `🔗 לרכישה: ${productLink}\n`;
  }
  
  message += `\n---\n`;
  message += `_תודה שבחרת ב-${influencerName}! 💜_`;
  
  return sendWhatsAppMessage({
    phoneNumber: customerPhone,
    message,
  });
}

/**
 * Send confirmation to customer after support request
 */
export async function sendSupportConfirmation(
  customerPhone: string,
  brandName: string
): Promise<SendMessageResult> {
  const message = `✅ *הפנייה שלך התקבלה!*\n\n` +
    `הפנייה שלך בנושא ${brandName} נשמרה בהצלחה.\n` +
    `נציג מהמותג יחזור אליך בהקדם.\n\n` +
    `תודה על הסבלנות! 🙏`;
  
  return sendWhatsAppMessage({
    phoneNumber: customerPhone,
    message,
  });
}

