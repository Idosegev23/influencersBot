import { getInfluencerByUsername, getBrandsByInfluencer, supabase } from '@/lib/supabase';
import { notifyBrandSupport, sendSupportConfirmation } from '@/lib/whatsapp';
import { getGeminiClient, MODELS } from '@/lib/ai/google-client';

// Types
export interface SupportData {
  brand?: string;
  brandId?: string;
  brandPhone?: string;
  customerName?: string;
  orderNumber?: string;
  problemDetails?: string;
  customerPhone?: string;
}

export interface SupportState {
  step: 'detect' | 'brand' | 'name' | 'order' | 'problem' | 'phone' | 'complete';
  data: SupportData;
}

export interface BrandInfo {
  brand_name: string;
  description: string | null;
  coupon_code: string | null;
  category: string | null;
}

export interface SupportFlowResult {
  response: string | null;
  supportState: SupportState | null;
  action: string;
  brands?: BrandInfo[];
  inputType?: string;
  supportRequestId?: string;
  whatsappSent?: boolean;
  customerNotified?: boolean;
}

// Save support request to database
async function saveSupportRequest(
  influencerId: string,
  data: SupportData
): Promise<string | null> {
  try {
    const { data: result, error } = await supabase
      .from('support_requests')
      .insert({
        influencer_id: influencerId,
        brand: data.brand || '',
        customer_name: data.customerName || '',
        order_number: data.orderNumber || '',
        problem: data.problemDetails || '',
        phone: data.customerPhone || '',
        status: 'open',
        whatsapp_sent: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving support request:', error);
      return null;
    }

    return result.id;
  } catch (error) {
    console.error('Error saving support request:', error);
    return null;
  }
}

// Intent detection using Gemini
export async function detectSupportIntent(message: string): Promise<{ intent: 'support' | 'general'; confidence: number }> {
  try {
    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model: MODELS.CHAT_LITE,
      contents: message,
      config: {
        systemInstruction: `אתה מזהה כוונות. בדוק אם ההודעה מתארת בעיה עם:
- קופון שלא עובד
- הזמנה (בעיה, עיכוב, טעות)
- משלוח (לא הגיע, איחור, נזק)
- החזר כספי
- תלונה על מוצר
- שירות לקוחות

החזר JSON בלבד: {"intent": "support" | "general", "confidence": 0.0-1.0}`,
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const result = JSON.parse(response.text || '{}');
    return {
      intent: result.intent || 'general',
      confidence: result.confidence || 0
    };
  } catch (error) {
    console.error('Intent detection error:', error);
    return { intent: 'general', confidence: 0 };
  }
}

// Generate empathetic response for support
function generateSupportResponse(
  step: string,
  data: SupportData,
  influencerName: string
): string {
  const prompts: Record<string, string> = {
    brand: `אוי איזה באסה! 😔 מצטערת לשמוע.
בואי נטפל בזה - על איזה מותג מדובר?`,
    
    name: `הבנתי, ${data.brand}. מה השם שלך?`,
    
    order: `תודה ${data.customerName}! מה מספר ההזמנה?
(אם אין - כתבי "אין")`,
    
    problem: `אוקי${data.orderNumber && data.orderNumber !== 'אין' ? `, הזמנה ${data.orderNumber}` : ''}. 
מה הבעיה בדיוק?`,
    
    phone: `הבנתי. מה הטלפון שלך לחזרה?`,
    
    complete: `תודה! 🙏 הפנייה נשמרה ונשלחה.
מישהו מהצוות יחזור אלייך בהקדם! 💜`
  };

  return prompts[step] || 'איך אפשר לעזור?';
}

// Validate phone number (Israeli format)
function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[-\s]/g, '');
  return /^0[5][0-9]{8}$/.test(cleaned) || /^972[5][0-9]{8}$/.test(cleaned);
}

/**
 * Process support flow logic
 */
export async function processSupportFlow(
  message: string,
  username: string,
  supportState?: SupportState | null
): Promise<SupportFlowResult> {
  // Get influencer
  const influencer = await getInfluencerByUsername(username);
  if (!influencer) {
    throw new Error('Influencer not found');
  }

  // Get brands for this influencer
  const brands = await getBrandsByInfluencer(influencer.id);
  const brandInfos: BrandInfo[] = brands.map(b => ({
    brand_name: b.brand_name,
    description: b.description,
    coupon_code: b.coupon_code,
    category: b.category,
  }));
  
  let state: SupportState = supportState || { step: 'detect', data: {} };
  
  // Step 1: Detect intent if starting fresh
  if (state.step === 'detect') {
    // If we're calling this function, we likely already detected intent via routing
    // But we double check if it's a fresh start
    
    // Start support flow
    state.step = 'brand';
    const response = generateSupportResponse('brand', state.data, influencer.display_name);
    
    return {
      response,
      supportState: state,
      action: 'show_brands',
      brands: brandInfos,
    };
  }
  
  // Step 2: Brand selected
  if (state.step === 'brand') {
    // Find matching brand
    const brand = brands.find(b => 
      b.brand_name.toLowerCase() === message.toLowerCase() ||
      message.includes(b.brand_name)
    );
    
    if (brand) {
      state.data.brand = brand.brand_name;
      state.data.brandId = brand.id;
      state.data.brandPhone = brand.whatsapp_phone || '0547667775'; // Default phone
      state.step = 'name';
      const response = generateSupportResponse('name', state.data, influencer.display_name);
      
      return {
        response,
        supportState: state,
        action: 'collect_input',
        inputType: 'name'
      };
    } else {
      // Brand not found, ask again
      return {
        response: 'לא מצאתי את המותג הזה. בבקשה בחרי מהרשימה:',
        supportState: state,
        action: 'show_brands',
        brands: brandInfos,
      };
    }
  }
  
  // Step 3: Name collected
  if (state.step === 'name') {
    state.data.customerName = message.trim();
    state.step = 'order';
    const response = generateSupportResponse('order', state.data, influencer.display_name);
    
    return {
      response,
      supportState: state,
      action: 'collect_input',
      inputType: 'order'
    };
  }
  
  // Step 4: Order number collected
  if (state.step === 'order') {
    state.data.orderNumber = message.trim();
    state.step = 'problem';
    const response = generateSupportResponse('problem', state.data, influencer.display_name);
    
    return {
      response,
      supportState: state,
      action: 'collect_input',
      inputType: 'problem'
    };
  }
  
  // Step 5: Problem details collected
  if (state.step === 'problem') {
    state.data.problemDetails = message.trim();
    state.step = 'phone';
    const response = generateSupportResponse('phone', state.data, influencer.display_name);
    
    return {
      response,
      supportState: state,
      action: 'collect_input',
      inputType: 'phone'
    };
  }
  
  // Step 6: Phone collected - complete!
  if (state.step === 'phone') {
    if (!isValidPhone(message)) {
      return {
        response: 'המספר לא נראה תקין. בבקשה הכניסי מספר נייד ישראלי (למשל: 0541234567)',
        supportState: state,
        action: 'collect_input',
        inputType: 'phone'
      };
    }
    
    state.data.customerPhone = message.replace(/[-\s]/g, '');
    state.step = 'complete';
    const response = generateSupportResponse('complete', state.data, influencer.display_name);
    
    // Save support request to database
    const supportRequestId = await saveSupportRequest(influencer.id, state.data);
    
    // Send WhatsApp to BRAND (not influencer)
    let brandWhatsappSent = false;
    const brandPhone = state.data.brandPhone || '0547667775';
    
    const brandResult = await notifyBrandSupport({
      brandName: state.data.brand || '',
      brandPhone: brandPhone,
      influencerName: influencer.display_name,
      customerName: state.data.customerName || '',
      customerPhone: state.data.customerPhone || '',
      orderNumber: state.data.orderNumber,
      problemDetails: state.data.problemDetails || '',
    });
    brandWhatsappSent = brandResult.success;
    
    // Send confirmation to CUSTOMER
    let customerWhatsappSent = false;
    if (state.data.customerPhone) {
      const customerResult = await sendSupportConfirmation(
        state.data.customerPhone,
        state.data.brand || ''
      );
      customerWhatsappSent = customerResult.success;
    }
    
    // Update whatsapp_sent status
    if (supportRequestId && (brandWhatsappSent || customerWhatsappSent)) {
      await supabase
        .from('support_requests')
        .update({ whatsapp_sent: true })
        .eq('id', supportRequestId);
    }
    
    return {
      response,
      supportState: state,
      action: 'complete',
      supportRequestId: supportRequestId || undefined,
      whatsappSent: brandWhatsappSent,
      customerNotified: customerWhatsappSent,
    };
  }
  
  return {
    response: 'משהו השתבש. בואי נתחיל מחדש.',
    supportState: { step: 'detect', data: {} },
    action: 'reset'
  };
}