import { config } from "dotenv";
config({ path: ".env.local" });

const tests = [
  { account: "038fd490-906d-431f-b428-ff9203ce4968", name: "danielamit", query: "מה הקופון של סוניקייר ומה ההנחה?", expect: ["Sonicare", "Daniel", "%"] },
  { account: "038fd490-906d-431f-b428-ff9203ce4968", name: "danielamit", query: "איזה מותגי איפור את עובדת איתם?", expect: ["מאק", "לוריאל"] },
  { account: "038fd490-906d-431f-b428-ff9203ce4968", name: "danielamit", query: "יש לך מתכון שמכינים בסיר אחד?", expect: ["סיר", "פסטה"] },
  { account: "038fd490-906d-431f-b428-ff9203ce4968", name: "danielamit", query: "מה הקוד הנחה לדלתא?", expect: ["Delta", "Danielamit", "15"] },
  { account: "de38eac6-d2fb-46a7-ac09-5ec860147ca0", name: "ldrs", query: "מה ההבדל בין שיווק משפיענים לשיווק שותפים?", expect: ["influencer", "affiliate"] },
  { account: "de38eac6-d2fb-46a7-ac09-5ec860147ca0", name: "ldrs", query: "עם איזה מותגים עבדתם?", expect: ["brand"] },
  { account: "de38eac6-d2fb-46a7-ac09-5ec860147ca0", name: "ldrs", query: "כמה משפיענים יש לכם ברשת?", expect: ["influencer"] },
  { account: "218c0d6a-f76b-4418-a5ab-4f42c2917e07", name: "tambour", query: "איזה צבעים יש לטמבור לסלון?", expect: ["צבע", "סלון"] },
  { account: "218c0d6a-f76b-4418-a5ab-4f42c2917e07", name: "tambour", query: "מה ההבדל בין צבע פנים לצבע חוץ?", expect: ["פנים", "חוץ"] },
  { account: "86fc5238-1d5a-4803-b43a-d99bd63d5fa4", name: "clinique", query: "מה הקרם הכי טוב לעור יבש?", expect: ["קרם", "לחות"] },
  { account: "86fc5238-1d5a-4803-b43a-d99bd63d5fa4", name: "clinique", query: "יש לכם סרום ויטמין C?", expect: ["סרום", "ויטמין"] },
  { account: "1a9fe42f-98e1-470c-9dee-d549342b34a1", name: "the_dekel", query: "על מה הסרטון האחרון שלך?", expect: [] },
  { account: "1a9fe42f-98e1-470c-9dee-d549342b34a1", name: "the_dekel", query: "מה דעתך על ביטקוין?", expect: [] },
  { account: "6facd754-2aed-410f-8b74-49ecc9304558", name: "moroccanoil", query: "מה הטיפול הכי טוב לשיער פגום?", expect: ["שיער", "שמן"] },
  { account: "72c0d040-7f32-4af7-9d62-93fa74739a06", name: "eranswis", query: "על מה דיברת בפודקאסט האחרון?", expect: [] },
  { account: "bc26f0ae-adde-494c-9586-e6ca33d04ac9", name: "maimonspices", query: "איזה תבלינים אתם ממליצים לבשר?", expect: ["תבלין", "בשר"] },
  { account: "60c0cfbb-333e-442b-87d3-67986207206a", name: "argania", query: "מה היתרונות של שמן ארגן?", expect: ["ארגן", "שמן"] },
];

async function run() {
  const { retrieveContext } = await import("../src/lib/rag/retrieve");

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    const start = Date.now();
    try {
      const result = await retrieveContext({
        accountId: t.account,
        query: t.query,
        topK: 5,
      });
      const ms = Date.now() - start;
      const topSim = result.sources[0]?.confidence || 0;
      const allText = result.sources.map((s: any) => s.excerpt).join(" ").toLowerCase();
      const types = [...new Set(result.sources.map((s: any) => s.entityType))].join(",");

      const missing = t.expect.filter(kw => {
        const found = allText.toLowerCase().includes(kw.toLowerCase());
        return !found;
      });

      if (missing.length === 0) {
        console.log(`[PASS] ${t.name}: ${t.query} -- sim=${topSim.toFixed(2)} ${ms}ms [${types}] (${result.sources.length} sources)`);
        passed++;
      } else {
        console.log(`[FAIL] ${t.name}: ${t.query} -- sim=${topSim.toFixed(2)} ${ms}ms missing=[${missing.join(", ")}] [${types}]`);
        failed++;
      }
    } catch (err: any) {
      console.log(`[ERROR] ${t.name}: ${t.query} -- ${err?.message || String(err)}`);
      failed++;
    }
  }

  console.log("");
  console.log("===========================================");
  console.log(`RESULTS: ${passed}/${passed + failed} passed (${(100 * passed / (passed + failed)).toFixed(0)}%)`);
  console.log("===========================================");
}

run().catch(console.error);
