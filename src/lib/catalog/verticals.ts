/**
 * Catalog vertical registry — one taxonomy + extraction ruleset per market.
 *
 * A scanned account's *archetype* says who it is (brand / influencer / ministry). Its
 * *vertical* says what it sells, and that is what the product catalog needs: a fashion
 * retailer and a supplement shop want completely different category enums, different
 * subcategory vocabularies, and different attributes worth extracting (material and size
 * vs. dosage and active ingredient).
 *
 * Before this registry the extractor hardcoded a single cosmetics enum, so every
 * non-cosmetics account collapsed into `other`. One entry here now drives all three
 * consumers: the Gemini extraction prompt, the catalog filter chips, and the admin
 * add-account form.
 *
 * This module is PURE DATA — no server imports — so client components can read it too.
 *
 * Adding a market = adding one entry to VERTICALS. Nothing else needs to change.
 */

export const VERTICAL_IDS = [
  'fashion',
  'beauty',
  'food',
  'home',
  'sports',
  'jewelry',
  'electronics',
  'health',
  'baby_kids',
  'pets',
  'saas',
  'services',
  'general',
] as const;

export type VerticalId = (typeof VERTICAL_IDS)[number];

export interface CategoryLabel {
  he: string;
  en: string;
}

export interface CatalogVertical {
  id: VerticalId;
  label: CategoryLabel;
  /** Main category enum the extractor must choose from, in display order. */
  categories: Record<string, CategoryLabel>;
  /** Suggested subcategory vocabulary — guidance for the model, not enforced. */
  subcategories: string[];
  /** Vertical-specific guidance appended to the extraction prompt. */
  extractionRules: string;
  /**
   * Which optional product attributes are worth extracting here. Drives both the prompt
   * and which filter affordances the catalog UI offers.
   */
  attributes: {
    volume: boolean; // ml / g — cosmetics, food, supplements
    ingredients: boolean; // INCI / nutrition / actives
    material: boolean; // fabric, metal, wood
    sizes: boolean; // apparel & footwear sizing
  };
}

const OTHER: CategoryLabel = { he: 'אחר', en: 'Other' };

export const VERTICALS: CatalogVertical[] = [
  {
    id: 'fashion',
    label: { he: 'אופנה והלבשה', en: 'Fashion & Apparel' },
    categories: {
      women: { he: 'נשים', en: 'Women' },
      men: { he: 'גברים', en: 'Men' },
      kids: { he: 'ילדים', en: 'Kids' },
      baby: { he: 'תינוקות', en: 'Baby' },
      shoes: { he: 'הנעלה', en: 'Shoes' },
      bags: { he: 'תיקים', en: 'Bags' },
      accessories: { he: 'אקססוריז', en: 'Accessories' },
      jewelry: { he: 'תכשיטים', en: 'Jewelry' },
      sportswear: { he: 'ספורט', en: 'Sportswear' },
      swimwear: { he: 'בגדי ים', en: 'Swimwear' },
      home: { he: 'בית ואורח חיים', en: 'Home & Lifestyle' },
      beauty: { he: 'יופי וטיפוח', en: 'Beauty' },
      sale: { he: 'מבצעים', en: 'Sale' },
      other: OTHER,
    },
    subcategories: [
      'shirts', 'tshirts', 'tank_tops', 'dress_shirts', 'blouses', 'dresses', 'skirts',
      'pants', 'jeans', 'shorts', 'jackets', 'coats', 'knitwear', 'hoodies', 'suits',
      'activewear', 'swimwear', 'underwear', 'socks', 'sleepwear',
      'sneakers', 'boots', 'sandals', 'heels', 'flats',
      'handbags', 'backpacks', 'wallets', 'belts', 'hats', 'scarves', 'sunglasses', 'watches',
    ],
    extractionRules: `זהו אתר אופנה. שים לב:
- category נגזר מהקהל שהפריט מיועד לו (נשים / גברים / ילדים / תינוקות), לא מסוג הבד.
- אם הפריט הוא נעליים, תיק או תכשיט — העדף את הקטגוריה הייעודית על פני קהל היעד.
- keyIngredients = החומרים שמהם עשוי הפריט (["כותנה", "פוליאסטר"]).
- benefits = מאפיינים בולטים (["גזרה צמודה", "בד נושם", "מתאים לערב"]).
- volume / volumeMl אינם רלוונטיים — החזר null.`,
    attributes: { volume: false, ingredients: false, material: true, sizes: true },
  },
  {
    id: 'beauty',
    label: { he: 'קוסמטיקה וטיפוח', en: 'Beauty & Personal Care' },
    categories: {
      hair_care: { he: 'טיפוח שיער', en: 'Hair Care' },
      face_care: { he: 'טיפוח פנים', en: 'Face Care' },
      body_care: { he: 'טיפוח גוף', en: 'Body Care' },
      lip_care: { he: 'טיפוח שפתיים', en: 'Lip Care' },
      nails: { he: 'ציפורניים', en: 'Nails' },
      makeup: { he: 'איפור', en: 'Makeup' },
      fragrance: { he: 'בשמים', en: 'Fragrance' },
      skincare: { he: 'טיפוח עור', en: 'Skincare' },
      men: { he: 'טיפוח לגבר', en: "Men's Grooming" },
      sun_care: { he: 'הגנה מהשמש', en: 'Sun Care' },
      tools: { he: 'אביזרים וכלים', en: 'Tools' },
      sets: { he: 'מארזים', en: 'Sets' },
      other: OTHER,
    },
    subcategories: [
      'shampoo', 'conditioner', 'mask', 'serum', 'oil', 'cream', 'lotion', 'gel', 'wax',
      'clay', 'spray', 'foam', 'cleanser', 'toner', 'peeling', 'sunscreen', 'deodorant',
      'lipstick', 'lip_oil', 'mascara', 'foundation', 'blush', 'eyeshadow', 'nail_polish',
      'perfume', 'brush', 'towel', 'kit',
    ],
    extractionRules: `זהו אתר קוסמטיקה וטיפוח. שים לב:
- חלץ נפח (מ"ל / גרם) והמר ל-volumeMl כמספר.
- ingredients = רשימת ה-INCI המלאה אם מופיעה.
- keyIngredients = הרכיבים הפעילים בעברית (["חומצה היאלורונית", "רטינול"]).
- benefits = מה המוצר פותר (["יובש", "קמטים", "אקנה"]).
- targetAudience = סוג עור / שיער (["עור רגיש", "שיער צבוע"]).`,
    attributes: { volume: true, ingredients: true, material: false, sizes: false },
  },
  {
    id: 'food',
    label: { he: 'מזון ומשקאות', en: 'Food & Beverage' },
    categories: {
      fresh: { he: 'טרי', en: 'Fresh' },
      pantry: { he: 'מזווה', en: 'Pantry' },
      spices: { he: 'תבלינים', en: 'Spices' },
      beverages: { he: 'משקאות', en: 'Beverages' },
      alcohol: { he: 'אלכוהול', en: 'Alcohol' },
      snacks: { he: 'חטיפים', en: 'Snacks' },
      dairy: { he: 'חלב וביצים', en: 'Dairy & Eggs' },
      meat_fish: { he: 'בשר ודגים', en: 'Meat & Fish' },
      bakery: { he: 'מאפים', en: 'Bakery' },
      frozen: { he: 'קפואים', en: 'Frozen' },
      health_food: { he: 'מזון בריאות', en: 'Health Food' },
      other: OTHER,
    },
    subcategories: [
      'coffee', 'tea', 'juice', 'soda', 'water', 'wine', 'beer', 'spirits',
      'bread', 'pastry', 'cake', 'cheese', 'yogurt', 'oil', 'vinegar', 'sauce', 'jam',
      'pasta', 'rice', 'legumes', 'nuts', 'chocolate', 'candy', 'cereal', 'spice_blend',
    ],
    extractionRules: `זהו אתר מזון. שים לב:
- חלץ משקל / נפח (גרם, ק"ג, מ"ל, ליטר) ל-volume, והמר ל-volumeMl כשמדובר בנוזל.
- ingredients = רשימת הרכיבים מהתווית.
- benefits = ערכים תזונתיים ותגיות (["ללא גלוטן", "טבעוני", "עתיר חלבון"]).
- targetAudience = העדפות תזונה (["צמחוני", "כשר", "ללא לקטוז"]).`,
    attributes: { volume: true, ingredients: true, material: false, sizes: false },
  },
  {
    id: 'home',
    label: { he: 'בית ועיצוב', en: 'Home & Living' },
    categories: {
      furniture: { he: 'ריהוט', en: 'Furniture' },
      bedding: { he: 'מצעים', en: 'Bedding' },
      kitchen: { he: 'מטבח', en: 'Kitchen' },
      bathroom: { he: 'אמבטיה', en: 'Bathroom' },
      decor: { he: 'עיצוב', en: 'Decor' },
      lighting: { he: 'תאורה', en: 'Lighting' },
      rugs: { he: 'שטיחים', en: 'Rugs' },
      storage: { he: 'אחסון', en: 'Storage' },
      garden: { he: 'גינה וחוץ', en: 'Garden & Outdoor' },
      appliances: { he: 'מוצרי חשמל', en: 'Appliances' },
      textiles: { he: 'טקסטיל', en: 'Textiles' },
      other: OTHER,
    },
    subcategories: [
      'sofas', 'armchairs', 'chairs', 'tables', 'beds', 'mattresses', 'shelves', 'cabinets',
      'dressers', 'sheets', 'duvets', 'pillows', 'blankets', 'towels', 'curtains',
      'cookware', 'tableware', 'cutlery', 'glassware', 'lamps', 'mirrors', 'vases',
      'candles', 'wall_art', 'planters',
    ],
    extractionRules: `זהו אתר בית ועיצוב. שים לב:
- keyIngredients = החומרים (["עץ אלון", "פליז", "כותנה"]).
- volume אינו רלוונטי; אם מופיעות מידות (רוחב/גובה/עומק) שים אותן ב-volume כטקסט.
- benefits = מאפיינים (["ניתן לכביסה במכונה", "עמיד למים", "הרכבה עצמית"]).
- targetAudience = החדר או השימוש (["סלון", "חדר ילדים", "חוץ"]).`,
    attributes: { volume: false, ingredients: false, material: true, sizes: false },
  },
  {
    id: 'sports',
    label: { he: 'ספורט וכושר', en: 'Sports & Fitness' },
    categories: {
      apparel: { he: 'ביגוד ספורט', en: 'Apparel' },
      footwear: { he: 'הנעלה', en: 'Footwear' },
      equipment: { he: 'ציוד', en: 'Equipment' },
      fitness: { he: 'כושר', en: 'Fitness' },
      outdoor: { he: 'שטח וטיולים', en: 'Outdoor' },
      cycling: { he: 'אופניים', en: 'Cycling' },
      water_sports: { he: 'ספורט מים', en: 'Water Sports' },
      team_sports: { he: 'ספורט קבוצתי', en: 'Team Sports' },
      supplements: { he: 'תוספי תזונה', en: 'Supplements' },
      accessories: { he: 'אביזרים', en: 'Accessories' },
      other: OTHER,
    },
    subcategories: [
      'running_shoes', 'training_shoes', 'cleats', 'tshirts', 'shorts', 'leggings',
      'jackets', 'sports_bras', 'swimwear', 'weights', 'yoga_mats', 'resistance_bands',
      'treadmills', 'bikes', 'helmets', 'backpacks', 'tents', 'sleeping_bags',
      'protein', 'vitamins', 'bottles', 'watches',
    ],
    extractionRules: `זהו אתר ספורט. שים לב:
- הפרד בין ביגוד/הנעלה לבין ציוד — הם קטגוריות שונות.
- targetAudience = הענף או רמת הפעילות (["ריצה", "כושר", "מתחילים"]).
- benefits = מאפיינים טכניים (["מנדף זיעה", "קל משקל", "עמיד למים"]).`,
    attributes: { volume: false, ingredients: false, material: true, sizes: true },
  },
  {
    id: 'jewelry',
    label: { he: 'תכשיטים ושעונים', en: 'Jewelry & Watches' },
    categories: {
      rings: { he: 'טבעות', en: 'Rings' },
      necklaces: { he: 'שרשראות', en: 'Necklaces' },
      earrings: { he: 'עגילים', en: 'Earrings' },
      bracelets: { he: 'צמידים', en: 'Bracelets' },
      watches: { he: 'שעונים', en: 'Watches' },
      mens: { he: 'לגבר', en: "Men's" },
      bridal: { he: 'כלה ואירוסין', en: 'Bridal' },
      sets: { he: 'מארזים', en: 'Sets' },
      other: OTHER,
    },
    subcategories: [
      'engagement_rings', 'wedding_bands', 'signet_rings', 'pendants', 'chains', 'chokers',
      'studs', 'hoops', 'drop_earrings', 'bangles', 'charm_bracelets', 'anklets',
      'analog_watches', 'smart_watches', 'cufflinks', 'brooches',
    ],
    extractionRules: `זהו אתר תכשיטים. שים לב:
- keyIngredients = המתכת והאבנים (["זהב 14 קראט", "יהלום", "כסף 925"]).
- volume אינו רלוונטי; מידות (אורך שרשרת, מידת טבעת) שים ב-volume כטקסט.
- benefits = מאפיינים (["היפואלרגני", "ניתן לחריטה"]).`,
    attributes: { volume: false, ingredients: false, material: true, sizes: true },
  },
  {
    id: 'electronics',
    label: { he: 'אלקטרוניקה', en: 'Electronics' },
    categories: {
      computers: { he: 'מחשבים', en: 'Computers' },
      phones: { he: 'סלולר', en: 'Phones' },
      audio: { he: 'שמע', en: 'Audio' },
      tv_video: { he: 'טלוויזיה ווידאו', en: 'TV & Video' },
      gaming: { he: 'גיימינג', en: 'Gaming' },
      cameras: { he: 'צילום', en: 'Cameras' },
      smart_home: { he: 'בית חכם', en: 'Smart Home' },
      wearables: { he: 'מתקנים לבישים', en: 'Wearables' },
      appliances: { he: 'מוצרי חשמל', en: 'Appliances' },
      accessories: { he: 'אביזרים', en: 'Accessories' },
      other: OTHER,
    },
    subcategories: [
      'laptops', 'desktops', 'tablets', 'monitors', 'keyboards', 'mice', 'storage',
      'smartphones', 'chargers', 'cases', 'headphones', 'earbuds', 'speakers',
      'soundbars', 'televisions', 'projectors', 'consoles', 'controllers', 'gpus',
      'dslr', 'lenses', 'drones', 'smartwatches', 'routers',
    ],
    extractionRules: `זהו אתר אלקטרוניקה. שים לב:
- keyIngredients = המפרט הטכני העיקרי (["Intel Core i7", "16GB RAM", "512GB SSD"]).
- benefits = יכולות בולטות (["סוללה ל-20 שעות", "עמיד למים IP68"]).
- productLine = הדגם או סדרת הדגמים (["ThinkPad X1", "Galaxy S24"]).
- volume אינו רלוונטי — החזר null.`,
    attributes: { volume: false, ingredients: false, material: false, sizes: false },
  },
  {
    id: 'health',
    label: { he: 'בריאות ותוספים', en: 'Health & Supplements' },
    categories: {
      vitamins: { he: 'ויטמינים', en: 'Vitamins' },
      supplements: { he: 'תוספי תזונה', en: 'Supplements' },
      herbal: { he: 'צמחי מרפא', en: 'Herbal' },
      otc: { he: 'ללא מרשם', en: 'Over the Counter' },
      medical_devices: { he: 'ציוד רפואי', en: 'Medical Devices' },
      personal_care: { he: 'טיפוח אישי', en: 'Personal Care' },
      sports_nutrition: { he: 'תזונת ספורט', en: 'Sports Nutrition' },
      other: OTHER,
    },
    subcategories: [
      'multivitamin', 'vitamin_d', 'vitamin_b', 'omega3', 'probiotics', 'magnesium',
      'iron', 'collagen', 'protein_powder', 'creatine', 'melatonin', 'tinctures',
      'teas', 'thermometers', 'blood_pressure_monitors', 'first_aid',
    ],
    extractionRules: `זהו אתר בריאות ותוספי תזונה. שים לב:
- חלץ מינון וכמות יחידות (["60 כמוסות", "1000 מ"ג"]) ל-volume.
- keyIngredients = הרכיבים הפעילים והמינון שלהם.
- benefits = מה זה מיועד לתמוך בו (["אנרגיה", "שינה", "חיסון"]).
- אל תמציא הצהרות רפואיות שלא כתובות בדף.`,
    attributes: { volume: true, ingredients: true, material: false, sizes: false },
  },
  {
    id: 'baby_kids',
    label: { he: 'תינוקות וילדים', en: 'Baby & Kids' },
    categories: {
      clothing: { he: 'ביגוד', en: 'Clothing' },
      shoes: { he: 'הנעלה', en: 'Shoes' },
      toys: { he: 'צעצועים', en: 'Toys' },
      gear: { he: 'ציוד', en: 'Gear' },
      nursery: { he: 'חדר ילדים', en: 'Nursery' },
      feeding: { he: 'האכלה', en: 'Feeding' },
      diapering: { he: 'החתלה', en: 'Diapering' },
      school: { he: 'בית ספר', en: 'School' },
      books_craft: { he: 'ספרים ויצירה', en: 'Books & Craft' },
      other: OTHER,
    },
    subcategories: [
      'bodysuits', 'pajamas', 'dresses', 'pants', 'coats', 'sneakers', 'sandals',
      'strollers', 'car_seats', 'carriers', 'high_chairs', 'cribs', 'bedding',
      'bottles', 'pacifiers', 'diapers', 'wipes', 'puzzles', 'dolls', 'building_blocks',
      'backpacks', 'stationery',
    ],
    extractionRules: `זהו אתר תינוקות וילדים. שים לב:
- targetAudience = טווח הגילאים (["0-6 חודשים", "3-5 שנים"]).
- benefits = בטיחות ונוחות (["ללא BPA", "ניתן לכביסה", "תקן בטיחות"]).
- keyIngredients = החומרים (["כותנה אורגנית", "עץ"]).`,
    attributes: { volume: false, ingredients: false, material: true, sizes: true },
  },
  {
    id: 'pets',
    label: { he: 'חיות מחמד', en: 'Pets' },
    categories: {
      dog_food: { he: 'מזון לכלבים', en: 'Dog Food' },
      cat_food: { he: 'מזון לחתולים', en: 'Cat Food' },
      treats: { he: 'חטיפים', en: 'Treats' },
      toys: { he: 'צעצועים', en: 'Toys' },
      grooming: { he: 'טיפוח', en: 'Grooming' },
      health: { he: 'בריאות', en: 'Health' },
      accessories: { he: 'אביזרים', en: 'Accessories' },
      habitat: { he: 'כלובים ומלונות', en: 'Habitat' },
      other: OTHER,
    },
    subcategories: [
      'dry_food', 'wet_food', 'puppy_food', 'kitten_food', 'dental_chews', 'leashes',
      'collars', 'harnesses', 'beds', 'carriers', 'litter', 'shampoo', 'brushes',
      'flea_treatment', 'supplements', 'aquariums', 'cages',
    ],
    extractionRules: `זהו אתר חיות מחמד. שים לב:
- targetAudience = סוג החיה וגילה (["כלב בוגר", "גור", "חתול"]).
- חלץ משקל אריזה ל-volume.
- ingredients = הרכב המזון אם מופיע.`,
    attributes: { volume: true, ingredients: true, material: false, sizes: false },
  },
  {
    id: 'saas',
    label: { he: 'תוכנה ו-SaaS', en: 'Software & SaaS' },
    categories: {
      plans: { he: 'מסלולים', en: 'Plans' },
      modules: { he: 'מודולים', en: 'Modules' },
      addons: { he: 'תוספים', en: 'Add-ons' },
      integrations: { he: 'אינטגרציות', en: 'Integrations' },
      services: { he: 'שירותי הטמעה', en: 'Professional Services' },
      support: { he: 'תמיכה', en: 'Support' },
      other: OTHER,
    },
    subcategories: [
      'free', 'starter', 'professional', 'business', 'enterprise', 'per_seat',
      'usage_based', 'onboarding', 'training', 'api_access', 'sso', 'white_label',
    ],
    extractionRules: `זהו אתר תוכנה / SaaS. "מוצר" כאן הוא מסלול, מודול או תוסף.
- price = המחיר החודשי אם מופיע; אם המחיר "צור קשר" או לא מפורסם — החזר null, אל תמציא.
- volume / ingredients אינם רלוונטיים — החזר null ו-[].
- benefits = הפיצ'רים הכלולים במסלול.
- targetAudience = גודל או סוג הארגון (["עסק קטן", "ארגון גדול"]).`,
    attributes: { volume: false, ingredients: false, material: false, sizes: false },
  },
  {
    id: 'services',
    label: { he: 'שירותים וטיפולים', en: 'Services & Treatments' },
    categories: {
      treatments: { he: 'טיפולים', en: 'Treatments' },
      consultations: { he: 'ייעוץ', en: 'Consultations' },
      courses: { he: 'קורסים והדרכות', en: 'Courses' },
      packages: { he: 'חבילות', en: 'Packages' },
      memberships: { he: 'מנויים', en: 'Memberships' },
      events: { he: 'אירועים', en: 'Events' },
      other: OTHER,
    },
    subcategories: [
      'single_session', 'series', 'trial', 'private', 'group', 'online', 'in_person',
      'monthly', 'annual', 'workshop', 'certification', 'assessment',
    ],
    extractionRules: `זהו אתר שירותים. "מוצר" כאן הוא טיפול, ייעוץ, קורס או חבילה.
- volume = משך המפגש אם מופיע (["50 דקות", "6 מפגשים"]); volumeMl תמיד null.
- benefits = מה השירות פותר.
- targetAudience = למי הוא מיועד.
- price = מחיר למפגש או לחבילה; אם לא מפורסם — null.`,
    attributes: { volume: false, ingredients: false, material: false, sizes: false },
  },
  {
    id: 'general',
    label: { he: 'כללי / מעורב', en: 'General / Mixed' },
    categories: {
      apparel: { he: 'ביגוד', en: 'Apparel' },
      beauty: { he: 'טיפוח', en: 'Beauty' },
      food: { he: 'מזון', en: 'Food' },
      home: { he: 'בית', en: 'Home' },
      electronics: { he: 'אלקטרוניקה', en: 'Electronics' },
      accessories: { he: 'אביזרים', en: 'Accessories' },
      services: { he: 'שירותים', en: 'Services' },
      sets: { he: 'מארזים', en: 'Sets' },
      other: OTHER,
    },
    subcategories: [
      'tops', 'bottoms', 'shoes', 'bags', 'skincare', 'haircare', 'makeup', 'snacks',
      'beverages', 'kitchen', 'decor', 'gadgets', 'tools', 'kit',
    ],
    extractionRules: `סוג האתר לא הוגדר מראש. בחר את הקטגוריה הרחבה שהכי מתאימה למוצר,
והשתמש ב-subcategory כדי לדייק. אם משהו לא ברור — החזר null במקום לנחש.`,
    attributes: { volume: true, ingredients: true, material: true, sizes: true },
  },
];

const BY_ID = new Map<string, CatalogVertical>(VERTICALS.map(v => [v.id, v]));

const GENERAL = BY_ID.get('general')!;

/** Resolve a vertical by id, falling back to `general` for unknown/missing ids. */
export function getVertical(id: VerticalId | string | null | undefined): CatalogVertical {
  return (id && BY_ID.get(id)) || GENERAL;
}

/** The vertical's category enum keys, in declaration order. */
export function categoryKeys(id: VerticalId | string | null | undefined): string[] {
  return Object.keys(getVertical(id).categories);
}

/**
 * Display label for a stored `widget_products.category` value.
 *
 * Looks in the account's own vertical first, then across all verticals — a re-scan can
 * change an account's vertical, and rows extracted under the old one must still read
 * correctly. Unknown keys are de-snaked rather than shown as raw slugs.
 */
export function categoryLabel(
  verticalId: VerticalId | string | null | undefined,
  category: string,
  lang: 'he' | 'en' = 'he'
): string {
  if (!category) return '';
  const own = getVertical(verticalId).categories[category];
  if (own) return own[lang];
  for (const v of VERTICALS) {
    const hit = v.categories[category];
    if (hit) return hit[lang];
  }
  return category.replace(/_/g, ' ');
}

/**
 * Default vertical suggested for an account archetype. Only archetypes that imply a market
 * get a specific answer — `brand` and `influencer` sell anything, so they stay `general`
 * and the admin picks explicitly on the add-account form.
 */
export function verticalForArchetype(archetype: string | null | undefined): VerticalId {
  switch (archetype) {
    case 'service_provider':
    case 'association':
      // An association has no catalog at all; 'services' keeps the extractor from
      // hunting for retail products on membership and policy pages.
      return 'services';
    case 'tech_creator':
      return 'saas';
    default:
      return 'general';
  }
}
