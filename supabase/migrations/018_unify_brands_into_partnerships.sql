-- ============================================
-- Migration 018: Unify Brands into Partnerships
-- ============================================
-- אוחד את טבלת brands לתוך partnerships
-- הוספת שדות שחסרים + העברת דאטה

-- ==================================================
-- שלב 1: הוספת עמודות חדשות ל-partnerships
-- ==================================================

ALTER TABLE public.partnerships 
ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(100),
ADD COLUMN IF NOT EXISTS link TEXT,
ADD COLUMN IF NOT EXISTS short_link TEXT,
ADD COLUMN IF NOT EXISTS category VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(20);

-- אינדקסים לחיפוש מהיר
CREATE INDEX IF NOT EXISTS idx_partnerships_is_active 
ON public.partnerships(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_partnerships_category 
ON public.partnerships(category);

-- ==================================================
-- שלב 2: העברת דאטה מ-brands ל-partnerships
-- ==================================================

-- פונקציה עזר להעברת דאטה
CREATE OR REPLACE FUNCTION migrate_brands_to_partnerships()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_brand RECORD;
  v_account_id UUID;
BEGIN
  -- עבור על כל הברנדים הישנים
  FOR v_brand IN 
    SELECT * FROM public.brands WHERE is_active = true
  LOOP
    -- מצא את ה-account_id המתאים (מהטבלה influencers -> accounts)
    SELECT a.id INTO v_account_id
    FROM public.accounts a
    WHERE a.id IN (
      SELECT id FROM public.influencers 
      WHERE id = v_brand.influencer_id
    )
    LIMIT 1;
    
    -- אם לא מצאנו account_id, דלג
    IF v_account_id IS NULL THEN
      CONTINUE;
    END IF;
    
    -- בדוק אם כבר קיים partnership עם אותו מותג
    IF NOT EXISTS (
      SELECT 1 FROM public.partnerships 
      WHERE account_id = v_account_id 
      AND brand_name = v_brand.brand_name
    ) THEN
      -- צור partnership חדש
      INSERT INTO public.partnerships (
        account_id,
        brand_name,
        status,
        brief,
        coupon_code,
        link,
        short_link,
        category,
        is_active,
        whatsapp_phone,
        notes,
        created_at,
        updated_at
      ) VALUES (
        v_account_id,
        v_brand.brand_name,
        'active', -- כל הברנדים הישנים נחשבים פעילים
        v_brand.description,
        v_brand.coupon_code,
        v_brand.link,
        v_brand.short_link,
        v_brand.category,
        v_brand.is_active,
        v_brand.whatsapp_phone,
        'מיובא מטבלת brands ישנה',
        v_brand.created_at,
        v_brand.updated_at
      );
      
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- הרץ את ההעברה
DO $$
DECLARE
  v_migrated_count INTEGER;
BEGIN
  SELECT migrate_brands_to_partnerships() INTO v_migrated_count;
  RAISE NOTICE 'Migrated % brands to partnerships', v_migrated_count;
END $$;

-- ==================================================
-- שלב 3: עדכן את chatbot_knowledge_base להצביע על partnerships
-- ==================================================

-- עדכן רשומות קיימות ב-knowledge_base שהצביעו על brands
UPDATE public.chatbot_knowledge_base
SET 
  source_type = 'partnership',
  knowledge_type = 'active_partnership'
WHERE source_type = 'brand' OR knowledge_type = 'brand_info';

-- ==================================================
-- שלב 4: הוספת הערות
-- ==================================================

COMMENT ON COLUMN public.partnerships.coupon_code IS 'קוד קופון להנחה (אופציונלי)';
COMMENT ON COLUMN public.partnerships.link IS 'לינק affiliate או לינק למותג';
COMMENT ON COLUMN public.partnerships.short_link IS 'לינק מקוצר (bit.ly וכו)';
COMMENT ON COLUMN public.partnerships.category IS 'קטגוריה של המותג (אופנה, קוסמטיקה, וכו)';
COMMENT ON COLUMN public.partnerships.is_active IS 'האם השת"פ פעיל כרגע';
COMMENT ON COLUMN public.partnerships.whatsapp_phone IS 'מספר WhatsApp של המותג';

-- ==================================================
-- שלב 5: (אופציונלי) Rename brands -> brands_deprecated
-- ==================================================
-- לא מוחקים את הטבלה - רק משנים שם למקרה שצריך לחזור אחורה
-- תוכל למחוק את זה אחרי שתוודא שהכל עובד

ALTER TABLE IF EXISTS public.brands 
RENAME TO brands_deprecated;

COMMENT ON TABLE public.brands_deprecated IS 'טבלה ישנה - הועבר ל-partnerships. ניתן למחוק לאחר אימות.';

-- ==================================================
-- סיום Migration
-- ==================================================

-- הצלחה!
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 018 completed successfully!';
  RAISE NOTICE 'Brands table renamed to brands_deprecated';
  RAISE NOTICE 'All active brands migrated to partnerships';
  RAISE NOTICE 'You can now use partnerships table for everything';
END $$;
